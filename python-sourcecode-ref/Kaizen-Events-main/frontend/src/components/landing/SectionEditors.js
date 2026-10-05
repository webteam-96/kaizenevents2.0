import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import ImageUploader from '../ui/ImageUploader';
import { Plus, Trash2 } from 'lucide-react';

// Section Editor Component
export const SectionEditor = ({ section, onUpdate, theme }) => {
  const handleFieldChange = (field, value) => {
    onUpdate({ ...section, [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Common Fields */}
      <div>
        <Label className="text-sm font-medium text-slate-700">Title</Label>
        <Input
          value={section.title || ''}
          onChange={(e) => handleFieldChange('title', e.target.value)}
          placeholder="Section title"
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-sm font-medium text-slate-700">Subtitle</Label>
        <Input
          value={section.subtitle || ''}
          onChange={(e) => handleFieldChange('subtitle', e.target.value)}
          placeholder="Section subtitle"
          className="mt-1"
        />
      </div>

      {['hero', 'about', 'contact'].includes(section.type) && (
        <div>
          <Label className="text-sm font-medium text-slate-700">Content</Label>
          <textarea
            value={section.content || ''}
            onChange={(e) => handleFieldChange('content', e.target.value)}
            placeholder="Section content"
            className="w-full mt-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[100px]"
          />
        </div>
      )}

      {section.type === 'hero' && (
        <div>
          <Label className="text-sm font-medium text-slate-700">Hero Image</Label>
          <ImageUploader
            value={section.image_url}
            onChange={(url) => handleFieldChange('image_url', url)}
            className="mt-1"
          />
        </div>
      )}

      {/* Type-specific editors */}
      {section.type === 'faq' && (
        <FAQItemsEditor
          items={section.items || []}
          onUpdate={(items) => handleFieldChange('items', items)}
        />
      )}

      {section.type === 'speakers' && (
        <SpeakersItemsEditor
          items={section.items || []}
          onUpdate={(items) => handleFieldChange('items', items)}
        />
      )}

      {section.type === 'schedule' && (
        <ScheduleItemsEditor
          items={section.items || []}
          onUpdate={(items) => handleFieldChange('items', items)}
        />
      )}

      {section.type === 'pricing' && (
        <PricingItemsEditor
          items={section.items || []}
          onUpdate={(items) => handleFieldChange('items', items)}
        />
      )}

      {/* Visibility Toggle */}
      <div className="flex items-center justify-between pt-4 border-t">
        <div>
          <Label className="text-sm font-medium text-slate-700">Visible</Label>
          <p className="text-xs text-slate-500">Show this section on the landing page</p>
        </div>
        <Switch
          checked={section.visible !== false}
          onCheckedChange={(checked) => handleFieldChange('visible', checked)}
        />
      </div>
    </div>
  );
};

// FAQ Items Editor
export const FAQItemsEditor = ({ items, onUpdate }) => {
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
      <Label className="text-sm font-medium text-slate-700">FAQ Items</Label>
      <div className="space-y-3 mt-2">
        {items.map((item, index) => (
          <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
            <Input
              value={item.question || ''}
              onChange={(e) => updateItem(index, 'question', e.target.value)}
              placeholder="Question"
            />
            <textarea
              value={item.answer || ''}
              onChange={(e) => updateItem(index, 'answer', e.target.value)}
              placeholder="Answer"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[60px]"
            />
            <Button variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500">
              <Trash2 className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="w-4 h-4 mr-1" /> Add FAQ
        </Button>
      </div>
    </div>
  );
};

// Speakers Items Editor
export const SpeakersItemsEditor = ({ items, onUpdate }) => {
  const addItem = () => {
    onUpdate([...items, { name: '', title: '', image_url: '' }]);
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
      <Label className="text-sm font-medium text-slate-700">Speakers</Label>
      <div className="space-y-3 mt-2">
        {items.map((item, index) => (
          <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
            <Input
              value={item.name || ''}
              onChange={(e) => updateItem(index, 'name', e.target.value)}
              placeholder="Speaker name"
            />
            <Input
              value={item.title || ''}
              onChange={(e) => updateItem(index, 'title', e.target.value)}
              placeholder="Title / Role"
            />
            <ImageUploader
              value={item.image_url}
              onChange={(url) => updateItem(index, 'image_url', url)}
              className="h-24"
            />
            <Button variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500">
              <Trash2 className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="w-4 h-4 mr-1" /> Add Speaker
        </Button>
      </div>
    </div>
  );
};

// Schedule Items Editor
export const ScheduleItemsEditor = ({ items, onUpdate }) => {
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
      <Label className="text-sm font-medium text-slate-700">Schedule Items</Label>
      <div className="space-y-3 mt-2">
        {items.map((item, index) => (
          <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={item.time || ''}
                onChange={(e) => updateItem(index, 'time', e.target.value)}
                placeholder="Time"
              />
              <Input
                value={item.title || ''}
                onChange={(e) => updateItem(index, 'title', e.target.value)}
                placeholder="Title"
              />
            </div>
            <Input
              value={item.description || ''}
              onChange={(e) => updateItem(index, 'description', e.target.value)}
              placeholder="Description"
            />
            <Button variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500">
              <Trash2 className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="w-4 h-4 mr-1" /> Add Schedule Item
        </Button>
      </div>
    </div>
  );
};

// Pricing Items Editor
export const PricingItemsEditor = ({ items, onUpdate }) => {
  const addItem = () => {
    onUpdate([...items, { name: '', price: '', features: '' }]);
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
      <Label className="text-sm font-medium text-slate-700">Pricing Tiers</Label>
      <div className="space-y-3 mt-2">
        {items.map((item, index) => (
          <div key={index} className="p-3 bg-slate-50 rounded-lg space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={item.name || ''}
                onChange={(e) => updateItem(index, 'name', e.target.value)}
                placeholder="Tier name"
              />
              <Input
                value={item.price || ''}
                onChange={(e) => updateItem(index, 'price', e.target.value)}
                placeholder="Price"
              />
            </div>
            <textarea
              value={item.features || ''}
              onChange={(e) => updateItem(index, 'features', e.target.value)}
              placeholder="Features (comma separated)"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm min-h-[60px]"
            />
            <Button variant="ghost" size="sm" onClick={() => removeItem(index)} className="text-red-500">
              <Trash2 className="w-4 h-4 mr-1" /> Remove
            </Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="w-4 h-4 mr-1" /> Add Pricing Tier
        </Button>
      </div>
    </div>
  );
};

export default SectionEditor;
