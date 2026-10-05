# Kaizen Events - Master Documentation

<p align="center">
  <img src="../frontend/public/kaizen-logo.png" alt="Kaizen Events Logo" width="150">
</p>

<p align="center">
  <strong>Complete Developer & Administrator Reference Guide</strong><br>
  Version 1.0.0 | Last Updated: December 2025
</p>

---

## Document Information

| Property | Value |
|----------|-------|
| **Application Name** | Kaizen Events |
| **Version** | 1.0.0 |
| **Platform Type** | Event Registration & Management System |
| **Tech Stack** | React + FastAPI + MongoDB |
| **License** | Proprietary |

---

## Table of Contents

### Part I: Overview & Getting Started
1. [Executive Summary](#part-i-executive-summary)
2. [Platform Capabilities](#platform-capabilities)
3. [Quick Start Guide](#quick-start-guide)
4. [Default Credentials](#default-credentials)

### Part II: System Architecture
5. [Architecture Overview](#part-ii-system-architecture)
6. [Technology Stack](#technology-stack)
7. [Directory Structure](#directory-structure)
8. [Component Diagram](#component-diagram)

### Part III: Database Design
9. [Database Schema](#part-iii-database-design)
10. [Collections Reference](#collections-reference)
11. [Data Models](#data-models)
12. [Indexes & Performance](#indexes--performance)

### Part IV: API Reference
13. [API Overview](#part-iv-api-reference)
14. [Authentication Endpoints](#authentication-endpoints)
15. [Campaign Endpoints](#campaign-endpoints)
16. [Registration Endpoints](#registration-endpoints)
17. [Payment Endpoints](#payment-endpoints)
18. [Kiosk Mode Endpoints](#kiosk-mode-endpoints)
19. [Administrative Endpoints](#administrative-endpoints)

### Part V: User Flows
20. [User Types & Roles](#part-v-user-flows)
21. [Super Admin Flows](#super-admin-flows)
22. [Organisation Admin Flows](#organisation-admin-flows)
23. [Kiosk Volunteer Flows](#kiosk-volunteer-flows)
24. [Public User Flows](#public-user-flows)

### Part VI: Feature Documentation
25. [Campaign Management](#part-vi-feature-documentation)
26. [Form Builder](#form-builder)
27. [Landing Page Builder](#landing-page-builder)
28. [Payment Integration](#payment-integration)
29. [Kiosk Mode](#kiosk-mode)
30. [Fund Transfers](#fund-transfers)

### Part VII: Integration Guides
31. [Payment Gateway Setup](#part-vii-integration-guides)
32. [Instamojo Webhook Configuration](#instamojo-webhook-configuration)
33. [WhatsApp Integration (Interakt)](#whatsapp-integration-interakt)
34. [Google Sheets Integration](#google-sheets-integration)
35. [Email Integration (Brevo)](#email-integration-brevo)

### Part VIII: Security
36. [Security Architecture](#part-viii-security)
37. [Authentication & Authorization](#authentication--authorization)
38. [Data Protection](#data-protection)
39. [Security Hardening](#security-hardening)
40. [VAPT Report Summary](#vapt-report-summary)

### Part IX: Deployment
41. [Deployment Overview](#part-ix-deployment)
42. [Environment Configuration](#environment-configuration)
43. [Cloud Deployment](#cloud-deployment)
44. [On-Premise Deployment](#on-premise-deployment)
45. [Docker Deployment](#docker-deployment)

### Part X: Operations & Maintenance
46. [Monitoring & Logging](#part-x-operations--maintenance)
47. [Backup & Recovery](#backup--recovery)
48. [Troubleshooting Guide](#troubleshooting-guide)
49. [Changelog](#changelog)

---

# Part I: Executive Summary

## Platform Overview

**Kaizen Events** is a comprehensive event registration and management platform designed for organizations to:

- Create and manage event campaigns
- Build custom registration forms with drag-and-drop interface
- Design landing pages using pre-built templates
- Process payments (online via Razorpay/Instamojo and offline via Kiosk Mode)
- Track registrations, revenue, and analytics
- Manage team access with role-based permissions
- Export data to external systems (Excel, Google Sheets)
- Send notifications via Email and WhatsApp

### Target Users

| User Type | Description |
|-----------|-------------|
| **Event Organizers** | NGOs, corporations, clubs organizing events |
| **Administrators** | Internal team managing the platform |
| **Attendees** | Public users registering for events |
| **Kiosk Volunteers** | On-site staff collecting registrations |

---

## Platform Capabilities

### Core Features Matrix

| Feature | Status | Description |
|---------|--------|-------------|
| Campaign Management | ✅ Complete | Full lifecycle management |
| Form Builder | ✅ Complete | Drag-drop with 10+ field types |
| Landing Page Builder | ✅ Complete | 8 templates with customization |
| Online Payments | ✅ Complete | Razorpay + Instamojo |
| Offline Payments | ✅ Complete | Kiosk Mode for cash collection |
| Hybrid Mode | ✅ Complete | Online + Kiosk combined |
| Fund Transfers | ✅ Complete | Multi-approval workflow |
| User Management | ✅ Complete | RBAC with 4 roles |
| Analytics | ✅ Complete | Dashboard + exports |
| Email Notifications | ⚠️ Pending IP Whitelist | Brevo integration ready |
| WhatsApp Notifications | ✅ Complete | Interakt integration |
| Google Sheets Sync | ✅ Complete | Real-time sync |

---

## Quick Start Guide

### For Administrators

```
Step 1: Login
─────────────────
Navigate to /login
Enter credentials (see Default Credentials below)

Step 2: Create Campaign
─────────────────
Dashboard → Campaigns → Create Campaign
Fill in: Name, Description, Payment Method
Save as Draft

Step 3: Build Form
─────────────────
Campaign Detail → Manage Registration Form
Drag fields from left panel
Configure labels, validation, pricing
Save Form

Step 4: Configure Payment
─────────────────
Control Panel → Payment Accounts
Add Razorpay or Instamojo credentials
Link to campaign in Campaign Settings

Step 5: Go Live
─────────────────
Campaign Detail → Toggle "Registration Open"
Change Status to "Active"
Share public URL with attendees
```

### For Public Users

```
Step 1: Browse Events
─────────────────
Visit homepage (/events)
View all active events

Step 2: Register
─────────────────
Click on event → Fill registration form
Select options and see total amount

Step 3: Pay
─────────────────
Complete payment via Razorpay/Instamojo
Receive confirmation email

Step 4: Done!
─────────────────
Registration confirmed
View details anytime
```

---

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | pranav@kaizeninfotech.com | Kaizentest1234 |
| **Kiosk Volunteer** | kiosk1@test.com | BeUVaZYs |

⚠️ **IMPORTANT**: Change these credentials before going to production!

---

# Part II: System Architecture

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              KAIZEN EVENTS ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│                                    INTERNET                                      │
│                                        │                                         │
│                                        ▼                                         │
│                         ┌──────────────────────────────┐                        │
│                         │      DNS / Load Balancer      │                        │
│                         │      (your-domain.com)        │                        │
│                         └──────────────┬───────────────┘                        │
│                                        │                                         │
│                         ┌──────────────┴───────────────┐                        │
│                         │      Reverse Proxy (Nginx)    │                        │
│                         │      SSL Termination          │                        │
│                         └──────────────┬───────────────┘                        │
│                                        │                                         │
│              ┌─────────────────────────┼─────────────────────────┐              │
│              │                         │                         │              │
│              ▼                         ▼                         ▼              │
│    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐       │
│    │    FRONTEND     │      │     BACKEND     │      │    STATIC       │       │
│    │    (React)      │      │    (FastAPI)    │      │    FILES        │       │
│    │    Port 3000    │      │    Port 8001    │      │   (uploads)     │       │
│    │                 │      │                 │      │                 │       │
│    │  • Dashboard    │      │  • REST API     │      │  • Logos        │       │
│    │  • Campaigns    │      │  • Auth/JWT     │      │  • Documents    │       │
│    │  • Form Builder │      │  • Payments     │      │  • Exports      │       │
│    │  • Landing Pages│      │  • Webhooks     │      │                 │       │
│    │  • Kiosk Mode   │      │  • Analytics    │      │                 │       │
│    └─────────────────┘      └────────┬────────┘      └─────────────────┘       │
│                                      │                                          │
│              ┌───────────────────────┼───────────────────────┐                 │
│              │                       │                       │                 │
│              ▼                       ▼                       ▼                 │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│    │    MongoDB      │    │    Razorpay     │    │    Instamojo    │          │
│    │    Database     │    │    Gateway      │    │    Gateway      │          │
│    │   Port 27017    │    │                 │    │                 │          │
│    └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                                  │
│    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│    │     Brevo       │    │    Interakt     │    │  Google Sheets  │          │
│    │    (Email)      │    │   (WhatsApp)    │    │     API         │          │
│    └─────────────────┘    └─────────────────┘    └─────────────────┘          │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.x | UI Framework |
| Tailwind CSS | 3.x | Styling |
| Shadcn UI | Latest | Component Library |
| Recharts | 2.x | Charts & Analytics |
| Axios | 1.x | HTTP Client |
| React Router | 6.x | Navigation |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Python | 3.11 | Runtime |
| FastAPI | 0.100+ | Web Framework |
| Pydantic | 2.x | Data Validation |
| Motor | 3.x | Async MongoDB Driver |
| PyJWT | 2.x | JWT Authentication |
| bcrypt | 4.x | Password Hashing |
| uvicorn | 0.23+ | ASGI Server |

### Database

| Technology | Version | Purpose |
|------------|---------|---------|
| MongoDB | 6.x | Primary Database |
| MongoDB Atlas | - | Cloud Option |

### External Services

| Service | Purpose |
|---------|---------|
| Razorpay | Card/UPI/Wallet Payments |
| Instamojo | Payment Links |
| Brevo (Sendinblue) | Transactional Email |
| Interakt | WhatsApp Notifications |
| Google Sheets API | Data Export/Sync |

---

## Directory Structure

```
/app
├── backend/
│   ├── server.py                    # Main FastAPI application
│   ├── auth.py                      # Authentication logic
│   ├── security.py                  # Security utilities (XSS, rate limiting)
│   ├── models.py                    # Core Pydantic models
│   ├── registration_models.py       # Registration data models
│   ├── form_models_advanced.py      # Form builder models
│   ├── payment_accounts_models.py   # Payment account models
│   ├── fund_transfer_models.py      # Fund transfer models
│   ├── analytics_models.py          # Analytics models
│   ├── landing_page_models.py       # Landing page models
│   │
│   ├── payment_routes.py            # Payment endpoints
│   ├── payment_service.py           # Payment business logic
│   ├── registration_routes.py       # Registration endpoints
│   ├── kiosk_routes.py              # Kiosk mode endpoints
│   ├── kiosk_volunteer_routes.py    # Kiosk volunteer management
│   ├── offline_payment_routes.py    # Offline payment handling
│   ├── fund_transfer_routes.py      # Fund transfer endpoints
│   ├── landing_page_routes.py       # Landing page endpoints
│   ├── analytics_routes.py          # Analytics endpoints
│   ├── user_routes.py               # User management
│   ├── sheets_routes.py             # Google Sheets integration
│   ├── notification_routes.py       # Email notifications
│   ├── whatsapp_routes.py           # WhatsApp integration
│   ├── url_shortener_routes.py      # URL shortening
│   ├── upload_routes.py             # File uploads
│   │
│   ├── formula_engine.py            # Secure expression parser
│   ├── audit_log.py                 # Audit logging
│   ├── integration_service.py       # External integrations
│   ├── invoice_service.py           # Invoice generation
│   ├── settlement_service.py        # Payment settlement
│   │
│   ├── requirements.txt             # Python dependencies
│   ├── Dockerfile                   # Backend container
│   ├── uploads/                     # File uploads directory
│   └── .env                         # Environment variables
│
├── frontend/
│   ├── public/
│   │   └── kaizen-logo.png
│   ├── src/
│   │   ├── App.js                   # Main router
│   │   ├── index.js                 # Entry point
│   │   ├── context/
│   │   │   └── AuthContext.js       # Auth state management
│   │   ├── services/
│   │   │   └── api.js               # Axios API client
│   │   ├── components/
│   │   │   ├── ui/                  # Shadcn UI components
│   │   │   ├── AppLayout.js         # Main layout
│   │   │   └── ErrorBoundary.js     # Error handling
│   │   ├── pages/
│   │   │   ├── Dashboard.js         # Admin dashboard
│   │   │   ├── Campaigns.js         # Campaign list
│   │   │   ├── CampaignDetail.js    # Campaign management
│   │   │   ├── CreateCampaign.js    # Campaign creation
│   │   │   ├── FormBuilder.js       # Drag-drop form builder
│   │   │   ├── LandingPageBuilder.js# Landing page editor
│   │   │   ├── KioskMode.js         # Kiosk interface
│   │   │   ├── ControlPanel.js      # Admin control panel
│   │   │   ├── FundTransfers.js     # Fund management
│   │   │   ├── PublicEventsHome.js  # Public events page
│   │   │   ├── PublicLandingPage.js # Public landing page
│   │   │   ├── PublicRegistration.js# Registration form
│   │   │   └── ErrorPages.js        # Error pages
│   │   └── utils/
│   │       └── formFieldTypes.js    # Form field definitions
│   │
│   ├── package.json                 # Node dependencies
│   ├── Dockerfile                   # Frontend container
│   ├── nginx.conf                   # Nginx config
│   └── .env                         # Environment variables
│
├── docs/
│   ├── MASTER_DOCUMENTATION.md      # This file
│   ├── API_REFERENCE.md             # API documentation
│   ├── ARCHITECTURE.md              # System architecture
│   ├── SECURITY_DOCUMENTATION.md    # Security guide
│   ├── USER_FLOWS.md                # User flow documentation
│   ├── DEPLOYMENT_GUIDE.md          # Deployment instructions
│   ├── TECHNICAL.md                 # Technical details
│   └── CHANGELOG.md                 # Version history
│
├── docker-compose.yml               # Production compose
├── docker-compose.dev.yml           # Development compose
├── mongo-init.js                    # Database initialization
├── .env.example                     # Environment template
└── README.md                        # Project readme
```

---

# Part III: Database Design

## Collections Overview

| Collection | Purpose | Key Fields |
|-----------|---------|------------|
| `users` | Admin users & roles | id, email, role, campaign_access |
| `campaigns` | Event campaigns | id, slug, status, payment_method |
| `registrations` | User registrations | id, campaign_id, form_data, payment_status |
| `payment_accounts` | Gateway credentials | id, gateway, api_key (encrypted) |
| `payments` | Payment transactions | id, registration_id, amount, status |
| `form_definitions` | Form structures | campaign_id, fields[] |
| `landing_pages` | Landing page content | campaign_id, sections[], theme |
| `fund_transfers` | Transfer requests | id, campaign_id, amount, status |
| `audit_logs` | Security audit trail | timestamp, event_type, user_id |
| `short_urls` | URL shortener | short_code, original_url |
| `campaign_members` | Closed group members | campaign_id, member_id, phone |

---

## Collections Reference

### users

```javascript
{
  id: "uuid-string",
  email: "user@example.com",        // Unique
  name: "User Name",
  hashed_password: "bcrypt-hash",   // Never exposed
  role: "super_admin",              // Enum: super_admin, org_admin, kiosk_volunteer, director
  is_active: true,
  
  // For org_admin - assigned campaigns
  campaign_access: ["campaign_id_1", "campaign_id_2"],
  
  // For director - approval permissions
  can_approve_transfers: true,
  
  // For kiosk_volunteer - assigned campaigns
  assigned_kiosk_campaigns: ["campaign_id"],
  
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z"
}
```

### campaigns

```javascript
{
  id: "uuid-string",
  name: "Annual Conference 2026",
  slug: "annual-conference-2026",    // URL-friendly, unique
  description: "Event description",
  logo_url: "https://...",
  organisation_name: "Rotary Club",
  
  // Campaign Type
  campaign_type: "open",             // Enum: open, closed_group
  
  // Payment Configuration
  payment_collection_method: "online", // Enum: online, offline
  fund_collection_mode: "kaizen_managed", // Enum: kaizen_managed, organizer_direct
  payment_enabled: true,
  payment_account_id: "uuid",
  base_price: 500.00,
  
  // Kiosk Mode
  kiosk_enabled: false,              // NEW: Hybrid mode toggle
  assigned_kiosk_volunteers: ["user_id"],
  
  // Visibility
  show_on_homepage: true,            // NEW: Homepage visibility toggle
  
  // Status & Lifecycle
  status: "active",                  // Enum: draft, active, closed, archived
  
  // Registration Settings
  registration_enabled: true,
  registration_limit: 500,
  current_registrations: 150,
  registration_start_date: "2025-01-01T00:00:00Z",
  registration_end_date: "2025-03-01T00:00:00Z",
  
  // Form Settings
  use_external_form: false,
  external_form_url: null,
  has_landing_page: true,
  
  // Stats
  total_revenue: 75000.00,
  total_transferred: 50000.00,
  pending_transfer: 25000.00,
  
  // Metadata
  created_by: "user_id",
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z"
}
```

### registrations

```javascript
{
  id: "uuid-string",
  campaign_id: "campaign-uuid",
  
  // User submitted data
  form_data: {
    name: "John Doe",
    email: "john@example.com",
    phone: "9876543210",
    // ... dynamic fields from form definition
  },
  
  // Pricing
  total_amount: 500.00,
  base_amount: 400.00,
  addon_amount: 100.00,
  
  // Status
  payment_status: "completed",       // Enum: pending, completed, failed, refunded, no_show
  registration_status: "confirmed",  // Enum: draft, submitted, confirmed, cancelled
  
  // Payment Details
  payment_gateway: "razorpay",       // Enum: razorpay, instamojo, offline
  gateway_payment_id: "pay_xxx",
  gateway_order_id: "order_xxx",
  payment_method: "upi",             // card, upi, netbanking, wallet, cash
  
  // Source
  source: "builtin",                 // Enum: builtin, external, kiosk
  
  // Offline Payment Info
  collected_by: "kiosk_volunteer_id",
  collected_at: "2025-01-15T10:30:00Z",
  receipt_number: "RCP-2025-001",
  
  // Metadata
  invoice_number: "INV-2025-0001",
  created_at: "2025-01-15T10:00:00Z",
  updated_at: "2025-01-15T10:30:00Z"
}
```

### payment_accounts

```javascript
{
  id: "uuid-string",
  name: "Main Razorpay Account",
  gateway_type: "razorpay",          // Enum: razorpay, instamojo
  is_active: true,
  
  // Razorpay Credentials
  razorpay_key_id: "rzp_xxx",        // Masked in API responses
  razorpay_key_secret: "encrypted",  // Encrypted storage
  
  // Instamojo Credentials (OAuth 2.0)
  instamojo_client_id: "xxx",
  instamojo_client_secret: "encrypted",
  instamojo_access_token: "encrypted",
  instamojo_token_expiry: "2025-01-01T00:00:00Z",
  
  // Stats
  total_transactions: 500,
  total_amount_collected: 250000.00,
  last_transaction_at: "2025-01-15T10:30:00Z",
  
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-15T00:00:00Z"
}
```

### fund_transfers

```javascript
{
  id: "uuid-string",
  request_number: "TR-2026-001",
  campaign_id: "campaign-uuid",
  campaign_name: "Annual Conference 2026",
  organization_name: "Rotary Club",
  
  // Amount Details
  gross_amount: 18525.00,
  platform_fee: 0.00,
  net_amount: 18525.00,
  
  // Status
  status: "completed",               // Enum: pending_approval, approved, rejected, completed
  
  // Bank Account Snapshot
  bank_account_id: "bank-uuid",
  bank_account_snapshot: {
    holder_name: "Rotary Club",
    account_number_masked: "****4567",
    ifsc: "HDFC0001234",
    bank_name: "HDFC Bank"
  },
  
  // Workflow Tracking
  created_by: "admin-user-id",
  created_at: "2025-01-06T10:00:00Z",
  notes: "Settlement for Jan 2026",
  
  approved_by: "director-user-id",
  approved_at: "2025-01-06T15:00:00Z",
  approval_notes: "Approved",
  
  completed_by: "admin-user-id",
  completed_at: "2025-01-07T09:00:00Z",
  transaction_reference: "NEFT/TXN/2026/01/07/123456",
  transfer_date: "2025-01-07",
  
  // Notification
  notification_sent: true,
  notification_sent_at: "2025-01-07T09:05:00Z",
  notification_email: "treasurer@org.com"
}
```

### audit_logs

```javascript
{
  id: "uuid-string",
  timestamp: "2025-01-15T10:30:00Z",
  
  // Event Info
  event_type: "LOGIN_SUCCESS",       // See audit event types below
  category: "authentication",
  
  // User Info
  user_id: "user-uuid",
  user_email: "p***v@kaizen.com",    // PII masked
  user_role: "super_admin",
  
  // Request Info
  ip_address: "192.168.1.1",
  user_agent: "Mozilla/5.0...",
  
  // Resource Info
  resource_type: "campaign",
  resource_id: "campaign-uuid",
  action_details: {
    // Context-specific details
  },
  
  // Result
  status: "success",                 // success, failure
  error_message: null,
  
  // Integrity (Hash Chain)
  integrity_hash: "sha256-hash",
  previous_hash: "sha256-previous"
}
```

**Audit Event Types:**
- Authentication: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`
- Users: `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `ROLE_CHANGED`
- Campaigns: `CAMPAIGN_CREATED`, `CAMPAIGN_UPDATED`, `CAMPAIGN_DELETED`, `CAMPAIGN_ARCHIVED`
- Registrations: `REGISTRATION_CREATED`, `REGISTRATION_UPDATED`, `REGISTRATION_DELETED`
- Payments: `PAYMENT_INITIATED`, `PAYMENT_COMPLETED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED`
- Fund Transfers: `TRANSFER_CREATED`, `TRANSFER_APPROVED`, `TRANSFER_REJECTED`, `TRANSFER_COMPLETED`
- Security: `RATE_LIMIT_EXCEEDED`, `UNAUTHORIZED_ACCESS`, `SUSPICIOUS_ACTIVITY`

---

## Indexes & Performance

### Required Indexes

```javascript
// Users
db.users.createIndex({ "id": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "role": 1 });

// Campaigns
db.campaigns.createIndex({ "id": 1 }, { unique: true });
db.campaigns.createIndex({ "slug": 1 }, { unique: true });
db.campaigns.createIndex({ "status": 1 });
db.campaigns.createIndex({ "show_on_homepage": 1, "status": 1 });

// Registrations
db.registrations.createIndex({ "id": 1 }, { unique: true });
db.registrations.createIndex({ "campaign_id": 1 });
db.registrations.createIndex({ "payment_status": 1 });
db.registrations.createIndex({ "created_at": -1 });
db.registrations.createIndex({ "campaign_id": 1, "payment_status": 1 });

// Audit Logs - with TTL for 2-year retention
db.audit_logs.createIndex({ "timestamp": 1 }, { expireAfterSeconds: 63072000 });
db.audit_logs.createIndex({ "event_type": 1, "timestamp": -1 });
db.audit_logs.createIndex({ "user_id": 1, "timestamp": -1 });

// Short URLs
db.short_urls.createIndex({ "short_code": 1 }, { unique: true });
```

---

# Part IV: API Reference

## API Overview

**Base URL:** `https://your-domain.com/api`

**Authentication:** JWT Bearer Token
```
Authorization: Bearer <token>
```

**Content Type:** `application/json`

**Response Format:**
```json
{
  "data": { ... },
  "message": "Success"
}
```

**Error Format:**
```json
{
  "detail": "Error message"
}
```

---

## Authentication Endpoints

### POST /api/auth/login

Login and receive JWT token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "super_admin"
  }
}
```

### GET /api/auth/me

Get current authenticated user.

**Response:**
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "super_admin",
  "campaign_access": []
}
```

---

## Campaign Endpoints

### GET /api/campaigns

List all campaigns (filtered by user role).

**Query Parameters:**
- `status`: Filter by status (draft, active, archived)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Annual Conference 2026",
    "slug": "annual-conference-2026",
    "status": "active",
    "current_registrations": 150,
    "total_revenue": 75000
  }
]
```

### POST /api/campaigns

Create new campaign.

**Request:**
```json
{
  "name": "Annual Conference 2026",
  "description": "Join us for...",
  "organisation_name": "Rotary Club",
  "campaign_type": "open",
  "payment_collection_method": "online",
  "fund_collection_mode": "kaizen_managed",
  "base_price": 500,
  "registration_limit": 500,
  "show_on_homepage": true,
  "kiosk_enabled": false
}
```

### GET /api/campaigns/{campaign_id}

Get campaign details.

### PUT /api/campaigns/{campaign_id}

Update campaign.

### DELETE /api/campaigns/{campaign_id}

Delete campaign (soft delete).

### POST /api/campaigns/{campaign_id}/archive

Archive campaign.

---

## Registration Endpoints

### POST /api/registrations/submit

Submit new registration (public endpoint).

**Request:**
```json
{
  "campaign_id": "uuid",
  "form_data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210"
  }
}
```

**Response:**
```json
{
  "registration_id": "uuid",
  "status": "pending",
  "payment_required": true,
  "amount": 500
}
```

### GET /api/campaigns/{campaign_id}/registrations

List campaign registrations (admin only).

**Query Parameters:**
- `status`: Filter by payment status
- `search`: Search by name/email/phone
- `page`: Page number
- `limit`: Items per page

### PUT /api/registrations/{registration_id}

Update registration details.

### GET /api/registrations/{campaign_id}/export

Export registrations to Excel.

---

## Payment Endpoints

### POST /api/payments/create

Create payment order.

**Request:**
```json
{
  "campaign_id": "uuid",
  "registration_id": "uuid",
  "amount": 500,
  "buyer_name": "John Doe",
  "buyer_email": "john@example.com",
  "buyer_phone": "9876543210"
}
```

**Response (Razorpay):**
```json
{
  "payment_id": "uuid",
  "gateway": "razorpay",
  "order_id": "order_xxx",
  "razorpay_key_id": "rzp_xxx",
  "amount": 500
}
```

### POST /api/payments/verify/razorpay

Verify Razorpay payment.

**Request:**
```json
{
  "razorpay_payment_id": "pay_xxx",
  "razorpay_order_id": "order_xxx",
  "razorpay_signature": "sig_xxx",
  "payment_id": "uuid"
}
```

### POST /api/payments/webhook/instamojo

Instamojo payment webhook (for built-in forms).

### POST /api/payments/webhook/instamojo/external/{campaign_slug}

External form webhook (for Google Forms, etc.).

### GET /api/payments/status/{payment_id}

Get payment status.

---

## Kiosk Mode Endpoints

### GET /api/kiosk/campaigns/{campaign_id}/info

Get kiosk campaign information.

### GET /api/kiosk/campaigns/{campaign_id}/stats

Get kiosk statistics (paid/pending/revenue).

### POST /api/kiosk/search

Search for registrants.

**Request:**
```json
{
  "campaign_id": "uuid",
  "query": "john"
}
```

### POST /api/kiosk/register

Create walk-in registration.

**Request:**
```json
{
  "campaign_id": "uuid",
  "form_data": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210"
  }
}
```

### POST /api/kiosk/confirm-payment

Mark payment as received.

**Request:**
```json
{
  "registration_id": "uuid",
  "amount_received": 500,
  "payment_method": "cash",
  "notes": "Received at counter"
}
```

---

## Administrative Endpoints

### Fund Transfers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/fund-transfers | List all transfers |
| POST | /api/fund-transfers | Create transfer request |
| GET | /api/fund-transfers/pending-approval | Get pending approvals (Director) |
| PUT | /api/fund-transfers/{id}/approve | Approve transfer |
| PUT | /api/fund-transfers/{id}/reject | Reject transfer |
| PUT | /api/fund-transfers/{id}/complete | Mark as completed |

### Payment Accounts

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/payment-accounts | List payment accounts |
| POST | /api/payment-accounts | Create payment account |
| PUT | /api/payment-accounts/{id} | Update payment account |
| DELETE | /api/payment-accounts/{id} | Delete payment account |

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/users | List users (Super Admin) |
| POST | /api/users | Create user |
| PUT | /api/users/{id} | Update user |
| DELETE | /api/users/{id} | Delete user |

---

## Public Endpoints (No Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/public/events | List active events |
| GET | /api/public/campaigns/{slug} | Get campaign for landing page |
| GET | /api/public/landing-page/{slug} | Get landing page content |
| GET | /api/public/form/{slug} | Get registration form |
| GET | /health | Health check |

---

# Part V: User Flows

## User Types & Roles

| Role | Access Level | Primary Functions |
|------|-------------|-------------------|
| **Super Admin** | Full system | All features, user management, system config |
| **Org Admin** | Campaign-specific | View/manage assigned campaigns |
| **Kiosk Volunteer** | Kiosk-only | On-site registration, payment collection |
| **Director** | Approval authority | Approve/reject fund transfers |
| **Public User** | Public pages | Browse events, register, pay |

---

## Super Admin Flows

### Campaign Creation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   CAMPAIGN CREATION FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Navigate: Dashboard → Campaigns → Create Campaign            │
│                                                                  │
│  2. Basic Info:                                                  │
│     • Campaign Name                                              │
│     • Organisation Name                                          │
│     • Description                                                │
│     • Logo (optional)                                            │
│                                                                  │
│  3. Campaign Type:                                               │
│     ○ Open - Anyone can register                                 │
│     ○ Closed Group - Pre-uploaded members only                   │
│                                                                  │
│  4. Payment Method:                                              │
│     ○ Online - Razorpay/Instamojo                               │
│     ○ Offline - Cash at venue (Kiosk Mode)                      │
│                                                                  │
│  5. Fund Collection (if Online):                                 │
│     ○ Kaizen Managed - Platform collects, transfers later        │
│     ○ Organizer Direct - Funds go to organizer directly          │
│                                                                  │
│  6. Settings:                                                    │
│     • Base Price                                                 │
│     • Registration Limit                                         │
│     • Show on Homepage toggle                                    │
│     • Enable Kiosk Mode toggle (for hybrid)                      │
│                                                                  │
│  7. Save → Campaign created in DRAFT status                      │
│                                                                  │
│  Next Steps:                                                     │
│  → Build Registration Form                                       │
│  → Configure Landing Page                                        │
│  → Link Payment Account                                          │
│  → Activate Campaign                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Form Builder Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     FORM BUILDER FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Access: Campaign Detail → Manage Registration Form              │
│                                                                  │
│  Available Field Types:                                          │
│  ├── 📝 Text Input (name, company)                              │
│  ├── 📧 Email Field                                             │
│  ├── 📱 Phone Number                                            │
│  ├── 📋 Dropdown (single selection)                             │
│  ├── ☑️ Checkbox (multiple selection)                           │
│  ├── 🔘 Radio Button (single selection)                         │
│  ├── 📅 Date Picker                                             │
│  ├── 📝 Text Area (long text)                                   │
│  ├── 📎 File Upload                                             │
│  └── 📑 Section Header                                          │
│                                                                  │
│  For Each Field:                                                 │
│  • Set Label                                                     │
│  • Mark Required/Optional                                        │
│  • Add Help Text                                                 │
│  • Configure Pricing (for options)                               │
│                                                                  │
│  Pricing Example:                                                │
│  ┌─────────────────────────────────┐                            │
│  │  T-Shirt Size (Dropdown)        │                            │
│  │  ├── Small - Free               │                            │
│  │  ├── Medium - Free              │                            │
│  │  ├── Large - +₹100              │                            │
│  │  └── XL - +₹150                 │                            │
│  └─────────────────────────────────┘                            │
│                                                                  │
│  Click "Save Form" when complete                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kiosk Volunteer Flows

### Walk-in Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 WALK-IN REGISTRATION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Click "New Walk-in Registration"                        │
│          Large button on kiosk interface                         │
│                                                                  │
│  Step 2: Fill Registration Form                                  │
│          • All campaign form fields appear                       │
│          • Enter attendee information                            │
│          • Select paid options (t-shirt, meals)                  │
│                                                                  │
│  Step 3: Review Total Amount                                     │
│          • System calculates: Base + Add-ons                     │
│          • Shows total prominently                               │
│                                                                  │
│  Step 4: Create Registration                                     │
│          • Click "Create & Continue"                             │
│          • Registration saved with PENDING status                │
│                                                                  │
│  Step 5: Collect Payment                                         │
│          ┌───────────────────────────────────────┐              │
│          │  Amount to Collect: ₹500              │              │
│          │                                       │              │
│          │  Amount Received: [________]          │              │
│          │                                       │              │
│          │  Payment Method:                      │              │
│          │  ○ Cash  ○ Card  ○ UPI               │              │
│          │                                       │              │
│          │  Notes: [____________________]        │              │
│          └───────────────────────────────────────┘              │
│                                                                  │
│  Step 6: Confirm Payment                                         │
│          • Click "Confirm Payment Received"                      │
│          • Receipt number generated                              │
│          • Success screen displayed                              │
│                                                                  │
│  Step 7: Next Registration                                       │
│          • Click "Next Registration"                             │
│          • Return to kiosk home                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Check-in Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      CHECK-IN FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Search for Registrant                                   │
│          • Enter name, email, or phone                           │
│          • Click Search                                          │
│                                                                  │
│  Step 2: Select from Results                                     │
│          • View name, contact info                               │
│          • See payment status (Paid/Pending)                     │
│          • Click to select                                       │
│                                                                  │
│  Step 3A: For PENDING Payments                                   │
│          • Amount due shown                                      │
│          • Enter amount received                                 │
│          • Select payment method                                 │
│          • Confirm payment                                       │
│                                                                  │
│  Step 3B: For COMPLETED Payments                                 │
│          • "Already Paid" badge shown                            │
│          • View details only                                     │
│          • Mark as checked-in (optional)                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Public User Flows

### Online Registration Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                ONLINE REGISTRATION FLOW                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Browse Events (/events)                                      │
│     • View all active events with cards                          │
│     • See event name, date, organization                         │
│                                                                  │
│  2. Click Event → Landing Page                                   │
│     • View full event details                                    │
│     • See speakers, schedule, pricing                            │
│     • Click "Register Now"                                       │
│                                                                  │
│  3. Fill Registration Form                                       │
│     • Enter required information                                 │
│     • Select options (pricing updates)                           │
│     • Review total amount                                        │
│                                                                  │
│  4. Submit & Pay                                                 │
│     • Click "Submit & Pay"                                       │
│     • Redirected to payment gateway                              │
│                                                                  │
│  5. Complete Payment                                             │
│     ┌─────────────────────────────────────┐                     │
│     │  Choose Payment Method:             │                     │
│     │  • Credit/Debit Card                │                     │
│     │  • UPI                              │                     │
│     │  • Net Banking                      │                     │
│     │  • Wallet                           │                     │
│     └─────────────────────────────────────┘                     │
│                                                                  │
│  6. Success!                                                     │
│     • Registration confirmed                                     │
│     • Receipt displayed                                          │
│     • Confirmation email sent                                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# Part VI: Feature Documentation

## Campaign Management

### Campaign Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Open** | Anyone can register | Public events, conferences |
| **Closed Group** | Pre-uploaded members only | Club events, member-only |

### Payment Methods

| Method | Description | Features |
|--------|-------------|----------|
| **Online** | Razorpay/Instamojo gateway | Instant confirmation, multiple payment modes |
| **Offline** | Cash collection at venue | Kiosk mode, manual verification |
| **Hybrid** | Online + Kiosk | Both options available |

### Campaign Status Lifecycle

```
DRAFT → ACTIVE → CLOSED → ARCHIVED
  │        │        │         │
  │        │        │         └── Historical record
  │        │        └── Registrations stopped
  │        └── Open for registrations
  └── Not visible to public
```

---

## Form Builder

### Field Types Reference

| Field Type | Description | Pricing Support |
|------------|-------------|-----------------|
| Text | Single line input | ❌ |
| Email | Validated email | ❌ |
| Phone | Phone number | ❌ |
| Number | Numeric input | ❌ |
| Dropdown | Single selection | ✅ |
| Checkbox | Multiple selection | ✅ |
| Radio | Single selection | ✅ |
| Date | Date picker | ❌ |
| Textarea | Multi-line text | ❌ |
| File Upload | Document/image | ❌ |
| Section Header | Form organization | ❌ |

### Pricing Configuration

Fields with pricing support can have per-option pricing:

```javascript
{
  "field_type": "dropdown",
  "label": "Meal Preference",
  "options": [
    { "value": "veg", "label": "Vegetarian", "price": 0 },
    { "value": "non-veg", "label": "Non-Vegetarian", "price": 100 },
    { "value": "vegan", "label": "Vegan", "price": 150 }
  ]
}
```

---

## Kiosk Mode

### Features

- Walk-in registration with dynamic form
- Search existing registrants
- Mark payments as received
- Real-time statistics
- Receipt generation

### Access Methods

1. **Direct URL:** `/kiosk/{campaign-id}`
2. **Login Redirect:** Kiosk volunteers redirected after login
3. **Short URL:** Admin-configured short links

### Statistics Dashboard

```
┌─────────────────────────────────────────────┐
│  KIOSK STATS                                │
├─────────────────────────────────────────────┤
│                                             │
│  ✅ Paid          ⏳ Pending     💰 Revenue │
│     150              25            ₹75,000  │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Fund Transfers

### Approval Workflow

```
┌──────────────────────────────────────────────────────────────────┐
│                    FUND TRANSFER WORKFLOW                         │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Super Admin            Director              Super Admin         │
│       │                    │                      │               │
│       │ Creates Transfer   │                      │               │
│       │ Request            │                      │               │
│       ▼                    │                      │               │
│  ┌─────────┐               │                      │               │
│  │ PENDING │──────────────▶│                      │               │
│  │ APPROVAL│               │                      │               │
│  └─────────┘               ▼                      │               │
│                       ┌─────────┐                 │               │
│                       │ REVIEW  │                 │               │
│                       └────┬────┘                 │               │
│                            │                      │               │
│              ┌─────────────┴─────────────┐        │               │
│              │                           │        │               │
│              ▼                           ▼        │               │
│         ┌─────────┐                 ┌─────────┐   │               │
│         │APPROVED │                 │REJECTED │   │               │
│         └────┬────┘                 └─────────┘   │               │
│              │                                    │               │
│              └────────────────────────────────────▶               │
│                                                   │               │
│                                              ┌────┴────┐          │
│                                              │COMPLETED│          │
│                                              └─────────┘          │
│                                                   │               │
│                                              Notification         │
│                                              Sent                 │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

# Part VII: Integration Guides

## Payment Gateway Setup

### Razorpay Configuration

1. **Get Credentials:**
   - Login to [Razorpay Dashboard](https://dashboard.razorpay.com/)
   - Settings → API Keys → Generate Key

2. **Add to Kaizen:**
   - Control Panel → Payment Accounts
   - Add New → Select Razorpay
   - Enter Key ID and Secret

3. **Test Cards:**
   | Card | Number |
   |------|--------|
   | Success | 4111 1111 1111 1111 |
   | Failure | 4000 0000 0000 0002 |

### Instamojo Configuration

1. **Get OAuth Credentials:**
   - Login to [Instamojo Dashboard](https://www.instamojo.com/dashboard/)
   - Developer/API Settings → OAuth Apps
   - Create new OAuth App

2. **Add to Kaizen:**
   - Control Panel → Payment Accounts
   - Add New → Select Instamojo
   - Enter Client ID and Secret

---

## Instamojo Webhook Configuration

### For External Forms (Google Forms, Typeform)

1. **Get Webhook URL:**
   - Campaign Detail → Registration Form → External Form
   - Copy the webhook URL:
   ```
   https://your-domain.com/api/payments/webhook/instamojo/external/{campaign-slug}
   ```

2. **Configure in Instamojo:**
   - Create Payment Link
   - Advanced Settings → Webhook URL
   - Paste the webhook URL

3. **Data Captured:**
   - Buyer name, email, phone
   - Payment amount
   - Transaction ID
   - Timestamp

---

## WhatsApp Integration (Interakt)

### Required Templates

Create these templates in Interakt:

1. **payment_reminder** (Required)
   ```
   Hi {{1}},
   
   Reminder to complete registration for *{{2}}*.
   
   Link: {{3}}
   
   Regards,
   Kaizen Events
   ```

2. **registration_confirmation** (Optional)
   ```
   Hi {{1}},
   
   Registration confirmed for *{{2}}*! 🎉
   
   Date: {{3}}
   Venue: {{4}}
   ```

### API Key Configuration

Add to backend `.env`:
```
INTERAKT_API_KEY=your-interakt-api-key
```

---

## Email Integration (Brevo)

### Setup Steps

1. **Get API Key:**
   - [Brevo Dashboard](https://app.brevo.com/)
   - Settings → SMTP & API → API Keys

2. **Configure:**
   ```
   BREVO_API_KEY=xkeysib-xxx
   ```

3. **IP Whitelist:**
   - Add server IP: `35.184.53.215`
   - Settings → Senders & IPs → IPs

### Email Templates

- Registration Confirmation
- Payment Receipt
- Event Reminder
- Password Reset

---

# Part VIII: Security

## Security Architecture

### Defense in Depth Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LAYER 1: PERIMETER                                             │
│  ├── Rate Limiting (Login: 10/min, API: 100/min)               │
│  ├── CORS Policy (Restricted Origins)                           │
│  └── Security Headers (CSP, X-Frame, HSTS)                      │
│                                                                  │
│  LAYER 2: APPLICATION                                           │
│  ├── JWT Token Authentication                                   │
│  ├── Role-Based Access Control (RBAC)                           │
│  ├── Input Validation (Pydantic)                                │
│  └── Secure Expression Parser (No eval())                       │
│                                                                  │
│  LAYER 3: DATA                                                  │
│  ├── bcrypt Password Hashing                                    │
│  ├── Secure OTP (secrets module)                                │
│  ├── MongoDB Query Sanitization                                 │
│  └── XSS Prevention (html.escape)                               │
│                                                                  │
│  LAYER 4: AUDIT                                                 │
│  ├── Immutable Audit Logs                                       │
│  ├── Hash Chain Integrity                                       │
│  └── 2-Year Retention (TTL)                                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Authentication & Authorization

### Password Requirements

- Minimum 8 characters
- At least 1 uppercase letter (A-Z)
- At least 1 lowercase letter (a-z)
- At least 1 digit (0-9)
- Common passwords blocked

### JWT Token Configuration

| Setting | Value |
|---------|-------|
| Algorithm | HS256 |
| Expiry | 24 hours |
| Secret | 64+ bytes |

### Role Permissions Matrix

| Permission | Super Admin | Org Admin | Kiosk Vol | Director |
|------------|-------------|-----------|-----------|----------|
| Create Campaign | ✅ | ❌ | ❌ | ❌ |
| Edit Campaign | ✅ | Assigned | ❌ | ❌ |
| View Registrations | ✅ | Assigned | Assigned | ❌ |
| Kiosk Mode | ✅ | ❌ | Assigned | ❌ |
| Fund Transfers | ✅ | ❌ | ❌ | Approve |
| User Management | ✅ | ❌ | ❌ | ❌ |
| Payment Accounts | ✅ | ❌ | ❌ | ❌ |

---

## Security Hardening

### Vulnerabilities Fixed

| Vulnerability | Severity | Fix |
|---------------|----------|-----|
| `eval()` Code Injection | CRITICAL | Secure expression parser |
| Insecure OTP | HIGH | `secrets.token_hex()` |
| XSS in Descriptions | HIGH | `html.escape()` |
| Missing Rate Limits | MEDIUM | RateLimitMiddleware |

### Security Headers

| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| X-XSS-Protection | 1; mode=block |
| Content-Security-Policy | Strict |
| Referrer-Policy | strict-origin-when-cross-origin |

---

## VAPT Report Summary

**Overall Security Rating: PASS (21/22 controls)**

### Key Findings

| Control | Status |
|---------|--------|
| NoSQL Injection Prevention | ✅ Pass |
| XSS Prevention | ✅ Pass |
| Authentication Required | ✅ Pass |
| Password Hash Protection | ✅ Pass |
| API Key Protection | ✅ Pass |
| CORS Configuration | ✅ Pass |
| Security Headers | ✅ Pass |
| RBAC Implementation | ✅ Pass |
| JWT Token Validation | ✅ Pass |
| Password Policy | ✅ Pass |
| Payment Webhook Security | ✅ Pass |

---

# Part IX: Deployment

## Environment Configuration

### Backend Environment Variables

```bash
# Database
MONGO_URL=mongodb://localhost:27017
DB_NAME=kaizen_events

# Security
JWT_SECRET_KEY=your-64-char-random-string

# URLs
FRONTEND_URL=https://your-domain.com

# Payment Gateways
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
INSTAMOJO_CLIENT_ID=xxx
INSTAMOJO_CLIENT_SECRET=xxx

# Notifications
BREVO_API_KEY=xxx
INTERAKT_API_KEY=xxx
```

### Frontend Environment Variables

```bash
REACT_APP_BACKEND_URL=https://your-domain.com/api
```

---

## Cloud Deployment Options

| Provider | Frontend | Backend | Database | Est. Cost |
|----------|----------|---------|----------|-----------|
| Vercel + Railway | Vercel | Railway | MongoDB Atlas | $0-25/mo |
| AWS | S3 + CloudFront | EC2/ECS | DocumentDB | $30-100/mo |
| Google Cloud | Cloud Storage | Cloud Run | Atlas | $25-80/mo |
| DigitalOcean | App Platform | App Platform | Managed DB | $12-48/mo |

---

## On-Premise Deployment

### Linux (Ubuntu)

```bash
# Quick deploy
sudo bash deploy-kaizen.sh

# Services
pm2 start ecosystem.config.js
sudo systemctl restart nginx
```

### Windows Server

```powershell
# Quick deploy
.\Deploy-Kaizen.ps1

# Services
Get-Service KaizenBackend, KaizenFrontend
Restart-Service KaizenBackend
```

---

## Docker Deployment

### Quick Start

```bash
# Clone and configure
git clone your-repo
cp .env.example .env

# Edit .env with your values
nano .env

# Deploy
docker-compose up -d

# View logs
docker-compose logs -f
```

### Services

```yaml
services:
  mongodb:    # Database
  backend:    # FastAPI
  frontend:   # React + Nginx
  nginx:      # Reverse proxy
```

---

# Part X: Operations & Maintenance

## Monitoring & Logging

### Log Locations

**Linux:**
```bash
# Backend logs
tail -f /var/log/supervisor/backend.err.log

# Frontend logs
tail -f /var/log/supervisor/frontend.err.log

# Nginx logs
tail -f /var/log/nginx/access.log
```

**Docker:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Health Check

```bash
curl https://your-domain.com/health
# Expected: {"status": "healthy"}
```

---

## Backup & Recovery

### Database Backup

```bash
# Manual backup
mongodump --uri="mongodb://..." --out=/backup/$(date +%Y%m%d)

# Restore
mongorestore --uri="mongodb://..." /backup/20251201
```

### Automated Backup Script

```bash
#!/bin/bash
# /opt/scripts/backup.sh
BACKUP_DIR="/backup/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
mongodump --uri="$MONGO_URL" --out="$BACKUP_DIR/$DATE"
find $BACKUP_DIR -type d -mtime +7 -exec rm -rf {} +
```

Add to crontab:
```
0 2 * * * /opt/scripts/backup.sh
```

---

## Troubleshooting Guide

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Login fails | Wrong credentials | Check email/password |
| 500 errors | Backend crash | Check backend logs |
| Payment fails | Gateway config | Verify API keys |
| Emails not sent | IP not whitelisted | Whitelist server IP |
| CORS errors | Wrong origin | Check CORS config |

### Debug Commands

```bash
# Check services
sudo supervisorctl status

# Check MongoDB
mongosh --eval 'db.runCommand("ping")'

# Check backend health
curl -v http://localhost:8001/health

# Check frontend
curl -v http://localhost:3000
```

---

## Changelog

### Version 1.0.0 (January 2026)

**Features:**
- Campaign Management (Draft/Active/Archived)
- Drag-and-drop Form Builder
- Landing Page Builder (8 templates)
- Razorpay & Instamojo Integration
- Kiosk Mode for offline payments
- Hybrid Mode (Online + Kiosk)
- Fund Transfer with approval workflow
- Role-based access control
- Google Sheets sync
- WhatsApp notifications (Interakt)

**Security:**
- Removed `eval()` vulnerability
- Secured OTP generation
- Added XSS protection
- Implemented audit logging
- Added rate limiting

---

## Support & Resources

### Documentation Links

| Document | Purpose |
|----------|---------|
| [API Reference](API_REFERENCE.md) | Complete API documentation |
| [User Flows](USER_FLOWS.md) | Detailed user workflows |
| [Security Guide](SECURITY_DOCUMENTATION.md) | Security implementation |
| [Deployment Guide](DEPLOYMENT_GUIDE.md) | Deployment instructions |

### External Resources

- [MongoDB Documentation](https://docs.mongodb.com/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://reactjs.org/docs/)
- [Razorpay Docs](https://razorpay.com/docs/)
- [Instamojo Docs](https://docs.instamojo.com/)

---

<p align="center">
  <strong>Kaizen Events - Master Documentation</strong><br>
  Version 1.0.0 | December 2025<br>
  <em>Made with ❤️ for Kaizen Events</em>
</p>
