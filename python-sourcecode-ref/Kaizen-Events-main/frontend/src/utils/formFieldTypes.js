// Field type icons and configurations
import { Type, Mail, Phone, Hash, Calendar, Clock, ChevronDown, CheckSquare, Radio, Upload, AlignLeft, FileText, CheckCircle, User, IndianRupee, Bold, Star, Minus, SlidersHorizontal, ToggleLeft, MapPin, PenLine, Image as ImageIcon } from 'lucide-react';
import { gatewayAmountLimitsFor } from './fieldValidation';

export const FIELD_TYPES = [
  {
    type: 'name',
    label: 'Name',
    icon: User,
    category: 'basic',
    description: 'First, Middle, Last Name fields',
  },
  {
    type: 'text',
    label: 'Text Input',
    icon: Type,
    category: 'basic',
  },
  {
    type: 'email',
    label: 'Email',
    icon: Mail,
    category: 'basic',
  },
  {
    type: 'phone',
    label: 'Phone',
    icon: Phone,
    category: 'basic',
  },
  {
    type: 'address',
    label: 'Address',
    icon: MapPin,
    category: 'basic',
    description: 'Street, city, state, postal code & country',
  },
  {
    type: 'number',
    label: 'Number',
    icon: Hash,
    category: 'basic',
  },
  {
    type: 'date',
    label: 'Date',
    icon: Calendar,
    category: 'basic',
  },
  {
    type: 'time',
    label: 'Time',
    icon: Clock,
    category: 'basic',
  },
  {
    type: 'textarea',
    label: 'Text Area',
    icon: AlignLeft,
    category: 'basic',
  },
  {
    type: 'rich_text',
    label: 'Rich Text',
    icon: Bold,
    category: 'basic',
    description: 'Formatted text block (bold, italic, lists, links, tables)',
  },
  {
    type: 'dropdown',
    label: 'Dropdown',
    icon: ChevronDown,
    category: 'choice',
  },
  {
    type: 'radio',
    label: 'Radio Buttons',
    icon: Radio,
    category: 'choice',
  },
  {
    type: 'yes_no',
    label: 'Yes / No',
    icon: ToggleLeft,
    category: 'choice',
    description: 'A simple Yes or No toggle',
  },
  {
    type: 'image_choice',
    label: 'Image Choices',
    icon: ImageIcon,
    category: 'choice',
    description: 'Pick one option shown as an image',
  },
  {
    type: 'checkbox',
    label: 'Checkboxes',
    icon: CheckSquare,
    category: 'choice',
  },
  {
    type: 'file_upload',
    label: 'File Upload',
    icon: Upload,
    category: 'advanced',
  },
  {
    type: 'section_header',
    label: 'Section Header',
    icon: FileText,
    category: 'layout',
  },
  {
    type: 'terms_checkbox',
    label: 'Terms & Conditions',
    icon: CheckCircle,
    category: 'advanced',
  },
  {
    type: 'price',
    label: 'Price Summary',
    icon: IndianRupee,
    category: 'advanced',
    description: 'Read-only field that shows the live total based on selections',
  },
  {
    type: 'custom_amount',
    label: 'Custom Amount (payer decides)',
    icon: IndianRupee,
    category: 'advanced',
    description: 'Registrant types the amount to pay — added to the total automatically',
  },
  {
    type: 'currency',
    label: 'Currency',
    icon: IndianRupee,
    category: 'advanced',
    description: 'Currency input for data collection — not added to the total',
  },
  {
    type: 'rating',
    label: 'Rating',
    icon: Star,
    category: 'advanced',
    description: 'Star rating (1 to N stars)',
  },
  {
    type: 'slider',
    label: 'Slider',
    icon: SlidersHorizontal,
    category: 'advanced',
    description: 'Pick a number on a range slider',
  },
  {
    type: 'signature',
    label: 'Signature',
    icon: PenLine,
    category: 'advanced',
    description: 'Draw-to-sign signature pad',
  },
  {
    type: 'divider',
    label: 'Divider / Spacer',
    icon: Minus,
    category: 'layout',
    description: 'A horizontal line or blank space to separate sections',
  },
];

export const FIELD_CATEGORIES = [
  { id: 'basic', label: 'Basic Fields' },
  { id: 'choice', label: 'Choice Fields' },
  { id: 'advanced', label: 'Advanced' },
  { id: 'layout', label: 'Layout' },
];

// paymentGateway (the campaign's assigned gateway, e.g. 'razorpay') seeds a new
// custom_amount field's Range with that gateway's real floor/ceiling — a donation
// field always has a threshold from the moment it's added, the same one the builder's
// Range editor and the actual submit-time checks enforce (see FieldEditor.js and
// utils/fieldValidation.js). Falls back to Razorpay's bounds when no gateway is known
// yet, matching gatewayAmountLimitsFor's own fallback.
export const createDefaultField = (type, paymentGateway) => {
  const baseField = {
    id: `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    label: '',
    placeholder: '',
    help_text: '',
    required: false,
    order: 0,
    width: 'full',
  };

  const gw = gatewayAmountLimitsFor(paymentGateway);

  // Add type-specific defaults
  const typeDefaults = {
    name: { 
      label: 'Full Name',
      name_config: {
        show_first_name: true,
        show_middle_name: false,
        show_last_name: true,
        first_name_label: 'First Name',
        middle_name_label: 'Middle Name',
        last_name_label: 'Last Name',
        first_name_placeholder: 'Enter first name',
        middle_name_placeholder: 'Enter middle name',
        last_name_placeholder: 'Enter last name',
      }
    },
    dropdown: { options: [{ label: 'Option 1', value: 'option1', price_modifier: 0 }] },
    radio: { options: [{ label: 'Option 1', value: 'option1', price_modifier: 0 }] },
    checkbox: { options: [{ label: 'Option 1', value: 'option1', price_modifier: 0 }] },
    section_header: { label: 'Section Title', help_text: 'Section description' },
    terms_checkbox: { label: 'I agree to the terms and conditions', required: true },
    price: { label: 'Total Amount', required: false },
    rich_text: { label: '', required: false, content: '' },
    custom_amount: { label: 'Custom Amount', required: false, min_value: gw.min, max_value: gw.max },
    currency: { label: 'Amount', required: false },
    rating: { label: 'Rating', required: false, max_rating: 5 },
    yes_no: { label: 'Yes or No?', required: false, yes_label: 'Yes', no_label: 'No' },
    image_choice: { label: 'Choose an option', required: false, options: [{ label: 'Option 1', value: 'option1', image_url: '' }] },
    slider: { label: 'Select a value', required: false, min_value: 0, max_value: 100, step: 1 },
    divider: { label: '', required: false, divider_style: 'line' },
    signature: { label: 'Signature', required: false },
    address: {
      label: 'Address',
      required: false,
      address_config: { show_line2: true, show_country: true },
    },
  };

  return {
    ...baseField,
    ...typeDefaults[type],
  };
};
