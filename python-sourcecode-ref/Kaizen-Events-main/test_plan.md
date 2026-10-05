# Comprehensive Test Plan - Kaizen Events Admin Panel

## Components to Test

### 1. Authentication & Authorization
- [ ] Super Admin Login
- [ ] Organisation Admin Login
- [ ] Role-based page access restrictions
- [ ] Token expiration handling

### 2. Dashboard Page
- [ ] Campaign filter dropdown
- [ ] Active/Inactive campaign counts
- [ ] Stats cards (Registrations, Paid, Pending, Revenue)
- [ ] Registration trend chart
- [ ] Revenue trend chart
- [ ] Recent registrations table
- [ ] Recent campaigns table
- [ ] Export Excel button
- [ ] Refresh button
- [ ] Org Admin restricted view

### 3. Campaigns Page
- [ ] List all campaigns
- [ ] Search/filter campaigns
- [ ] Create new campaign button
- [ ] Campaign cards display
- [ ] Status badges
- [ ] Org Admin sees only assigned campaigns

### 4. Campaign Detail Page
- [ ] Campaign info display
- [ ] Quick actions (Edit, Notifications, Form Builder, Landing Page)
- [ ] Payment settings modal
- [ ] Team member modal
- [ ] Analytics section
- [ ] View registrations link
- [ ] Public page link

### 5. Create/Edit Campaign
- [ ] Form validation
- [ ] Status selection
- [ ] Payment purpose field
- [ ] Save functionality

### 6. Form Builder
- [ ] Add/remove fields
- [ ] Field types (text, email, phone, select, etc.)
- [ ] Field validation rules
- [ ] Conditional logic
- [ ] Pricing rules
- [ ] Save form configuration

### 7. Landing Page Builder
- [ ] Template selection
- [ ] Section management (add/remove/reorder)
- [ ] Section editing
- [ ] Theme customization
- [ ] Preview functionality
- [ ] Save landing page

### 8. Campaign Registrations
- [ ] List registrations
- [ ] Search/filter
- [ ] Export CSV
- [ ] Export Excel
- [ ] View registration details

### 9. Payment Accounts
- [ ] List accounts
- [ ] Create Razorpay account
- [ ] Create Instamojo account
- [ ] Edit account
- [ ] Delete account
- [ ] Mode toggle (sandbox/production)

### 10. DKIM Registration
- [ ] List domains
- [ ] Register new domain
- [ ] View DNS records
- [ ] Verify domain
- [ ] Delete domain
- [ ] Create email senders
- [ ] Delete email senders

### 11. User Management
- [ ] List users
- [ ] Create Org Admin
- [ ] Edit user
- [ ] Delete user
- [ ] Campaign assignment

### 12. Campaign Settings
- [ ] Notifications tab
- [ ] Email notifications toggle
- [ ] DKIM sender selection
- [ ] CC/BCC recipients
- [ ] WhatsApp notifications toggle
- [ ] Google Sheets tab
- [ ] Sheets connection status

### 13. Public Landing Page
- [ ] Page renders correctly
- [ ] Registration button
- [ ] Modal opens
- [ ] Form submission
- [ ] Payment flow initiation

### 14. API Endpoints
- [ ] All CRUD operations
- [ ] Authentication middleware
- [ ] Error handling
- [ ] Data validation

