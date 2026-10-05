# Changelog

All notable changes to the Kaizen Events platform will be documented in this file.

---

## [1.0.0] - January 2026

### Added

#### Core Features
- **Campaign Management**
  - Create, edit, archive campaigns
  - Campaign status workflow: Draft → Active → Archived
  - Registration limits and caps
  - Campaign logos and branding

- **Form Builder**
  - Drag-and-drop form creation
  - Multiple field types: text, email, phone, dropdown, checkbox, file upload
  - Field validation and required fields
  - External form option (Google Forms, Typeform)

- **Landing Page Builder**
  - 8 pre-built templates with rich sample data:
    - Tech Conference
    - Corporate Gala
    - Professional Workshop
    - Product Launch
    - Charity Fundraiser
    - Sports Event
    - Wedding Celebration
    - Music Concert
  - Section types: Hero, About, Speakers, Schedule, Pricing, FAQ, Contact
  - Theme customization (colors, fonts)
  - Optional landing page toggle

- **Payment Integration**
  - Razorpay integration (cards, UPI, wallets)
  - Instamojo integration (payment links)
  - **External form webhook** for capturing payments from external forms
  - Campaign-specific webhook URLs
  - Payment status tracking

- **Registration System**
  - Public registration form
  - Registration status: pending, completed, failed
  - Registration toggle (manual open/close)
  - Registration window (date-based)
  - "Registration Closed" page with navigation

- **Public Website**
  - Homepage listing all active events
  - Public landing pages for each campaign
  - Public registration forms
  - Custom error pages (404, Registration Closed, Archived)

- **Admin Dashboard**
  - Overview statistics
  - Registration trends charts
  - Revenue tracking
  - Recent activity feed

- **User Management**
  - Super Admin and Org Admin roles
  - Campaign access control
  - Team member management

- **Analytics & Export**
  - Campaign analytics
  - Registration export (Excel)
  - Google Sheets sync (scaffolded)

#### Technical
- JWT-based authentication
- MongoDB database
- FastAPI backend with async support
- React frontend with Tailwind CSS
- Shadcn UI components
- Image compression for uploads
- CORS configuration

### Documentation
- README.md - Main documentation
- TECHNICAL.md - Technical documentation
- API_REFERENCE.md - API documentation
- ARCHITECTURE.md - System architecture
- INSTAMOJO_WEBHOOK.md - Webhook setup guide
- CHANGELOG.md - This file

---

## Version History

| Version | Date | Summary |
|---------|------|--------|
| 1.0.0 | Jan 2026 | Initial release with core features |

---

## Upcoming Features

- [ ] Form templates (Galas, Seminars, etc.)
- [ ] Form header image upload
- [ ] Live payment gateway testing
- [ ] Email notification templates
- [ ] Google Sheets real-time sync
- [ ] Bulk registration import
- [ ] Advanced analytics dashboard
- [ ] Multi-language support

---

## Migration Notes

### From Development to Production

1. Change default admin credentials
2. Set strong JWT_SECRET_KEY
3. Configure production MongoDB
4. Set up HTTPS/SSL
5. Configure production payment gateway keys
6. Verify CORS settings
7. Set up monitoring and logging

---

*For detailed technical information, see [TECHNICAL.md](TECHNICAL.md)*
