-- ============================================================================
-- Full wipe: payments + registrations for ONE campaign
-- ----------------------------------------------------------------------------
-- Target campaign: RID 3231 - District Conference 2026-27
-- Campaign ID:     31578b96-beb0-40f6-b7ea-1e087ac9169d
--
-- GUARDED: resolves the campaign, prints BEFORE counts, wraps deletes in a
-- transaction so you can COMMIT or ROLLBACK after reviewing.
--
-- HOW TO RUN (MySQL Workbench, or `mysql -u <user> -p kaizen_events`)
--   1. SET autocommit = 0;
--   2. Run sections 1 + 2 (resolve + preview). Confirm the campaign name and counts.
--   3. If correct, run sections 3-7.
--   4. Verify section 7 shows all zeros, then run  COMMIT;  (or  ROLLBACK;  to undo).
--   5. After committing: in the admin UI open the event's Integrations tab and click
--      "Sync All" — the Google Sheet rebuilds to just the header row.
--
-- DELETES:  refunds, payments, registrations, orphan_payments for this campaign.
-- RESETS:   campaign_members → unregistered; coupon_codes.current_usage decremented;
--           campaigns.current_registrations / total_revenue / total_transferred → 0.
-- KEEPS:    the campaign itself + its form/theme/email-templates/vendor-splits,
--           audit_logs, notification_logs, payment_accounts stats.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Resolve campaign, halt if it doesn't exist
-- ─────────────────────────────────────────────────────────────────────────────
SET @campaign_id := '31578b96-beb0-40f6-b7ea-1e087ac9169d';

SELECT id, name, slug, status, current_registrations, total_revenue
FROM   campaigns
WHERE  id = @campaign_id;
-- ⚠ Expect EXACTLY ONE row, and the name should be the RID 3231 event. If 0 rows, STOP.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Preview: rows that will be affected
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM payments       WHERE campaign_id = @campaign_id)            AS payments_to_delete,
  (SELECT COUNT(*) FROM registrations  WHERE campaign_id = @campaign_id)            AS registrations_to_delete,
  (SELECT COUNT(*) FROM refunds r
     JOIN registrations reg ON reg.id = r.registration_id
   WHERE reg.campaign_id = @campaign_id)                                            AS refunds_to_delete,
  (SELECT COUNT(*) FROM campaign_members
   WHERE campaign_id = @campaign_id AND registration_id IS NOT NULL)                AS members_to_unregister,
  (SELECT COUNT(*) FROM orphan_payments WHERE campaign_id = @campaign_id)           AS orphan_payments_to_delete;
-- ⚠ Review these numbers before continuing.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Begin transaction (everything below is reversible until COMMIT)
-- ─────────────────────────────────────────────────────────────────────────────
START TRANSACTION;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Decrement coupon usage for coupons used by completed registrations
-- (must run BEFORE deleting registrations — needs their coupon_code values)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE coupon_codes c
JOIN (
  SELECT  campaign_id, coupon_code, COUNT(*) AS uses
  FROM    registrations
  WHERE   campaign_id    = @campaign_id
    AND   coupon_code    IS NOT NULL
    AND   payment_status = 'completed'
  GROUP BY campaign_id, coupon_code
) r ON r.campaign_id = c.campaign_id AND r.coupon_code = c.code
SET    c.current_usage = GREATEST(0, c.current_usage - r.uses);
-- NOTE: coupon_codes has no updated_at column — do not set it here.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Delete in FK-safe order (children first)
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Refunds (FK → registrations)
DELETE r
FROM   refunds r
JOIN   registrations reg ON reg.id = r.registration_id
WHERE  reg.campaign_id = @campaign_id;

-- 5b. Payments (FK → campaign / registration / payment_account)
DELETE FROM payments
WHERE  campaign_id = @campaign_id;

-- 5c. Reset closed-group members to unregistered (keep the member rows themselves)
UPDATE campaign_members
SET    registration_id = NULL,
       status          = 'unregistered',
       registered_at   = NULL,
       updated_at      = NOW(6)
WHERE  campaign_id = @campaign_id
  AND  registration_id IS NOT NULL;

-- 5d. Registrations
DELETE FROM registrations
WHERE  campaign_id = @campaign_id;

-- 5e. Orphan payments (webhooks that arrived without a matching registration)
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
-- SECTION 7 — Verify, then COMMIT (or ROLLBACK)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM payments      WHERE campaign_id = @campaign_id)  AS payments_left,
  (SELECT COUNT(*) FROM registrations WHERE campaign_id = @campaign_id)  AS registrations_left,
  (SELECT current_registrations FROM campaigns WHERE id = @campaign_id)  AS counter_now,
  (SELECT total_revenue          FROM campaigns WHERE id = @campaign_id) AS revenue_now;
-- ⚠ Expect:  0,  0,  0,  0.00

-- COMMIT;     -- ← uncomment + run to make it permanent
-- ROLLBACK;  -- ← uncomment + run to UNDO everything from SECTION 3 onward
