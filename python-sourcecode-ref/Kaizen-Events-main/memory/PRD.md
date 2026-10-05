# Form Builder Application - Product Requirements Document

## Original Problem Statement
Build a comprehensive Form Builder application for event registration with dynamic pricing formulas, conditional field rules, and multiple payment integration options.

## Target Users
- **Super Admins/Directors:** Full access to create campaigns, manage forms, view analytics
- **Kiosk Volunteers:** Event check-in and on-site registration
- **Public Users:** Complete registration forms and make payments

## Core Requirements

### Form Builder Features
1. **Drag & Drop Form Builder** - Visual form creation with field types:
   - Text, Email, Phone/Tel, Number, Date
   - Dropdown, Radio, Checkbox (with multiple options)
   - Name field (with first/middle/last name sub-fields)
   - Section headers
   - Calculated fields

2. **Formula Builder** - Dynamic pricing calculations:
   - Functions: `sum()`, `avg()`, `min()`, `max()`, `round()`, `if()`
   - Field references: `${field_id}`, `${base_price}`
   - Operators: +, -, *, /, comparisons (>, <, >=, <=, ==, !=)
   - Conditional pricing rules with priorities

3. **Field Rules** - Conditional logic:
   - Actions: Show, Hide, Require, Enable, Disable, Set Value
   - Conditions: equals, not_equals, contains, greater_than, less_than, is_empty, is_not_empty
   - Match types: All conditions / Any condition

4. **Payment Integration:**
   - Instamojo (functional)
   - Razorpay (implemented, live testing blocked)
   - Offline payments with OTP verification

### Technical Architecture
```
/app/
├── backend/                    # FastAPI Python backend
│   ├── server.py              # Main server with routes
│   ├── models.py              # Pydantic models
│   ├── formula_engine.py      # Secure formula parser
│   ├── form_routes.py         # Form builder API routes
│   ├── offline_payment_routes.py
│   └── requirements.txt
├── frontend/                   # React frontend
│   └── src/
│       ├── components/
│       │   └── FormBuilder/
│       │       ├── FieldEditor.js
│       │       ├── FieldRules.js
│       │       └── FormulaBuilder.js
│       └── pages/
│           ├── PublicRegistration.js
│           └── PublicLandingPage.js
└── memory/
    └── PRD.md
```

## What's Been Implemented

### Completed (Jan 2025)
- [x] MongoDB Atlas connection stabilized (IP whitelisting)
- [x] Checkbox field rendering fixed (multi-option support)
- [x] Name field rendering (first/middle/last sub-fields)
- [x] Field Rules UI complete overhaul
- [x] Formula Builder UI improvements (operators, labels)
- [x] `if()` function support added to frontend
- [x] Offline payment OTP flow
- [x] Input validation (email, number, tel)
- [x] Total calculation - formula-based only (not auto-sum)
- [x] Backend formula validation API with all functions
- [x] **Formula Builder displays human-readable field names** (not cryptic IDs)
- [x] **Token-based formula input** - Fields appear as deletable chips/blocks, backspace removes entire field at once
- [x] **Formula auto-save to database** - "Save Formulas" button now saves directly to database
- [x] **Formula reads from `pricing_formula` field** - Fixed field name mismatch between save and read
- [x] **Kiosk Mode live search** - Results appear as you type (autocomplete dropdown)
- [x] **Registration status labels** - Changed "completed" to "Paid" and kept "Pending" for offline payment campaigns
- [x] **Created shared hook `usePublicForm.js`** - Extracted common form logic (calculateTotal, getFieldState, validateCoupon, etc.) for DRY code
- [x] **Kiosk Mode OTP Verification Flow** - Full end-to-end OTP verification for offline registrations:
  - Incorrect OTP shows specific error: "The OTP entered is incorrect. Please try again."
  - Correct OTP proceeds to payment confirmation with "OTP Verified" badge
  - Legacy registrations without OTP skip verification step automatically
  - Resend OTP functionality now works for kiosk volunteers
- [x] **Fixed Resend OTP API endpoint path** - Changed from `/offline-payments/registrations/...` to `/registrations/.../resend-otp`
- [x] **Updated access control for kiosk volunteers** - Kiosk volunteers can now resend OTP, verify OTP, confirm payments

### Testing Status
- **Backend Formula API:** 18/18 tests pass
- **Frontend Formula Builder:** Verified working
- **Field Rules UI:** Verified working

## Prioritized Backlog

### P0 - Critical
- None (all critical items resolved)

### P1 - High Priority
- [ ] End-to-End Formula Execution Testing - Complex formulas with `if` conditions
- [ ] End-to-End Field Rules Testing - All action types (Show, Hide, Require, Set Value, etc.)
- [ ] Kiosk Mode QR Code Scanner - Faster event check-ins

### P2 - Medium Priority
- [ ] Live Razorpay Testing - BLOCKED (needs live API credentials)
- [ ] Email Notifications (Brevo) - BLOCKED (needs IP whitelisting for 104.198.214.223)

### P3 - Low Priority
- [ ] Form template presets
- [ ] Advanced analytics dashboard
- [ ] Bulk registration import

## Known Limitations
1. **Code Duplication:** `renderField` function is still duplicated in `PublicRegistration.js` and `PublicLandingPage.js` - could be extracted to shared component
2. **Mocked Services:** Razorpay settlements, Brevo emails
3. **MongoDB IP Whitelisting:** Dynamic container IPs require `0.0.0.0/0` whitelist for dev environment

## Current Container IP
- **IP:** `35.225.230.28` (as of Jan 2025)
- If MongoDB connection fails, whitelist this IP in Atlas Network Access

## Test Credentials
- Super Admin: `pranav@kaizeninfotech.com` / `Kaizentest1234`
- Kiosk Volunteer: `kiosk1@test.com` / `BeUVaZYs`

## Key API Endpoints
- `POST /api/formula/validate` - Validate and test formulas
- `POST /api/evaluate-field-rules` - Evaluate field visibility/state
- `POST /api/registrations/offline/submit` - Offline registration with OTP
- `GET /api/public/campaigns/:slug` - Public form data
