import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, Trash2, Layers, Route } from 'lucide-react';
import { toast } from 'sonner';

const PageRules = ({ fields, pageBreaks, pageRules, onUpdateBreaks, onUpdateRules }) => {
  const [breaks, setBreaks] = useState(pageBreaks || []);
  const [rules, setRules] = useState(pageRules || []);

  const addPageBreak = () => {
    // Default position: after the last field (creates a final page with no fields unless moved)
    const defaultPosition = fields.length;
    const newBreak = {
      id: `page_${Date.now()}`,
      title: `Page ${breaks.length + 2}`,
      description: '',
      position: defaultPosition,  // insert break after this many fields (0 = before all fields)
      order: breaks.length + 1,
      conditions: []
    };
    const updated = [...breaks, newBreak];
    setBreaks(updated);
    onUpdateBreaks(updated);
    toast.success('Page break added — set its position below');
  };

  const deletePageBreak = (breakId) => {
    const updated = breaks.filter(b => b.id !== breakId);
    setBreaks(updated);
    onUpdateBreaks(updated);
    toast.success('Page break removed');
  };

  const updatePageBreak = (breakId, updates) => {
    const updated = breaks.map(b => b.id === breakId ? { ...b, ...updates } : b);
    setBreaks(updated);
    onUpdateBreaks(updated);
  };

  const addPageRule = () => {
    const newRule = {
      id: `pr_${Date.now()}`,
      name: 'New Page Rule',
      source_page: 1,
      conditions: [],
      action: 'skip_to',
      target_page: 2,
      match_type: 'all'
    };
    const updated = [...rules, newRule];
    setRules(updated);
    onUpdateRules(updated);
  };

  const deletePageRule = (ruleId) => {
    const updated = rules.filter(r => r.id !== ruleId);
    setRules(updated);
    onUpdateRules(updated);
  };

  const updatePageRule = (ruleId, updates) => {
    const updated = rules.map(r => r.id === ruleId ? { ...r, ...updates } : r);
    setRules(updated);
    onUpdateRules(updated);
  };

  const totalPages = breaks.length + 1;

  return (
    <div className="space-y-6">
      {/* Page Breaks */}
      <Card className="ke-card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <span
              className="ke-medallion flex-shrink-0"
              style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
            >
              <Layers className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <div>
              <h3 className="ke-section-title text-[15px]">Page Breaks</h3>
              <div className="ke-rule-gold mt-2 mb-2" />
              <p className="text-sm text-muted-foreground font-jakarta">
                Split your form into multiple pages for better user experience
              </p>
            </div>
          </div>
          <Button
            onClick={addPageBreak}
            size="sm"
            className="bg-primary hover:bg-primary-hover text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Page Break
          </Button>
        </div>

        <div className="mb-4 p-4 bg-muted rounded-lg">
          <div className="flex items-center space-x-2">
            <Layers className="w-5 h-5 text-primary" />
            <span className="text-sm font-jakarta font-medium text-foreground">
              Total Pages: {totalPages}
            </span>
          </div>
        </div>

        {breaks.length === 0 ? (
          <p className="text-sm text-muted-foreground font-jakarta text-center py-4">
            Single page form. Add page breaks to create multi-page form.
          </p>
        ) : (
          <div className="space-y-3">
            {breaks.map((pageBreak, index) => (
              <Card key={pageBreak.id} className="ke-card ke-card-hover p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-mono font-semibold text-primary">
                      Page {index + 2}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePageBreak(pageBreak.id)}
                    className="hover:bg-accent-subtle hover:text-accent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  {/* Position: where in the field list to insert the break */}
                  <div>
                    <Label className="text-sm text-foreground font-jakarta mb-1 block">Insert break after</Label>
                    <Select
                      value={String(pageBreak.position ?? fields.length)}
                      onValueChange={(v) => updatePageBreak(pageBreak.id, { position: parseInt(v, 10) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f, idx) => (
                          <SelectItem key={f.id || idx} value={String(idx + 1)}>
                            After "{f.label || `Field ${idx + 1}`}"
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Everything above this break = this page. Everything below = next page.
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm text-foreground font-jakarta mb-1 block">Page Title (shown after this break)</Label>
                    <Input
                      value={pageBreak.title}
                      onChange={(e) => updatePageBreak(pageBreak.id, { title: e.target.value })}
                      placeholder="Page title"
                    />
                  </div>

                  <div>
                    <Label className="text-sm text-foreground font-jakarta mb-1 block">Description</Label>
                    <Input
                      value={pageBreak.description}
                      onChange={(e) => updatePageBreak(pageBreak.id, { description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Page Rules */}
      <Card className="ke-card p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <span
              className="ke-medallion flex-shrink-0"
              style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
            >
              <Route className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
            </span>
            <div>
              <h3 className="ke-section-title text-[15px]">Page Navigation Rules</h3>
              <div className="ke-rule-gold mt-2 mb-2" />
              <p className="text-sm text-muted-foreground font-jakarta">
                Control page flow based on user responses
              </p>
            </div>
          </div>
          <Button
            onClick={addPageRule}
            size="sm"
            className="bg-primary hover:bg-primary-hover text-primary-foreground"
            disabled={totalPages < 2}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
        </div>

        {totalPages < 2 ? (
          <p className="text-sm text-muted-foreground font-jakarta text-center py-4">
            Add page breaks to enable page navigation rules
          </p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground font-jakarta text-center py-4">
            No page rules created yet
          </p>
        ) : (
          <div className="space-y-4">
            {rules.map((rule) => (
              <Card key={rule.id} className="ke-card ke-card-hover p-4">
                <div className="flex items-start justify-between mb-4">
                  <Input
                    value={rule.name}
                    onChange={(e) => updatePageRule(rule.id, { name: e.target.value })}
                    placeholder="Rule name"
                    className="font-medium"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePageRule(rule.id)}
                    className="hover:bg-accent-subtle hover:text-accent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-foreground font-jakarta mb-1 block">From Page</Label>
                    <Select
                      value={rule.source_page.toString()}
                      onValueChange={(value) => updatePageRule(rule.id, { source_page: parseInt(value) })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: totalPages }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>Page {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-foreground font-jakarta mb-1 block">Action</Label>
                    <Select
                      value={rule.action}
                      onValueChange={(value) => updatePageRule(rule.id, { action: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip_to">Skip To</SelectItem>
                        <SelectItem value="go_to">Go To</SelectItem>
                        <SelectItem value="submit">Submit Form</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-xs text-foreground font-jakarta mb-1 block">To Page</Label>
                    <Select
                      value={rule.target_page?.toString()}
                      onValueChange={(value) => updatePageRule(rule.id, { target_page: parseInt(value) })}
                      disabled={rule.action === 'submit'}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: totalPages }, (_, i) => (
                          <SelectItem key={i + 1} value={(i + 1).toString()}>Page {i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PageRules;
