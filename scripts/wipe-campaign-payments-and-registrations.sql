-- ============================================================================
-- Wipe payments + registrations for ONE campaign (full clean slate)
-- ----------------------------------------------------------------------------
-- Target: RID 3142 District Shukriya - उत्कष
-- Slug  : rid-3142-district-shukriya
--
-- This script is GUARDED:
--   1. Resolves the campaign by slug, halts if not exactly one row matches
--   2. Prints the row counts BEFORE making any change (preview)
--   3. Wraps the destructive section in a transaction so you can ROLLBACK
--      if the preview looks wrong
--
-- HOW TO RUN
--   - Open MySQL Workbench (or `mysql -u root -p kaizen_events`)
--   - Disable autocommit:        SET autocommit = 0;
--   - Paste-and-run sections 1 + 2 (lookup + preview). Verify the numbers.
--   - If they look right, run sections 3-7 (the deletes/updates).
--   - Run COMMIT;  to make it permanent.  Or  ROLLBACK;  to undo everything.
--   - After committing: in the admin UI open the campaign's Integrations tab
--     and click "Sync All" — the Google Sheet will rebuild with just the
--     header row (no data rows left).
--
-- WHAT THIS DOES
--   ✓ Deletes refunds, payments, registrations for this campaign
--   ✓ Resets campaign_members (closed-group attendees) back to unregistered
--   ✓ Decrements the coupon usage counters that this campaign's
--     registrations bumped up
--   ✓ Resets campaign counters: current_registrations = 0, total_revenue = 0
--   ✓ Cleans up orphan_payments rows that referenced this campaign
--
-- WHAT THIS DOES NOT TOUCH
--   ✗ The campaign row itself, its form_config, theme, email templates,
--     vendor splits — everything still configured exactly as before
--   ✗ audit_logs / notification_logs — historical record kept
--   ✗ payment_accounts.total_amount_collected — that's a cross-campaign
--     stat; if you need it recomputed, do it as a separate step
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Resolve campaign by slug, halt if no match
-- ─────────────────────────────────────────────────────────────────────────────
SET @slug := 'rid-3142-district-shukriya';

SELECT id, name, slug, status, current_registrations, total_revenue
FROM   campaigns
WHERE  slug = @slug;
-- ⚠ Expect EXACTLY ONE row. If 0 or 2+ rows return, stop now.

SET @campaign_id := (SELECT id FROM campaigns WHERE slug = @slug LIMIT 1);
SELECT @campaign_id AS resolved_campaign_id;
-- ⚠ If this is NULL, do not run further sections.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Preview: how many rows in each table will be affected?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM payments        WHERE campaign_id = @campaign_id) AS payments_to_delete,
  (SELECT COUNT(*) FROM registrations   WHERE campaign_id = @campaign_id) AS registrations_to_delete,
  (SELECT COUNT(*) FROM refunds r
   JOIN   registrations reg ON reg.id = r.registration_id
   WHERE  reg.campaign_id = @campaign_id)                                  AS refunds_to_delete,
  (SELECT COUNT(*) FROM campaign_members
   WHERE  campaign_id = @campaign_id AND registration_id IS NOT NULL)     AS members_to_unregister,
  (SELECT COUNT(DISTINCT coupon_code) FROM registrations
   WHERE  campaign_id = @campaign_id AND coupon_code IS NOT NULL
   AND    payment_status = 'completed')                                    AS coupons_used,
  (SELECT COUNT(*) FROM orphan_payments
   WHERE  campaign_id = @campaign_id)                                      AS orphan_payments_to_delete;
-- ⚠ Review these numbers. If anything looks wrong, STOP and ROLLBACK.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Open a transaction (so the next sections are reversible)
-- ─────────────────────────────────────────────────────────────────────────────
START TRANSACTION;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Decrement coupon usage counters for coupons used on this campaign
-- (must run BEFORE deleting registrations — we need the coupon_code values)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE coupon_codes c
JOIN (
  SELECT  campaign_id, coupon_code, COUNT(*) AS uses
  FROM    registrations
  WHERE   campaign_id   = @campaign_id
    AND   coupon_code   IS NOT NULL
    AND   payment_status = 'completed'
  GROUP BY campaign_id, coupon_code
) r ON r.campaign_id = c.campaign_id AND r.coupon_code = c.code
SET    c.current_usage = GREATEST(0, c.current_usage - r.uses);
-- NOTE: coupon_codes has no updated_at column — do not set it here.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Delete in FK-safe order (children first, then parents)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Refunds (FK → registrations)
DELETE r
FROM   refunds r
JOIN   registrations reg ON reg.id = r.registration_id
WHERE  reg.campaign_id = @campaign_id;

-- 5b. Payments (FK → campaign, registration, payment_account)
DELETE FROM payments
WHERE  campaign_id = @campaign_id;

-- 5c. Reset campaign_members back to unregistered (closed-group only)
-- (Do NOT delete members — those were uploaded via CSV and are the eligible list.)
UPDATE campaign_members
SET    registration_id = NULL,
       status          = 'unregistered',
       registered_at   = NULL,
       updated_at      = NOW(6)
WHERE  campaign_id = @campaign_id
  AND  registration_id IS NOT NULL;

-- 5d. Registrations (parent of everything above)
DELETE FROM registrations
WHERE  campaign_id = @campaign_id;

-- 5e. Orphan payments (gateway webhooks that landed without a matching reg)
DELETE FROM orphan_payments
WHERE  campaign_id = @campaign_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Reset campaign counters
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE campaigns
SET    current_registrations = 0,
       total_revenue         = 0,
       total_transferred     = 0,
       updated_at            = NOW(6)
WHERE  id = @campaign_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — Verify, then commit (or rollback)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM payments      WHERE campaign_id = @campaign_id) AS payments_left,
  (SELECT COUNT(*) FROM registrations WHERE campaign_id = @campaign_id) AS registrations_left,
  (SELECT current_registrations FROM campaigns WHERE id = @campaign_id) AS counter_now,
  (SELECT total_revenue          FROM campaigns WHERE id = @campaign_id) AS revenue_now;
-- ⚠ Expect:  0,  0,  0,  0.00

-- COMMIT;        -- ← uncomment + run to make it permanent
-- ROLLBACK;     -- ← uncomment + run to UNDO everything from SECTION 3 onward
