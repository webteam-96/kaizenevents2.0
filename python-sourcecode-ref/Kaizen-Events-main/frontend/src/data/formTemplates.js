// Form Templates for Registration Forms
// Each template provides a unique aesthetic and sample fields for different event types

import { v4 as uuidv4 } from 'uuid';

// Helper to generate unique IDs
const generateId = () => uuidv4().split('-')[0];

export const FORM_TEMPLATES = [
  {
    id: 'elegant-gala',
    name: 'Elegant Gala',
    description: 'Luxurious design for galas and award nights',
    icon: '✨',
    theme: {
      primary_color: '#c9a227',
      secondary_color: '#1a1a2e',
      background_color: '#1a1a2e',
      text_color: '#ffffff',
      accent_color: '#ffd700',
      font_family: 'Playfair Display',
      card_style: 'glass',
      page_background: '#0f0f1a',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'section_header', label: 'Attendee Information', order: 0, required: false },
      { id: generateId(), type: 'name', label: 'Full Name', placeholder: 'Enter your full name', required: true, order: 1, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'your.email@example.com', required: true, order: 2 },
      { id: generateId(), type: 'phone', label: 'Phone Number', placeholder: '+91 98765 43210', required: true, order: 3 },
      { id: generateId(), type: 'text', label: 'Company / Organization', placeholder: 'Your company name', required: false, order: 4 },
      { id: generateId(), type: 'dropdown', label: 'Seating Preference', required: true, order: 5, options: [
        { label: 'Individual Seat - ₹7,500', value: 'individual', price_modifier: 7500 },
        { label: 'Couple Package - ₹12,500', value: 'couple', price_modifier: 12500 },
        { label: 'Corporate Table (10 guests) - ₹65,000', value: 'corporate', price_modifier: 65000 }
      ]},
      { id: generateId(), type: 'dropdown', label: 'Dietary Requirements', required: true, order: 6, options: [
        { label: 'Vegetarian', value: 'vegetarian' },
        { label: 'Non-Vegetarian', value: 'non-vegetarian' },
        { label: 'Vegan', value: 'vegan' }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I agree to the terms and conditions', required: true, order: 7 }
    ]
  },
  {
    id: 'professional-seminar',
    name: 'Professional Seminar',
    description: 'Clean, corporate look for training and workshops',
    icon: '📚',
    theme: {
      primary_color: '#2563eb',
      secondary_color: '#1e40af',
      background_color: '#ffffff',
      text_color: '#1e293b',
      accent_color: '#3b82f6',
      font_family: 'Inter',
      card_style: 'solid',
      page_background: '#f1f5f9',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Work Email', placeholder: 'name@company.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'text', label: 'Company Name', placeholder: 'Your organization', required: true, order: 3 },
      { id: generateId(), type: 'text', label: 'Job Title', placeholder: 'Your current role', required: true, order: 4 },
      { id: generateId(), type: 'dropdown', label: 'Registration Type', required: true, order: 5, options: [
        { label: 'Individual - ₹12,999', value: 'individual', price_modifier: 12999 },
        { label: 'Team (3+) - ₹9,999/person', value: 'team', price_modifier: 9999 }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I accept the cancellation policy and terms', required: true, order: 6 }
    ]
  },
  {
    id: 'vip-dinner',
    name: 'VIP Dinner',
    description: 'Sophisticated design for exclusive dinners',
    icon: '🍽️',
    theme: {
      primary_color: '#091D40',
      secondary_color: '#091D40',
      background_color: '#1e1b4b',
      text_color: '#e0e7ff',
      accent_color: '#a78bfa',
      font_family: 'Cormorant Garamond',
      card_style: 'glass',
      page_background: '#0f0d24',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Guest Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email', placeholder: 'your@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Contact Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'number', label: 'Number of Guests', placeholder: '1', required: true, order: 3, min_value: 1, max_value: 10 },
      { id: generateId(), type: 'dropdown', label: 'Menu Preference', required: true, order: 4, options: [
        { label: "Chef's Tasting Menu (Non-Veg)", value: 'tasting-nonveg' },
        { label: "Chef's Tasting Menu (Vegetarian)", value: 'tasting-veg' }
      ]},
      { id: generateId(), type: 'textarea', label: 'Dietary Restrictions / Allergies', placeholder: 'Please inform us of any allergies', required: false, order: 5 },
      { id: generateId(), type: 'terms_checkbox', label: 'I understand the dress code is formal attire', required: true, order: 6 }
    ]
  },
  {
    id: 'celebration-night',
    name: 'Celebration Night',
    description: 'Festive design for parties and celebrations',
    icon: '🎉',
    theme: {
      primary_color: '#ec4899',
      secondary_color: '#db2777',
      background_color: '#27272a',
      text_color: '#fafafa',
      accent_color: '#f472b6',
      font_family: 'Outfit',
      card_style: 'glass',
      page_background: '#18181b',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Your Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email', placeholder: 'party@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'WhatsApp Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'dropdown', label: 'Ticket Type', required: true, order: 3, options: [
        { label: 'Stag Entry - ₹2,500', value: 'stag', price_modifier: 2500 },
        { label: 'Couple Entry - ₹4,000', value: 'couple', price_modifier: 4000 },
        { label: 'VIP Table (4 guests) - ₹15,000', value: 'vip', price_modifier: 15000 }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I confirm I am 18+ years old', required: true, order: 4 }
    ]
  },
  {
    id: 'modern-minimal',
    name: 'Modern Minimal',
    description: 'Clean, minimalist design for any event',
    icon: '🎯',
    theme: {
      primary_color: '#0f172a',
      secondary_color: '#334155',
      background_color: '#ffffff',
      text_color: '#0f172a',
      accent_color: '#14b8a6',
      font_family: 'Inter',
      card_style: 'solid',
      page_background: '#f8fafc',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email', placeholder: 'you@example.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Phone', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'terms_checkbox', label: 'I agree to the terms and conditions', required: true, order: 3 }
    ]
  },
  {
    id: 'conference-pro',
    name: 'Conference Pro',
    description: 'Professional design for conferences',
    icon: '🎤',
    theme: {
      primary_color: '#059669',
      secondary_color: '#047857',
      background_color: '#ffffff',
      text_color: '#14532d',
      accent_color: '#10b981',
      font_family: 'Libre Baskerville',
      card_style: 'solid',
      page_background: '#ecfdf5',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Full Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'name@company.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'text', label: 'Organization', placeholder: 'Company name', required: true, order: 3 },
      { id: generateId(), type: 'dropdown', label: 'Pass Type', required: true, order: 4, options: [
        { label: 'Early Bird - ₹2,999', value: 'early-bird', price_modifier: 2999 },
        { label: 'Professional - ₹4,999', value: 'professional', price_modifier: 4999 },
        { label: 'VIP - ₹9,999', value: 'vip', price_modifier: 9999 }
      ]},
      { id: generateId(), type: 'dropdown', label: 'T-Shirt Size', required: true, order: 5, options: [
        { label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }, { label: 'XL', value: 'xl' }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I accept the conference code of conduct', required: true, order: 6 }
    ]
  },
  {
    id: 'charity-fundraiser',
    name: 'Charity Fundraiser',
    description: 'Warm, inviting design for charity events',
    icon: '💝',
    theme: {
      primary_color: '#dc2626',
      secondary_color: '#b91c1c',
      background_color: '#ffffff',
      text_color: '#450a0a',
      accent_color: '#f87171',
      font_family: 'Nunito',
      card_style: 'solid',
      page_background: '#fef2f2',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Your Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'donor@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Phone Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'dropdown', label: 'Donation Tier', required: true, order: 3, options: [
        { label: 'Friend - ₹5,000', value: 'friend', price_modifier: 5000 },
        { label: 'Champion - ₹15,000', value: 'champion', price_modifier: 15000 },
        { label: 'Patron - ₹50,000', value: 'patron', price_modifier: 50000 }
      ]},
      { id: generateId(), type: 'textarea', label: 'Message of support (optional)', placeholder: 'Share why this cause matters to you...', required: false, order: 4 },
      { id: generateId(), type: 'terms_checkbox', label: 'I understand this is a charitable contribution', required: true, order: 5 }
    ]
  },
  {
    id: 'sports-event',
    name: 'Sports Event',
    description: 'Dynamic design for sports and fitness events',
    icon: '🏆',
    theme: {
      primary_color: '#ea580c',
      secondary_color: '#c2410c',
      background_color: '#292524',
      text_color: '#fafaf9',
      accent_color: '#fb923c',
      font_family: 'Oswald',
      card_style: 'glass',
      page_background: '#1c1917',
      gradient: null
    },
    sample_header_image: 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=1200&h=400&fit=crop',
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Participant Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email', placeholder: 'runner@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'dropdown', label: 'Race Category', required: true, order: 3, options: [
        { label: '5K Run - ₹850', value: '5k', price_modifier: 850 },
        { label: '10K Run - ₹1,200', value: '10k', price_modifier: 1200 },
        { label: 'Half Marathon - ₹2,000', value: '21k', price_modifier: 2000 },
        { label: 'Full Marathon - ₹3,500', value: '42k', price_modifier: 3500 }
      ]},
      { id: generateId(), type: 'dropdown', label: 'T-Shirt Size', required: true, order: 4, options: [
        { label: 'S', value: 's' }, { label: 'M', value: 'm' }, { label: 'L', value: 'l' }, { label: 'XL', value: 'xl' }
      ]},
      { id: generateId(), type: 'text', label: 'Emergency Contact Name', placeholder: 'Contact person', required: true, order: 5 },
      { id: generateId(), type: 'phone', label: 'Emergency Contact Number', placeholder: '+91 98765 43210', required: true, order: 6 },
      { id: generateId(), type: 'terms_checkbox', label: 'I declare that I am medically fit to participate', required: true, order: 7 }
    ]
  },
  {
    id: 'wedding-reception',
    name: 'Wedding & Reception',
    description: 'Romantic, elegant design for weddings and receptions',
    icon: '💍',
    theme: {
      primary_color: '#b76e79',
      secondary_color: '#4a3728',
      background_color: '#fffaf5',
      text_color: '#4a3728',
      accent_color: '#d4af37',
      font_family: 'Cormorant Garamond',
      card_style: 'solid',
      page_background: '#fdf6f0',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Guest Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'your@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Phone / WhatsApp Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'dropdown', label: 'Attending With', required: true, order: 3, options: [
        { label: 'Just Me', value: 'solo' },
        { label: 'Me + 1 Guest', value: 'plus-one' },
        { label: 'Family (up to 4)', value: 'family' }
      ]},
      { id: generateId(), type: 'dropdown', label: 'Meal Preference', required: true, order: 4, options: [
        { label: 'Vegetarian', value: 'vegetarian' },
        { label: 'Non-Vegetarian', value: 'non-vegetarian' },
        { label: 'Jain', value: 'jain' }
      ]},
      { id: generateId(), type: 'textarea', label: 'Wishes for the couple (optional)', placeholder: 'Share your blessings...', required: false, order: 5 },
      { id: generateId(), type: 'terms_checkbox', label: 'I confirm my RSVP for this event', required: true, order: 6 }
    ]
  },
  {
    id: 'corporate-workshop',
    name: 'Corporate Workshop',
    description: 'Structured, professional design for training sessions and workshops',
    icon: '🧑‍💻',
    theme: {
      primary_color: '#0369a1',
      secondary_color: '#075985',
      background_color: '#ffffff',
      text_color: '#0c4a6e',
      accent_color: '#0ea5e9',
      font_family: 'Inter',
      card_style: 'solid',
      page_background: '#f0f9ff',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Full Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Work Email', placeholder: 'name@company.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'text', label: 'Company Name', placeholder: 'Your organization', required: true, order: 3 },
      { id: generateId(), type: 'dropdown', label: 'Session Track', required: true, order: 4, options: [
        { label: 'Beginner', value: 'beginner' },
        { label: 'Advanced', value: 'advanced' }
      ]},
      { id: generateId(), type: 'dropdown', label: 'Registration Type', required: true, order: 5, options: [
        { label: 'Individual - ₹1,999', value: 'individual', price_modifier: 1999 },
        { label: 'Group of 5 - ₹7,999', value: 'group', price_modifier: 7999 }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I accept the workshop terms and cancellation policy', required: true, order: 6 }
    ]
  },
  {
    id: 'webinar-virtual',
    name: 'Webinar / Virtual Event',
    description: 'Sleek, tech-forward design for online sessions and webinars',
    icon: '💻',
    theme: {
      primary_color: '#091D40',
      secondary_color: '#4338ca',
      background_color: '#ffffff',
      text_color: '#1e1b4b',
      accent_color: '#818cf8',
      font_family: 'Libre Baskerville',
      card_style: 'solid',
      page_background: '#eef2ff',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Full Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'The join link will be sent here', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: false, order: 2 },
      { id: generateId(), type: 'dropdown', label: 'How did you hear about this session?', required: false, order: 3, options: [
        { label: 'Social Media', value: 'social' },
        { label: 'Email', value: 'email' },
        { label: 'Referral', value: 'referral' },
        { label: 'Other', value: 'other' }
      ]},
      { id: generateId(), type: 'checkbox', label: 'Send me updates about future sessions', required: false, order: 4, options: [
        { label: 'Yes, keep me updated', value: 'yes' }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I agree to the terms and conditions', required: true, order: 5 }
    ]
  },
  {
    id: 'cultural-festival',
    name: 'Cultural Festival',
    description: 'Vibrant design for cultural festivals, fairs and community events',
    icon: '🎇',
    theme: {
      primary_color: '#f59e0b',
      secondary_color: '#b45309',
      background_color: '#fffbeb',
      text_color: '#78350f',
      accent_color: '#f97316',
      font_family: 'Outfit',
      card_style: 'solid',
      page_background: '#fff7ed',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Your Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'phone', label: 'WhatsApp Number', placeholder: '+91 98765 43210', required: true, order: 1 },
      { id: generateId(), type: 'email', label: 'Email', placeholder: 'your@email.com', required: false, order: 2 },
      { id: generateId(), type: 'number', label: 'Number of Family Members Attending', placeholder: '1', required: true, order: 3, min_value: 1, max_value: 20 },
      { id: generateId(), type: 'dropdown', label: 'Pass Type', required: true, order: 4, options: [
        { label: 'Single Day - ₹200', value: 'single-day', price_modifier: 200 },
        { label: 'Full Festival Pass - ₹500', value: 'full-pass', price_modifier: 500 }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I agree to the event guidelines', required: true, order: 5 }
    ]
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Bold, modern design for product launches and brand reveals',
    icon: '🚀',
    theme: {
      primary_color: '#111827',
      secondary_color: '#374151',
      background_color: '#111827',
      text_color: '#f9fafb',
      accent_color: '#22d3ee',
      font_family: 'Outfit',
      card_style: 'glass',
      page_background: '#030712',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Full Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'your@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'text', label: 'Company / Organization (optional)', placeholder: 'Your company name', required: false, order: 3 },
      { id: generateId(), type: 'dropdown', label: 'How did you hear about this launch?', required: false, order: 4, options: [
        { label: 'Social Media', value: 'social' },
        { label: 'Press / Media', value: 'press' },
        { label: 'Referral', value: 'referral' },
        { label: 'Other', value: 'other' }
      ]},
      { id: generateId(), type: 'terms_checkbox', label: 'I agree to receive updates about this product', required: true, order: 5 }
    ]
  },
  {
    id: 'awards-night',
    name: 'Awards Night',
    description: 'Glamorous design for award ceremonies and recognition nights',
    icon: '🏅',
    theme: {
      primary_color: '#091D40',
      secondary_color: '#581c87',
      background_color: '#1e1033',
      text_color: '#f5f3ff',
      accent_color: '#CC9C4C',
      font_family: 'Playfair Display',
      card_style: 'glass',
      page_background: '#120a24',
      gradient: null
    },
    sample_header_image: null,
    sample_fields: [
      { id: generateId(), type: 'name', label: 'Full Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
      { id: generateId(), type: 'email', label: 'Email', placeholder: 'your@email.com', required: true, order: 1 },
      { id: generateId(), type: 'phone', label: 'Contact Number', placeholder: '+91 98765 43210', required: true, order: 2 },
      { id: generateId(), type: 'dropdown', label: "You're Attending As", required: true, order: 3, options: [
        { label: 'Nominee', value: 'nominee' },
        { label: 'Guest', value: 'guest' },
        { label: 'Press', value: 'press' }
      ]},
      { id: generateId(), type: 'dropdown', label: 'Seating', required: true, order: 4, options: [
        { label: 'Standard - ₹3,500', value: 'standard', price_modifier: 3500 },
        { label: 'Premium - ₹6,000', value: 'premium', price_modifier: 6000 }
      ]},
      { id: generateId(), type: 'textarea', label: 'Dietary Requirements (optional)', placeholder: 'Please inform us of any allergies', required: false, order: 5 },
      { id: generateId(), type: 'terms_checkbox', label: 'I understand the dress code is formal attire', required: true, order: 6 }
    ]
  }
];

// ── Extra design-language showcase templates ────────────────────────────────
// Each leans into a distinct visual system rendered by src/styles/formStyles.css.
// The `style` + `layout` (assigned below) are what the public form's engine reads.
const stdFields = (ticketLabel = 'Ticket Type') => [
  { id: generateId(), type: 'name', label: 'Full Name', required: true, order: 0, name_config: { show_first_name: true, show_middle_name: false, show_last_name: true } },
  { id: generateId(), type: 'email', label: 'Email Address', placeholder: 'you@example.com', required: true, order: 1 },
  { id: generateId(), type: 'phone', label: 'Mobile Number', placeholder: '+91 98765 43210', required: true, order: 2 },
  { id: generateId(), type: 'dropdown', label: ticketLabel, required: true, order: 3, options: [
    { label: 'Standard - ₹1,500', value: 'standard', price_modifier: 1500 },
    { label: 'Premium - ₹3,000', value: 'premium', price_modifier: 3000 },
  ] },
  { id: generateId(), type: 'terms_checkbox', label: 'I agree to the terms and conditions', required: true, order: 4 },
];

FORM_TEMPLATES.push(
  { id: 'brutalist-bold', name: 'Brutalist Bold', description: 'Hard edges, offset shadows, nothing apologetic', icon: '🟨',
    theme: { primary_color: '#111111', secondary_color: '#111111', background_color: '#ffffff', text_color: '#111111', accent_color: '#ffe500', font_family: 'Space Grotesk', card_style: 'solid', page_background: '#fffdf2', gradient: null },
    sample_header_image: null, sample_fields: stdFields('Pass') },
  { id: 'glass-aurora', name: 'Glass Aurora', description: 'A frosted pane over colour that bleeds through', icon: '🫧',
    theme: { primary_color: '#5b8cff', secondary_color: '#3e7bfa', background_color: '#1b2440', text_color: '#eaf0ff', accent_color: '#b14bff', font_family: 'Poppins', card_style: 'glass', page_background: '#0e1424', gradient: null },
    sample_header_image: null, sample_fields: stdFields() },
  { id: 'terminal-console', name: 'Terminal Console', description: 'Monospace, dark, phosphor glow', icon: '🖥️',
    theme: { primary_color: '#3dff6e', secondary_color: '#3dff6e', background_color: '#0a130c', text_color: '#bfe8c4', accent_color: '#3dff6e', font_family: 'JetBrains Mono', card_style: 'solid', page_background: '#050a06', gradient: null },
    sample_header_image: null, sample_fields: stdFields('Access') },
  { id: 'editorial-broadsheet', name: 'Editorial Broadsheet', description: 'Magazine serif at display size', icon: '📰',
    theme: { primary_color: '#8c1d18', secondary_color: '#16150f', background_color: '#ffffff', text_color: '#16150f', accent_color: '#8c1d18', font_family: 'Playfair Display', card_style: 'solid', page_background: '#fcfbf7', gradient: null },
    sample_header_image: null, sample_fields: stdFields('Seat') },
  { id: 'swiss-grid', name: 'Swiss Grid', description: 'Rules, alignment and one decisive accent', icon: '🔴',
    theme: { primary_color: '#e1000f', secondary_color: '#111111', background_color: '#ffffff', text_color: '#111111', accent_color: '#e1000f', font_family: 'Inter', card_style: 'solid', page_background: '#ffffff', gradient: null },
    sample_header_image: null, sample_fields: stdFields() },
  { id: 'soft-neu', name: 'Soft Neumorphic', description: 'One surface, pressed and raised — no borders', icon: '🩶',
    theme: { primary_color: '#6d7ff5', secondary_color: '#334155', background_color: '#e7e9ee', text_color: '#2e3440', accent_color: '#f58da0', font_family: 'Poppins', card_style: 'solid', page_background: '#e7e9ee', gradient: null },
    sample_header_image: null, sample_fields: stdFields() },
  { id: 'clay-bubble', name: 'Clay Bubble', description: 'Puffy, pressable, three-dimensional pastel', icon: '🍡',
    theme: { primary_color: '#7b61ff', secondary_color: '#db2777', background_color: '#ffffff', text_color: '#221e3d', accent_color: '#ff87b2', font_family: 'Poppins', card_style: 'solid', page_background: '#f0eeff', gradient: null },
    sample_header_image: null, sample_fields: stdFields() },
  { id: 'botanical-fern', name: 'Botanical Fern', description: 'Soft blobs, earthy ink, a serif that breathes', icon: '🌿',
    theme: { primary_color: '#3f7d4e', secondary_color: '#4a3728', background_color: '#ffffff', text_color: '#1c2a1e', accent_color: '#c1874a', font_family: 'Inter', card_style: 'solid', page_background: '#f5f7f0', gradient: null },
    sample_header_image: null, sample_fields: stdFields() },
);

// Assign each template a design language + page layout + FIELD STRUCTURE
// ([style, layout, fields]) — all three drive formStyles.css. `fields` changes how
// each field's label + control are placed (stack / left / float / rule / numbered / boxed).
const TEMPLATE_STYLE = {
  'elegant-gala': ['elegant', 'card', 'rule'],
  'professional-seminar': ['corporate', 'card', 'left'],
  'vip-dinner': ['elegant', 'card', 'rule'],
  'celebration-night': ['festive', 'card', 'boxed'],
  'modern-minimal': ['minimal', 'card', 'stack'],
  'conference-pro': ['corporate', 'card', 'left'],
  'charity-fundraiser': ['clay', 'card', 'float'],
  'sports-event': ['brutalist', 'full', 'boxed'],
  'wedding-reception': ['botanical', 'card', 'numbered'],
  'corporate-workshop': ['corporate', 'card', 'left'],
  'webinar-virtual': ['minimal', 'card', 'stack'],
  'cultural-festival': ['festive', 'card', 'boxed'],
  'product-launch': ['terminal', 'full', 'left'],
  'awards-night': ['elegant', 'split', 'rule'],
  'brutalist-bold': ['brutalist', 'card', 'boxed'],
  'glass-aurora': ['glass', 'card', 'float'],
  'terminal-console': ['terminal', 'card', 'left'],
  'editorial-broadsheet': ['editorial', 'split', 'rule'],
  'swiss-grid': ['swiss', 'card', 'left'],
  'soft-neu': ['neu', 'card', 'stack'],
  'clay-bubble': ['clay', 'card', 'float'],
  'botanical-fern': ['botanical', 'split', 'numbered'],
};
FORM_TEMPLATES.forEach((t) => {
  const [style, layout, fields] = TEMPLATE_STYLE[t.id] || ['minimal', 'card', 'stack'];
  t.theme.style = style;
  t.theme.layout = layout;
  t.theme.fields = fields;
});

// The DEFAULT theme (used when a campaign has NO template/style) must stay
// style-less, so un-templated / custom-theme forms render exactly as before.
export const DEFAULT_FORM_THEME = (() => {
  const { style, layout, fields, ...rest } = FORM_TEMPLATES.find((t) => t.id === 'modern-minimal').theme;
  return rest;
})();

export const getFormTemplate = (templateId) => {
  return FORM_TEMPLATES.find(t => t.id === templateId) || FORM_TEMPLATES[4];
};

// Helper to regenerate IDs for sample fields (to avoid conflicts)
export const applyTemplate = (template) => {
  return {
    ...template,
    sample_fields: template.sample_fields.map(field => ({
      ...field,
      id: generateId()
    }))
  };
};
