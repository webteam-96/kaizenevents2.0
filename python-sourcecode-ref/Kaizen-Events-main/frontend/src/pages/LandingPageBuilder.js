import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const toAbsUrl = (url) => url?.startsWith('/api/uploads/') ? `${BACKEND_URL}${url}` : (url || '');
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import ImageUploader from '../components/ui/ImageUploader';
import { 
  ArrowLeft, Save, Eye, EyeOff, Plus, Trash2, GripVertical,
  ChevronUp, ChevronDown, Palette, Layout, Settings, Sparkles,
  Type, Calendar, Mail
} from 'lucide-react';
import { toast } from 'sonner';
import { SECTION_TYPES, DEFAULT_SECTIONS, DEFAULT_THEME, TEMPLATES } from '../data/landingPageTemplates';

const LandingPageBuilder = () => {
  const { campaignId } = useParams();
  const { isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [campaign, setCampaign] = useState(null);
  const [formFields, setFormFields] = useState([]);
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [showRegistrationButton, setShowRegistrationButton] = useState(true);
  const [activeTab, setActiveTab] = useState('sections');
  const [selectedSection, setSelectedSection] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin()) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [campaignId, isSuperAdmin, navigate]);

  const fetchData = async () => {
    try {
      const [campaignRes, landingRes, formRes] = await Promise.all([
        api.get(`/campaigns/${campaignId}`),
        api.get(`/campaigns/${campaignId}/landing-page`).catch(() => ({ data: null })),
        api.get(`/campaigns/${campaignId}/form`).catch(() => ({ data: null }))
      ]);

      setCampaign(campaignRes.data);

      const allFields = formRes.data?.fields || [];
      const tierFields = allFields
        .filter(f => ['dropdown', 'radio', 'checkbox'].includes(f.type)
                     && Array.isArray(f.options) && f.options.length > 0)
        .map(f => ({
          id: f.id,
          label: f.label,
          type: f.type,
          options: f.options.map(o => ({ value: o.value, label: o.label }))
        }));
      setFormFields(tierFields);

      if (landingRes.data) {
        setSections(landingRes.data.sections || DEFAULT_SECTIONS);
        setTheme(landingRes.data.theme || DEFAULT_THEME);
        setShowRegistrationButton(landingRes.data.show_registration_button !== false);
      }
    } catch (error) {
      toast.error('Failed to load landing page data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/campaigns/${campaignId}/landing-page`, {
        sections,
        theme,
        show_registration_button: showRegistrationButton
      });
      toast.success('Landing page saved successfully!');
    } catch (error) {
      toast.error('Failed to save landing page');
    } finally {
      setSaving(false);
    }
  };

  const addSection = (type) => {
    const sectionConfig = SECTION_TYPES.find(s => s.type === type);
    
    // Detect current template's layout style from existing sections
    const existingSection = sections.find(s => s.type === type);
    const existingLayout = existingSection?.layout;
    
    // If no existing section of same type, try to detect template style from other sections
    const detectTemplateStyle = () => {
      // Check hero section for template hints
      const heroSection = sections.find(s => s.type === 'hero');
      if (heroSection?.layout) {
        // Map hero layouts to corresponding section layouts
        const layoutMappings = {
          'split-right': { speakers: 'cards-grid', schedule: 'timeline', pricing: 'cards-featured', about: 'cards' },
          'elegant-centered': { speakers: 'elegant-circles', schedule: 'elegant-timeline', pricing: 'elegant-horizontal', about: 'elegant-bordered' },
          'minimal-left': { speakers: 'horizontal-bio', schedule: 'day-columns', pricing: 'minimal-list', about: 'simple-text' },
          'romantic-hero': { speakers: 'elegant-circles', schedule: 'wedding-events', pricing: 'elegant-horizontal', about: 'love-story' },
          'neon-hero': { speakers: 'artist-cards', schedule: 'festival-days', pricing: 'vip-tiers', about: 'band-lineup' },
          'dynamic-hero': { speakers: 'athletes-grid', schedule: 'race-timeline', pricing: 'race-packages', about: 'race-categories' },
        };
        return layoutMappings[heroSection.layout]?.[type] || null;
      }
      return null;
    };
    
    const detectedLayout = existingLayout || detectTemplateStyle();
    
    // Default sample data for each section type
    const sampleData = {
      hero: {
        title: 'Welcome to Our Event',
        subtitle: 'Join us for an amazing experience',
        content: 'Discover what makes this event special. Register now to secure your spot!',
        image_url: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1600&q=80',
        stats: [
          { value: '500+', label: 'Attendees' },
          { value: '20+', label: 'Speakers' },
          { value: '2', label: 'Days' }
        ]
      },
      about: {
        title: 'About the Event',
        subtitle: 'Why You Should Attend',
        content: 'This event brings together industry leaders, innovators, and enthusiasts for an unforgettable experience. Network with like-minded professionals, learn from experts, and discover new opportunities.',
        features: [
          { icon: '🎯', title: 'Expert Speakers', desc: 'Learn from industry leaders and pioneers' },
          { icon: '🤝', title: 'Networking', desc: 'Connect with professionals from around the world' },
          { icon: '🚀', title: 'Workshops', desc: 'Hands-on sessions to develop your skills' },
          { icon: '💡', title: 'Innovation', desc: 'Discover the latest trends and technologies' }
        ]
      },
      speakers: {
        title: 'Featured Speakers',
        subtitle: 'Learn from the Best',
        items: [
          { name: 'Dr. Sarah Johnson', title: 'CEO, Tech Innovations', image_url: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=400&q=80', topic: 'Future of Technology', bio: 'Industry pioneer with 20+ years of experience' },
          { name: 'Michael Chen', title: 'Founder, StartupHub', image_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80', topic: 'Building Successful Startups', bio: 'Serial entrepreneur and investor' },
          { name: 'Emily Rodriguez', title: 'Director of Innovation', image_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&q=80', topic: 'Design Thinking', bio: 'Award-winning product designer' }
        ]
      },
      schedule: {
        title: 'Event Schedule',
        subtitle: 'Plan Your Day',
        items: [
          { time: '09:00 AM', title: 'Registration & Welcome Coffee', description: 'Check-in and networking breakfast' },
          { time: '10:00 AM', title: 'Opening Keynote', description: 'Inspiring talk by our chief speaker' },
          { time: '11:30 AM', title: 'Breakout Sessions', description: 'Choose from multiple tracks' },
          { time: '01:00 PM', title: 'Networking Lunch', description: 'Connect with fellow attendees' },
          { time: '02:30 PM', title: 'Workshops', description: 'Hands-on learning sessions' },
          { time: '05:00 PM', title: 'Closing Ceremony', description: 'Summary and awards' }
        ]
      },
      pricing: {
        title: 'Registration Options',
        subtitle: 'Choose Your Pass',
        items: [
          { name: 'Early Bird', price: '₹999', originalPrice: '₹1,499', features: ['Full event access', 'Conference materials', 'Lunch included', 'Certificate'], featured: false },
          { name: 'Standard', price: '₹1,499', originalPrice: '₹1,999', features: ['Full event access', 'Conference materials', 'Lunch included', 'Certificate', 'Workshop access'], featured: true },
          { name: 'VIP', price: '₹2,999', originalPrice: '₹3,999', features: ['Full event access', 'Conference materials', 'All meals included', 'Certificate', 'All workshops', 'VIP networking'], featured: false }
        ]
      },
      faq: {
        title: 'Frequently Asked Questions',
        subtitle: 'Got Questions? We Have Answers',
        items: [
          { question: 'What is included in the registration?', answer: 'Your registration includes access to all sessions, conference materials, lunch, and networking events. VIP passes include additional perks.' },
          { question: 'Is there a dress code?', answer: 'Business casual is recommended. Comfortable shoes are suggested as there will be walking between sessions.' },
          { question: 'Will sessions be recorded?', answer: 'Yes, session recordings will be available to all registered attendees within 48 hours after the event.' },
          { question: 'What is the refund policy?', answer: 'Full refunds are available up to 14 days before the event. 50% refund up to 7 days before. No refunds within 7 days.' }
        ]
      },
      contact: {
        title: 'Contact Us',
        subtitle: 'Get in Touch',
        content: 'Have questions about the event? Our team is here to help!',
        email: 'events@example.com',
        phone: '+91 98765 43210',
        address: 'Conference Center, Main Street, City'
      }
    };
    
    const defaultData = sampleData[type] || {};
    
    const newSection = {
      id: `${type}-${Date.now()}`,
      type,
      layout: detectedLayout, // Inherit layout from template
      title: defaultData.title || sectionConfig?.label || type,
      subtitle: defaultData.subtitle || '',
      content: defaultData.content || '',
      image_url: defaultData.image_url || '',
      items: defaultData.items || (type === 'faq' || type === 'speakers' || type === 'schedule' || type === 'pricing' ? [] : undefined),
      features: defaultData.features,
      stats: defaultData.stats,
      email: defaultData.email,
      phone: defaultData.phone,
      address: defaultData.address,
      order: sections.length,
      visible: true
    };
    setSections([...sections, newSection]);
    setSelectedSection(newSection.id);
  };

  const removeSection = (sectionId) => {
    setSections(sections.filter(s => s.id !== sectionId));
    if (selectedSection === sectionId) {
      setSelectedSection(null);
    }
  };

  const updateSection = (sectionId, updates) => {
    setSections(sections.map(s => 
      s.id === sectionId ? { ...s, ...updates } : s
    ));
  };

  const moveSection = (sectionId, direction) => {
    const index = sections.findIndex(s => s.id === sectionId);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    
    const newSections = [...sections];
    [newSections[index], newSections[newIndex]] = [newSections[newIndex], newSections[index]];
    newSections.forEach((s, i) => s.order = i);
    setSections(newSections);
  };

  const applyTemplate = (template) => {
    setSections(template.sections.map((s, i) => ({ ...s, id: `${s.type}-${Date.now()}-${i}` })));
    setTheme(template.theme);
    toast.success(`Template "${template.name}" applied!`);
  };

  const getSectionIcon = (type) => {
    const config = SECTION_TYPES.find(s => s.type === type);
    return config?.icon || Type;
  };

  if (loading) {
    return (
      <div className="ke-atmos min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const selectedSectionData = sections.find(s => s.id === selectedSection);

  return (
    <div className="ke-atmos min-h-screen flex flex-col">
      {/* Slim premium header / toolbar */}
      <div className="ke-glass border-b border-border sticky top-0 z-50">
        <div className="max-w-full mx-auto px-4 md:px-6 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button
                variant="ghost"
                onClick={() => navigate(`/campaigns/${campaignId}`)}
                className="hover:bg-muted rounded-lg shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <span
                className="ke-medallion shrink-0 hidden sm:flex"
                style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
              >
                <Layout className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
              </span>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] font-jakarta font-semibold text-muted-foreground">
                  Landing Page Builder
                </div>
                <h1 className="text-lg md:text-xl font-outfit font-bold tracking-tight text-foreground truncate">
                  {campaign?.name}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <Button
                variant="outline"
                onClick={() => setShowPreview(!showPreview)}
                className="border-border"
              >
                {showPreview ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showPreview ? 'Edit' : 'Preview'}
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105"
                style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
              >
                {saving ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showPreview ? (
        /* Preview Mode */
        <LandingPagePreview
          campaign={campaign}
          sections={sections}
          theme={theme}
          showRegistrationButton={showRegistrationButton}
        />
      ) : (
        /* Edit Mode */
        <>
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar - Section List */}
          <div className="w-72 bg-card border-r border-border flex flex-col">
            {/* Tabs */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('sections')}
                className={`flex-1 py-3 text-sm font-jakarta font-medium ${
                  activeTab === 'sections'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Layout className="w-4 h-4 inline mr-1" />
                Sections
              </button>
              <button
                onClick={() => setActiveTab('theme')}
                className={`flex-1 py-3 text-sm font-jakarta font-medium ${
                  activeTab === 'theme'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Palette className="w-4 h-4 inline mr-1" />
                Theme
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`flex-1 py-3 text-sm font-jakarta font-medium ${
                  activeTab === 'templates'
                    ? 'text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sparkles className="w-4 h-4 inline mr-1" />
                Templates
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === 'sections' && (
                <div className="space-y-3">
                  {/* Section List */}
                  {sections.map((section, index) => {
                    const Icon = getSectionIcon(section.type);
                    return (
                      <div
                        key={section.id}
                        onClick={() => setSelectedSection(section.id)}
                        className={`ke-card ke-card-hover p-3 cursor-pointer ${
                          selectedSection === section.id
                            ? 'bg-primary-subtle ring-2 ring-primary border-transparent'
                            : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <GripVertical className="w-4 h-4 text-muted-foreground" />
                            <Icon className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm font-jakarta font-medium text-foreground">
                              {section.title || section.type}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); moveSection(section.id, 'up'); }}
                              disabled={index === 0}
                              className="p-1 hover:bg-muted rounded disabled:opacity-30"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); moveSection(section.id, 'down'); }}
                              disabled={index === sections.length - 1}
                              className="p-1 hover:bg-muted rounded disabled:opacity-30"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeSection(section.id); }}
                              className="p-1 hover:bg-muted rounded text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {!section.visible && (
                          <span className="text-xs text-muted-foreground ml-6">Hidden</span>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Section */}
                  <div className="pt-4 border-t border-border">
                    <h3 className="ke-section-title text-[15px]">Add Section</h3>
                    <div className="ke-rule-gold mt-2 mb-3" />
                    <div className="grid grid-cols-2 gap-2">
                      {SECTION_TYPES.map((sectionType) => {
                        const Icon = sectionType.icon;
                        return (
                          <button
                            key={sectionType.type}
                            onClick={() => addSection(sectionType.type)}
                            className="p-2 text-left rounded-xl border border-dashed border-border hover:border-primary hover:bg-primary-subtle transition-all"
                          >
                            <Icon className="w-4 h-4 text-muted-foreground mb-1" />
                            <span className="text-xs font-jakarta text-muted-foreground">{sectionType.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'theme' && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-2 block">Primary Color</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={theme.primary_color}
                        onChange={(e) => setTheme({ ...theme, primary_color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <Input
                        value={theme.primary_color}
                        onChange={(e) => setTheme({ ...theme, primary_color: e.target.value })}
                        className="flex-1 h-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-2 block">Secondary Color</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={theme.secondary_color}
                        onChange={(e) => setTheme({ ...theme, secondary_color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <Input
                        value={theme.secondary_color}
                        onChange={(e) => setTheme({ ...theme, secondary_color: e.target.value })}
                        className="flex-1 h-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-2 block">Background Color</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={theme.background_color}
                        onChange={(e) => setTheme({ ...theme, background_color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <Input
                        value={theme.background_color}
                        onChange={(e) => setTheme({ ...theme, background_color: e.target.value })}
                        className="flex-1 h-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-foreground font-jakarta text-sm mb-2 block">Text Color</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={theme.text_color}
                        onChange={(e) => setTheme({ ...theme, text_color: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer"
                      />
                      <Input
                        value={theme.text_color}
                        onChange={(e) => setTheme({ ...theme, text_color: e.target.value })}
                        className="flex-1 h-10"
                      />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-foreground font-jakarta text-sm">Show Registration Button</Label>
                        <p className="text-xs text-muted-foreground">Display CTA button on hero</p>
                      </div>
                      <Switch
                        checked={showRegistrationButton}
                        onCheckedChange={setShowRegistrationButton}
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'templates' && (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-jakarta mb-3">
                    Ready-to-use templates - just replace the text!
                  </p>
                  {TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => applyTemplate(template)}
                      className="ke-card ke-card-hover w-full p-4 text-left hover:border-primary hover:bg-primary-subtle group"
                    >
                      <div className="flex items-start space-x-3">
                        <span className="text-2xl mt-0.5">{template.preview}</span>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-jakarta font-semibold text-foreground group-hover:text-primary transition-colors">{template.name}</h4>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{template.description}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium bg-muted text-muted-foreground">
                              {template.sections.length} sections
                            </span>
                            <span
                              className="inline-block w-3 h-3 rounded-full border border-border"
                              style={{ backgroundColor: template.theme.primary_color }}
                              title="Theme color"
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Content - Section Editor */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedSectionData ? (
              <SectionEditor
                section={selectedSectionData}
                onUpdate={(updates) => updateSection(selectedSectionData.id, updates)}
                theme={theme}
                formFields={formFields}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <span
                    className="ke-medallion mx-auto mb-4"
                    style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.16), transparent 85%)' }}
                  >
                    <Layout className="w-6 h-6" style={{ color: 'hsl(var(--accent))' }} />
                  </span>
                  <p className="font-jakarta">Select a section to edit</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky bottom action bar */}
        <div className="ke-glass sticky bottom-0 z-40 border-t border-border px-4 md:px-6 py-3 flex items-center justify-between gap-3">
          <p className="text-xs font-jakarta text-muted-foreground hidden sm:block">
            Changes are saved to this campaign's landing page
          </p>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto rounded-lg font-jakarta font-semibold shadow-sm hover:brightness-105"
            style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          >
            {saving ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
        </>
      )}
    </div>
  );
};

// Section Editor Component
const SectionEditor = ({ section, onUpdate, theme, formFields = [] }) => {
  const Icon = SECTION_TYPES.find(s => s.type === section.type)?.icon || Type;

  return (
    <Card className="ke-card p-6">
      <div className="flex items-center space-x-3 mb-5">
        <span
          className="ke-medallion shrink-0"
          style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
        >
          <Icon className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
        </span>
        <div>
          <h3 className="ke-section-title text-[15px]">
            Edit {SECTION_TYPES.find(s => s.type === section.type)?.label || section.type}
          </h3>
          <p className="text-xs text-muted-foreground font-jakarta mt-0.5">
            {SECTION_TYPES.find(s => s.type === section.type)?.description}
          </p>
        </div>
      </div>
      <div className="ke-rule-gold mb-5" />

      <div className="space-y-4">
        {/* Visibility Toggle */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div>
            <Label className="text-foreground font-jakarta font-medium">Visible</Label>
            <p className="text-xs text-muted-foreground">Show this section on the page</p>
          </div>
          <Switch
            checked={section.visible}
            onCheckedChange={(checked) => onUpdate({ visible: checked })}
          />
        </div>

        {/* Title */}
        <div>
          <Label className="text-foreground font-jakarta text-sm mb-2 block">Title</Label>
          <Input
            value={section.title || ''}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder="Section title"
            className="h-11"
          />
        </div>

        {/* Subtitle (for hero) */}
        {(section.type === 'hero' || section.type === 'about') && (
          <div>
            <Label className="text-foreground font-jakarta text-sm mb-2 block">Subtitle</Label>
            <Input
              value={section.subtitle || ''}
              onChange={(e) => onUpdate({ subtitle: e.target.value })}
              placeholder="Section subtitle"
              className="h-11"
            />
          </div>
        )}

        {/* Content (for about, contact) */}
        {(section.type === 'about' || section.type === 'contact') && (
          <div>
            <Label className="text-foreground font-jakarta text-sm mb-2 block">Content</Label>
            <textarea
              value={section.content || ''}
              onChange={(e) => onUpdate({ content: e.target.value })}
              placeholder="Section content..."
              rows={4}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        )}

        {/* Image Upload (for hero) */}
        {section.type === 'hero' && (
          <ImageUploader
            value={section.image_url || ''}
            onChange={(url) => onUpdate({ image_url: url })}
            label="Background Image"
            placeholder="Enter image URL or upload"
            aspectRatio="16/9"
          />
        )}

        {/* Items Editor for FAQ */}
        {section.type === 'faq' && (
          <FAQItemsEditor
            items={section.items || []}
            onUpdate={(items) => onUpdate({ items })}
          />
        )}

        {/* Items Editor for Speakers */}
        {section.type === 'speakers' && (
          <SpeakersItemsEditor
            items={section.items || []}
            onUpdate={(items) => onUpdate({ items })}
          />
        )}

        {/* Items Editor for Schedule */}
        {section.type === 'schedule' && (
          <ScheduleItemsEditor
            items={section.items || []}
            onUpdate={(items) => onUpdate({ items })}
          />
        )}

        {/* Items Editor for Pricing */}
        {section.type === 'pricing' && (
          <PricingItemsEditor
            items={section.items || []}
            onUpdate={(items) => onUpdate({ items })}
            formFields={formFields}
          />
        )}
      </div>

      {/* Preview */}
      <div className="mt-6 pt-6 border-t border-border">
        <Label className="text-foreground font-jakarta text-sm mb-3 block">Preview</Label>
        <div
          className="rounded-lg overflow-hidden border border-border"
          style={{ backgroundColor: theme.background_color }}
        >
          <SectionPreview section={section} theme={theme} />
        </div>
      </div>
    </Card>
  );
};

// FAQ Items Editor
const FAQItemsEditor = ({ items, onUpdate }) => {
  const addItem = () => {
    onUpdate([...items, { question: '', answer: '' }]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onUpdate(newItems);
  };

  const removeItem = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label className="text-foreground font-jakarta text-sm mb-2 block">FAQ Items</Label>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="ke-card p-3">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground">Question {index + 1}</span>
              <button onClick={() => removeItem(index)} className="text-destructive hover:opacity-80">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={item.question || ''}
              onChange={(e) => updateItem(index, 'question', e.target.value)}
              placeholder="Question"
              className="h-9 mb-2"
            />
            <textarea
              value={item.answer || ''}
              onChange={(e) => updateItem(index, 'answer', e.target.value)}
              placeholder="Answer"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground"
            />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Add FAQ
        </Button>
      </div>
    </div>
  );
};

// Speakers Items Editor
const SpeakersItemsEditor = ({ items, onUpdate }) => {
  const addItem = () => {
    onUpdate([...items, { name: '', title: '', bio: '', image_url: '' }]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onUpdate(newItems);
  };

  const removeItem = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label className="text-foreground font-jakarta text-sm mb-2 block">Speakers</Label>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="ke-card p-3">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground">Speaker {index + 1}</span>
              <button onClick={() => removeItem(index)} className="text-destructive hover:opacity-80">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={item.name || ''}
              onChange={(e) => updateItem(index, 'name', e.target.value)}
              placeholder="Name"
              className="h-9 mb-2"
            />
            <Input
              value={item.title || ''}
              onChange={(e) => updateItem(index, 'title', e.target.value)}
              placeholder="Title/Position"
              className="h-9 mb-2"
            />
            <ImageUploader
              value={item.image_url || ''}
              onChange={(url) => updateItem(index, 'image_url', url)}
              label="Speaker Photo"
              placeholder="Enter image URL or upload"
              aspectRatio="1/1"
            />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Add Speaker
        </Button>
      </div>
    </div>
  );
};

// Schedule Items Editor
const ScheduleItemsEditor = ({ items, onUpdate }) => {
  const addItem = () => {
    onUpdate([...items, { time: '', title: '', description: '' }]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    onUpdate(newItems);
  };

  const removeItem = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  return (
    <div>
      <Label className="text-foreground font-jakarta text-sm mb-2 block">Schedule Items</Label>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="ke-card p-3">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground">Item {index + 1}</span>
              <button onClick={() => removeItem(index)} className="text-destructive hover:opacity-80">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={item.time || ''}
              onChange={(e) => updateItem(index, 'time', e.target.value)}
              placeholder="Time (e.g., 9:00 AM)"
              className="h-9 mb-2"
            />
            <Input
              value={item.title || ''}
              onChange={(e) => updateItem(index, 'title', e.target.value)}
              placeholder="Title"
              className="h-9 mb-2"
            />
            <Input
              value={item.description || ''}
              onChange={(e) => updateItem(index, 'description', e.target.value)}
              placeholder="Description"
              className="h-9"
            />
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Add Schedule Item
        </Button>
      </div>
    </div>
  );
};

// Pricing Items Editor
const PricingItemsEditor = ({ items, onUpdate, formFields = [] }) => {
  const addItem = () => {
    onUpdate([...items, { name: '', price: '', features: '' }]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    // Clearing the field resets the option too
    if (field === 'form_field_id') {
      newItems[index].form_field_option_value = '';
    }
    onUpdate(newItems);
  };

  const removeItem = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  const optionsForField = (fieldId) => {
    const f = formFields.find(ff => ff.id === fieldId);
    return f ? f.options : [];
  };

  return (
    <div>
      <Label className="text-foreground font-jakarta text-sm mb-2 block">Pricing Tiers</Label>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="ke-card p-3">
            <div className="flex justify-between mb-2">
              <span className="text-xs text-muted-foreground">Tier {index + 1}</span>
              <button onClick={() => removeItem(index)} className="text-destructive hover:opacity-80">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <Input
              value={item.name || ''}
              onChange={(e) => updateItem(index, 'name', e.target.value)}
              placeholder="Tier Name (e.g., Standard)"
              className="h-9 mb-2"
            />
            <Input
              value={item.price || ''}
              onChange={(e) => updateItem(index, 'price', e.target.value)}
              placeholder="Price (e.g., ₹2,999)"
              className="h-9 mb-2"
            />
            <textarea
              value={item.features || ''}
              onChange={(e) => updateItem(index, 'features', e.target.value)}
              placeholder="Features (comma separated)"
              rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground mb-2"
            />

            {/* Map this tier to a form field option */}
            <div className="pt-2 mt-2 border-t border-dashed border-border">
              <Label className="text-xs text-muted-foreground font-jakarta mb-1 block">
                Link to form field (pre-select when user clicks Register)
              </Label>
              {formFields.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  Add a dropdown, radio, or checkbox field with options in the Form Builder to enable this.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={item.form_field_id || ''}
                    onChange={(e) => updateItem(index, 'form_field_id', e.target.value)}
                    className="h-9 px-2 text-sm rounded-lg border border-border bg-background text-foreground"
                  >
                    <option value="">— No mapping —</option>
                    {formFields.map(f => (
                      <option key={f.id} value={f.id}>{f.label} ({f.type})</option>
                    ))}
                  </select>
                  <select
                    value={item.form_field_option_value || ''}
                    onChange={(e) => updateItem(index, 'form_field_option_value', e.target.value)}
                    disabled={!item.form_field_id}
                    className="h-9 px-2 text-sm rounded-lg border border-border bg-background text-foreground disabled:bg-muted disabled:text-muted-foreground"
                  >
                    <option value="">— Select option —</option>
                    {optionsForField(item.form_field_id).map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full">
          <Plus className="w-4 h-4 mr-1" /> Add Pricing Tier
        </Button>
      </div>
    </div>
  );
};

// Section Preview Component - Creative & Modern Design
const SectionPreview = ({ section, theme }) => {
  if (!section.visible) {
    return (
      <div className="p-8 text-center text-slate-400">
        <EyeOff className="w-8 h-8 mx-auto mb-2" />
        <p>This section is hidden</p>
      </div>
    );
  }

  const layout = section.layout || 'default';
  const getGradient = (color1, color2, direction = '135deg') => 
    `linear-gradient(${direction}, ${color1}, ${color2})`;

  // HERO SECTION - Multiple Layouts
  if (section.type === 'hero') {
    // Layout: Split Right (Tech Conference)
    if (layout === 'split-right') {
      return (
        <div className="relative min-h-[450px] overflow-hidden" style={{ backgroundColor: theme.background_color }}>
          <div className="grid md:grid-cols-2 min-h-[450px]">
            {/* Left Content */}
            <div className="flex flex-col justify-center p-8 md:p-12">
              <span 
                className="inline-block w-fit px-3 py-1 rounded-sm text-xs font-semibold mb-4 uppercase tracking-wider"
                style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}
              >
                {section.subtitle}
              </span>
              <h1 className="text-4xl md:text-5xl font-outfit font-bold mb-4" style={{ color: theme.text_color }}>
                {section.title}
              </h1>
              <p className="text-lg opacity-70 mb-6" style={{ color: theme.text_color }}>
                {section.content}
              </p>
              {/* Stats Row */}
              {section.stats && (
                <div className="flex gap-8 mb-8">
                  {section.stats.map((stat, i) => (
                    <div key={i}>
                      <div className="text-3xl font-bold" style={{ color: theme.primary_color }}>{stat.value}</div>
                      <div className="text-sm opacity-60" style={{ color: theme.text_color }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-4">
                <button className="px-6 py-3 rounded-lg font-semibold text-white" style={{ backgroundColor: theme.primary_color }}>
                  Register Now
                </button>
                <button className="px-6 py-3 rounded-lg font-semibold border-2" style={{ borderColor: theme.primary_color, color: theme.primary_color }}>
                  Learn More
                </button>
              </div>
            </div>
            {/* Right Image */}
            <div 
              className="relative bg-cover bg-center min-h-[300px] md:min-h-full"
              style={{ backgroundImage: `url(${toAbsUrl(section.image_url)})` }}
            >
              <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${theme.background_color} 0%, transparent 30%)` }} />
            </div>
          </div>
        </div>
      );
    }

    // Layout: Elegant Centered (Corporate Gala)
    if (layout === 'elegant-centered') {
      return (
        <div 
          className="relative min-h-[500px] flex items-center justify-center"
          style={{ 
            backgroundImage: `url(${toAbsUrl(section.image_url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative z-10 text-center px-8">
            <div className="mb-6">
              <span className="text-6xl">✦</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-outfit font-light tracking-wider text-white mb-4 uppercase">
              {section.title}
            </h1>
            <div className="w-32 h-0.5 mx-auto mb-6" style={{ backgroundColor: theme.primary_color }} />
            <p className="text-xl text-white/80 font-light tracking-wide mb-2">{section.subtitle}</p>
            <p className="text-lg text-white/60">{section.date}</p>
            <button className="mt-8 px-10 py-4 text-lg font-medium tracking-wider uppercase border-2 text-white hover:bg-white/10 transition-colors" style={{ borderColor: theme.primary_color }}>
              Reserve Your Seat
            </button>
          </div>
        </div>
      );
    }

    // Layout: Minimal Left (Workshop)
    if (layout === 'minimal-left') {
      return (
        <div className="min-h-[400px] grid md:grid-cols-5" style={{ backgroundColor: theme.background_color }}>
          <div className="md:col-span-3 p-8 md:p-16 flex flex-col justify-center">
            <h1 className="text-4xl md:text-5xl font-outfit font-bold mb-4" style={{ color: theme.text_color }}>
              {section.title}
            </h1>
            <p className="text-xl opacity-70 mb-6" style={{ color: theme.text_color }}>{section.subtitle}</p>
            <p className="mb-8 opacity-60" style={{ color: theme.text_color }}>{section.content}</p>
            {section.highlights && (
              <div className="flex flex-wrap gap-3 mb-8">
                {section.highlights.map((h, i) => (
                  <span key={i} className="px-4 py-2 rounded-sm text-sm font-medium" style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}>
                    ✓ {h}
                  </span>
                ))}
              </div>
            )}
            <button className="w-fit px-8 py-4 rounded-lg font-semibold text-white" style={{ backgroundColor: theme.primary_color }}>
              Enroll Now →
            </button>
          </div>
          <div className="md:col-span-2 bg-cover bg-center min-h-[300px]" style={{ backgroundImage: `url(${toAbsUrl(section.image_url)})` }} />
        </div>
      );
    }

    // Layout: Fullbleed Countdown (Product Launch)
    if (layout === 'fullbleed-countdown') {
      return (
        <div 
          className="relative min-h-[550px] flex items-center justify-center"
          style={{ 
            backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.9), rgba(0,0,0,0.6)), url(${toAbsUrl(section.image_url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="text-center px-8">
            <p className="text-sm tracking-[0.3em] uppercase mb-4" style={{ color: theme.primary_color }}>{section.subtitle}</p>
            <h1 className="text-6xl md:text-8xl font-outfit font-black text-white mb-6 tracking-tight">
              {section.title}
            </h1>
            <p className="text-xl text-white/70 mb-8 max-w-xl mx-auto">{section.content}</p>
            <div className="inline-block px-6 py-3 rounded-sm mb-8" style={{ backgroundColor: theme.primary_color }}>
              <span className="text-white font-semibold">{section.launch_date}</span>
            </div>
            <div className="flex justify-center gap-4">
              <button className="px-8 py-4 rounded-lg font-bold text-lg" style={{ backgroundColor: theme.primary_color, color: '#fff' }}>
                Get Notified
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Layout: Story Hero (Charity)
    if (layout === 'story-hero') {
      return (
        <div 
          className="relative min-h-[500px] flex items-end"
          style={{ 
            backgroundImage: `url(${toAbsUrl(section.image_url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 60%)' }} />
          <div className="relative z-10 w-full p-8 md:p-12">
            <div className="max-w-4xl">
              <h1 className="text-4xl md:text-6xl font-outfit font-bold text-white mb-4">{section.title}</h1>
              <p className="text-xl text-white/80 mb-6">{section.subtitle}</p>
              <p className="text-lg text-white/60 mb-8">{section.content}</p>
              {section.impact && (
                <div className="flex gap-8 mb-8">
                  {section.impact.map((item, i) => (
                    <div key={i} className="text-center">
                      <div className="text-3xl font-bold" style={{ color: theme.primary_color }}>{item.value}</div>
                      <div className="text-sm text-white/60">{item.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <button className="px-8 py-4 rounded-sm font-semibold text-white" style={{ backgroundColor: theme.primary_color }}>
                Donate Now ♥
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Layout: Dynamic Hero (Sports)
    if (layout === 'dynamic-hero') {
      return (
        <div 
          className="relative min-h-[500px] overflow-hidden"
          style={{ 
            backgroundImage: `url(${toAbsUrl(section.image_url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute bottom-0 left-0 right-0 h-32" style={{ background: `linear-gradient(to top, ${theme.background_color}, transparent)` }} />
          {/* Angled overlay */}
          <div className="absolute top-0 left-0 w-1/2 h-full" style={{ background: `linear-gradient(135deg, ${theme.primary_color}ee 0%, transparent 70%)` }} />
          <div className="relative z-10 min-h-[500px] flex items-center p-8 md:p-16">
            <div>
              <p className="text-sm font-bold tracking-widest mb-4 uppercase" style={{ color: theme.secondary_color }}>{section.subtitle}</p>
              <h1 className="text-5xl md:text-7xl font-outfit font-black text-white mb-4 uppercase tracking-tight">
                {section.title}
              </h1>
              <p className="text-xl text-white/80 mb-8">{section.content}</p>
              {section.stats && (
                <div className="flex gap-10 mb-8">
                  {section.stats.map((stat, i) => (
                    <div key={i}>
                      <div className="text-4xl font-black text-white">{stat.value}</div>
                      <div className="text-sm text-white/60 uppercase tracking-wider">{stat.label}</div>
                    </div>
                  ))}
                </div>
              )}
              <button className="px-10 py-4 rounded-none font-bold text-lg uppercase tracking-wider" style={{ backgroundColor: theme.primary_color, color: '#fff' }}>
                Register Now
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Layout: Romantic Hero (Wedding)
    if (layout === 'romantic-hero') {
      return (
        <div 
          className="relative min-h-[550px] flex items-center justify-center"
          style={{ 
            backgroundImage: `url(${toAbsUrl(section.image_url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 text-center px-8">
            <p className="text-lg text-white/80 font-light italic mb-4">{section.subtitle}</p>
            <h1 className="text-5xl md:text-7xl font-outfit font-light text-white mb-2" style={{ fontStyle: 'italic' }}>
              {section.title}
            </h1>
            <p className="text-xl text-white/70 mb-6">{section.content}</p>
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="w-16 h-px bg-white/50" />
              <span className="text-2xl" style={{ color: theme.primary_color }}>♥</span>
              <div className="w-16 h-px bg-white/50" />
            </div>
            <p className="text-2xl text-white font-light">{section.date}</p>
          </div>
        </div>
      );
    }

    // Layout: Neon Hero (Music Concert)
    if (layout === 'neon-hero') {
      return (
        <div 
          className="relative min-h-[550px] flex items-center justify-center overflow-hidden"
          style={{ 
            backgroundImage: `url(${toAbsUrl(section.image_url)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <div className="absolute inset-0 bg-black/70" />
          {/* Neon glow effects */}
          <div className="absolute top-20 left-20 w-64 h-64 rounded-full blur-[100px] opacity-50" style={{ backgroundColor: theme.primary_color }} />
          <div className="absolute bottom-20 right-20 w-64 h-64 rounded-full blur-[100px] opacity-50" style={{ backgroundColor: theme.secondary_color }} />
          <div className="relative z-10 text-center px-8">
            <h1 
              className="text-7xl md:text-9xl font-outfit font-black text-white mb-0 tracking-tighter uppercase"
              style={{ textShadow: `0 0 60px ${theme.primary_color}` }}
            >
              {section.title}
            </h1>
            <p className="text-3xl md:text-4xl font-outfit font-light text-white/80 tracking-widest uppercase mb-8">{section.subtitle}</p>
            <p className="text-xl text-white/60 tracking-wider mb-4">{section.content}</p>
            <div className="inline-block px-6 py-2 rounded-sm border-2 mb-8" style={{ borderColor: theme.primary_color, color: theme.primary_color }}>
              {section.date}
            </div>
            <div className="flex justify-center gap-4">
              <button className="px-10 py-4 rounded-none font-bold text-lg uppercase tracking-wider" style={{ backgroundColor: theme.primary_color, color: '#fff', boxShadow: `0 0 30px ${theme.primary_color}` }}>
                Get Tickets
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Default Hero Layout
    return (
      <div 
        className="relative min-h-[400px] flex items-center justify-center overflow-hidden"
        style={{
          background: section.image_url 
            ? `linear-gradient(to bottom, rgba(0,0,0,0.4), rgba(0,0,0,0.7)), url(${toAbsUrl(section.image_url)})`
            : getGradient(theme.primary_color, theme.secondary_color || theme.primary_color + 'cc'),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="relative z-10 text-center px-8 max-w-4xl mx-auto">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-outfit font-bold mb-4 text-white">
            {section.title || 'Event Title'}
          </h1>
          <p className="text-lg md:text-xl text-white/90 mb-8">{section.subtitle}</p>
          <button className="px-8 py-4 rounded-xl text-lg font-semibold bg-white" style={{ color: theme.primary_color }}>
            Register Now →
          </button>
        </div>
      </div>
    );
  }

  // ABOUT SECTION - Multiple Layouts
  if (section.type === 'about') {
    const layout = section.layout || 'default';
    
    // Cards layout (Tech Conference)
    if (layout === 'cards' && section.features) {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-5xl mx-auto text-center">
            <span className="inline-block px-4 py-1 rounded-sm text-sm font-medium mb-4" style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}>
              {section.subtitle}
            </span>
            <h2 className="text-3xl md:text-4xl font-outfit font-bold mb-6" style={{ color: theme.text_color }}>{section.title}</h2>
            <p className="text-lg opacity-70 mb-12 max-w-2xl mx-auto" style={{ color: theme.text_color }}>{section.content}</p>
            <div className="grid md:grid-cols-3 gap-6">
              {section.features.map((f, i) => (
                <div key={i} className="p-6 rounded-2xl text-center" style={{ backgroundColor: theme.primary_color + '08', border: `1px solid ${theme.primary_color}15` }}>
                  <div className="text-4xl mb-4">{f.icon}</div>
                  <h4 className="font-semibold text-lg mb-2" style={{ color: theme.text_color }}>{f.title}</h4>
                  <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Elegant bordered (Corporate Gala)
    if (layout === 'elegant-bordered') {
      return (
        <div className="py-20 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-3xl mx-auto text-center">
            <div className="border-2 p-12 relative" style={{ borderColor: theme.primary_color + '40' }}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4" style={{ backgroundColor: theme.background_color }}>
                <span style={{ color: theme.primary_color }}>✦ ✦ ✦</span>
              </div>
              <p className="text-sm tracking-widest uppercase mb-4" style={{ color: theme.primary_color }}>{section.subtitle}</p>
              <h2 className="text-3xl font-outfit font-light mb-6 tracking-wide" style={{ color: theme.text_color }}>{section.title}</h2>
              <p className="leading-relaxed" style={{ color: theme.text_color, opacity: 0.8 }}>{section.content}</p>
            </div>
          </div>
        </div>
      );
    }

    // Checklist layout (Workshop)
    if (layout === 'checklist' && section.checklist) {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-12 items-center">
              <div>
                <span className="inline-block px-3 py-1 rounded text-sm font-medium mb-4" style={{ backgroundColor: theme.primary_color, color: '#fff' }}>{section.subtitle}</span>
                <h2 className="text-3xl font-outfit font-bold mb-4" style={{ color: theme.text_color }}>{section.title}</h2>
                <p className="opacity-70" style={{ color: theme.text_color }}>{section.content}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {section.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: theme.primary_color + '08' }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs text-white" style={{ backgroundColor: theme.primary_color }}>✓</span>
                    <span className="text-sm" style={{ color: theme.text_color }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Feature blocks (Product Launch)
    if (layout === 'feature-blocks' && section.features) {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {section.features.map((f, i) => (
                <div key={i} className="p-6 rounded-xl text-center" style={{ backgroundColor: theme.primary_color + '10', border: `1px solid ${theme.primary_color}30` }}>
                  <div className="text-4xl mb-3">{f.icon}</div>
                  <h4 className="font-bold text-xl mb-1" style={{ color: theme.primary_color }}>{f.title}</h4>
                  <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Story mission (Charity)
    if (layout === 'story-mission') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block px-4 py-1 rounded-sm text-sm font-medium mb-4" style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}>{section.subtitle}</span>
            <h2 className="text-3xl font-outfit font-bold mb-6" style={{ color: theme.text_color }}>{section.title}</h2>
            <p className="text-lg leading-relaxed mb-8" style={{ color: theme.text_color }}>{section.content}</p>
            {section.quote && (
              <blockquote className="p-6 rounded-2xl italic text-lg" style={{ backgroundColor: theme.primary_color + '10', color: theme.text_color, borderLeft: `4px solid ${theme.primary_color}` }}>
                {section.quote}
              </blockquote>
            )}
          </div>
        </div>
      );
    }

    // Race categories (Sports)
    if (layout === 'race-categories' && section.categories) {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12 uppercase tracking-wider" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {section.categories.map((cat, i) => (
                <div key={i} className="p-6 rounded-none text-center border-l-4" style={{ backgroundColor: theme.primary_color + '10', borderColor: theme.primary_color }}>
                  <h4 className="font-bold text-xl mb-2 uppercase" style={{ color: theme.text_color }}>{cat.name}</h4>
                  <div className="text-3xl font-black mb-2" style={{ color: theme.primary_color }}>{cat.distance}</div>
                  <p className="text-sm opacity-60" style={{ color: theme.text_color }}>Start: {cat.start}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Love story (Wedding)
    if (layout === 'love-story') {
      return (
        <div className="py-20 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-2xl mx-auto text-center">
            <span className="text-4xl mb-6 block" style={{ color: theme.primary_color }}>♥</span>
            <p className="text-sm tracking-widest uppercase mb-4" style={{ color: theme.primary_color }}>{section.subtitle}</p>
            <h2 className="text-3xl font-outfit font-light mb-8 italic" style={{ color: theme.text_color }}>{section.title}</h2>
            <p className="leading-relaxed text-lg" style={{ color: theme.text_color, opacity: 0.8 }}>{section.content}</p>
          </div>
        </div>
      );
    }

    // Default about
    return (
      <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
        <div className="max-w-3xl mx-auto text-center">
          <span className="inline-block px-4 py-1 rounded-sm text-sm font-medium mb-4" style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}>{section.subtitle}</span>
          <h2 className="text-3xl font-outfit font-bold mb-6" style={{ color: theme.text_color }}>{section.title}</h2>
          <p className="leading-relaxed" style={{ color: theme.text_color }}>{section.content}</p>
        </div>
      </div>
    );
  }

  // SPEAKERS SECTION - Multiple Layouts  
  if (section.type === 'speakers') {
    const layout = section.layout || 'default';
    const items = section.items || [];

    // Grid cards (Tech Conference)
    if (layout === 'grid-cards') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.primary_color + '05' }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {items.map((item, i) => (
                <div key={i} className="bg-white rounded-2xl p-5 text-center shadow-lg hover:shadow-xl transition-shadow" style={{ border: `1px solid ${theme.primary_color}10` }}>
                  <div className="w-20 h-20 mx-auto rounded-xl bg-cover bg-center mb-4 shadow" style={{ backgroundImage: `url(${toAbsUrl(item.image_url)})` }} />
                  <h4 className="font-semibold" style={{ color: theme.text_color }}>{item.name}</h4>
                  <p className="text-xs opacity-60 mb-2" style={{ color: theme.text_color }}>{item.title}</p>
                  {item.topic && <span className="inline-block px-2 py-0.5 rounded text-xs" style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}>{item.topic}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Horizontal bio (Workshop)
    if (layout === 'horizontal-bio') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="space-y-6">
              {items.map((item, i) => (
                <div key={i} className="flex gap-6 p-6 rounded-2xl" style={{ backgroundColor: theme.primary_color + '08' }}>
                  <div className="w-24 h-24 rounded-xl bg-cover bg-center flex-shrink-0" style={{ backgroundImage: `url(${toAbsUrl(item.image_url)})` }} />
                  <div>
                    <h4 className="font-semibold text-xl" style={{ color: theme.text_color }}>{item.name}</h4>
                    <p className="text-sm mb-2" style={{ color: theme.primary_color }}>{item.title}</p>
                    <p className="text-sm opacity-70" style={{ color: theme.text_color }}>{item.bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Presenters row (Product Launch)
    if (layout === 'presenters-row') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-outfit font-bold text-center mb-10 uppercase tracking-wider" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="flex justify-center gap-12 flex-wrap">
              {items.map((item, i) => (
                <div key={i} className="text-center">
                  <div className="w-32 h-32 rounded-full bg-cover bg-center mx-auto mb-4 border-4" style={{ backgroundImage: `url(${toAbsUrl(item.image_url)})`, borderColor: theme.primary_color }} />
                  <h4 className="font-bold" style={{ color: theme.text_color }}>{item.name}</h4>
                  <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Guest showcase (Charity)
    if (layout === 'guest-showcase') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-outfit font-bold mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="flex justify-center gap-16 flex-wrap">
              {items.map((item, i) => (
                <div key={i} className="text-center">
                  <div className="w-36 h-36 rounded-full bg-cover bg-center mx-auto mb-4 border-4 shadow-xl" style={{ backgroundImage: `url(${toAbsUrl(item.image_url)})`, borderColor: theme.primary_color + '40' }} />
                  <h4 className="font-semibold text-lg" style={{ color: theme.text_color }}>{item.name}</h4>
                  <p className="text-sm" style={{ color: theme.primary_color }}>{item.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Artist grid (Music Concert)
    if (layout === 'artist-grid') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-4xl font-outfit font-black text-center mb-12 uppercase tracking-wider" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {items.map((item, i) => (
                <div key={i} className="relative group overflow-hidden">
                  <div className="aspect-square bg-cover bg-center" style={{ backgroundImage: `url(${toAbsUrl(item.image_url)})` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h4 className="font-black text-lg text-white uppercase">{item.name}</h4>
                      <p className="text-sm" style={{ color: theme.primary_color }}>{item.title}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Default speakers
    const speakerCount = items.length;
    // Dynamic grid alignment based on number of speakers
    const getSpeakersGridClass = () => {
      if (speakerCount === 1) return 'flex justify-center';
      if (speakerCount === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-xl mx-auto';
      if (speakerCount === 3) return 'grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto';
      if (speakerCount === 4) return 'grid grid-cols-2 md:grid-cols-4 gap-6';
      return 'grid grid-cols-2 md:grid-cols-4 gap-6';
    };
    return (
      <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-outfit font-bold mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
          <div className={getSpeakersGridClass()}>
            {items.map((item, i) => (
              <div key={i} className={`text-center ${speakerCount === 1 ? 'max-w-[180px] w-full' : ''}`}>
                <div className="w-20 h-20 mx-auto rounded-full bg-cover bg-center mb-3" style={{ backgroundImage: `url(${toAbsUrl(item.image_url)})` }} />
                <h4 className="font-medium" style={{ color: theme.text_color }}>{item.name}</h4>
                <p className="text-xs opacity-60" style={{ color: theme.text_color }}>{item.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // SCHEDULE SECTION - Multiple Layouts
  if (section.type === 'schedule') {
    const layout = section.layout || 'default';
    const items = section.items || [];

    // Timeline (Tech Conference)
    if (layout === 'timeline') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5" style={{ backgroundColor: theme.primary_color + '30' }} />
              <div className="space-y-6">
                {items.map((item, i) => (
                  <div key={i} className="flex gap-6">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 shadow-lg" style={{ backgroundColor: theme.primary_color }}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div className="flex-1 pb-6">
                      <span className="inline-block px-3 py-1 rounded-sm text-sm font-medium mb-2" style={{ backgroundColor: theme.primary_color + '15', color: theme.primary_color }}>{item.time}</span>
                      <h4 className="font-semibold text-lg" style={{ color: theme.text_color }}>{item.title}</h4>
                      <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Elegant timeline (Corporate Gala)
    if (layout === 'elegant-timeline') {
      return (
        <div className="py-20 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-outfit font-light text-center mb-12 tracking-wide uppercase" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="space-y-8">
              {items.map((item, i) => (
                <div key={i} className="flex gap-8 items-center">
                  <div className="text-right w-24">
                    <span className="font-light text-lg" style={{ color: theme.primary_color }}>{item.time}</span>
                  </div>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: theme.primary_color }} />
                  <div>
                    <h4 className="font-medium tracking-wide" style={{ color: theme.text_color }}>{item.title}</h4>
                    <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Day columns (Workshop)
    if (layout === 'day-columns') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {items.map((item, i) => (
                <div key={i} className="p-6 rounded-xl" style={{ backgroundColor: theme.primary_color + '08', borderLeft: `4px solid ${theme.primary_color}` }}>
                  <span className="text-sm font-bold uppercase tracking-wider" style={{ color: theme.primary_color }}>{item.time}</span>
                  <h4 className="font-semibold text-lg mt-2" style={{ color: theme.text_color }}>{item.title}</h4>
                  <p className="text-sm opacity-60 mt-1" style={{ color: theme.text_color }}>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Wedding events
    if (layout === 'wedding-events') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-3xl font-outfit font-light mb-12 italic" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="space-y-6">
              {items.map((item, i) => (
                <div key={i} className="p-6 rounded-2xl" style={{ backgroundColor: theme.primary_color + '08' }}>
                  <span className="inline-block px-4 py-1 rounded-sm text-sm font-medium mb-3" style={{ backgroundColor: theme.primary_color, color: '#fff' }}>{item.time}</span>
                  <h4 className="font-semibold text-xl" style={{ color: theme.text_color }}>{item.title}</h4>
                  <p className="text-sm opacity-70" style={{ color: theme.text_color }}>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Festival days (Music Concert)
    if (layout === 'festival-days') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-black text-center mb-12 uppercase tracking-wider" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {items.map((item, i) => (
                <div key={i} className="p-6 text-center" style={{ backgroundColor: theme.primary_color + '15', border: `2px solid ${theme.primary_color}` }}>
                  <span className="text-sm font-black uppercase tracking-widest" style={{ color: theme.primary_color }}>{item.time}</span>
                  <h4 className="font-black text-2xl my-3 uppercase" style={{ color: theme.text_color }}>{item.title}</h4>
                  <p className="text-sm opacity-70" style={{ color: theme.text_color }}>{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Default schedule
    return (
      <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="flex gap-4 p-4 rounded-xl" style={{ backgroundColor: theme.primary_color + '08' }}>
                <span className="font-medium whitespace-nowrap" style={{ color: theme.primary_color }}>{item.time}</span>
                <div>
                  <h4 className="font-medium" style={{ color: theme.text_color }}>{item.title}</h4>
                  <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // PRICING SECTION - Multiple Layouts
  if (section.type === 'pricing') {
    const layout = section.layout || 'default';
    const items = section.items || [];

    // Cards featured (Tech Conference)
    if (layout === 'cards-featured') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.primary_color + '05' }}>
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {items.map((item, i) => (
                <div key={i} className={`relative bg-white rounded-2xl p-8 text-center shadow-lg ${i === 1 ? 'md:-mt-4 md:mb-4 ring-2' : ''}`} style={{ ringColor: i === 1 ? theme.primary_color : 'transparent' }}>
                  {i === 1 && <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-sm text-sm font-bold text-white" style={{ backgroundColor: theme.primary_color }}>Popular</div>}
                  <h4 className="font-semibold text-lg mb-2" style={{ color: theme.text_color }}>{item.name}</h4>
                  <div className="text-4xl font-bold my-4" style={{ color: theme.primary_color }}>{item.price}</div>
                  <ul className="text-sm text-left space-y-2 mb-6">
                    {(item.features || '').split(',').map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2" style={{ color: theme.text_color }}>
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs text-white" style={{ backgroundColor: theme.primary_color }}>✓</span>
                        {f.trim()}
                      </li>
                    ))}
                  </ul>
                  <button className="w-full py-3 rounded-xl font-semibold" style={{ backgroundColor: i === 1 ? theme.primary_color : theme.primary_color + '15', color: i === 1 ? '#fff' : theme.primary_color }}>
                    Select
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Elegant horizontal (Corporate Gala)
    if (layout === 'elegant-horizontal') {
      return (
        <div className="py-20 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-light text-center mb-12 uppercase tracking-wide" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-6 border-b" style={{ borderColor: theme.primary_color + '30' }}>
                  <div>
                    <h4 className="font-medium text-lg" style={{ color: theme.text_color }}>{item.name}</h4>
                    <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{item.features}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-light" style={{ color: theme.primary_color }}>{item.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Minimal list (Workshop)
    if (layout === 'minimal-list') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="space-y-4">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-6 rounded-xl" style={{ backgroundColor: theme.primary_color + '08' }}>
                  <div>
                    <h4 className="font-semibold" style={{ color: theme.text_color }}>{item.name}</h4>
                    <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{item.features}</p>
                  </div>
                  <div className="text-2xl font-bold" style={{ color: theme.primary_color }}>{item.price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Donation tiers (Charity)
    if (layout === 'donation-tiers') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {items.map((item, i) => (
                <div key={i} className="p-6 rounded-2xl text-center" style={{ backgroundColor: theme.primary_color + '10', border: `2px solid ${theme.primary_color}30` }}>
                  <h4 className="font-semibold text-lg mb-2" style={{ color: theme.text_color }}>{item.name}</h4>
                  <div className="text-3xl font-bold my-4" style={{ color: theme.primary_color }}>{item.price}</div>
                  <p className="text-sm opacity-70 mb-6" style={{ color: theme.text_color }}>{item.features}</p>
                  <button className="w-full py-3 rounded-sm font-semibold text-white" style={{ backgroundColor: theme.primary_color }}>
                    Donate ♥
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Festival passes (Music Concert)
    if (layout === 'festival-passes') {
      return (
        <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-outfit font-black text-center mb-12 uppercase tracking-wider" style={{ color: theme.text_color }}>{section.title}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {items.map((item, i) => (
                <div key={i} className="p-6 text-center" style={{ backgroundColor: theme.primary_color + '10', border: `2px solid ${theme.primary_color}` }}>
                  <h4 className="font-black uppercase tracking-wider mb-2" style={{ color: theme.text_color }}>{item.name}</h4>
                  <div className="text-4xl font-black my-4" style={{ color: theme.primary_color }}>{item.price}</div>
                  <p className="text-sm opacity-60 mb-6" style={{ color: theme.text_color }}>{item.features}</p>
                  <button className="w-full py-3 font-bold uppercase tracking-wider" style={{ backgroundColor: theme.primary_color, color: '#fff' }}>
                    Buy Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // Default pricing
    const pricingCount = items.length;
    // Dynamic grid alignment based on number of items
    const getPricingGridClass = () => {
      if (pricingCount === 1) return 'flex justify-center';
      if (pricingCount === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto';
      if (pricingCount === 3) return 'grid grid-cols-1 md:grid-cols-3 gap-6';
      if (pricingCount === 4) return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6';
      return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
    };
    return (
      <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
          <div className={getPricingGridClass()}>
            {items.map((item, i) => (
              <div key={i} className={`p-6 rounded-xl text-center ${pricingCount === 1 ? 'max-w-sm w-full' : ''}`} style={{ backgroundColor: theme.primary_color + '08' }}>
                <h4 className="font-semibold mb-2" style={{ color: theme.text_color }}>{item.name}</h4>
                <div className="text-3xl font-bold my-4" style={{ color: theme.primary_color }}>{item.price}</div>
                <p className="text-sm opacity-60" style={{ color: theme.text_color }}>{Array.isArray(item.features) ? item.features.join(', ') : item.features}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // FAQ SECTION
  if (section.type === 'faq') {
    const items = section.items || [];
    return (
      <div className="py-16 px-8" style={{ backgroundColor: theme.background_color }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-outfit font-bold text-center mb-12" style={{ color: theme.text_color }}>{section.title}</h2>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className="p-6 rounded-xl" style={{ backgroundColor: theme.primary_color + '08' }}>
                <h4 className="font-semibold flex items-center gap-3" style={{ color: theme.text_color }}>
                  <span className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style={{ backgroundColor: theme.primary_color }}>Q</span>
                  {item.question}
                </h4>
                <p className="mt-3 pl-11 text-sm opacity-70" style={{ color: theme.text_color }}>{item.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // CONTACT SECTION
  if (section.type === 'contact') {
    return (
      <div className="py-16 px-8" style={{ background: getGradient(theme.primary_color, theme.secondary_color || theme.primary_color) }}>
        <div className="max-w-2xl mx-auto text-center">
          <Mail className="w-12 h-12 mx-auto mb-6 text-white opacity-80" />
          <h2 className="text-3xl font-outfit font-bold text-white mb-8">{section.title}</h2>
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8" style={{ border: '1px solid rgba(255,255,255,0.2)' }}>
            <p className="text-white text-lg whitespace-pre-line">{section.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // DEFAULT
  return (
    <div className="p-8 text-center" style={{ backgroundColor: theme.background_color }}>
      <h2 className="text-2xl font-outfit font-bold mb-2" style={{ color: theme.text_color }}>{section.title || section.type}</h2>
      <p className="text-sm opacity-50" style={{ color: theme.text_color }}>Preview for {section.type} section</p>
    </div>
  );
};

// Full Landing Page Preview
const LandingPagePreview = ({ campaign, sections, theme, showRegistrationButton }) => {
  return (
    <div className="flex-1 overflow-y-auto" style={{ backgroundColor: theme.background_color }}>
      {sections.filter(s => s.visible).sort((a, b) => a.order - b.order).map((section) => (
        <SectionPreview key={section.id} section={section} theme={theme} />
      ))}
    </div>
  );
};

export default LandingPageBuilder;
