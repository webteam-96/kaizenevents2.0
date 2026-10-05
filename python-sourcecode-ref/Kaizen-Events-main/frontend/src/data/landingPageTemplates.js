// Landing Page Templates - Extracted from LandingPageBuilder
import { Image, Type, Users, Calendar, HelpCircle, Mail, DollarSign } from 'lucide-react';

export const SECTION_TYPES = [
  { type: 'hero', label: 'Hero Banner', icon: Image, description: 'Main banner with title and CTA' },
  { type: 'about', label: 'About', icon: Type, description: 'Event description and details' },
  { type: 'speakers', label: 'Speakers', icon: Users, description: 'Featured speakers or guests' },
  { type: 'schedule', label: 'Schedule', icon: Calendar, description: 'Event timeline' },
  { type: 'pricing', label: 'Pricing', icon: DollarSign, description: 'Registration pricing tiers' },
  { type: 'faq', label: 'FAQ', icon: HelpCircle, description: 'Frequently asked questions' },
  { type: 'contact', label: 'Contact', icon: Mail, description: 'Contact information' },
];

export const DEFAULT_SECTIONS = [
  {
    id: 'hero-1',
    type: 'hero',
    title: 'Welcome to Our Event',
    subtitle: 'Join us for an amazing experience',
    content: '',
    image_url: '',
    order: 0,
    visible: true
  },
  {
    id: 'about-1',
    type: 'about',
    title: 'About the Event',
    subtitle: '',
    content: 'Learn more about what makes this event special.',
    order: 1,
    visible: true
  }
];

export const DEFAULT_THEME = {
  primary_color: '#091D40',
  secondary_color: '#14b8a6',
  background_color: '#ffffff',
  text_color: '#1e293b',
  font_family: 'Libre Baskerville'
};

export const TEMPLATES = [
  // Tech Conference
  {
    id: 'tech-conference',
    name: 'Tech Conference',
    preview: '💻',
    description: 'Modern split-screen hero with grid layouts',
    layout: 'modern-split',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'split-right', 
        title: 'TechSummit 2026', 
        subtitle: 'Where Innovation Meets Opportunity', 
        content: 'Join 2000+ developers, founders, and tech leaders for 2 days of cutting-edge insights, hands-on workshops, and unparalleled networking opportunities.', 
        image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80', 
        stats: [
          { value: '50+', label: 'Expert Speakers' }, 
          { value: '2000+', label: 'Attendees' }, 
          { value: '30+', label: 'Workshops' },
          { value: '2', label: 'Days' }
        ], 
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'cards', 
        title: 'Why Attend TechSummit?', 
        subtitle: 'Join the Premier Tech Event of 2026', 
        content: 'TechSummit brings together the brightest minds in technology for two days of inspiration, learning, and connection. Whether you\'re a startup founder, seasoned developer, or tech enthusiast, you\'ll find invaluable insights and opportunities.', 
        features: [
          { icon: '🎯', title: 'Learn from Pioneers', desc: 'Hear from industry leaders who are shaping the future of technology' }, 
          { icon: '🤝', title: 'Network & Connect', desc: 'Build lasting relationships with fellow innovators and potential collaborators' }, 
          { icon: '🚀', title: 'Grow Your Career', desc: 'Discover new opportunities and accelerate your professional development' },
          { icon: '💡', title: 'Hands-on Experience', desc: 'Participate in interactive workshops and get practical skills' }
        ], 
        order: 1, 
        visible: true 
      },
      { 
        id: 'speakers-1', 
        type: 'speakers', 
        layout: 'grid-cards', 
        title: 'Featured Speakers', 
        subtitle: 'Learn from Industry Leaders',
        items: [
          { name: 'Dr. Sarah Chen', title: 'AI Research Director, Google DeepMind', image_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80', topic: 'The Future of Generative AI', bio: 'Leading researcher with 50+ publications in machine learning' },
          { name: 'Raj Patel', title: 'CTO, Stripe', image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80', topic: 'Building Scalable Systems', bio: 'Architected systems processing billions of transactions' },
          { name: 'Emily Rodriguez', title: 'VP Engineering, Meta', image_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80', topic: 'Engineering Leadership at Scale', bio: 'Manages 500+ engineers across AR/VR products' },
          { name: 'David Kim', title: 'Founder & CEO, TechVentures', image_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400&q=80', topic: 'From Startup to IPO', bio: 'Serial entrepreneur with 3 successful exits' }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'schedule-1', 
        type: 'schedule', 
        layout: 'timeline', 
        title: 'Event Schedule', 
        subtitle: 'Two Days of Intensive Learning',
        items: [
          { time: '08:00 AM', title: 'Registration & Breakfast', description: 'Check-in, grab your badge, and enjoy networking breakfast' },
          { time: '09:30 AM', title: 'Opening Keynote', description: 'Dr. Sarah Chen on "The Future of Generative AI"' },
          { time: '11:00 AM', title: 'Breakout Sessions', description: 'Choose from 5 parallel tracks: AI/ML, Cloud, Security, DevOps, Product' },
          { time: '12:30 PM', title: 'Networking Lunch', description: 'Connect with speakers and attendees over gourmet lunch' },
          { time: '02:00 PM', title: 'Hands-on Workshops', description: 'Practical sessions with limited seats - register early!' },
          { time: '04:30 PM', title: 'Panel Discussion', description: '"Building the Future: Trends to Watch in 2027"' },
          { time: '06:00 PM', title: 'Evening Reception', description: 'Cocktails, appetizers, and live music networking event' }
        ], 
        order: 3, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'cards-featured', 
        title: 'Choose Your Pass', 
        subtitle: 'Invest in Your Future',
        items: [
          { name: 'Early Bird', price: '₹2,999', originalPrice: '₹4,999', features: ['Full conference access', 'All keynotes & sessions', 'Networking events', 'Conference swag bag', 'Certificate of attendance'], featured: false },
          { name: 'Professional', price: '₹4,999', originalPrice: '₹6,999', features: ['Everything in Early Bird', 'Workshop access (2 sessions)', 'Priority seating', 'Lunch included both days', 'Recording access (30 days)'], featured: true },
          { name: 'VIP', price: '₹9,999', originalPrice: '₹12,999', features: ['Everything in Professional', 'All workshops included', 'Speaker dinner invitation', 'Premium swag kit', '1-on-1 mentor session', 'Lifetime recording access'], featured: false }
        ], 
        order: 4, 
        visible: true 
      },
      { 
        id: 'faq-1', 
        type: 'faq', 
        layout: 'accordion', 
        title: 'Frequently Asked Questions', 
        subtitle: 'Got Questions? We\'ve Got Answers',
        items: [
          { question: 'What is included in the conference pass?', answer: 'All passes include access to keynotes, main sessions, and networking events. Professional and VIP passes include additional benefits like workshop access, meals, and recordings. Check the pricing section for complete details.' },
          { question: 'Is there a dress code?', answer: 'Business casual is recommended. The evening networking reception is smart casual. Comfortable shoes are advised as there will be plenty of walking between sessions.' },
          { question: 'Will sessions be recorded?', answer: 'Yes! Professional and VIP pass holders get access to session recordings. Professional pass includes 30-day access, while VIP gets lifetime access to all recordings.' },
          { question: 'What is the refund policy?', answer: 'Full refunds are available up to 30 days before the event. 50% refund up to 14 days before. No refunds within 14 days, but you can transfer your ticket to someone else.' },
          { question: 'Is there parking available?', answer: 'Yes, the venue offers paid parking. We recommend using public transport or rideshare as spaces are limited. We\'ll send detailed directions closer to the event date.' }
        ], 
        order: 5, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'gradient-card', 
        title: 'Get In Touch', 
        subtitle: 'Have questions? We\'re here to help!',
        content: 'Reach out to our team for any inquiries about sponsorship, speakers, or general questions.',
        email: 'events@techsummit.com',
        phone: '+91 98765 43210',
        address: 'Bengaluru International Exhibition Centre, Bengaluru',
        social: {
          twitter: '@techsummit2026',
          linkedin: 'techsummit-conference'
        },
        order: 6, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#091D40', 
      secondary_color: '#06b6d4', 
      background_color: '#ffffff', 
      text_color: '#1e293b', 
      font_family: 'Libre Baskerville' 
    }
  },
  
  // Corporate Gala
  {
    id: 'corporate-gala',
    name: 'Corporate Gala',
    preview: '✨',
    description: 'Elegant centered design with decorative frames',
    layout: 'elegant-centered',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'elegant-centered', 
        title: 'Annual Excellence Awards', 
        subtitle: '✦ Celebrating Outstanding Achievements ✦', 
        content: 'Join us for an evening of recognition, celebration, and inspiration as we honor exceptional individuals who have made extraordinary contributions.',
        date: 'February 20, 2026 | 6:30 PM Onwards', 
        image_url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=1600&q=80', 
        venue: 'The Grand Ballroom, Taj Palace, New Delhi',
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'elegant-bordered', 
        title: 'An Evening of Excellence', 
        subtitle: 'Black Tie Event', 
        content: 'The Annual Excellence Awards is our flagship event celebrating outstanding achievements across industry, innovation, and community leadership. Now in its 15th year, this prestigious gathering brings together visionaries, leaders, and changemakers for an unforgettable evening of recognition and celebration.\n\nThis year, we will honor 25 exceptional individuals across 8 categories, recognizing their dedication, innovation, and impact on their respective fields.',
        highlights: [
          { icon: '🏆', text: '25 Award Recipients' },
          { icon: '🎭', text: 'Live Entertainment' },
          { icon: '🍽️', text: '7-Course Gourmet Dinner' },
          { icon: '🤝', text: '500+ Distinguished Guests' }
        ],
        order: 1, 
        visible: true 
      },
      { 
        id: 'schedule-1', 
        type: 'schedule', 
        layout: 'elegant-timeline', 
        title: 'Evening Program', 
        subtitle: 'A Night to Remember',
        items: [
          { time: '6:30 PM', title: 'Red Carpet & Reception', description: 'Welcome cocktails and hors d\'oeuvres in the Grand Foyer' },
          { time: '7:30 PM', title: 'Gala Dinner Begins', description: 'Guests are seated for the seven-course culinary experience' },
          { time: '8:00 PM', title: 'Opening Address', description: 'Welcome speech by our Chairman and Chief Guest' },
          { time: '8:30 PM', title: 'Awards Ceremony', description: 'Recognition of Excellence Award recipients across all categories' },
          { time: '9:30 PM', title: 'Live Performance', description: 'Special musical performance by renowned artists' },
          { time: '10:00 PM', title: 'Networking & Dancing', description: 'Continue the celebration with music and conversation' },
          { time: '11:30 PM', title: 'Vote of Thanks', description: 'Closing remarks and appreciation' }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'elegant-horizontal', 
        title: 'Reserve Your Seat', 
        subtitle: 'Limited Seats Available',
        items: [
          { name: 'Individual Seat', price: '₹7,500', features: ['Gala dinner', 'Awards ceremony', 'Welcome cocktails', 'Event memento'] },
          { name: 'Couple Package', price: '₹12,500', features: ['2 Gala dinner seats', 'Awards ceremony', 'Premium cocktails', 'Event mementos', 'Valet parking'] },
          { name: 'Corporate Table (10)', price: '₹65,000', features: ['10 premium seats', 'Table name display', 'Priority seating', 'Dedicated service', 'Logo in program', 'VIP parking'] }
        ], 
        order: 3, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'elegant-footer', 
        title: 'RSVP & Inquiries', 
        subtitle: 'For reservations and corporate sponsorship',
        content: 'Contact our events team to reserve your seats or discuss corporate sponsorship opportunities.',
        email: 'gala@excellenceawards.com',
        phone: '+91 11 2345 6789',
        deadline: 'RSVP by February 10, 2026',
        order: 4, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#b8860b', 
      secondary_color: '#1e3a5f', 
      background_color: '#0a0a0a', 
      text_color: '#ffffff', 
      font_family: 'Outfit' 
    }
  },
  
  // Professional Workshop
  {
    id: 'professional-workshop',
    name: 'Professional Workshop',
    preview: '📚',
    description: 'Clean minimal design with sidebar highlights',
    layout: 'minimal-sidebar',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'minimal-left', 
        title: 'Digital Marketing Masterclass', 
        subtitle: 'Transform Your Marketing Skills in 2 Days', 
        content: 'An intensive, hands-on training program designed for marketing professionals who want to master the latest digital marketing strategies, tools, and techniques from industry experts.', 
        image_url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&q=80',
        badges: ['Certified Course', 'Hands-on Training', 'Industry Experts'],
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'checklist', 
        title: "What You'll Master",
        subtitle: 'Comprehensive Curriculum',
        intro: 'This workshop covers everything you need to create and execute winning digital marketing campaigns:',
        checklist: [
          'SEO & Content Strategy - Rank higher and drive organic traffic',
          'Google Ads & PPC - Master paid advertising that converts',
          'Social Media Marketing - Build engaged communities',
          'Facebook & Instagram Ads - Target and convert your ideal customers',
          'Email Marketing Automation - Nurture leads at scale',
          'Analytics & Data-Driven Decisions - Measure what matters',
          'Marketing Funnel Optimization - Convert more visitors into customers',
          'AI Tools for Marketing - Leverage the latest technology'
        ],
        bonus: 'BONUS: Lifetime access to our private community of 5000+ marketers',
        order: 1, 
        visible: true 
      },
      { 
        id: 'speakers-1', 
        type: 'speakers', 
        layout: 'horizontal-bio', 
        title: 'Your Instructors', 
        subtitle: 'Learn from the Best in the Industry',
        items: [
          { name: 'Ananya Krishnan', title: 'Head of Digital Marketing, Unilever India', image_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80', bio: '15+ years in digital marketing. Has managed campaigns with 100+ crore budgets. Featured in Economic Times and Forbes India.' },
          { name: 'Vikram Sharma', title: 'Google Certified Trainer & SEO Expert', image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80', bio: 'Trained 10,000+ professionals. Helped 500+ businesses achieve first-page rankings. Author of "SEO Secrets Revealed".' }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'minimal-list', 
        title: 'Enrollment Options', 
        subtitle: 'Invest in Your Growth',
        earlyBirdDeadline: 'Early bird pricing ends in 7 days!',
        items: [
          { name: 'Individual', price: '₹12,999', originalPrice: '₹19,999', features: ['Full 2-day workshop', 'Course materials', 'Certificate of completion', 'Lunch & refreshments', '30-day email support'] },
          { name: 'Team (3+)', price: '₹9,999/person', originalPrice: '₹12,999', features: ['Everything in Individual', 'Group exercises', 'Team consultation session', '60-day support', '20% group discount'] }
        ],
        guarantee: '100% Money-Back Guarantee if you\'re not satisfied',
        order: 3, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'minimal-cta', 
        title: 'Limited to 30 Seats', 
        subtitle: 'Small batches for personalized attention',
        content: 'Join our upcoming batch and transform your marketing skills. Early registrations get bonus 1-on-1 strategy session worth ₹5,000!',
        email: 'workshops@digitalmastery.com',
        phone: '+91 98765 12345',
        cta: 'Reserve Your Seat Now',
        urgency: 'Only 8 seats remaining!',
        order: 4, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#2563eb', 
      secondary_color: '#059669', 
      background_color: '#f8fafc', 
      text_color: '#0f172a', 
      font_family: 'Libre Baskerville' 
    }
  },
  
  // Product Launch
  {
    id: 'product-launch',
    name: 'Product Launch',
    preview: '🚀',
    description: 'Bold full-bleed hero with countdown style',
    layout: 'bold-fullbleed',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'fullbleed-countdown', 
        title: 'Vision Pro 2.0', 
        subtitle: 'THE FUTURE IS HERE', 
        content: 'Be among the first to experience our revolutionary device that will transform how you work, create, and connect. Limited seats for the exclusive unveiling event.', 
        image_url: 'https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=1600&q=80',
        launchDate: 'March 20, 2026',
        countdown: true,
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'feature-blocks', 
        title: 'Revolutionary Features', 
        subtitle: 'Experience Technology Like Never Before',
        features: [
          { icon: '⚡', title: '10x Faster Processing', desc: 'Next-generation M5 chip delivers unprecedented performance for creative professionals' },
          { icon: '👁️', title: '8K Retina Display', desc: 'Stunning visual clarity with HDR support and 120Hz ProMotion' },
          { icon: '🔋', title: '24-Hour Battery', desc: 'All-day battery life that keeps up with your most demanding workflows' },
          { icon: '🧠', title: 'Neural Engine 3.0', desc: 'On-device AI that understands context and anticipates your needs' },
          { icon: '🌐', title: 'Seamless Connectivity', desc: 'Wi-Fi 7, 5G, and satellite connectivity for anywhere productivity' },
          { icon: '🎨', title: 'Studio-Grade Camera', desc: '200MP sensor with computational photography and ProRAW support' }
        ], 
        order: 1, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'bold-tiers', 
        title: 'Event Access', 
        subtitle: 'Join the Unveiling',
        items: [
          { name: 'General Access', price: 'FREE', features: ['Live keynote viewing', 'Product demo zones', 'Networking lounge', 'Launch day refreshments'] },
          { name: 'VIP Experience', price: '₹4,999', features: ['Priority front-row seating', 'Hands-on demo priority', 'Meet the product team', 'Exclusive swag kit', 'Early purchase access'] },
          { name: 'Media & Creator', price: 'By Invitation', features: ['Press conference access', 'B-roll footage', 'Interview opportunities', 'Review unit allocation'] }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'bold-cta', 
        title: 'Reserve Your Spot', 
        subtitle: 'Be Part of History',
        content: 'Join us at Phoenix Palladium, Mumbai on March 20, 2026 at 6:00 PM IST for the global unveiling of Vision Pro 2.0.',
        email: 'events@visionpro.com',
        phone: '+91 22 6789 0123',
        venue: 'Phoenix Palladium, Lower Parel, Mumbai',
        order: 3, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#dc2626', 
      secondary_color: '#f97316', 
      background_color: '#0f0f0f', 
      text_color: '#ffffff', 
      font_family: 'Outfit' 
    }
  },
  
  // Charity Fundraiser
  {
    id: 'charity-fundraiser',
    name: 'Charity Fundraiser',
    preview: '💝',
    description: 'Emotional story-driven design with impact numbers',
    layout: 'story-impact',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'story-hero', 
        title: 'Hope Gala 2026', 
        subtitle: 'Together We Can Make A Difference', 
        content: 'Join us for an inspiring evening as we come together to build schools and provide quality education for 2,000 underprivileged children across rural India.', 
        image_url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&q=80', 
        impact: [
          { value: '₹50L', label: 'Fundraising Goal' },
          { value: '2,000', label: 'Children to Benefit' },
          { value: '5', label: 'Schools to Build' },
          { value: '15', label: 'Villages Covered' }
        ], 
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'story-mission', 
        title: 'Our Mission', 
        subtitle: 'Education Changes Everything',
        content: 'The Hope Foundation has been transforming lives through education since 2008. We believe every child deserves access to quality education, regardless of their circumstances.\n\nOver the past 17 years, we have built 42 schools, educated 15,000+ children, and witnessed countless success stories of first-generation learners becoming doctors, engineers, and teachers.\n\nThis year, with your support, we aim to expand to 5 new villages in Rajasthan and Maharashtra, bringing hope and opportunity to communities that need it most.',
        stats: [
          { value: '42', label: 'Schools Built' },
          { value: '15,000+', label: 'Students Educated' },
          { value: '95%', label: 'Graduation Rate' },
          { value: '17', label: 'Years of Impact' }
        ],
        testimonial: {
          quote: 'Because of Hope Foundation, I became the first person in my village to graduate from college. Now I teach at the same school that gave me a chance.',
          author: 'Sunita Devi, Class of 2018'
        },
        order: 1, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'donation-tiers', 
        title: 'Support Our Cause', 
        subtitle: 'Every Contribution Matters',
        items: [
          { name: 'Friend', price: '₹5,000', impact: 'Provides school supplies for 5 children', features: ['Gala dinner', 'Certificate of appreciation', 'Annual impact report'] },
          { name: 'Champion', price: '₹15,000', impact: 'Sponsors one child\'s education for a year', features: ['Everything in Friend', 'Student pen pal program', 'Name in donor wall', 'VIP seating'] },
          { name: 'Patron', price: '₹50,000', impact: 'Funds a classroom renovation', features: ['Everything in Champion', 'School visit opportunity', 'Meet beneficiary families', 'Exclusive patron dinner'] },
          { name: 'Visionary', price: '₹2,00,000', impact: 'Builds a complete learning center', features: ['Everything in Patron', 'Naming rights', 'Foundation board meet', 'Legacy recognition'] }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'heart-footer', 
        title: 'Join Us in Making a Difference', 
        subtitle: 'April 15, 2026 | The Leela Palace, Mumbai',
        content: 'Your presence and support will help us reach our goal of building 5 new schools. 100% of gala proceeds go directly to our education programs.',
        email: 'gala@hopefoundation.org',
        phone: '+91 22 4567 8901',
        socialProof: 'Supported by 200+ corporate partners and 5,000+ individual donors',
        order: 3, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#ec4899', 
      secondary_color: '#091D40', 
      background_color: '#fdf4ff', 
      text_color: '#1e1b4b', 
      font_family: 'Libre Baskerville' 
    }
  },
  
  // Sports Event
  {
    id: 'sports-event',
    name: 'Sports Event',
    preview: '🏆',
    description: 'Dynamic angled sections with energetic style',
    layout: 'dynamic-angled',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'dynamic-hero', 
        title: 'MUMBAI MARATHON 2026', 
        subtitle: 'RUN FOR A CAUSE', 
        content: 'Be part of India\'s most iconic running event. Challenge yourself, push your limits, and join 55,000 runners from around the world.', 
        image_url: 'https://images.unsplash.com/photo-1513593771513-7b58b6c4af38?w=1600&q=80',
        date: 'January 19, 2026', 
        stats: [
          { value: '55,000', label: 'Runners Expected' },
          { value: '80+', label: 'Countries' },
          { value: '₹50Cr+', label: 'For Charity' },
          { value: '18th', label: 'Edition' }
        ], 
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'race-categories', 
        title: 'Choose Your Race', 
        subtitle: 'Categories for Every Runner',
        categories: [
          { name: 'Full Marathon', distance: '42.195 km', start: '5:15 AM', cutoff: '6 hours', difficulty: 'Advanced', route: 'CST → Worli Sea Link → Bandra → Marine Drive → CST' },
          { name: 'Half Marathon', distance: '21.097 km', start: '5:45 AM', cutoff: '3.5 hours', difficulty: 'Intermediate', route: 'CST → Worli → Haji Ali → Marine Drive → CST' },
          { name: '10K Run', distance: '10 km', start: '7:00 AM', cutoff: '2 hours', difficulty: 'Beginner-Intermediate', route: 'Marine Drive → Girgaon → Marine Drive' },
          { name: 'Dream Run', distance: '5.9 km', start: '7:45 AM', cutoff: 'No time limit', difficulty: 'All Levels', route: 'Marine Drive circular' }
        ], 
        order: 1, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'race-registration', 
        title: 'Register Now', 
        subtitle: 'Early Bird Pricing Available',
        items: [
          { name: 'Dream Run 5.9K', price: '₹850', earlyBird: '₹650', includes: ['Finisher medal', 'Event bib', 'Timing chip', 'Participation T-shirt', 'Post-run refreshments'] },
          { name: '10K Run', price: '₹1,200', earlyBird: '₹950', includes: ['Finisher medal', 'Event bib', 'Timing chip', 'Tech running T-shirt', 'Hydration stations', 'Post-run snacks'] },
          { name: 'Half Marathon', price: '₹2,000', earlyBird: '₹1,600', includes: ['Premium finisher medal', 'Event bib', 'Timing chip', 'Dry-fit running T-shirt', 'Energy gels (3)', 'Post-run meal'] },
          { name: 'Full Marathon', price: '₹3,500', earlyBird: '₹2,800', includes: ['Exclusive finisher medal', 'Event bib', 'Timing chip', 'Premium running T-shirt', 'Energy gels (6)', 'Post-run full meal', 'Finisher certificate'] }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'race-info', 
        title: 'Race Information', 
        subtitle: 'Everything You Need to Know',
        content: 'Collect your race kit from the Mumbai Marathon Expo at NSCI Dome, Worli between January 16-18, 2026.',
        email: 'info@mumbaimarathon.com',
        phone: '+91 22 6789 0000',
        expoDetails: {
          venue: 'NSCI Dome, Worli, Mumbai',
          dates: 'January 16-18, 2026',
          timing: '10:00 AM - 8:00 PM'
        },
        importantDates: [
          { date: 'Nov 30', event: 'Early Bird Registration Closes' },
          { date: 'Jan 10', event: 'Regular Registration Closes' },
          { date: 'Jan 16-18', event: 'Race Kit Collection at Expo' },
          { date: 'Jan 19', event: 'Race Day!' }
        ],
        order: 3, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#ea580c', 
      secondary_color: '#16a34a', 
      background_color: '#ffffff', 
      text_color: '#18181b', 
      font_family: 'Outfit' 
    }
  },
  
  // Wedding Celebration
  {
    id: 'wedding-celebration',
    name: 'Wedding Celebration',
    preview: '💒',
    description: 'Romantic design with flowing curves',
    layout: 'romantic-flowing',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'romantic-hero', 
        title: 'Priya & Arjun', 
        subtitle: 'Request the pleasure of your company', 
        content: 'at the celebration of their union as they begin their journey together', 
        date: 'February 16, 2026', 
        image_url: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&q=80',
        quote: '"Two souls, one heart"',
        order: 0, 
        visible: true 
      },
      { 
        id: 'about-1', 
        type: 'about', 
        layout: 'love-story', 
        title: 'Our Story', 
        subtitle: 'How We Met',
        content: "What started as a chance meeting at a friend's party in 2019 blossomed into something beautiful. Arjun still remembers being captivated by Priya's infectious laugh from across the room.\n\nOver countless coffee dates, late-night conversations, and adventures around the world, we discovered that we're not just in love—we're best friends. Through every high and low, we've grown stronger together.\n\nAfter 5 wonderful years, Arjun proposed during a sunset hike in the mountains of Himachal Pradesh—a place that holds special meaning in our story. And Priya said YES!",
        milestones: [
          { date: 'May 2019', event: 'First Met' },
          { date: 'August 2019', event: 'First Date' },
          { date: 'December 2020', event: 'Moved In Together' },
          { date: 'October 2025', event: 'Got Engaged!' }
        ],
        order: 1, 
        visible: true 
      },
      { 
        id: 'schedule-1', 
        type: 'schedule', 
        layout: 'wedding-events', 
        title: 'Wedding Events', 
        subtitle: 'Three Days of Celebration',
        items: [
          { time: 'February 14', title: 'Mehendi Ceremony', description: '6:00 PM | Poolside, The Leela Palace', dress: 'Colorful traditional attire' },
          { time: 'February 15', title: 'Sangeet Night', description: '7:00 PM | Grand Ballroom, The Leela Palace', dress: 'Indo-western or formal' },
          { time: 'February 16', title: 'Wedding Ceremony', description: '10:00 AM | Garden Lawns, The Leela Palace', dress: 'Traditional wedding attire' },
          { time: 'February 16', title: 'Reception', description: '7:00 PM | Crystal Hall, The Leela Palace', dress: 'Black tie / formal' }
        ], 
        order: 2, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'wedding-rsvp', 
        title: 'RSVP', 
        subtitle: 'We can\'t wait to celebrate with you!',
        content: 'Kindly respond by January 30, 2026 to help us finalize arrangements.',
        venue: 'The Leela Palace, Udaipur, Rajasthan',
        accommodation: 'A room block has been reserved for guests. Please mention "Priya-Arjun Wedding" when booking.',
        contact: [
          { name: 'Mrs. Meera Sharma (Bride\'s Mother)', phone: '+91 98765 11111' },
          { name: 'Mr. Vikram Malhotra (Groom\'s Father)', phone: '+91 98765 22222' }
        ],
        specialNote: 'Please let us know of any dietary restrictions or special requirements.',
        order: 3, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#be185d', 
      secondary_color: '#091D40', 
      background_color: '#fdf2f8', 
      text_color: '#4a044e', 
      font_family: 'Outfit' 
    }
  },
  
  // Music Concert
  {
    id: 'music-concert',
    name: 'Music Concert',
    preview: '🎵',
    description: 'Edgy dark design with neon accents',
    layout: 'edgy-neon',
    sections: [
      { 
        id: 'hero-1', 
        type: 'hero', 
        layout: 'neon-hero', 
        title: 'SOUNDWAVE', 
        subtitle: 'FESTIVAL 2026', 
        content: 'India\'s Biggest Multi-Genre Music Festival', 
        date: 'December 27-29, 2026',
        tagline: '3 DAYS • 50+ ARTISTS • 5 STAGES',
        image_url: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1600&q=80', 
        order: 0, 
        visible: true 
      },
      { 
        id: 'speakers-1', 
        type: 'speakers', 
        layout: 'artist-grid', 
        title: 'HEADLINERS', 
        subtitle: 'World-Class Artists',
        items: [
          { name: 'ARIJIT SINGH', title: 'Bollywood Night - Dec 27', image_url: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=400&q=80', tag: 'BOLLYWOOD' },
          { name: 'DIVINE', title: 'Hip-Hop Takeover - Dec 28', image_url: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=400&q=80', tag: 'HIP-HOP' },
          { name: 'NUCLEYA', title: 'EDM Night - Dec 28', image_url: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&q=80', tag: 'EDM' },
          { name: 'THE LOCAL TRAIN', title: 'Rock Stage - Dec 29', image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80', tag: 'ROCK' },
          { name: 'PRATEEK KUHAD', title: 'Acoustic Garden - Dec 29', image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&q=80', tag: 'INDIE' },
          { name: 'KSHMR', title: 'Main Stage Closer - Dec 29', image_url: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&q=80', tag: 'EDM' }
        ],
        lineup: '+ 44 more artists across 5 stages',
        order: 1, 
        visible: true 
      },
      { 
        id: 'pricing-1', 
        type: 'pricing', 
        layout: 'festival-passes', 
        title: 'GET YOUR PASS', 
        subtitle: 'Early Bird Pricing - Limited Time!',
        items: [
          { name: 'DAY PASS', price: '₹2,999', originalPrice: '₹3,999', features: ['Single day entry', 'All 5 stages access', 'F&B areas', 'Chill zones', 'Valid for any 1 day'] },
          { name: '3-DAY PASS', price: '₹6,999', originalPrice: '₹9,999', features: ['All 3 days entry', 'All 5 stages access', 'Festival merchandise 10% off', 'Priority entry lines', 'Exclusive fan meet opportunities'], featured: true },
          { name: 'VIP EXPERIENCE', price: '₹15,999', originalPrice: '₹22,999', features: ['All 3 days VIP entry', 'Elevated viewing platforms', 'VIP lounges & bars', 'Meet & greet passes', 'Festival merchandise kit', 'Dedicated parking'] }
        ],
        addons: [
          { name: 'Camping Package', price: '₹3,500', desc: '3-night stay in premium tents' },
          { name: 'After Party Pass', price: '₹1,500', desc: 'Late night sets till 4 AM' }
        ],
        order: 2, 
        visible: true 
      },
      { 
        id: 'contact-1', 
        type: 'contact', 
        layout: 'festival-info', 
        title: 'FESTIVAL INFO', 
        subtitle: 'Everything You Need to Know',
        content: 'Join 75,000+ music lovers at the most anticipated festival of the year.',
        venue: 'Mahalaxmi Race Course, Mumbai',
        dates: 'December 27-29, 2026',
        gates: 'Gates open at 2:00 PM daily',
        email: 'info@soundwavefest.in',
        phone: '+91 22 9876 5432',
        social: {
          instagram: '@soundwavefest',
          twitter: '@soundwavefest',
          youtube: 'SoundwaveFestival'
        },
        ageRestriction: 'Ages 16+ (Under 18 with parent/guardian)',
        order: 3, 
        visible: true 
      }
    ],
    theme: { 
      primary_color: '#091D40', 
      secondary_color: '#f43f5e', 
      background_color: '#09090b', 
      text_color: '#fafafa', 
      font_family: 'Outfit' 
    }
  }
];
