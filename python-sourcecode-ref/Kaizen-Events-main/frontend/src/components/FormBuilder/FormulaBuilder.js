import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, Trash2, TestTube, Calculator, Variable, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';

const FormulaBuilder = ({ campaignId, fields, pricingRules: initialRules, pricingFormula: initialFormula, onSave }) => {
  const [pricingRules, setPricingRules] = useState(initialRules || []);
  const [testResult, setTestResult] = useState(null);
  const containerRef = useRef(null);

  // Get all fields for reference (excluding section headers)
  const allFields = useMemo(() => fields.filter(f => f.type !== 'section_header'), [fields]);

  // Create a map of field IDs to labels for quick lookup
  const fieldLabelMap = useMemo(() => {
    const map = { 'base_price': 'Base Price' };
    allFields.forEach(f => {
      map[f.id] = f.label || f.id;
    });
    return map;
  }, [allFields]);

  // Parse formula string into tokens (fields, operators, text)
  const parseFormulaToTokens = useCallback((formula) => {
    if (!formula) return [];
    
    const tokens = [];
    const regex = /(\$\{[^}]+\})/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(formula)) !== null) {
      // Add any text before this match
      if (match.index > lastIndex) {
        const text = formula.substring(lastIndex, match.index);
        if (text.trim()) {
          tokens.push({ type: 'text', value: text });
        }
      }
      
      // Add the field reference
      const fieldId = match[1].replace(/\$\{|\}/g, '');
      tokens.push({ 
        type: 'field', 
        fieldId: fieldId,
        label: fieldLabelMap[fieldId] || fieldId
      });
      
      lastIndex = regex.lastIndex;
    }

    // Add any remaining text
    if (lastIndex < formula.length) {
      const text = formula.substring(lastIndex);
      if (text.trim()) {
        tokens.push({ type: 'text', value: text });
      }
    }

    return tokens;
  }, [fieldLabelMap]);

  // Convert tokens back to formula string
  const tokensToFormula = useCallback((tokens) => {
    return tokens.map(token => {
      if (token.type === 'field') {
        return `\${${token.fieldId}}`;
      }
      return token.value;
    }).join('');
  }, []);

  // Initialize tokens from initial formula
  const [tokens, setTokens] = useState(() => parseFormulaToTokens(initialFormula || ''));
  
  // Get the actual formula string from tokens
  const masterFormula = useMemo(() => tokensToFormula(tokens), [tokens, tokensToFormula]);

  // Add a field token
  const addFieldToken = (fieldId) => {
    const label = fieldLabelMap[fieldId] || fieldId;
    setTokens(prev => [...prev, { type: 'field', fieldId, label }]);
  };

  // Add an operator/text token
  const addOperatorToken = (operator) => {
    // If last token is text, append to it
    setTokens(prev => {
      const lastToken = prev[prev.length - 1];
      if (lastToken && lastToken.type === 'text') {
        const updated = [...prev];
        updated[updated.length - 1] = { ...lastToken, value: lastToken.value + operator };
        return updated;
      }
      return [...prev, { type: 'text', value: operator }];
    });
  };

  // Add a function template
  const addFunctionToken = (funcTemplate) => {
    setTokens(prev => [...prev, { type: 'text', value: funcTemplate }]);
  };

  // Remove a token by index
  const removeToken = (index) => {
    setTokens(prev => prev.filter((_, i) => i !== index));
  };

  // Handle keyboard events in the formula area
  const handleKeyDown = (e) => {
    if (e.key === 'Backspace' && tokens.length > 0) {
      // Remove last token
      setTokens(prev => prev.slice(0, -1));
      e.preventDefault();
    }
  };

  // Clear all tokens
  const clearFormula = () => {
    setTokens([]);
    setTestResult(null);
  };

  const addPricingRule = () => {
    const newRule = {
      id: `rule_${Date.now()}`,
      name: 'New Pricing Rule',
      formula: '',
      conditions: [],
      priority: pricingRules.length,
      description: ''
    };
    setPricingRules([...pricingRules, newRule]);
  };

  const updateRule = (ruleId, updates) => {
    setPricingRules(pricingRules.map(r => r.id === ruleId ? { ...r, ...updates } : r));
  };

  const deleteRule = (ruleId) => {
    setPricingRules(pricingRules.filter(r => r.id !== ruleId));
  };

  const testFormula = async (formula) => {
    if (!formula.trim()) {
      toast.error('Please add fields to build a formula');
      return;
    }
    
    try {
      const fieldIds = fields.map(f => f.id);
      const response = await api.post('/formula/validate', {
        formula,
        field_ids: fieldIds
      });

      if (response.data.is_valid) {
        toast.success(`Formula is valid! Test result: ${response.data.result}`);
        setTestResult(response.data.result);
      } else {
        toast.error(`Invalid formula: ${response.data.error}`);
        setTestResult(null);
      }
    } catch (error) {
      toast.error('Failed to validate formula');
      setTestResult(null);
    }
  };

  const saveFormulas = () => {
    onSave({
      pricing_rules: pricingRules,
      pricing_formula: masterFormula
    });
    toast.success('Formulas saved successfully!');
  };

  // Available functions — insert opening only so user can fill args; close manually with ")"
  const availableFunctions = [
    { name: 'sum',   template: 'sum(',   description: 'Add multiple values — close with )' },
    { name: 'avg',   template: 'avg(',   description: 'Calculate average — close with )' },
    { name: 'min',   template: 'min(',   description: 'Minimum value — close with )' },
    { name: 'max',   template: 'max(',   description: 'Maximum value — close with )' },
    { name: 'round', template: 'round(', description: 'Round to integer — close with )' },
    { name: 'if',    template: 'if(',    description: 'If / then / else — close with )' },
  ];

  // Get numeric fields that can be used in formulas
  const numericFields = fields.filter(f =>
    ['number', 'currency', 'percentage', 'slider', 'calculated', 'custom_amount', 'rating'].includes(f.type) ||
    (f.options && f.options.some(o => o.price_modifier))
  );

  return (
    <div className="space-y-6">
      {/* Master Formula Card */}
      <Card className="ke-card p-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="ke-medallion" style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}>
            <Calculator className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <h3 className="ke-section-title text-[15px]">Master Pricing Formula</h3>
        </div>
        <div className="ke-rule-gold mt-2 mb-3" />
        <p className="text-sm text-muted-foreground font-jakarta mb-4">
          Click fields below to add them to your formula. Press backspace to remove the last item.
        </p>
        
        {/* Token-based Formula Input */}
        <div className="space-y-4">
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Formula
            </Label>

            {/* Formula Display Area */}
            <div
              ref={containerRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              className="min-h-[56px] p-3 border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-text flex flex-wrap items-center gap-1.5"
              onClick={() => containerRef.current?.focus()}
              data-testid="formula-input-area"
            >
              {tokens.length === 0 ? (
                <span className="text-muted-foreground text-sm">Click fields below to build your formula...</span>
              ) : (
                tokens.map((token, index) => (
                  token.type === 'field' ? (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-md text-sm font-medium group hover:bg-primary/20 transition-colors"
                    >
                      {token.label}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeToken(index);
                        }}
                        className="ml-0.5 hover:bg-primary/30 rounded p-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
                        data-testid={`remove-token-${index}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : (
                    <span key={index} className="text-foreground text-sm font-mono px-1">
                      {token.value}
                    </span>
                  )
                ))
              )}
              
              {/* Blinking cursor indicator when focused */}
              <span className="w-0.5 h-5 bg-primary animate-pulse" />
            </div>

            {/* Clear button */}
            {tokens.length > 0 && (
              <button
                onClick={clearFormula}
                className="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                Clear formula
              </button>
            )}

            {/* Test Result Display */}
            {testResult !== null && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm text-green-700 font-jakarta font-medium">
                  Test Result: ₹{testResult}
                </span>
              </div>
            )}
          </div>

          {/* Field Selection Buttons */}
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block flex items-center">
              <Variable className="w-4 h-4 mr-1" />
              Click to Insert Field
            </Label>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addFieldToken('base_price')}
                className="border-border hover:border-primary hover:text-primary hover:bg-primary/5 font-medium transition-all"
                data-testid="insert-base-price"
              >
                Base Price
              </Button>
              {numericFields.map((field) => (
                <Button
                  key={field.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFieldToken(field.id)}
                  className="border-border hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                  data-testid={`insert-field-${field.id}`}
                >
                  {field.label || field.id}
                </Button>
              ))}
              {numericFields.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No numeric fields yet. Add a Number / Currency / Percentage / Slider field, or a Dropdown / Radio / Checkbox with priced options.
                </p>
              )}
            </div>
          </div>

          {/* Operator Buttons */}
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Operators
            </Label>
            <div className="flex flex-wrap gap-2">
              {[
                { symbol: ' + ', label: '+' },
                { symbol: ' - ', label: '-' },
                { symbol: ' * ', label: '×' },
                { symbol: ' / ', label: '÷' },
                { symbol: '(', label: '(' },
                { symbol: ')', label: ')' },
                { symbol: ' > ', label: '>' },
                { symbol: ' < ', label: '<' },
                { symbol: ' >= ', label: '≥' },
                { symbol: ' <= ', label: '≤' },
                { symbol: ' == ', label: '=' },
                { symbol: ', ', label: ',' },
              ].map((op) => (
                <Button
                  key={op.symbol}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addOperatorToken(op.symbol)}
                  className="border-border hover:border-primary hover:bg-primary hover:text-primary-foreground min-w-[40px] font-mono text-lg transition-all"
                  data-testid={`insert-op-${op.label}`}
                >
                  {op.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Number Pad — click digits to append to formula */}
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Numbers
            </Label>
            <div className="flex flex-wrap gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '.'].map((digit) => (
                <Button
                  key={digit}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addOperatorToken(digit)}
                  className="border-border hover:border-primary hover:bg-primary hover:text-primary-foreground min-w-[40px] font-mono text-lg transition-all"
                  data-testid={`insert-digit-${digit}`}
                >
                  {digit}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Click digits to type numbers like <code>1</code>, <code>100</code>, or <code>0.5</code>. Useful for defaults: <code>max(1, ${'${people_count}'})</code>.
            </p>
          </div>

          {/* Function Selection */}
          <div>
            <Label className="text-foreground font-jakarta font-medium mb-2 block">
              Insert Function
            </Label>
            <div className="flex flex-wrap gap-2">
              {availableFunctions.map((func) => (
                <Button
                  key={func.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFunctionToken(func.template)}
                  className="border-border hover:border-secondary hover:text-secondary hover:bg-secondary/5 transition-all"
                  title={func.description}
                  data-testid={`insert-func-${func.name}`}
                >
                  {func.name}()
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Clicking a function inserts just the opening — e.g. <code>max(</code>. Add the arguments, then click <code>)</code> from the Operators row to close.
            </p>
          </div>
          
          {/* Test Button */}
          <div className="flex items-center space-x-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => testFormula(masterFormula)}
              className="border-border"
              data-testid="test-formula-btn"
            >
              <TestTube className="w-4 h-4 mr-2" />
              Test Formula
            </Button>
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-4 p-3 bg-muted rounded-lg">
          <p className="text-xs text-muted-foreground font-jakarta mb-2 font-medium">Formula Examples:</p>
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Simple: <code className="bg-card px-1 rounded">[Base Price] + [Quantity] * 100</code></p>
            <p>• With function: <code className="bg-card px-1 rounded">sum([Field 1], [Field 2]) * 1.18</code></p>
            <p>• Conditional: <code className="bg-card px-1 rounded">if([Quantity] {'>'} 10, [Base Price] * 0.9, [Base Price])</code></p>
          </div>
        </div>
      </Card>

      {/* Conditional Pricing Rules */}
      <Card className="ke-card p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="ke-section-title text-[15px]">Conditional Pricing Rules</h3>
          <Button
            onClick={addPricingRule}
            size="sm"
            className="bg-primary hover:bg-primary-hover text-primary-foreground"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
        </div>
        <div className="ke-rule-gold mt-1 mb-4" />

        {pricingRules.length === 0 ? (
          <p className="text-sm text-muted-foreground font-jakarta text-center py-8">
            No pricing rules yet. Click &quot;Add Rule&quot; to create conditional pricing.
          </p>
        ) : (
          <div className="space-y-4">
            {pricingRules.map((rule) => (
              <Card key={rule.id} className="ke-card ke-card-hover p-4">
                <div className="flex items-start justify-between mb-3">
                  <Input
                    value={rule.name}
                    onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                    placeholder="Rule name"
                    className="font-medium max-w-xs"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteRule(rule.id)}
                    className="hover:bg-accent-subtle hover:text-accent"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm text-foreground font-jakarta mb-1 block">Formula</Label>
                    <div className="flex space-x-2">
                      <Input
                        value={rule.formula}
                        onChange={(e) => updateRule(rule.id, { formula: e.target.value })}
                        placeholder="e.g., ${field_1} * 0.1"
                        className="font-mono text-sm flex-1"
                      />
                      <Select
                        onValueChange={(value) => {
                          const newFormula = rule.formula + `\${${value}}`;
                          updateRule(rule.id, { formula: newFormula });
                        }}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="+ Field" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base_price">Base Price</SelectItem>
                          {numericFields.map(f => (
                            <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm text-foreground font-jakarta mb-1 block">Description</Label>
                    <Input
                      value={rule.description}
                      onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                      placeholder="Describe when this rule applies"
                      className="text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-sm text-foreground font-jakarta mb-1 block">Priority (lower = higher priority)</Label>
                    <Input
                      type="number"
                      value={rule.priority}
                      onChange={(e) => updateRule(rule.id, { priority: parseInt(e.target.value) || 0 })}
                      className="text-sm w-24"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Card>

      {/* Save Button — sticky bottom action bar */}
      <div className="sticky bottom-0 -mx-1 px-4 py-3 ke-glass rounded-xl border-t border-border flex justify-end">
        <Button
          onClick={saveFormulas}
          className="font-semibold shadow-sm hover:opacity-90 transition-opacity"
          style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          data-testid="save-formulas-btn"
        >
          Save Formulas
        </Button>
      </div>
    </div>
  );
};

export default FormulaBuilder;
