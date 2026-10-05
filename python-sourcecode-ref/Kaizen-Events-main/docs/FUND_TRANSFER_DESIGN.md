# Fund Transfer Management System - Detailed Design Document

## 📋 Overview
A comprehensive system to manage fund collection and transfers between Kaizen and event organizers.

---

## 🔄 User Flows

### Flow 1: Campaign Creation (Fund Collection Mode Selection)
```
Campaign Creator creates campaign
    ↓
Step: Select Fund Collection Mode (REQUIRED)
    ├── Option A: "Kaizen Managed" - Kaizen collects payments and transfers to organizer
    └── Option B: "Direct to Organizer" - Organizer uses their own payment gateway
    ↓
If "Kaizen Managed" selected → Fund Management module becomes visible
```

### Flow 2: Bank Account Setup (Post Campaign Creation)
```
Campaign Dashboard → Fund Management Tab
    ↓
Add Bank Account Details
    ├── Account Holder Name
    ├── Account Number
    ├── IFSC Code
    ├── Bank Name
    └── Notification Email (for transfer alerts)
    ↓
Submit → Bank details saved for this campaign
```

### Flow 3: Transfer Request & Approval
```
Super Admin views pending funds
    ↓
Creates Transfer Request
    ├── Select amount to transfer
    ├── Add reference number
    └── Submit for approval
    ↓
Request goes to "Pending Approval" status
    ↓
Company Director reviews & approves/rejects
    ↓
If Approved → Super Admin marks as "Completed" after actual bank transfer
    ↓
Manual notification trigger → Email sent to organizer
```

---

## 🖥️ UI Mockups

### MOCKUP 1: Create Campaign - Fund Collection Mode Selection
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Create Campaign                                                    [Save]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Campaign Name *                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Annual Conference 2026                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Organization Name *                                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Rotary Club of Mumbai                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  💰 Fund Collection Mode *                                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ○ Kaizen Managed                                                   │   │
│  │     Kaizen collects payments on your behalf and transfers           │   │
│  │     funds to your bank account (2.95% platform fee applies)         │   │
│  │                                                                     │   │
│  │  ○ Direct to Organizer                                              │   │
│  │     You use your own payment gateway. Configure it in               │   │
│  │     Payment Settings after creating the campaign.                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ⚠️ This setting cannot be changed after the campaign receives payments    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MOCKUP 2: Campaign Dashboard - Fund Management Tab (Org Admin View)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Annual Conference 2026                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Overview] [Form Builder] [Registrations] [💰 Fund Management] [Settings] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     💰 FUND SUMMARY                                  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │   Total Collected        Platform Fee (2.95%)      Net Payable     │   │
│  │   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐   │   │
│  │   │   ₹50,000    │       │   ₹1,475     │       │   ₹48,525    │   │   │
│  │   └──────────────┘       └──────────────┘       └──────────────┘   │   │
│  │                                                                     │   │
│  │   Transferred            Pending Transfer                          │   │
│  │   ┌──────────────┐       ┌──────────────┐                          │   │
│  │   │   ₹30,000    │       │   ₹18,525    │                          │   │
│  │   │   (3 times)  │       │              │                          │   │
│  │   └──────────────┘       └──────────────┘                          │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🏦 BANK ACCOUNT DETAILS                              [✏️ Edit]     │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Account Holder:  Rotary Club of Mumbai                            │   │
│  │  Account Number:  ****4567                                         │   │
│  │  IFSC Code:       HDFC0001234                                      │   │
│  │  Bank Name:       HDFC Bank                                        │   │
│  │                                                                     │   │
│  │  📧 Notification Email: treasurer@rotarymumbai.org                 │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  📜 TRANSFER HISTORY                                                │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Date         Amount      Reference       Status                   │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │  05 Jan 2026  ₹15,000    TXN789456      ✅ Completed               │   │
│  │  28 Dec 2025  ₹10,000    TXN654321      ✅ Completed               │   │
│  │  15 Dec 2025  ₹5,000     TXN123456      ✅ Completed               │   │
│  │                                                                     │   │
│  │  Total Transferred: ₹30,000                                        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MOCKUP 3: Add/Edit Bank Account Modal (Org Admin)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🏦 Bank Account Details                                            [X]    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Account Holder Name *                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Rotary Club of Mumbai                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Account Number *                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 12345678904567                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Confirm Account Number *                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 12345678904567                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  IFSC Code *                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ HDFC0001234                                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Bank Name *                                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ HDFC Bank                                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  📧 Notification Email *                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ treasurer@rotarymumbai.org                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  Email where transfer notifications will be sent                            │
│                                                                             │
│                                        [Cancel]  [💾 Save Bank Details]    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MOCKUP 4: Super Admin - Fund Transfers Dashboard
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 Fund Transfers                                          [+ New Transfer]│
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  Total       │  │  Platform    │  │  Total       │  │  Pending     │    │
│  │  Collected   │  │  Fees        │  │  Transferred │  │  Approval    │    │
│  │              │  │              │  │              │  │              │    │
│  │  ₹2,50,000   │  │  ₹7,375      │  │  ₹1,80,000   │  │  ₹62,625     │    │
│  │              │  │  (2.95%)     │  │              │  │  (3 pending) │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  📊 CAMPAIGNS WITH PENDING TRANSFERS                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Campaign              Collected    Fee      Net      Pending   Action│   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Annual Conference     ₹50,000   ₹1,475   ₹48,525   ₹18,525  [View] │   │
│  │ Rotary Club Mumbai                                                  │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ District Meet 2026    ₹1,00,000 ₹2,950   ₹97,050   ₹47,050  [View] │   │
│  │ Rotary District 3141                                               │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Youth Workshop        ₹25,000   ₹737.50  ₹24,262   ₹24,262  [View] │   │
│  │ Leo Club Chennai                                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  📜 RECENT TRANSFERS                                      [View All →]     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Date       Campaign              Amount    Status      Approved By        │
│  ──────────────────────────────────────────────────────────────────────── │
│  05 Jan     Annual Conference     ₹15,000   ✅ Completed  Director A       │
│  28 Dec     District Meet         ₹50,000   ⏳ Pending    -                │
│  15 Dec     Annual Conference     ₹10,000   ✅ Completed  Director B       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MOCKUP 5: Create Transfer Request Modal (Super Admin)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💸 Create Transfer Request                                          [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Campaign: Annual Conference 2026 - Rotary Club Mumbai                      │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Available for Transfer: ₹18,525                                            │
│                                                                             │
│  Transfer Amount *                                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ₹ 18,525                                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  [Full Amount] [Partial Amount]                                             │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  🏦 Transfer To:                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Account: Rotary Club of Mumbai                                     │   │
│  │  Number:  ****4567                                                  │   │
│  │  Bank:    HDFC Bank (HDFC0001234)                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Notes (Optional)                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Settlement for registrations till 05 Jan 2026                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ⚠️ This request will be sent for Director approval                        │
│                                                                             │
│                               [Cancel]  [📤 Submit for Approval]           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MOCKUP 6: Director Approval Dashboard
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔐 Director Approval Panel                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Welcome, Director Name                                                     │
│                                                                             │
│  ┌──────────────────────┐                                                  │
│  │  Pending Approvals   │                                                  │
│  │        3             │                                                  │
│  └──────────────────────┘                                                  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  📋 TRANSFER REQUESTS AWAITING APPROVAL                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Request #TR-2026-001                           Submitted: 06 Jan   │   │
│  │  ────────────────────────────────────────────────────────────────   │   │
│  │                                                                     │   │
│  │  Campaign:     Annual Conference 2026                               │   │
│  │  Organization: Rotary Club of Mumbai                                │   │
│  │  Amount:       ₹18,525                                              │   │
│  │  Transfer To:  ****4567 (HDFC Bank)                                 │   │
│  │  Requested By: Admin Name                                           │   │
│  │  Notes:        Settlement for registrations till 05 Jan             │   │
│  │                                                                     │   │
│  │  ────────────────────────────────────────────────────────────────   │   │
│  │                                                                     │   │
│  │  Campaign Stats:                                                    │   │
│  │  • Total Collected: ₹50,000                                         │   │
│  │  • Platform Fee: ₹1,475                                             │   │
│  │  • Previously Transferred: ₹30,000                                  │   │
│  │  • This Request: ₹18,525                                            │   │
│  │  • Remaining After: ₹0                                              │   │
│  │                                                                     │   │
│  │                          [❌ Reject]  [✅ Approve Transfer]         │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  📜 MY APPROVAL HISTORY                                                     │
│                                                                             │
│  Date       Request        Amount     Campaign              Action         │
│  ──────────────────────────────────────────────────────────────────────── │
│  05 Jan    TR-2025-098    ₹15,000    Annual Conference    ✅ Approved      │
│  28 Dec    TR-2025-097    ₹50,000    District Meet        ❌ Rejected      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MOCKUP 7: Mark Transfer as Completed & Send Notification (Super Admin)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ✅ Complete Transfer                                                [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Request: TR-2026-001 (Approved by Director A)                              │
│  Campaign: Annual Conference 2026                                           │
│  Amount: ₹18,525                                                            │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  Bank Transaction Reference *                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ NEFT/TXN/2026/01/07/123456                                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Transfer Date *                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 07 Jan 2026                                                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  📧 NOTIFICATION                                                            │
│                                                                             │
│  ☑️ Send notification email to organizer                                    │
│                                                                             │
│  Email will be sent to: treasurer@rotarymumbai.org                         │
│                                                                             │
│  Preview:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Subject: Fund Transfer Completed - Annual Conference 2026          │   │
│  │                                                                     │   │
│  │  Dear Rotary Club of Mumbai,                                        │   │
│  │                                                                     │   │
│  │  A fund transfer of ₹18,525 has been completed for your event.     │   │
│  │                                                                     │   │
│  │  Transaction Reference: NEFT/TXN/2026/01/07/123456                  │   │
│  │  Transfer Date: 07 Jan 2026                                         │   │
│  │  Bank Account: ****4567                                             │   │
│  │                                                                     │   │
│  │  Best regards,                                                      │   │
│  │  Kaizen Events Team                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                          [Cancel]  [✅ Mark Completed & Notify]            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 👥 User Roles & Access

### Super Admin
- View all campaigns with Kaizen-managed funds
- Create transfer requests
- Mark approved transfers as completed
- Send notifications
- View all transfer history
- Access Director Approval Panel (if also a director)

### Company Director (New Role)
- Access Director Approval Panel
- Approve/Reject transfer requests
- View approval history
- Cannot create or complete transfers

### Organization Admin
- View fund summary for their campaigns
- Add/Edit bank account details
- View transfer history
- Cannot create transfer requests

---

## 🔐 Approval Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        TRANSFER APPROVAL WORKFLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

     Super Admin                   Director                    Super Admin
         │                            │                            │
         │ Creates Transfer           │                            │
         │ Request                    │                            │
         ▼                            │                            │
    ┌─────────┐                       │                            │
    │ PENDING │ ──────────────────────▶                            │
    │ APPROVAL│     Request sent      │                            │
    └─────────┘     for approval      │                            │
                                      ▼                            │
                                 ┌─────────┐                       │
                                 │ REVIEW  │                       │
                                 └─────────┘                       │
                                      │                            │
                         ┌────────────┴────────────┐               │
                         │                         │               │
                         ▼                         ▼               │
                    ┌─────────┐              ┌─────────┐           │
                    │APPROVED │              │REJECTED │           │
                    └─────────┘              └─────────┘           │
                         │                         │               │
                         │                         └──────▶ END    │
                         │                                         │
                         └─────────────────────────────────────────▶
                              Request returned                     │
                              to Super Admin                       │
                                                                   ▼
                                                             ┌───────────┐
                                                             │ PROCESSING│
                                                             └───────────┘
                                                                   │
                                                    Actual bank    │
                                                    transfer done  │
                                                                   ▼
                                                             ┌───────────┐
                                                             │ COMPLETED │
                                                             └───────────┘
                                                                   │
                                                    Notification   │
                                                    sent (optional)│
                                                                   ▼
                                                                 END
```

---

## 📊 Database Schema

### Collection: fund_transfers
```json
{
  "id": "uuid",
  "request_number": "TR-2026-001",
  "campaign_id": "campaign_uuid",
  "campaign_name": "Annual Conference 2026",
  "organization_name": "Rotary Club of Mumbai",
  
  "gross_amount": 18525.00,
  "platform_fee": 0,
  "net_amount": 18525.00,
  
  "status": "pending_approval | approved | rejected | completed",
  
  "bank_account_id": "bank_account_uuid",
  "bank_account_snapshot": {
    "holder_name": "Rotary Club of Mumbai",
    "account_number_masked": "****4567",
    "ifsc": "HDFC0001234",
    "bank_name": "HDFC Bank"
  },
  
  "created_by": "super_admin_id",
  "created_at": "datetime",
  "notes": "Settlement for Jan 2026",
  
  "approved_by": "director_id",
  "approved_at": "datetime",
  "approval_notes": "",
  
  "completed_by": "super_admin_id",
  "completed_at": "datetime",
  "transaction_reference": "NEFT/TXN/123456",
  "transfer_date": "2026-01-07",
  
  "notification_sent": true,
  "notification_sent_at": "datetime",
  "notification_email": "treasurer@rotary.org"
}
```

### Collection: campaign_bank_accounts
```json
{
  "id": "uuid",
  "campaign_id": "campaign_uuid",
  "account_holder_name": "Rotary Club of Mumbai",
  "account_number": "12345678904567",
  "account_number_masked": "****4567",
  "ifsc_code": "HDFC0001234",
  "bank_name": "HDFC Bank",
  "notification_email": "treasurer@rotary.org",
  "is_verified": false,
  "created_at": "datetime",
  "updated_at": "datetime",
  "created_by": "user_id"
}
```

### Campaign Model Update
```json
{
  // ... existing fields ...
  "fund_collection_mode": "kaizen_managed | organizer_direct",
  "total_transferred": 0.0,
  "pending_transfer": 0.0
}
```

### New User Role
```python
class UserRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    ORG_ADMIN = "org_admin"
    DIRECTOR = "director"  # NEW
```

---

## 📁 Files to Create/Modify

### Backend (New Files)
1. `/app/backend/fund_transfer_models.py` - Pydantic models
2. `/app/backend/fund_transfer_routes.py` - API endpoints
3. `/app/backend/campaign_bank_routes.py` - Bank account management

### Backend (Modify)
1. `/app/backend/models.py` - Add fund_collection_mode, Director role
2. `/app/backend/server.py` - Register new routes

### Frontend (New Files)
1. `/app/frontend/src/pages/FundTransfers.js` - Super Admin dashboard
2. `/app/frontend/src/pages/DirectorApprovals.js` - Director approval panel
3. `/app/frontend/src/components/FundManagement.js` - Campaign fund tab

### Frontend (Modify)
1. `/app/frontend/src/pages/CreateCampaign.js` - Add fund_collection_mode
2. `/app/frontend/src/pages/CampaignDetail.js` - Add Fund Management tab
3. `/app/frontend/src/App.js` - Add new routes
4. `/app/frontend/src/components/Sidebar.js` - Add menu items

---

## 🔑 API Endpoints

### Fund Transfers
- `POST /api/fund-transfers` - Create transfer request
- `GET /api/fund-transfers` - List all transfers (Super Admin)
- `GET /api/fund-transfers/campaign/{id}` - Get campaign transfers
- `GET /api/fund-transfers/pending-approval` - Director pending list
- `PUT /api/fund-transfers/{id}/approve` - Approve transfer
- `PUT /api/fund-transfers/{id}/reject` - Reject transfer
- `PUT /api/fund-transfers/{id}/complete` - Mark as completed
- `POST /api/fund-transfers/{id}/notify` - Send notification

### Bank Accounts
- `POST /api/campaigns/{id}/bank-account` - Add bank account
- `GET /api/campaigns/{id}/bank-account` - Get bank account
- `PUT /api/campaigns/{id}/bank-account` - Update bank account

### Dashboard Stats
- `GET /api/fund-transfers/stats` - Overall stats (Super Admin)
- `GET /api/campaigns/{id}/fund-summary` - Campaign fund summary

---

## ⏱️ Development Phases

### Phase 1: Foundation (Backend)
1. Create models and database collections
2. Update Campaign model with fund_collection_mode
3. Create bank account APIs
4. Create fund transfer APIs

### Phase 2: Super Admin UI
1. Fund Transfers dashboard
2. Create transfer request modal
3. Complete transfer modal

### Phase 3: Director Approval
1. Add Director role
2. Create Director Approval page
3. Approval workflow APIs

### Phase 4: Organization Admin UI
1. Fund Management tab in campaign
2. Bank account management
3. Transfer history view

### Phase 5: Notifications
1. Email notification system (manual trigger)
2. Notification templates
3. Future: Automated notifications hook

---

Ready to proceed with development once you approve this plan!
