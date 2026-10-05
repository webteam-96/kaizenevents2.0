# Kaizen Events - Complete User Guide

**Version**: 1.0  
**Last Updated**: April 2026  
**Platform**: Kaizen Events - Self-Hosted Event Registration & Management Platform

---

## Table of Contents

1. [Introduction & Terminology](#1-introduction--terminology)
2. [Getting Started](#2-getting-started)
3. [User Roles Explained](#3-user-roles-explained)
4. [Event Management](#4-event-management)
5. [Form Builder](#5-form-builder)
6. [Pricing & Formulas](#6-pricing--formulas)
7. [Field Rules & Conditional Logic](#7-field-rules--conditional-logic)
8. [Multi-Page Forms](#8-multi-page-forms)
9. [Landing Page Builder](#9-landing-page-builder)
10. [Public User Experience](#10-public-user-experience)
11. [Online Payments](#11-online-payments)
12. [Offline Payments](#12-offline-payments)
13. [Kiosk Mode](#13-kiosk-mode)
14. [Managing Registrations](#14-managing-registrations)
15. [Closed Group Events](#15-closed-group-events)
16. [Payment Accounts](#16-payment-accounts)
17. [Fund Transfers](#17-fund-transfers)
18. [Director Approvals](#18-director-approvals)
19. [Notifications & Communications](#19-notifications--communications)
20. [Google Sheets Integration](#20-google-sheets-integration)
21. [User Management](#21-user-management)
22. [DKIM & Email Deliverability](#22-dkim--email-deliverability)
23. [URL Shortener](#23-url-shortener)
24. [Analytics & Reporting](#24-analytics--reporting)
25. [Activity Logs](#25-activity-logs)
26. [Appendix](#26-appendix)

---

## 1. Introduction & Terminology

### What is Kaizen Events?

Kaizen Events is a self-hosted event registration and management platform. It serves as an alternative to hosted form builders like Zoho Forms, with the added benefit of integrated payment processing, a visual drag-and-drop form builder with formula-based dynamic pricing, a landing page builder with pre-built templates, and team and event management tools.

The platform handles the full lifecycle of event management: creating events, building registration forms, publishing landing pages, collecting payments through Razorpay or Instamojo, managing registrations, handling on-site check-in via kiosk mode, and transferring collected funds to organizers.

### Key Terminology

- **Event**: The central object in Kaizen Events. An event represents a single gathering or occasion. It contains a registration form, a landing page, payment configuration, and all associated registrations. Everything in the system is organized around events.

- **Registration**: A single user's sign-up for an event. A registration contains the form data submitted by the user, a payment record (if applicable), and status tracking through the lifecycle (draft, submitted, confirmed, cancelled, no-show).

- **Slug**: A URL-friendly identifier for an event, automatically generated from the event name. For example, an event named "Tech Summit 2026" gets the slug `tech-summit-2026`. The slug is used in public-facing URLs like `/event/tech-summit-2026` and `/register/tech-summit-2026`.

- **Landing Page**: A public-facing marketing page for an event. Built using the Landing Page Builder, it can include sections like a hero banner, about section, speakers, schedule, pricing tiers, FAQ, and contact information. The landing page lives at `/event/:slug`.

- **Form Builder**: The drag-and-drop interface for designing registration forms. Supports 14 field types, conditional logic (field rules), formula-based dynamic pricing, multi-page forms, and form design customization.

- **Kiosk**: An on-site registration and check-in mode designed for use at the event venue. Kiosk mode provides a simplified interface for searching registrants, verifying identity via OTP, recording cash payments, and creating walk-in registrations.

- **Fund Transfer**: The process of moving collected registration funds from the platform to the event organizer's bank account. Applies only to events using the "Kaizen Managed" fund collection mode.

- **Payment Account**: A configured payment gateway account (Razorpay or Instamojo) with API credentials. Multiple payment accounts can be created and assigned to different events.

- **Closed Group**: An event type where only pre-approved members can register. Members are uploaded via CSV/Excel file. During registration, users must verify their identity by matching their phone number against the member list.

- **Fund Collection Mode**: Determines how payment funds flow. "Kaizen Managed" means the platform holds funds and transfers them to the organizer later. "Organizer Direct" means the payment gateway deposits directly into the organizer's linked bank account.

- **Director**: Any user who has the `can_approve_transfers` permission flag enabled. Directors can approve or reject fund transfer requests and change requests. This is a permission, not a separate role.

- **OTP**: One-Time Password. Used for identity verification in offline payments and kiosk mode. A 6-digit code sent to the registrant's phone number via SMS or WhatsApp.

- **Invoice Number**: A unique identifier assigned to each confirmed registration, used for receipt and tracking purposes.

---

## 2. Getting Started

### Accessing the Public Homepage

The public homepage is available at the root URL (`/`). It displays all active events that have the "Show on Homepage" option enabled. Each event card shows the event name, organization, description, logo image, and a "Register" button that links to the registration form.

Visitors do not need to log in to view the homepage, browse landing pages, or complete registrations. These are all public-facing pages.

### Logging In

Navigate to `/login` to access the admin interface. Enter your email address and password, then click "Log In". Upon successful authentication, you will be redirected to the Dashboard (`/dashboard`).

If you do not have an account, contact a Super Admin to create one for you. There is no self-registration for admin accounts.

Your session is maintained via a JWT access token (valid for 30 minutes) and a refresh token (valid for 7 days). The token refreshes automatically in the background. If your session expires, you will be redirected to the login page.

### The Dashboard

The Dashboard (`/dashboard`) is the first screen you see after logging in. It provides an overview of your events and registrations.

**Statistics Cards** (displayed at the top):
- Total Events (and breakdown by active/inactive)
- Total Registrations
- Paid Registrations
- Pending Registrations
- Total Revenue collected

**Event Filter**: A dropdown at the top lets you filter all dashboard statistics and charts by a specific event, or view "All Events" aggregated data.

**Trend Charts**: Two charts show the last 7 days of data:
- Registration Trend: An area chart showing daily registration counts
- Revenue Trend: A bar chart showing daily revenue collected

**Recent Registrations**: A table showing the most recent registrations across your events, displaying registrant name, event, amount, payment status, and date.

**Quick Actions**: Buttons to create a new event, export data, or refresh the dashboard.

### Navigation

The navigation bar is fixed at the top of the screen. It contains:
- **Kaizen Events logo** (links to Dashboard)
- **Dashboard** link
- **Events** link
- **Fund Transfers** link (Super Admin only)
- **Control Panel** link (Super Admin only)
- **User name and avatar** (displayed on the right)
- **Logout** button

On mobile devices, a hamburger menu opens a side drawer with the same navigation items.

The navigation items you see depend on your role:
- **Super Admin**: Dashboard, Events, Fund Transfers, Control Panel
- **Org Admin**: Dashboard, Events
- **Kiosk Volunteer**: Only sees the Kiosk Mode interface for their assigned events

---

## 3. User Roles Explained

Kaizen Events has three user roles and one permission-based designation:

### Super Admin

The Super Admin has unrestricted access to every feature in the platform. There should be at least one Super Admin account in any deployment.

**What a Super Admin can do:**
- Create, edit, archive, unarchive, and delete events
- Access all events (not restricted by event assignment)
- Build and edit registration forms and landing pages
- Manage all registrations across all events
- Create and manage payment accounts (Razorpay and Instamojo)
- Manage fund transfers: view fund summaries, create transfer requests, mark transfers as completed
- Access the Control Panel with all sub-pages: User Management, Payment Accounts, Kiosk Volunteers, Integrations, DKIM Registration, Activity Logs, and Approvals
- Create and manage other users (Super Admins and Org Admins)
- Configure integrations (Brevo email, Google Sheets)
- Register and verify DKIM domains for email deliverability
- View activity logs and audit trails
- Export registration data

### Org Admin (Event Organizer)

An Org Admin is scoped to specific events. When a Super Admin creates an Org Admin user, they assign which events that user can access.

**What an Org Admin can do:**
- View the Dashboard (filtered to their assigned events)
- View and manage their assigned events (but not create new ones)
- Build and edit registration forms for their events
- Build and edit landing pages for their events
- View and manage registrations for their events
- Manage closed group members for their events
- Handle offline payment verification for their events
- Export registration data for their events
- View event analytics

**What an Org Admin cannot do:**
- Create new events
- Access events they are not assigned to
- Manage payment accounts
- Access the Control Panel
- Create or manage other users
- Configure integrations or DKIM
- Manage fund transfers or approvals
- View activity logs

### Kiosk Volunteer

A Kiosk Volunteer is a limited-access account designed for on-site event staff. Volunteers are created through the Kiosk Volunteers management page and assigned to specific events.

**What a Kiosk Volunteer can do:**
- Access Kiosk Mode (`/kiosk/:eventId`) for their assigned events
- Search for registrants by name, email, phone, or registration ID
- Send and verify OTP for identity confirmation
- Record cash, card, or UPI payments received at the venue
- Create walk-in registrations for new attendees
- View kiosk-specific statistics (total registrations, verified today, pending payments)

**What a Kiosk Volunteer cannot do:**
- Access the admin Dashboard, Campaigns list, or any other admin page
- Edit campaign settings, forms, or landing pages
- Export data or view analytics
- Manage users or payment accounts

### Director (Permission-Based)

A Director is not a separate role but rather any user (Super Admin or Org Admin) who has the `can_approve_transfers` flag enabled on their account. This flag is set by a Super Admin in User Management.

**What a Director can do (in addition to their base role):**
- Access the Approvals page (`/approvals`)
- Review pending fund transfer requests and approve or reject them
- Review pending change requests (bank account changes, payment gateway changes, fund collection mode changes) and approve or reject them
- View the approval history
- Access User Management to view users (read-only for Org Admin directors)
- Access Activity Logs

---

## 4. Event Management

### What is an Event?

An event is the core organizational unit in Kaizen Events. It represents a single gathering or occasion and bundles together everything related to that event: the registration form, the landing page, payment configuration, registrations, members (for closed groups), and fund management settings.

Each event has a unique slug used in public URLs, a lifecycle status, and configuration for how payments are collected and funds are managed.

### Creating an Event

**URL**: `/events/create`  
**Access**: Super Admin only

To create an event, click the "Create Event" button on the Events list page or the Dashboard. You will be taken to a form with the following fields:

**Basic Information:**
- **Event Name** (required): The display name of the event. When you type the name, the system auto-generates a URL slug below it.
- **Slug** (auto-generated): The URL-friendly identifier. You can manually edit the slug if needed. This becomes part of the public URL (`/event/your-slug` and `/register/your-slug`).
- **Organization Name**: The name of the organizing entity, displayed on the public pages.
- **Description**: A brief description of the event.
- **Event Logo**: Upload an image or use the default sample image. This appears on the homepage card and landing page.

**Event Type:**
- **Open**: Anyone can register. The form is publicly accessible.
- **Closed Group**: Only pre-approved members can register. Members must be uploaded first, and registrants verify their identity by phone number.

**Payment Configuration:**
- **Fund Collection Mode** (required for online payment events):
  - **Kaizen Managed**: The platform collects and holds the funds. You later create fund transfer requests to move money to the organizer's bank account. A 2.95% platform fee applies.
  - **Organizer Direct**: The payment gateway deposits funds directly into the organizer's linked bank account. No platform fee, no fund transfers needed.
- **Payment Collection Method**:
  - **Online**: Registrants pay via Razorpay or Instamojo during registration.
  - **Offline**: Registrants submit the form without paying online. Payment is collected in person and verified via OTP. If you select offline, the fund collection mode is automatically set to "Organizer Direct".
- **Payment Gateway**: Choose Razorpay or Instamojo (determined by the payment account you select).
- **Payment Account**: Select a configured payment account. Only accounts matching the selected gateway type are shown.
- **Payment Purpose**: A label describing what the payment is for (e.g., "Registration Fee", "Donation").

**Registration Settings:**
- **Kiosk Enabled**: Toggle to enable Kiosk Mode for this event. When enabled, kiosk volunteers can use the on-site registration interface.
- **Show on Homepage**: Toggle to display this event on the public homepage listing.
- **Status**: Set to "Draft" initially. Change to "Active" when ready to accept registrations.
- **Max Registrations**: Optional cap on the number of registrations. Leave blank for unlimited.
- **Registration Start Date**: Optional date when registration opens. Before this date, the registration form shows a "Registration not yet open" message.
- **Registration End Date**: Optional date when registration closes. After this date, the form shows a "Registration closed" message.

Click "Create Event" to save. You will be redirected to the Event Detail page.

### Event Lifecycle

Events move through the following statuses:

1. **Draft**: The initial state after creation. The event is not publicly accessible. Use this time to configure the form, landing page, and payment settings.
2. **Active**: The event is live and accepting registrations (subject to registration dates if set). The public landing page and registration form are accessible.
3. **Archived**: The event is no longer active. Registration forms show an "Event Archived" message. Event data is preserved for reference.

Status transitions:
- Draft to Active: Set the status to "active" from the event settings or edit page
- Active to Archived: Click "Archive" on the Event Detail page (confirmation required)
- Archived to Active: Click "Unarchive" on the Event Detail page
- Any status to Deleted: Super Admin can permanently delete an event (irreversible)

### Editing an Event

**URL**: `/events/:eventId/edit`  
**Access**: Super Admin

Navigate to the Event Detail page and click the "Edit" button. The edit form contains the same fields as the creation form, pre-populated with current values. Make your changes and click "Save".

### Event Detail Page

**URL**: `/events/:eventId`  
**Access**: Super Admin, assigned Org Admins

The Event Detail page is the central hub for managing an event. It is divided into several sections:

**Header**: Shows the event name, status badge, organization name, and quick action buttons (Edit, Form Builder, Landing Page, Registrations, Members, Settings).

**Overview Section**:
- Statistics cards: Total Registrations, Completed Payments, Pending Payments, Total Revenue
- Registration trend chart (area chart showing recent registrations)
- Payment status breakdown (pie chart)

**Quick Action Cards**: Clickable cards that link to:
- Form Builder
- Landing Page Builder
- Registrations
- Closed Group Members (if event type is closed_group)
- Offline Payments (if payment method is offline)
- Campaign Settings
- Kiosk Mode (if kiosk is enabled)

**Short URLs Section**: Generate and view short links for:
- Registration URL (e.g., `yoursite.com/register/slug`)
- Kiosk URL (e.g., `yoursite.com/kiosk/campaignId`)

Each short URL shows the generated short link, a copy button, and the click count.

**Fund Management Tab**: (For Kaizen Managed campaigns) Shows the fund summary, bank accounts, and transfer requests. See Section 17 for details.

**Entity History Tab**: Shows the change history for this campaign, including who made changes and when.

### Archiving and Unarchiving

On the Campaign Detail page, Super Admins can:
- **Archive**: Click the "Archive" button. A confirmation dialog appears. Once archived, the registration form shows an "Event Archived" message and no new registrations are accepted.
- **Unarchive**: Click the "Unarchive" button to reactivate an archived campaign.

### Deleting a Campaign

Super Admins can permanently delete a campaign. This removes the campaign and all associated data (registrations, form definitions, landing page, members, fund transfers). This action is irreversible.

### Short URLs

From the Campaign Detail page, you can generate short URLs for the registration page and kiosk page. Click "Generate Short Link" next to each URL type. The system creates a shortened URL that redirects to the full URL. Short URLs are useful for sharing in print materials, social media, or QR codes.

---

## 5. Form Builder

**URL**: `/campaigns/:campaignId/form-builder`  
**Access**: Super Admin, assigned Org Admins

The Form Builder is where you design the registration form for a campaign. It uses a drag-and-drop interface with a live preview option.

### Interface Layout

The Form Builder has six tabs across the top:

1. **Design**: Configure the form's visual appearance including header image, form template, and theme colors
2. **Fields**: The main form building area. Left panel shows the field list; right panel shows the field editor for the selected field
3. **Formulas**: Configure pricing formulas and coupon codes
4. **Field Rules**: Set up conditional logic to show/hide fields based on other field values
5. **Pages**: Configure multi-page form behavior with page breaks and page rules
6. **Integrations**: Configure per-campaign integrations like Google Sheets sync

### Field Types

The Form Builder supports 14 field types organized into four categories:

**Basic Fields:**
- **Name**: A composite field with configurable parts (First Name, Middle Name, Last Name). Each part can be shown or hidden independently. The first name part is always shown.
- **Text Input**: A single-line text input for short text entries.
- **Email**: A text input with email format validation.
- **Phone**: A text input with phone number format validation.
- **Number**: A numeric input that accepts only numbers. Supports min/max validation.
- **Date**: A date picker field.
- **Time**: A time picker field.
- **Text Area**: A multi-line text input for longer text entries.

**Choice Fields:**
- **Dropdown**: A select menu with predefined options. Users pick one option from a dropdown list.
- **Radio Buttons**: A set of radio buttons where users pick exactly one option. All options are visible at once.
- **Checkboxes**: A set of checkboxes where users can select multiple options.

**Advanced Fields:**
- **File Upload**: Allows users to upload files (images, documents, etc.).
- **Terms & Conditions**: A special checkbox field for accepting terms and conditions. Typically marked as required.

**Layout Fields:**
- **Section Header**: A non-interactive heading element used to visually separate sections of the form. It displays a title and optional subtitle.

### Drag-and-Drop Reordering

Fields in the left panel can be reordered by dragging. Click and hold the grip handle (the six-dot icon) on the left side of a field, then drag it to the desired position. The field order in the builder determines the order in the registration form.

### Adding Fields

In the Fields tab, click the "Add Field" button (the plus icon). A dropdown shows all available field types grouped by category. Click a field type to add it to the end of the form. The new field is automatically selected for editing in the right panel.

### Editing Field Properties

Click any field in the left panel to select it. The right panel shows the field editor with these properties:

**Common Properties (all field types):**
- **Label**: The field name displayed to the user (e.g., "Full Name", "Email Address")
- **Placeholder**: Gray hint text shown inside the field when empty
- **Help Text**: Additional instructions displayed below the field
- **Required**: Toggle to make the field mandatory
- **Width**: Choose "Full Width" (takes the entire row) or "Half Width" (shares the row with another half-width field)

**Name Field Properties:**
- **Show First Name**: Always enabled
- **Show Middle Name**: Toggle to show/hide the middle name part
- **Show Last Name**: Toggle to show/hide the last name part

**Choice Field Properties (Dropdown, Radio, Checkbox):**
- **Options**: A list of choices. Each option has:
  - **Label**: The text displayed to the user
  - **Value**: The internal value stored (auto-generated from label if not set)
  - **Price Modifier**: An optional amount to add to or subtract from the total price when this option is selected (see Section 6)
- Add options with the "Add Option" button
- Remove options with the trash icon
- Reorder options by dragging

**Number Field Properties:**
- **Min Value**: Minimum accepted number
- **Max Value**: Maximum accepted number

**File Upload Properties:**
- **Accepted File Types**: Configure which file extensions are allowed
- **Max File Size**: Set the maximum upload size

### Deleting Fields

Click the trash icon on any field in the left panel. The field is immediately removed. If the deleted field was selected, the right panel clears.

### Saving the Form

Click the "Save" button in the top-right corner. The entire form configuration (fields, pricing, field rules, page breaks, page rules, integrations, design settings) is saved at once. You will see a success notification confirming the save.

### Form Preview

Click the "Preview" button (eye icon) in the top-right corner to see how the form will appear to public users. The preview opens in a modal showing the full form with all fields rendered. You can interact with the preview to test field behavior. Close the preview to return to the builder.

---

## 6. Pricing & Formulas

The Formulas tab in the Form Builder lets you configure how the registration price is calculated. Kaizen Events supports static pricing, option-based price modifiers, formula-based dynamic pricing, early bird pricing, and coupon codes.

### Base Price

The base price is the starting price for every registration. Set it in the Formulas tab by entering a number in the "Base Price" field. If the event is free, set the base price to 0.

### Option Price Modifiers

Each option in a Dropdown, Radio, or Checkbox field can have a price modifier. This is an amount that gets added to (or subtracted from) the total price when that option is selected.

**How it works:**
1. Go to the Fields tab
2. Select a Dropdown, Radio, or Checkbox field
3. In the field editor, each option has a "Price Modifier" field
4. Enter a positive number to add to the price (e.g., `500` adds 500 to the total)
5. Enter a negative number to subtract from the price (e.g., `-200` subtracts 200)
6. Leave at 0 for no price impact

**Example**: A "Ticket Type" dropdown with options:
- "General Admission" with price modifier `0` (uses base price)
- "VIP Access" with price modifier `2000` (adds 2000 to base price)
- "Student Discount" with price modifier `-500` (subtracts 500 from base price)

If the base price is 1000, selecting "VIP Access" makes the total 3000.

### Formula-Based Dynamic Pricing

For complex pricing logic, you can write a pricing formula. The formula is evaluated in real-time as the user fills out the form, and the result becomes the total price.

**Available References:**
- `${base_price}` — References the base price value
- `${field_id}` — References the current value of any form field (use the field's internal ID)

**Available Functions:**
- `sum(value1, value2, ...)` — Returns the sum of all arguments
- `avg(value1, value2, ...)` — Returns the average of all arguments
- `min(value1, value2, ...)` — Returns the minimum value
- `max(value1, value2, ...)` — Returns the maximum value
- `round(value)` — Rounds a number to the nearest integer
- `if(condition, true_value, false_value)` — Returns true_value if condition is truthy, false_value otherwise

**Math Operators:** `+`, `-`, `*`, `/`

**Example Formulas:**
- `${base_price} + ${number_of_guests} * 500` — Base price plus 500 per guest
- `if(${ticket_type} == "vip", ${base_price} * 2, ${base_price})` — Double price for VIP
- `round(${base_price} * 1.18)` — Base price with 18% tax
- `sum(${base_price}, ${addon_1}, ${addon_2})` — Sum of base price and two add-on field values

Enter the formula in the "Pricing Formula" text area in the Formulas tab. If a formula is set, it overrides the simple base price + option modifier calculation.

### Early Bird Pricing

Early bird pricing lets you offer a discounted rate for early registrations.

**Configuration (in the Formulas tab):**
- **Early Bird Price**: The discounted base price for early registrations
- **Early Bird End Date**: The date and time when early bird pricing expires

**How it works:** If the current date is before the early bird end date, the early bird price is used as the base price. After the end date, the regular base price applies. Option modifiers and formulas still apply on top of whichever base price is active.

### Coupon Codes

Coupon codes allow registrants to apply discount codes during registration.

**Creating a coupon (in the Formulas tab):**
- **Code**: The text code users will enter (e.g., "EARLYBIRD50")
- **Discount Type**: Percentage or Fixed Amount
- **Discount Value**: The percentage or fixed amount to discount
- **Max Uses**: Maximum number of times the coupon can be used (leave blank for unlimited)
- **Valid From**: Start date for the coupon
- **Valid Until**: Expiration date for the coupon

**How coupons work for registrants:**
1. On the registration form, there is a "Have a coupon code?" section
2. The user enters the code and clicks "Apply"
3. The system validates the code (checks if it exists, is within validity dates, and has not exceeded max uses)
4. If valid, the discount is applied to the total and the discounted price is shown
5. If invalid, an error message explains why (expired, max uses reached, not found)

---

## 7. Field Rules & Conditional Logic

**Location**: Form Builder, "Field Rules" tab  
**Purpose**: Show, hide, require, or modify fields dynamically based on the values of other fields in the form.

### How Field Rules Work

A field rule consists of:
1. **Conditions**: One or more conditions that are evaluated against current form data
2. **Match Type**: Whether ALL conditions must be true (AND logic) or ANY condition must be true (OR logic)
3. **Actions**: What happens to target fields when the conditions are met

### Conditions

Each condition specifies:
- **Source Field**: The field whose value is being checked
- **Operator**: The comparison to perform
- **Value**: The value to compare against (not needed for is_empty/is_not_empty)

**Available Operators:**
- `equals` — Field value exactly matches the specified value
- `not_equals` — Field value does not match the specified value
- `contains` — Field value contains the specified text (case-insensitive)
- `not_contains` — Field value does not contain the specified text
- `greater_than` — Field value (as a number) is greater than the specified value
- `less_than` — Field value (as a number) is less than the specified value
- `is_empty` — Field has no value (empty string, null, or empty array)
- `is_not_empty` — Field has some value
- `starts_with` — Field value starts with the specified text
- `ends_with` — Field value ends with the specified text
- `between` — Field value (as a number) falls between two specified values

### Actions

Each action specifies:
- **Target Field**: The field to be affected
- **Action Type**: What to do to the target field

**Available Action Types:**
- `show` — Make the target field visible (it was hidden by default or by another rule)
- `hide` — Hide the target field from view. Hidden fields are not submitted with the form.
- `require` — Make the target field required (overrides the field's default required setting)
- `enable` — Enable the target field (remove disabled state)
- `disable` — Disable the target field (grayed out, cannot be edited)
- `set_value` — Set the target field to a specific value

### Match Types

- **ALL (AND logic)**: Every condition in the rule must be true for the actions to execute
- **ANY (OR logic)**: At least one condition must be true for the actions to execute

### Creating a Field Rule

1. Go to the "Field Rules" tab in the Form Builder
2. Click "Add Rule"
3. Give the rule a descriptive name (e.g., "Show company fields for corporate registrations")
4. Set the Match Type (ALL or ANY)
5. Add one or more conditions by clicking "Add Condition":
   - Select the source field
   - Select the operator
   - Enter the comparison value
6. Add one or more actions by clicking "Add Action":
   - Select the target field
   - Select the action type
   - If action is `set_value`, enter the value to set
7. Save the form to persist the rules

### Example Rules

**Show "Company Name" only for corporate registrations:**
- Condition: "Registration Type" (dropdown) `equals` "Corporate"
- Action: `show` "Company Name" (text field, hidden by default)

**Require "Dietary Restrictions" when "Need Meals" is checked:**
- Condition: "Need Meals" (checkbox) `is_not_empty`
- Action: `require` "Dietary Restrictions" (text area)

**Show additional fields based on ticket tier:**
- Match Type: ANY
- Condition 1: "Ticket Type" `equals` "VIP"
- Condition 2: "Ticket Type" `equals` "Premium"
- Action: `show` "Preferred Seating" (dropdown)
- Action: `show` "Special Requests" (textarea)

---

## 8. Multi-Page Forms

**Location**: Form Builder, "Pages" tab  
**Purpose**: Split a long registration form into multiple pages for a better user experience.

### Page Breaks

Page breaks define where one page ends and the next begins. All fields between two page breaks (or between the start of the form and the first page break, or between the last page break and the end of the form) appear on the same page.

**Adding a page break:**
1. Go to the "Pages" tab in the Form Builder
2. Click "Add Page Break"
3. Select the position in the field list where the break should occur
4. Optionally, add a page title that displays at the top of each page

### Page Rules

Page rules allow you to control page navigation based on form data. You can skip pages or jump to specific pages based on conditions.

**Creating a page rule:**
1. In the Pages tab, click "Add Page Rule"
2. Define conditions (same format as field rules: source field, operator, value)
3. Define the action:
   - **Skip Page**: Skip a specified page (the user moves directly to the next page after it)
   - **Jump to Page**: Navigate directly to a specified page number

### User Experience

When a multi-page form is presented to the registrant:
- A progress indicator shows the current page number and total pages
- "Next" and "Previous" buttons navigate between pages
- Validation runs on the current page before allowing navigation to the next page (required fields on the current page must be filled)
- The final page shows a "Submit" button instead of "Next"
- Users can go back to previous pages to review or change their answers

---

## 9. Landing Page Builder

**URL**: `/campaigns/:campaignId/landing-page`  
**Access**: Super Admin

The Landing Page Builder creates a public marketing page for your campaign. The built page is accessible at `/event/:slug`.

### Interface

The builder has three tabs:
1. **Sections**: Add, edit, reorder, and remove page sections
2. **Theme**: Configure colors, fonts, and visual styling
3. **Settings**: Toggle the registration button and configure advanced options

### Section Types

The Landing Page Builder supports 7 section types:

1. **Hero Banner**: The main banner at the top of the page. Contains a title, subtitle, descriptive text, background image, and optional statistics badges. This is typically the first thing visitors see.

2. **About**: A section for describing the event in detail. Supports a title, subtitle, body text, and feature cards (each with an icon, title, and description).

3. **Speakers**: Showcase featured speakers or guests. Each speaker has a name, title/role, photo, topic, and bio. Displayed as a grid of cards.

4. **Schedule**: Display the event timeline. Each item has a time, title, and description. Displayed as a vertical timeline.

5. **Pricing**: Show registration pricing tiers. Each tier has a name, price, original price (for showing discounts), a list of features, and a "featured" flag for highlighting a recommended option.

6. **FAQ**: Frequently asked questions displayed as an accordion. Each item has a question and answer. Users click to expand/collapse answers.

7. **Contact**: Contact information section with email, phone, address, and social media links.

### Adding and Editing Sections

To add a section:
1. Click "Add Section" in the Sections tab
2. Choose a section type from the dropdown
3. The new section appears at the bottom of the section list

To edit a section:
1. Click on any section in the list to select it
2. The right panel shows the section editor with fields specific to that section type
3. Edit the title, subtitle, content, items, images, and other properties
4. Changes are saved when you click the main "Save" button

### Reordering Sections

Click the up/down arrow buttons on each section to move it higher or lower in the page. The order in the builder matches the order on the published page.

### Removing Sections

Click the trash icon on a section to remove it. This does not require confirmation.

### Theme Configuration

The Theme tab lets you customize the visual design:
- **Primary Color**: The main accent color used for buttons, links, and highlights (default: `#7c3aed`, purple)
- **Secondary Color**: A complementary accent color (default: `#14b8a6`, teal)
- **Background Color**: The page background color (default: `#ffffff`, white)
- **Text Color**: The main text color (default: `#1e293b`, dark slate)
- **Font Family**: The typeface used throughout the page (default: "Plus Jakarta Sans")

### Registration Button

Toggle the "Show Registration Button" switch to display or hide a "Register Now" button on the landing page. When enabled, the button links to the registration form at `/register/:slug`.

### Preview

Click the "Preview" button (eye icon) to see a live preview of the landing page as it will appear to visitors. The preview renders all sections with the current theme. Close the preview to return to editing.

### Templates

The builder includes 8 pre-built templates that you can apply to quickly set up a professional landing page:

1. **Tech Conference**: Modern split-screen hero, grid card layouts, tech-focused design with speakers, schedule, pricing tiers, FAQ, and contact sections.

2. **Corporate Gala**: Elegant design with a full-bleed hero image, formal tone, sophisticated pricing tables for individual seats, couple packages, and corporate tables.

3. **Professional Workshop**: Clean, education-focused layout with instructor profiles, detailed curriculum schedule, and individual/team pricing options.

4. **Product Launch**: Bold, product-focused design with dramatic hero, feature showcase, demo schedule, and tiered access levels (General, VIP, Media).

5. **Charity Fundraiser**: Warm, cause-driven design with impact stories, donation tiers with impact descriptions (Friend, Champion, Patron, Visionary levels).

6. **Sports Event**: Energetic design with race categories, course maps, timing details, and registration packages for different distances.

7. **Wedding Celebration**: Elegant, personal design with ceremony schedule, venue details, gallery section, and family contact information.

8. **Music Concert**: Vibrant, festival-style design with artist lineup, multi-day schedule, ticket tiers (Day Pass, Full Festival, VIP), and add-on packages.

To apply a template, click "Use Template" on any template card. The template replaces all current sections and theme settings. You can then customize every element.

### Saving

Click the "Save" button to persist the landing page configuration. The page is immediately updated on the public URL.

---

## 10. Public User Experience

These are the pages visible to the general public without any login.

### Public Homepage (`/`)

The public homepage lists all active campaigns that have "Show on Homepage" enabled. Each campaign is displayed as a card showing:
- Campaign logo/image
- Campaign name
- Organization name
- Description
- A "Register" button linking to `/register/:slug`

If no campaigns are set to show on the homepage, the page displays a message indicating no events are currently available.

### Landing Page (`/event/:slug`)

The public landing page for a specific campaign. This page is built using the Landing Page Builder and displays all configured sections (hero, about, speakers, schedule, pricing, FAQ, contact) with the campaign's theme.

If a registration button is enabled, a "Register Now" button appears that links to the registration form.

If the campaign is archived, visitors see an "Event Archived" message instead of the landing page.

### Registration Form (`/register/:slug`)

The standalone registration form page where users fill out and submit their registration.

**Form Layout:**
- Campaign logo and name at the top
- Form fields arranged according to the Form Builder configuration
- Real-time price calculation displayed at the bottom (updates as the user fills fields)
- Coupon code input (if coupons are configured)
- Payment summary showing base price, option modifiers, discounts, and total
- Submit/Pay button

**Form Filling Process:**
1. The user fills in all form fields
2. The price updates in real-time based on field values, option modifiers, and formulas
3. Optionally, the user enters a coupon code and clicks "Apply"
4. The user reviews the total amount
5. The user clicks "Submit" or "Pay Now"

**What happens next depends on the payment configuration:**
- **Online Payment (Razorpay)**: A Razorpay checkout popup appears. The user completes payment. On success, they are redirected to the payment success page.
- **Online Payment (Instamojo)**: The user is redirected to the Instamojo payment page. After payment, they are redirected back to the payment status page.
- **Offline Payment**: The registration is submitted with a "pending" payment status. The user receives an OTP for later verification at the venue.
- **Free Event (base price = 0)**: The registration is submitted immediately and confirmed.

**Error States:**
- If the campaign is not found, a 404 page is shown
- If the campaign is archived, an "Event Archived" page is shown
- If registration is closed (past end date or registration disabled), a "Registration Closed" page is shown
- If max registrations have been reached, a "Registration Full" message is shown

### Closed Group Registration

For closed group campaigns, the registration form has an additional verification step before the form fields are shown:

1. The user sees a search/verification interface
2. The user searches for their name or enters their phone number
3. The system checks the phone number against the uploaded member list
4. If the phone number matches a member, the user is verified and the full registration form is displayed
5. If no match is found, the user sees a message indicating they are not in the member list and cannot register

### Payment Success Page (`/payment-success`)

Displayed after a successful online payment. Shows:
- A success confirmation message
- Registration ID / Invoice Number
- Amount paid
- Campaign name
- A receipt summary

### Payment Failed Page (`/payment-failed`)

Displayed when an online payment fails. Shows:
- An error message explaining the failure
- A "Try Again" button to retry the payment
- Registration details for reference

### Payment Status Page (`/payment-status`)

A page for checking payment status. Used as the callback URL for Instamojo payments. Shows the current payment status (pending, completed, failed) and registration details.

---

## 11. Online Payments

Kaizen Events supports two payment gateways for online payment collection: Razorpay and Instamojo.

### Razorpay

Razorpay is an Indian payment gateway that supports credit cards, debit cards, UPI, net banking, and digital wallets.

**How Razorpay payments work:**
1. When the user clicks "Pay Now" on the registration form, the backend creates a Razorpay order
2. The Razorpay checkout popup appears in the browser (a modal overlay)
3. The user selects their payment method and completes the payment within the popup
4. Razorpay sends a payment signature to the frontend
5. The frontend sends the payment ID, order ID, and signature to the backend for verification
6. The backend verifies the signature using the Razorpay secret key
7. If verification succeeds, the registration status is updated to "confirmed" and the payment status to "completed"
8. The user is redirected to the payment success page
9. A confirmation email and/or WhatsApp message is sent to the registrant

**If payment fails:**
- The user sees an error in the Razorpay popup
- They can retry the payment or close the popup
- The registration remains in "pending" payment status
- They are redirected to the payment failed page

### Instamojo

Instamojo is an Indian payment gateway primarily used for small businesses and events.

**How Instamojo payments work:**
1. When the user clicks "Pay Now", the backend creates an Instamojo payment request
2. The user is redirected to the Instamojo payment page (leaves your site)
3. The user completes payment on Instamojo's page
4. Instamojo sends a webhook notification to your backend with the payment status
5. The user is redirected back to your site's payment status page
6. The backend verifies the payment using the webhook data
7. If payment is confirmed, the registration is updated to "confirmed"

**Instamojo-specific notes:**
- Uses redirect-based flow (user leaves your site temporarily)
- Webhook verification ensures payment authenticity even if the user closes the browser before being redirected back
- Supports test mode (sandbox) and production mode

### Payment Verification

For both gateways, payment verification happens server-side:
- **Razorpay**: Signature verification using HMAC-SHA256 with the key secret
- **Instamojo**: Webhook signature verification using the salt

This ensures that payment confirmations cannot be forged by manipulating frontend code.

---

## 12. Offline Payments

Offline payment mode is designed for events where payment is collected in person (cash, check, or manual UPI transfer) rather than through an online gateway.

### How Offline Payments Work

**Registration:**
1. The user fills out the registration form on `/register/:slug`
2. The form shows an "Offline Payment" option (or it is the only option if the campaign is configured for offline-only)
3. The user submits the form
4. The system creates a registration with "pending" payment status
5. A 6-digit OTP is sent to the user's phone number via SMS or WhatsApp
6. The user receives confirmation that their registration is submitted and pending payment

**Verification at the venue:**
1. The user arrives at the event venue and goes to the registration desk
2. The event organizer opens the Offline Payments page (`/campaigns/:campaignId/offline-payments`)
3. The page shows a list of pending offline payments for the campaign
4. The organizer can either:
   - Ask the user for their OTP and enter it in the verification form, or
   - Search for the user in the pending payments list and verify manually
5. The 6-digit OTP is entered into the OTP input (six individual digit boxes)
6. If the OTP matches, the registration details are displayed
7. The organizer confirms the payment amount received
8. The organizer adds optional payment notes (e.g., "Cash received", "UPI transfer")
9. The organizer clicks "Confirm Payment"
10. The registration status updates to "confirmed" and payment status to "completed"
11. A receipt number is generated

**OTP Management:**
- OTPs are 6 digits
- Each OTP input box advances to the next automatically after entering a digit
- Paste support: users can paste the full 6-digit code
- If the OTP is expired or incorrect, an error message is shown

**Pending Payments List:**
The Offline Payment Verification page shows all pending registrations with:
- Registrant name
- Email and phone
- Registration date
- Amount due
- A "Refresh" button to reload the list

**No-Show Marking:**
For registrations where the user registered but never showed up, organizers can mark them as "no-show". This updates the payment status to "no_show" and helps with reconciliation.

---

## 13. Kiosk Mode

**URL**: `/kiosk/:campaignId`  
**Access**: Super Admin, assigned Kiosk Volunteers

Kiosk Mode provides a simplified, purpose-built interface for on-site event registration and check-in. It is designed to run on a tablet or laptop at the event venue's registration desk.

### Enabling Kiosk Mode

1. When creating or editing a campaign, toggle the "Kiosk Enabled" switch to on
2. Create kiosk volunteer accounts (see Kiosk Volunteer Management below)
3. Assign volunteers to the campaign
4. Share the kiosk URL (`/kiosk/:campaignId`) or generate a short URL for it

### Kiosk Interface

The Kiosk Mode interface has a clean, distraction-free layout with the following areas:

**Header Bar**: Shows the campaign name, a "Home" button (back to dashboard), a "Logout" button, and a refresh button.

**Stats Bar**: Real-time statistics displayed at the top:
- Total Registrations for this campaign
- Verified Today (checked in today)
- Pending Payments

**Search Section**: A large search input where volunteers can search for registrants by:
- Name
- Email address
- Phone number
- Registration ID

Search is live (results appear as you type with a short debounce delay).

**Search Results**: A list of matching registrations showing:
- Registrant name
- Email and phone
- Payment status (with color coding)
- Amount
- Registration date

Click a result to select it and proceed to verification.

### Verification Flow

1. Select a registrant from the search results
2. The registrant's details are displayed (name, email, phone, amount, payment status)
3. Click "Send OTP" to send a verification code to the registrant's phone
4. The registrant reads the OTP from their phone and tells the volunteer
5. The volunteer enters the OTP in the input field
6. Click "Verify OTP"
7. If the OTP is correct, verification succeeds and payment options appear

### Recording Payment

After OTP verification:
1. Enter the amount received in the "Amount Received" field (pre-filled with the registration amount)
2. Select the payment method: Cash, Card, or UPI
3. Add optional payment notes
4. Click "Confirm Payment"
5. A success screen appears with receipt details

### Walk-In Registration

For new attendees who did not pre-register:
1. Click the "New Registration" button (UserPlus icon)
2. A simplified registration form appears with the campaign's form fields
3. Fill in the registrant's information
4. Submit the form
5. The registration is created and payment can be recorded immediately

### Auto-Refresh

Kiosk statistics auto-refresh every 30 seconds to keep the display current without manual intervention.

### Kiosk Volunteer Management

**URL**: `/kiosk-volunteers`  
**Access**: Super Admin (via Control Panel)

This page manages the volunteer accounts that can access Kiosk Mode.

**Creating a Volunteer:**
1. Click "Add Volunteer"
2. Enter the volunteer's name, email, and phone
3. Select which campaigns the volunteer can access (multi-select)
4. Click "Create"
5. A temporary password is generated and displayed in a modal
6. Copy the password and share it securely with the volunteer

**Managing Volunteers:**
- **Edit**: Click the edit icon to change the volunteer's name, phone, or campaign assignments
- **Delete**: Click the delete icon to remove the volunteer. A confirmation dialog appears.
- **Reset Password**: Generate a new temporary password for the volunteer

The volunteer list shows each volunteer's name, email, phone, assigned campaigns, and creation date.

---

## 14. Managing Registrations

**URL**: `/campaigns/:campaignId/registrations`  
**Access**: Super Admin, assigned Org Admins

The Registrations page displays all registrations for a specific campaign with search, filtering, and management capabilities.

### Registration List

Registrations are displayed in a table with the following columns:
- Registrant Name (extracted from form data)
- Email
- Phone
- Amount
- Payment Status (color-coded badge)
- Invoice Number
- Registration Date

### Search

Use the search bar at the top to find registrations by:
- Registrant name
- Email address
- Invoice number

Search is applied as you type.

### Filters

**Payment Status Filter** (dropdown):
- All (default)
- Completed
- Pending
- Failed

**Date Filter** (dropdown):
- All Time (default)
- Today
- This Week
- This Month

### Analytics Section

At the top of the page, analytics cards show:
- Total Registrations
- Completed Payments
- Pending Payments
- Total Revenue
- A registration trend chart

### Viewing Registration Details

Click the eye icon on any registration row to view full details in a side panel. The detail view shows:
- All form field responses (rendered according to field type)
- Payment information: status, amount, payment ID, gateway, transaction date
- Registration metadata: created date, invoice number, campaign name

### Editing a Registration

Click the edit icon on any registration row. An edit modal appears allowing you to:
- Modify the payment amount
- Edit form field values
- Add a payment adjustment (increase or decrease the amount with a reason)
- Save changes

Changes to the registration amount are logged in the activity log.

### Resending Receipt

Click the mail icon on a registration row to resend the confirmation email to the registrant. This triggers the same email that was sent upon successful registration/payment, with the receipt details and invoice number.

### WhatsApp Notification

Click the WhatsApp (message) icon on a registration row to send a WhatsApp notification to the registrant. This uses the configured WhatsApp integration (Interakt) to send a template-based message with registration confirmation details.

### Exporting Data

Click the "Export" button at the top of the registrations page. You can export as:
- **CSV**: A comma-separated values file
- **Excel (XLSX)**: A Microsoft Excel spreadsheet

The export includes all form fields as columns, plus registration metadata (ID, date, payment status, amount, payment ID, invoice number, campaign name). The export respects the current search and filter selections.

### Registration Statuses

- **Draft**: Registration started but not yet submitted (rare, typically from abandoned forms)
- **Submitted**: Form submitted but payment not yet completed
- **Confirmed**: Payment completed (or free event registration confirmed)
- **Cancelled**: Registration cancelled by an admin
- **No-Show**: Registrant did not attend the event (marked by organizer)

### Payment Statuses

- **Pending**: Payment initiated but not yet completed
- **Completed**: Payment successfully received and verified
- **Failed**: Payment attempt failed (card declined, UPI timeout, etc.)
- **Refunded**: Full refund processed
- **Partial Refund**: Partial refund processed
- **No-Show**: Marked as no-show (used for offline payments where the registrant never arrived)

### Processing Refunds

For registrations with completed payments, you can process refunds:
1. Click the edit icon on a registration
2. In the registration detail view, click "Process Refund"
3. Choose "Full Refund" or "Partial Refund"
4. For partial refunds, enter the refund amount
5. Add a reason for the refund
6. Confirm the refund

The refund is processed through the original payment gateway (Razorpay or Instamojo). The registration's payment status updates to "refunded" or "partial_refund".

---

## 15. Closed Group Events

Closed group campaigns restrict registration to a pre-approved list of members. This is useful for private events, invitation-only gatherings, or situations where only specific people should be allowed to register.

### Setting Up a Closed Group Campaign

1. When creating a campaign, set the "Campaign Type" to "Closed Group"
2. After creating the campaign, navigate to the Members page to upload your member list

### Uploading Members

**URL**: `/campaigns/:campaignId/members`  
**Access**: Super Admin, assigned Org Admins

**Upload via CSV/Excel:**
1. Click the "Upload Members" button
2. The upload modal appears with a three-step wizard:

**Step 1 - Select File:**
- Click "Choose File" or drag and drop a CSV or Excel file
- The file should contain columns for member information (name, phone number, email, and optionally custom fields)

**Step 2 - Map Columns:**
- A preview of the file data is shown (first few rows)
- Map the columns in your file to Kaizen Events fields:
  - **Name Column**: Select which column contains the member's name
  - **Mobile Column**: Select which column contains the phone number (required for verification)
  - **Email Column**: Select which column contains the email address
  - **Custom Columns**: Map any additional columns to custom fields
- Click "Continue" to proceed

**Step 3 - Upload Results:**
- The system processes the file and shows results:
  - **Added**: Number of new members successfully added
  - **Skipped**: Number of duplicates (already existing members) that were skipped
  - **Errors**: Number of rows with errors (missing required fields, invalid data)
- If there are errors, a downloadable error report is available showing which rows failed and why

### Adding a Single Member

1. Click "Add Member" on the Members page
2. Enter the member's name, mobile number, email, and any custom field values
3. Click "Save"

### Member List

The Members page shows all members with:
- Member name
- Mobile number
- Email
- Registration status: "Registered" (green badge) or "Not Registered" (gray badge)
- Custom field values

**Pagination**: Members are displayed with pagination. Use the page controls at the bottom to navigate.

**Filtering**: 
- Use the status filter to show "All", "Registered", or "Unregistered" members
- Use the search bar to search by name, mobile, or email

**Selection**: Check individual members or use "Select All" to select members for bulk actions.

### Editing Members

Click the edit icon on a member row to modify their name, mobile number, email, or custom fields.

### Deleting Members

Click the delete icon on a member row to remove them from the group. This does not affect existing registrations.

### Sending Reminders

Send reminders to unregistered members encouraging them to register:

1. Select members using checkboxes (or use "Select All" to select all unregistered members)
2. Click "Send Reminders"
3. In the reminder modal, choose channels:
   - **Email**: Send an email reminder with a link to the registration form
   - **WhatsApp**: Send a WhatsApp reminder via the Interakt integration
4. Confirm the number of recipients
5. Click "Send"

You can also send reminders to individual members by clicking the mail or WhatsApp icon on their row.

### Verification During Registration

When a member visits the registration form for a closed group campaign:
1. They see a verification interface instead of the form
2. They search for their name or enter their phone number
3. The system searches the member list for a matching phone number
4. If a match is found, the member is verified and the registration form is displayed
5. If no match is found, a message indicates they are not authorized to register

---

## 16. Payment Accounts

**URL**: `/payment-accounts`  
**Access**: Super Admin only

Payment Accounts are the configured payment gateway credentials used by campaigns to process online payments. Each account represents a set of API credentials for either Razorpay or Instamojo.

### Why Multiple Accounts?

You may need multiple payment accounts because:
- Different campaigns may collect funds for different organizations, each with their own gateway accounts
- You may want separate test/sandbox accounts and production accounts
- Different campaigns may use different payment gateways (some use Razorpay, others use Instamojo)

### Creating a Payment Account

1. Click "Add Payment Account"
2. Fill in the form:
   - **Account Name**: A descriptive name (e.g., "Main Razorpay Account", "Test Instamojo")
   - **Gateway Type**: Select "Razorpay" or "Instamojo"
   - **Description**: Optional notes about this account
   - **Is Active**: Toggle to enable/disable the account

3. **For Razorpay accounts:**
   - **Key ID**: Your Razorpay Key ID (starts with `rzp_test_` for test mode or `rzp_live_` for live mode)
   - **Key Secret**: Your Razorpay Key Secret
   - **Mode**: Test or Live

4. **For Instamojo accounts:**
   - **API Key**: Your Instamojo API Key
   - **Auth Token**: Your Instamojo Auth Token
   - **Salt**: Your Instamojo Salt (used for webhook verification)
   - **Mode**: Sandbox or Production

5. Click "Save"

### Editing a Payment Account

Click the edit icon on an account card. The edit form shows the same fields with current values pre-populated. Credential fields (key secret, auth token) are masked by default. Click the eye icon to reveal them.

### Deleting a Payment Account

Click the delete icon on an account card. Accounts that are currently assigned to active campaigns cannot be deleted. Reassign those campaigns to a different account first.

### Account Statistics

Each payment account card shows:
- Gateway type and mode (test/live)
- Active/inactive status
- Transaction count (number of payments processed)
- Total amount collected through this account

### Assigning Accounts to Campaigns

Payment accounts are assigned to campaigns during campaign creation or editing. In the campaign form, the "Payment Account" dropdown shows all active payment accounts filtered by the selected gateway type.

---

## 17. Fund Transfers

**URL**: `/fund-transfers`  
**Access**: Super Admin

Fund Transfers manage the movement of collected registration funds from the platform to event organizers. This feature applies only to campaigns using the "Kaizen Managed" fund collection mode.

### How Fund Collection Works

When a campaign uses "Kaizen Managed" mode:
1. A registrant pays the registration fee
2. The payment gateway (Razorpay/Instamojo) deducts its processing fees
3. The gateway settles the net amount to the platform's bank account
4. The platform deducts a 2.95% platform fee from the original collected amount
5. The remaining amount is the "net payable" to the organizer
6. The Super Admin creates a fund transfer request
7. A Director approves the transfer
8. The Super Admin executes the bank transfer and marks it as completed

### Fund Transfers Page Layout

The page is divided into sections:

**Summary Cards** (top):
- Total Collected: Gross amount collected from all registrations
- Gateway Charges: Total payment gateway processing fees
- Gateway Settled: Total amount settled by gateways to the platform
- Platform Fee (2.95%): Platform's commission
- Net Payable: Amount owed to organizers
- Already Transferred: Amount already sent to organizers
- Pending Transfer: Remaining amount to be transferred

**Campaign Filter**: Filter the summary and transfer list by a specific campaign or view all campaigns.

**Campaign Fund Details**: When a specific campaign is selected, shows detailed breakdown for that campaign.

**Transfer Requests**: A list of all fund transfer requests showing status, amount, campaign, creation date, and action buttons.

### Bank Accounts

Before creating a transfer request, the campaign must have a bank account configured:

1. In the Fund Transfers page, select a campaign
2. Click "Add Bank Account" in the campaign's fund details section
3. Enter:
   - **Account Holder Name**: The name on the bank account
   - **Account Number**: The bank account number
   - **IFSC Code**: The bank's IFSC code
   - **Bank Name**: The name of the bank
   - **Notification Email**: Email address to notify when transfers are completed
4. Click "Save"

Changes to bank account details require Director approval (they become change requests).

### Creating a Transfer Request

1. Select a campaign from the filter
2. Click "Create Transfer Request"
3. Enter the transfer amount (cannot exceed the pending transfer balance)
4. Add notes explaining the transfer purpose
5. Click "Submit"
6. The transfer request is created with "pending_approval" status
7. A Director must approve the request before it can be executed

### Transfer Request Lifecycle

1. **Pending Approval**: The request has been created and awaits Director approval
2. **Approved**: A Director has approved the request. The Super Admin can now execute the transfer.
3. **Rejected**: A Director has rejected the request with a reason. The request can be resubmitted with modifications.
4. **Completed**: The Super Admin has executed the bank transfer and marked it as completed with a transaction reference.

### Completing a Transfer

After a transfer request is approved:
1. Execute the actual bank transfer through your banking channel
2. In the Fund Transfers page, click "Complete" on the approved transfer
3. Enter:
   - **Bank Transaction Reference**: The UTR number or transaction ID from the bank
   - **Transfer Date**: The date the bank transfer was executed
   - **Send Notification**: Toggle to email the organizer about the completed transfer
4. Click "Complete Transfer"
5. The transfer status updates to "completed"
6. If notification is enabled, the organizer receives an email confirmation

### Settlement Sync

For accurate fund accounting, you can sync payment settlement data from the gateways:
1. Click "Sync Settlements" on the campaign fund details
2. The system fetches the latest settlement data from Razorpay or Instamojo
3. Settlement data includes actual gateway fees, settlement status, and settlement dates
4. The fund summary updates with the synced data

This is important because gateway fees are estimated at the time of payment but the actual fees may differ slightly. Settlement sync provides the real numbers.

---

## 18. Director Approvals

**URL**: `/approvals`  
**Access**: Users with `can_approve_transfers` permission (Directors)

The Approvals page is where Directors review and approve or reject pending fund transfer requests and change requests.

### Accessing Approvals

The Approvals page is accessible from:
- The Control Panel (if you are a Super Admin with Director permission)
- Directly via the URL `/approvals`

You must have `can_approve_transfers` enabled on your user account to access this page. If you attempt to access it without the permission, you will see a "You do not have approval permissions" error.

### Fund Transfer Approvals

When a Super Admin creates a fund transfer request, it appears in the Approvals page for all Directors to review.

Each pending transfer shows:
- Campaign name
- Transfer amount
- Requested by (the user who created the request)
- Notes from the requester
- Date created

**To approve a transfer:**
1. Click "Approve" on the transfer
2. An approval dialog appears
3. Optionally add approval notes
4. Click "Confirm Approval"
5. The transfer moves to "approved" status and can be executed by a Super Admin

**To reject a transfer:**
1. Click "Reject" on the transfer
2. A rejection dialog appears
3. Enter a rejection reason (required)
4. Click "Confirm Rejection"
5. The transfer moves to "rejected" status. The requester can see the rejection reason and may create a new request.

### Change Request Approvals

Certain sensitive changes require Director approval before they take effect:
- **Bank Account Changes**: When a campaign's bank account details are modified
- **Payment Gateway Changes**: When a campaign's assigned payment account is changed
- **Fund Collection Mode Changes**: When a campaign switches between Kaizen Managed and Organizer Direct

Each change request shows:
- Campaign name
- Type of change
- Current value and proposed new value
- Requested by
- Date created

Approve or reject change requests using the same process as fund transfers.

### Approval History

The page shows both pending and historical approvals. Past approvals/rejections show the decision, the Director who made the decision, and the date.

---

## 19. Notifications & Communications

Kaizen Events supports automated and manual notifications through email and WhatsApp.

### Email (Brevo/Sendinblue)

Email notifications are sent through the Brevo (formerly Sendinblue) transactional email API.

**Automated Email Notifications:**
- **Registration Confirmation**: Sent when a registration is submitted (contains registration details, invoice number)
- **Payment Receipt**: Sent when payment is successfully completed (contains payment amount, transaction ID, receipt)
- **Fund Transfer Completion**: Sent to the organizer when a fund transfer is marked as completed

**Manual Email Notifications:**
- **Resend Receipt**: From the Registrations page, click the mail icon on any registration to resend the confirmation email
- **Closed Group Reminders**: Send email reminders to unregistered members to encourage registration
- **Test Email**: From the Integrations page, send a test email to verify the Brevo configuration

**Configuration:**
1. Navigate to Control Panel > Integrations
2. In the "Email (Brevo)" section, enter your Brevo API key
3. Click "Configure"
4. Send a test email to verify the setup

### WhatsApp (Interakt)

WhatsApp notifications are sent through the Interakt platform using pre-approved WhatsApp Business API templates.

**Automated WhatsApp Notifications:**
- **Registration Confirmation**: Sent when a registration is confirmed (template-based message with event name, registration ID)
- **OTP Delivery**: OTP codes for offline payment verification can be sent via WhatsApp

**Manual WhatsApp Notifications:**
- **Registration Notification**: From the Registrations page, click the WhatsApp icon on any registration
- **Closed Group Reminders**: Send WhatsApp reminders to unregistered members

**Note:** WhatsApp integration requires a configured Interakt account with approved message templates. Template messages must follow WhatsApp Business API guidelines.

### Notification Settings

Notification behavior can be configured per campaign through Campaign Settings:
- Toggle email notifications on/off for the campaign
- Toggle WhatsApp notifications on/off for the campaign
- Configure notification templates

### Notification Logs

The system maintains logs of all sent notifications. These can be viewed in the Activity Logs page by filtering for notification-related events (registration confirmations, payment receipts, reminder sends).

---

## 20. Google Sheets Integration

Kaizen Events can automatically sync registration data to Google Sheets, providing organizers with a live, always-updated spreadsheet of their registrations.

### Setting Up Google Sheets Integration

**Step 1: Configure Service Account Credentials**
1. Navigate to Control Panel > Integrations
2. In the "Google Sheets" section, paste your Google service account credentials JSON
3. Click "Configure"
4. The system reads the service account email from the credentials

**Step 2: Share Access**
After configuring, the page shows the service account email. You need to share your Google Spreadsheets (or the Drive folder) with this email address for the integration to write data.

### Creating a Campaign Sheet

From the Integrations tab in the Form Builder:
1. Click "Create Sheet" for the campaign
2. The system creates a new Google Spreadsheet in the service account's Drive
3. The spreadsheet is named after the campaign
4. Column headers are automatically set based on the form fields

### Auto-Sync

Once a sheet is configured for a campaign, new registrations are automatically added as new rows in the spreadsheet. Each row contains:
- Registration ID
- Registration Date
- Registrant Name
- Email
- Phone
- Payment Status
- Amount
- Payment ID
- Campaign Name
- All form field values (one column per field)

### Manual Sync

If the spreadsheet gets out of sync (rows were accidentally deleted, or you want to refresh all data):
1. Go to the Form Builder > Integrations tab
2. Click "Re-sync All Registrations"
3. The system clears the sheet and writes all registrations from scratch

### Sheet Configuration

Each campaign can have its own sheet. The configuration stores:
- **Spreadsheet ID**: The Google Sheets document ID
- **Sheet Name**: The specific sheet/tab name within the spreadsheet

These can be viewed and edited in the Form Builder > Integrations tab.

---

## 21. User Management

**URL**: `/users` or `/control-panel/users`  
**Access**: Super Admin, Directors (read access)

User Management allows Super Admins to create, edit, and delete user accounts and manage their permissions.

### Creating a User

1. Click "Add User"
2. Fill in the form:
   - **Name**: The user's display name
   - **Email**: The user's email address (used for login)
   - **Password**: Set an initial password. Click the eye icon to show/hide the password.
   - **Role**: Select "Super Admin" or "Org Admin"
   - **Campaign Access** (for Org Admin): Select which campaigns this user can access. Use the multi-select to assign one or more campaigns.
   - **Can Approve Transfers**: Toggle to grant Director permission. When enabled, the user can access the Approvals page and approve/reject fund transfers and change requests.
3. Click "Save"

### Editing a User

Click the edit icon on a user row. The edit form shows the same fields with current values:
- Name, email, and role can be modified
- Password can be changed (leave blank to keep the current password)
- Campaign access assignments can be updated
- Director permission can be toggled

### Deleting a User

Click the delete icon on a user row. A confirmation dialog appears. Deleting a user:
- Removes their ability to log in
- Does not affect registrations or other data they created
- Is irreversible

### Password Reset

When editing a user, set a new password in the password field. The user will need to use the new password on their next login.

### Searching Users

Use the search bar to filter the user list by name or email.

### User List Columns

- Name
- Email
- Role (Super Admin or Org Admin badge)
- Campaign Access (list of assigned campaign names, for Org Admins)
- Director Permission (check mark if enabled)
- Actions (edit, delete)

---

## 22. DKIM & Email Deliverability

**URL**: `/dkim` or `/control-panel/dkim`  
**Access**: Super Admin only

DKIM (DomainKeys Identified Mail) is an email authentication protocol that helps prevent your outgoing emails from being marked as spam. This page manages domain verification and email sender configuration using the Resend email service.

### What is DKIM and Why It Matters

When Kaizen Events sends emails (registration confirmations, payment receipts, reminders), those emails need to appear legitimate to email providers like Gmail, Outlook, and Yahoo. Without proper DKIM configuration, your emails may:
- Land in the recipient's spam/junk folder
- Be rejected entirely by the recipient's email server
- Show a "via thirdparty.com" warning in email clients

DKIM signs outgoing emails with a cryptographic signature that proves the email was authorized by the domain owner.

### Registering a Domain

1. Click "Add Domain"
2. Enter:
   - **Domain**: Your sending domain (e.g., `events.yourcompany.com`)
   - **Resend API Key**: Your Resend API key (used for DNS record management and email sending)
3. Click "Register"
4. The system registers the domain with Resend and generates DNS records

### Configuring DNS Records

After registering a domain, the system shows the DNS records you need to add to your domain's DNS configuration:
- DKIM record (TXT record)
- SPF record (TXT record, if applicable)
- Return-path / bounce handling record (CNAME or MX)

For each record:
1. Log in to your DNS provider (GoDaddy, Cloudflare, Route 53, etc.)
2. Add the records exactly as shown
3. Wait for DNS propagation (can take up to 48 hours, usually much faster)

### Verifying a Domain

After adding DNS records:
1. Click "Verify" on the domain row
2. The system checks if the DNS records are properly configured
3. If verification succeeds, the domain status changes to "Verified" (green check mark)
4. If verification fails, you see an error indicating which records are missing or incorrect
5. You can retry verification after correcting the DNS records

### Email Senders

Once a domain is verified, you can configure email senders:
1. Click "Add Sender"
2. Enter:
   - **Sender Name**: The display name in the "From" field (e.g., "Kaizen Events")
   - **Sender Email**: The email address in the "From" field (must be on a verified domain, e.g., `notifications@events.yourcompany.com`)
   - **DKIM Domain**: Select the verified domain to use
   - **Is Default**: Toggle to make this the default sender for all outgoing emails
3. Click "Save"

---

## 23. URL Shortener

The URL shortener creates short, memorable links for campaign URLs. This is particularly useful for printing on physical materials, sharing in SMS messages, or creating QR codes.

### Creating Short URLs

Short URLs are created from the Campaign Detail page:
1. Navigate to the Campaign Detail page
2. In the Short URLs section, you will see the registration URL and (if kiosk is enabled) the kiosk URL
3. Click "Generate Short Link" next to the URL you want to shorten
4. A short URL is created and displayed

### Short URL Format

Short URLs follow the format: `https://yoursite.com/s/:shortCode`

The short code is a randomly generated alphanumeric string.

### Using Short URLs

- Copy the short URL using the copy button
- Share it via email, SMS, social media, or print materials
- When a user visits the short URL, they are automatically redirected to the full URL

### Click Tracking

Each short URL tracks the number of times it has been visited. The click count is displayed next to the short URL on the Campaign Detail page.

### Campaign-Specific Short URLs

Short URLs are associated with a campaign. From the Campaign Detail page, you can see all short URLs generated for that campaign. Each campaign can have:
- A short URL for the registration page (`/register/:slug`)
- A short URL for the kiosk page (`/kiosk/:campaignId`)

---

## 24. Analytics & Reporting

### Dashboard Analytics

**URL**: `/dashboard`

The main dashboard provides an aggregated view across all campaigns (or filtered by a specific campaign):

**Statistics:**
- Total Campaigns (active and inactive counts)
- Total Registrations
- Paid Registrations (completed payments)
- Pending Registrations (awaiting payment)
- Total Revenue

**Trend Charts:**
- **Registration Trend** (7-day area chart): Shows daily registration counts for the past week
- **Revenue Trend** (7-day bar chart): Shows daily revenue collected for the past week

**Recent Registrations Table**: The most recent registrations across campaigns, showing name, campaign, amount, status, and date.

### Campaign Analytics

**URL**: `/campaigns/:campaignId/registrations` (top section)

Each campaign's registrations page includes an analytics section:

**Statistics Cards:**
- Total Registrations
- Completed Payments (count and amount)
- Pending Payments (count and amount)
- Failed Payments (count)

**Charts:**
- Registration trend chart specific to this campaign
- Payment status distribution

### Export Functionality

**From Dashboard:**
Click the "Export" button on the dashboard to download registration data across all accessible campaigns as an Excel file.

**From Campaign Registrations:**
Click the "Export" button on the campaign registrations page. Choose CSV or Excel format. The export includes:
- Registration ID
- Invoice Number
- Registration Date
- All form field values (each field becomes a column)
- Payment Status
- Payment Amount
- Payment ID
- Payment Gateway
- Transaction Date
- Campaign Name

The export respects current search and filter selections, so you can export a subset of registrations.

---

## 25. Activity Logs

**URL**: `/activity-logs`  
**Access**: Super Admin, Directors

Activity Logs provide a comprehensive audit trail of all actions performed in the system. Every significant user action and system event is recorded as an immutable log entry.

### Log Entry Structure

Each activity log entry contains:
- **Event Type**: The category of the event (e.g., LOGIN_SUCCESS, CAMPAIGN_CREATED, PAYMENT_VERIFIED)
- **User**: The user who performed the action (name and email)
- **Resource**: The affected entity (campaign, registration, payment, user, etc.)
- **Details**: Additional context about the action (what changed, old values, new values)
- **Timestamp**: When the event occurred
- **IP Address**: The IP address of the request (when available)

### Event Types

The system tracks the following categories of events:

**Authentication:**
- LOGIN_SUCCESS: Successful user login
- LOGIN_FAILED: Failed login attempt

**User Management:**
- USER_CREATED: New user account created
- USER_UPDATED: User account modified
- USER_DELETED: User account deleted

**Campaign Management:**
- CAMPAIGN_CREATED: New campaign created
- CAMPAIGN_UPDATED: Campaign settings modified
- CAMPAIGN_DELETED: Campaign permanently deleted
- CAMPAIGN_ARCHIVED: Campaign archived

**Landing Pages:**
- LANDING_PAGE_CREATED: Landing page created
- LANDING_PAGE_UPDATED: Landing page modified
- LANDING_PAGE_PUBLISHED: Landing page published
- LANDING_PAGE_DELETED: Landing page deleted

**Registrations:**
- REGISTRATION_CREATED: New registration submitted
- REGISTRATION_UPDATED: Registration details modified
- REGISTRATION_DELETED: Registration removed

**Payments:**
- PAYMENT_INITIATED: Payment process started
- PAYMENT_VERIFIED: Payment successfully verified
- PAYMENT_FAILED: Payment attempt failed
- PAYMENT_REFUNDED: Refund processed

**Fund Transfers:**
- TRANSFER_CREATED: Fund transfer request created
- TRANSFER_APPROVED: Fund transfer approved by Director
- TRANSFER_REJECTED: Fund transfer rejected by Director
- TRANSFER_COMPLETED: Fund transfer executed and marked complete

**Bank Accounts:**
- BANK_ACCOUNT_CREATED: Bank account added to a campaign
- BANK_ACCOUNT_UPDATED: Bank account details modified
- BANK_ACCOUNT_DELETED: Bank account removed

**Form Builder:**
- FORM_UPDATED: Form configuration changed

**Settings:**
- SETTINGS_UPDATED: System or campaign settings changed

**Data Operations:**
- DATA_EXPORT: Registration data exported
- DATA_IMPORT: Member data imported (CSV upload)

**Security:**
- UNAUTHORIZED_ACCESS: Attempted access to unauthorized resource

### Searching and Filtering

**Search**: Enter text in the search bar to search across event types, user names, and resource descriptions.

**Filters:**
- **Event Type**: Filter by a specific event type from the dropdown
- **Date Range**: Filter logs within a specific date range

**Pagination**: Logs are paginated. Use the page controls to navigate through older entries.

### Audit Trail Integrity

Activity logs are stored with integrity hashes to ensure they have not been tampered with. This is important for compliance and dispute resolution. Logs cannot be edited or deleted through the UI. Each log entry's hash is computed using the previous entry's hash, forming a chain.

---

## 26. Appendix

### A. Complete List of All Routes

#### Public Routes (No Authentication Required)

| Route | Page | Description |
|-------|------|-------------|
| `/` | Public Events Home | Lists all active campaigns marked for homepage display |
| `/login` | Login | Email and password login for admin users |
| `/event/:slug` | Public Landing Page | Public marketing page for a specific campaign |
| `/register/:slug` | Public Registration | Registration form for a specific campaign |
| `/payment-success` | Payment Success | Confirmation page after successful online payment |
| `/payment-failed` | Payment Failed | Error page after failed online payment |
| `/payment-status` | Payment Status | Payment status check page (Instamojo callback) |
| `/payment-callback` | Payment Status | Alternative payment callback URL |
| `/error` | Error Page | Generic error page |
| `/error/500` | Server Error | 500 Internal Server Error page |
| `/error/403` | Unauthorized | 403 Forbidden page |
| `/404` | Not Found | 404 Not Found page |

#### Protected Routes (Authentication Required)

| Route | Page | Access | Description |
|-------|------|--------|-------------|
| `/dashboard` | Dashboard | All authenticated users | Main dashboard with stats and charts |
| `/campaigns` | Campaigns List | All authenticated users | List of all accessible campaigns |
| `/campaigns/create` | Create Campaign | Super Admin | Create a new campaign |
| `/campaigns/:campaignId` | Campaign Detail | Super Admin, assigned Org Admin | Campaign overview, stats, and management |
| `/campaigns/:campaignId/edit` | Edit Campaign | Super Admin | Edit campaign settings |
| `/campaigns/:campaignId/form-builder` | Form Builder | Super Admin, assigned Org Admin | Design the registration form |
| `/campaigns/:campaignId/landing-page` | Landing Page Builder | Super Admin | Design the public landing page |
| `/campaigns/:campaignId/registrations` | Campaign Registrations | Super Admin, assigned Org Admin | View and manage registrations |
| `/campaigns/:campaignId/members` | Campaign Members | Super Admin, assigned Org Admin | Manage closed group members |
| `/campaigns/:campaignId/settings` | Campaign Settings | Super Admin, assigned Org Admin | Campaign-specific settings |
| `/campaigns/:campaignId/offline-payments` | Offline Payment Verification | Super Admin, assigned Org Admin | Verify and confirm offline payments |
| `/kiosk/:campaignId` | Kiosk Mode | Super Admin, assigned Kiosk Volunteer | On-site registration and check-in |
| `/kiosk-volunteers` | Kiosk Volunteers | Super Admin | Manage kiosk volunteer accounts |
| `/payment-accounts` | Payment Accounts | Super Admin | Manage payment gateway accounts |
| `/users` | User Management | Super Admin, Directors | Manage user accounts |
| `/dkim` | DKIM Registration | Super Admin | Manage email domain verification |
| `/integrations` | Integrations | Super Admin | Configure email and Google Sheets |
| `/fund-transfers` | Fund Transfers | Super Admin | Manage fund transfers to organizers |
| `/approvals` | Director Approvals | Directors | Review and approve/reject requests |
| `/activity-logs` | Activity Logs | Super Admin, Directors | View system audit trail |
| `/control-panel` | Control Panel | Super Admin | Central hub for system settings |
| `/control-panel/users` | User Management | Super Admin | User management (via Control Panel) |
| `/control-panel/dkim` | DKIM Registration | Super Admin | DKIM management (via Control Panel) |
| `/control-panel/integrations` | Integrations | Super Admin | Integrations (via Control Panel) |

### B. Glossary

| Term | Definition |
|------|------------|
| **API Key** | A secret credential used to authenticate with external services (payment gateways, email providers) |
| **Base Price** | The starting price for a registration before any option modifiers, formulas, or discounts are applied |
| **Campaign** | An event with its own registration form, landing page, payment configuration, and registrations |
| **Closed Group** | A campaign type where only pre-approved members can register |
| **Coupon Code** | A discount code that registrants can apply to reduce the registration price |
| **DKIM** | DomainKeys Identified Mail, an email authentication protocol to prevent spam classification |
| **Director** | A user with `can_approve_transfers` permission who can approve fund transfers |
| **Early Bird** | A time-limited discounted price for early registrations |
| **Field Rule** | A conditional logic rule that shows, hides, or modifies form fields based on other field values |
| **Form Builder** | The drag-and-drop interface for designing registration forms |
| **Formula** | A mathematical expression used to calculate dynamic pricing based on form field values |
| **Fund Collection Mode** | How payment funds flow: Kaizen Managed (platform holds) or Organizer Direct (gateway pays organizer) |
| **Fund Transfer** | The process of moving collected funds from the platform to the organizer's bank account |
| **IFSC** | Indian Financial System Code, used to identify bank branches for fund transfers |
| **Instamojo** | An Indian payment gateway supported by Kaizen Events |
| **Invoice Number** | A unique identifier assigned to each confirmed registration |
| **Kiosk** | An on-site registration and check-in interface for event venues |
| **Landing Page** | A public marketing page for a campaign, built with the Landing Page Builder |
| **OTP** | One-Time Password, a 6-digit code used for identity verification |
| **Org Admin** | A user role scoped to specific campaigns, for event organizers |
| **Page Break** | A divider that splits a form into multiple pages |
| **Payment Account** | A configured set of payment gateway credentials |
| **Platform Fee** | The 2.95% fee charged on Kaizen Managed campaigns |
| **Price Modifier** | An amount added to or subtracted from the base price when a specific option is selected |
| **Razorpay** | An Indian payment gateway supported by Kaizen Events |
| **Registration** | A user's sign-up for a campaign, including form data and payment records |
| **Resend** | An email service used for DKIM domain management and email sending |
| **Settlement** | The process where a payment gateway deposits collected funds into the merchant's bank account |
| **Short URL** | A shortened, trackable URL that redirects to a full campaign URL |
| **Slug** | A URL-friendly identifier for a campaign, derived from the campaign name |
| **Super Admin** | The highest-privilege user role with full access to all features |
| **UTR** | Unique Transaction Reference, a bank-assigned identifier for fund transfers |
| **Webhook** | A server-to-server notification from a payment gateway about payment status changes |

### C. Frequently Asked Questions

**Q: How do I create my first event?**  
A: Log in as a Super Admin, go to Campaigns, click "Create Campaign", fill in the event details, payment configuration, and click "Create". Then use the Form Builder to design your registration form and the Landing Page Builder to create your event page.

**Q: Can an Org Admin create campaigns?**  
A: No. Only Super Admins can create campaigns. Once created, a Super Admin can assign the campaign to an Org Admin, who can then manage registrations, the form, and the landing page for that campaign.

**Q: What is the difference between Kaizen Managed and Organizer Direct?**  
A: In "Kaizen Managed" mode, the platform collects and holds all funds, then transfers them to the organizer after Director approval. A 2.95% platform fee is charged. In "Organizer Direct" mode, the payment gateway deposits funds directly into the organizer's bank account. No platform fee, but the platform has no control over fund distribution.

**Q: How do I test payments without real money?**  
A: Create a payment account using test/sandbox credentials. For Razorpay, use a Key ID starting with `rzp_test_`. For Instamojo, set the mode to "Sandbox". Test mode processes simulated payments without real charges.

**Q: Can I use both Razorpay and Instamojo at the same time?**  
A: Not on the same campaign. Each campaign is assigned a single payment account, which is either Razorpay or Instamojo. However, different campaigns can use different gateways.

**Q: What happens when a registrant's payment fails?**  
A: The registration is saved with a "pending" payment status. For Razorpay, the user can retry payment immediately through the popup. For Instamojo, they are redirected to the payment failed page with a retry option. The registration remains in the system and the user can try again.

**Q: How do offline payments work?**  
A: The registrant fills out the form and submits it without paying online. They receive a 6-digit OTP on their phone. At the event venue, they present the OTP to the organizer, who verifies it on the Offline Payments page and confirms that cash/check/UPI payment was received.

**Q: Can I issue refunds?**  
A: Yes. From the Registrations page, select a registration with a completed payment. Click edit, then "Process Refund". You can issue a full or partial refund. The refund is processed through the original payment gateway.

**Q: How do I add team members who can manage my event?**  
A: Ask a Super Admin to create an Org Admin account in User Management and assign your campaign to that user. The new Org Admin can then log in and manage the assigned campaign.

**Q: Why are my emails going to spam?**  
A: You likely need to configure DKIM. Go to Control Panel > DKIM Registration, register your sending domain, add the DNS records to your domain provider, and verify. This authenticates your emails and significantly improves deliverability.

**Q: How does the Google Sheets integration work?**  
A: After configuring the Google service account credentials in Integrations, go to the Form Builder > Integrations tab for a campaign and click "Create Sheet". New registrations will automatically appear as rows in the created Google Spreadsheet.

**Q: What is the maximum file size for closed group member uploads?**  
A: The system supports standard CSV and Excel files. For best results, keep files under a few thousand rows. Very large files may take longer to process. The upload preview shows the first few rows for column mapping verification.

**Q: Can I have multiple registration forms for one campaign?**  
A: No. Each campaign has one registration form. If you need different forms for different audiences, create separate campaigns.

**Q: How do I close registration for an event?**  
A: You have several options: (1) Set a registration end date in the campaign settings, (2) Archive the campaign, or (3) Disable registration through campaign settings. Existing registrations are not affected.

**Q: What happens to data when I delete a campaign?**  
A: Deleting a campaign permanently removes the campaign, all registrations, form configuration, landing page, members, and fund transfer records. This action cannot be undone. Consider archiving instead if you want to keep the data for reference.

---

*This guide covers all features of the Kaizen Events platform as of April 2026. For technical documentation, API reference, and deployment guides, refer to the other documents in the `/docs` directory.*
