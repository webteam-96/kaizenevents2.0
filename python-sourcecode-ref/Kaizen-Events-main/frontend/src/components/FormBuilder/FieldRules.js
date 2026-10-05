import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, Trash2, ChevronDown, ChevronRight, Save, Workflow } from 'lucide-react';
import { toast } from 'sonner';

const FieldRules = ({ fields, fieldRules, onUpdate, onSave, saving = false }) => {
  const [rules, setRules] = useState(fieldRules || []);
  // Initialize expanded rules - first rule is expanded by default
  const [expandedRules, setExpandedRules] = useState(() => {
    const initial = fieldRules && fieldRules.length > 0 ? new Set([fieldRules[0].id]) : new Set();
    return initial;
  });

  // Get available fields for an action. A field may be targeted by multiple rules, so we
  // do NOT exclude targets used in other rules. We only prevent the same field appearing
  // twice in the actions of the SAME rule (which would be contradictory/redundant).
  const getAvailableTargets = (currentRuleId, currentActionIndex) => {
    const usedTargets = new Set();
    const currentRule = rules.find(r => r.id === currentRuleId);

    currentRule?.actions?.forEach((action, idx) => {
      if (idx !== currentActionIndex && action.target_field_id) {
        usedTargets.add(action.target_field_id);
      }
    });

    return fields.filter(f => !usedTargets.has(f.id));
  };

  // Calculate the next rule number based on existing rules
  const getNextRuleNumber = () => {
    const existingNumbers = rules
      .map(r => {
        const match = r.name?.match(/Field Rule (\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => n > 0);
    
    return existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  };

  const addRule = () => {
    const ruleNumber = getNextRuleNumber();
    const newRule = {
      id: `rule_${Date.now()}`,
      name: `Field Rule ${ruleNumber}`,
      conditions: [{
        field_id: '',
        operator: 'equals',
        value: ''
      }],
      match_type: 'all',
      actions: [{
        action: 'show',
        target_field_id: ''
      }]
    };
    
    // Add new rule at the beginning (top)
    const updated = [newRule, ...rules];
    setRules(updated);
    onUpdate(updated);
    
    // Expand only the new rule, collapse others
    setExpandedRules(new Set([newRule.id]));
    
    toast.success(`Field Rule ${ruleNumber} created`);
  };

  const deleteRule = (ruleId) => {
    const updated = rules.filter(r => r.id !== ruleId);
    setRules(updated);
    onUpdate(updated);
    
    // Remove from expanded set
    const newExpanded = new Set(expandedRules);
    newExpanded.delete(ruleId);
    setExpandedRules(newExpanded);
    
    toast.success('Rule deleted');
  };

  const toggleRuleExpansion = (ruleId) => {
    const newExpanded = new Set(expandedRules);
    if (newExpanded.has(ruleId)) {
      newExpanded.delete(ruleId);
    } else {
      newExpanded.add(ruleId);
    }
    setExpandedRules(newExpanded);
  };

  const updateRule = (ruleId, updates) => {
    const updated = rules.map(r => r.id === ruleId ? { ...r, ...updates } : r);
    setRules(updated);
    onUpdate(updated);
  };

  const addCondition = (ruleId) => {
    const rule = rules.find(r => r.id === ruleId);
    const newCondition = {
      field_id: '',
      operator: 'equals',
      value: ''
    };
    updateRule(ruleId, {
      conditions: [...rule.conditions, newCondition]
    });
  };

  const removeCondition = (ruleId, condIndex) => {
    const rule = rules.find(r => r.id === ruleId);
    if (rule.conditions.length <= 1) {
      toast.error('At least one condition is required');
      return;
    }
    const updatedConditions = rule.conditions.filter((_, i) => i !== condIndex);
    updateRule(ruleId, { conditions: updatedConditions });
  };

  const updateCondition = (ruleId, condIndex, updates) => {
    const rule = rules.find(r => r.id === ruleId);
    const updatedConditions = rule.conditions.map((c, i) => 
      i === condIndex ? { ...c, ...updates } : c
    );
    updateRule(ruleId, { conditions: updatedConditions });
  };

  const addAction = (ruleId) => {
    const rule = rules.find(r => r.id === ruleId);
    const newAction = {
      action: 'show',
      target_field_id: ''
    };
    updateRule(ruleId, {
      actions: [...rule.actions, newAction]
    });
  };

  const removeAction = (ruleId, actionIndex) => {
    const rule = rules.find(r => r.id === ruleId);
    if (rule.actions.length <= 1) {
      toast.error('At least one action is required');
      return;
    }
    const updatedActions = rule.actions.filter((_, i) => i !== actionIndex);
    updateRule(ruleId, { actions: updatedActions });
  };

  const updateAction = (ruleId, actionIndex, updates) => {
    const rule = rules.find(r => r.id === ruleId);
    const updatedActions = rule.actions.map((a, i) => 
      i === actionIndex ? { ...a, ...updates } : a
    );
    updateRule(ruleId, { actions: updatedActions });
  };

  // Get a summary of the rule for collapsed view
  const getRuleSummary = (rule) => {
    const conditionField = fields.find(f => f.id === rule.conditions?.[0]?.field_id);
    const targetField = fields.find(f => f.id === rule.actions?.[0]?.target_field_id);
    
    if (!conditionField || !targetField) {
      return 'Incomplete rule - click to configure';
    }
    
    const operator = rule.conditions?.[0]?.operator?.replace(/_/g, ' ') || 'equals';
    const action = rule.actions?.[0]?.action || 'show';
    
    return `If "${conditionField.label}" ${operator}${rule.conditions[0].value ? ` "${rule.conditions[0].value}"` : ''} → ${action} "${targetField.label}"`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="ke-medallion flex-shrink-0"
            style={{ background: 'linear-gradient(150deg, hsl(var(--accent) / 0.18), transparent 85%)' }}
          >
            <Workflow className="w-5 h-5" style={{ color: 'hsl(var(--accent))' }} />
          </span>
          <div>
            <h3 className="ke-section-title text-[15px]">Field Rules</h3>
            <div className="ke-rule-gold mt-2 mb-2" />
            <p className="text-sm text-muted-foreground font-jakarta">
              Create conditional logic to show, hide, or modify fields based on user input
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={addRule}
            size="sm"
            className="bg-primary hover:bg-primary-hover text-primary-foreground"
            data-testid="add-field-rule-btn"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Rule
          </Button>
          <Button
            onClick={() => onSave?.()}
            disabled={saving}
            size="sm"
            variant="outline"
            className="border-primary text-primary hover:bg-primary-subtle"
            data-testid="save-field-rules-btn"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Rules'}
          </Button>
        </div>
      </div>

      {rules.length === 0 ? (
        <Card className="ke-card p-12 text-center">
          <p className="text-muted-foreground font-jakarta mb-4">
            No field rules created yet
          </p>
          <Button onClick={addRule} variant="outline" data-testid="create-first-rule-btn">
            Create Your First Rule
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, ruleIndex) => {
            const isExpanded = expandedRules.has(rule.id);
            
            return (
              <Card
                key={rule.id}
                className="ke-card ke-card-hover overflow-hidden"
                style={isExpanded ? { borderColor: 'hsl(var(--accent) / 0.45)' } : undefined}
                data-testid={`field-rule-${ruleIndex}`}
              >
                {/* Collapsed Header */}
                <div 
                  className={`flex items-center justify-between p-4 cursor-pointer hover:bg-muted transition-colors ${
                    isExpanded ? 'border-b border-border' : ''
                  }`}
                  onClick={() => toggleRuleExpansion(rule.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-foreground font-jakarta truncate">
                        {rule.name}
                      </h4>
                      {!isExpanded && (
                        <p className="text-sm text-muted-foreground font-jakarta truncate mt-0.5">
                          {getRuleSummary(rule)}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteRule(rule.id);
                    }}
                    className="hover:bg-muted hover:text-destructive flex-shrink-0"
                    data-testid={`delete-rule-${ruleIndex}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-6 pt-4">
                    {/* Rule Name */}
                    <div className="mb-6">
                      <Label className="text-sm font-jakarta font-medium text-foreground mb-2 block">
                        Rule Name
                      </Label>
                      <Input
                        value={rule.name}
                        onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                        placeholder="Rule name"
                        className="font-medium"
                        data-testid={`rule-name-input-${ruleIndex}`}
                      />
                    </div>

                    {/* Conditions */}
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <Label className="text-sm font-jakarta font-medium text-foreground">
                          When (Conditions)
                        </Label>
                        <Select
                          value={rule.match_type}
                          onValueChange={(value) => updateRule(rule.id, { match_type: value })}
                        >
                          <SelectTrigger className="w-32 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All match</SelectItem>
                            <SelectItem value="any">Any match</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-3">
                        {rule.conditions.map((condition, condIndex) => (
                          <div key={condIndex} className="flex items-center gap-2">
                            <div className="grid grid-cols-12 gap-2 flex-1">
                              <div className="col-span-4">
                                <Select
                                  value={condition.field_id}
                                  onValueChange={(value) => updateCondition(rule.id, condIndex, { field_id: value, value: '' })}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {fields.map(f => (
                                      <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="col-span-3">
                                <Select
                                  value={condition.operator}
                                  onValueChange={(value) => updateCondition(rule.id, condIndex, { operator: value })}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="equals">Equals</SelectItem>
                                    <SelectItem value="not_equals">Not Equals</SelectItem>
                                    <SelectItem value="contains">Contains</SelectItem>
                                    <SelectItem value="greater_than">Greater Than</SelectItem>
                                    <SelectItem value="less_than">Less Than</SelectItem>
                                    <SelectItem value="is_empty">Is Empty</SelectItem>
                                    <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="col-span-5">
                                {(() => {
                                  const needsValue = condition.operator !== 'is_empty' && condition.operator !== 'is_not_empty';
                                  if (!needsValue) {
                                    return (
                                      <div className="h-10 flex items-center text-sm text-muted-foreground italic px-3">
                                        No value needed
                                      </div>
                                    );
                                  }

                                  // If the selected field has options (dropdown/radio/checkbox), show them as a Select
                                  const selectedField = fields.find(f => f.id === condition.field_id);
                                  const hasOptions = selectedField
                                    && ['dropdown', 'radio', 'checkbox'].includes(selectedField.type)
                                    && Array.isArray(selectedField.options)
                                    && selectedField.options.length > 0;

                                  if (hasOptions) {
                                    return (
                                      <Select
                                        value={condition.value}
                                        onValueChange={(value) => updateCondition(rule.id, condIndex, { value })}
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder="Select value" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {selectedField.options.map(opt => (
                                            <SelectItem key={opt.value} value={opt.value}>
                                              {opt.label || opt.value}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    );
                                  }

                                  return (
                                    <Input
                                      value={condition.value}
                                      onChange={(e) => updateCondition(rule.id, condIndex, { value: e.target.value })}
                                      placeholder="Value"
                                    />
                                  );
                                })()}
                              </div>
                            </div>
                            
                            {rule.conditions.length > 1 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeCondition(rule.id, condIndex)}
                                className="hover:bg-muted hover:text-destructive h-10 w-10 p-0"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addCondition(rule.id)}
                        className="mt-3 border-border"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Condition
                      </Button>
                    </div>

                    {/* Actions */}
                    <div>
                      <Label className="text-sm font-jakarta font-medium text-foreground mb-3 block">
                        Then (Actions)
                      </Label>

                      <div className="space-y-3">
                        {rule.actions.map((action, actionIndex) => {
                          // Get available targets for this action (excludes fields already targeted in other rules)
                          const availableTargets = getAvailableTargets(rule.id, actionIndex);
                          
                          // Check if current target is still valid
                          const currentTargetValid = action.target_field_id && 
                            (availableTargets.some(f => f.id === action.target_field_id) || 
                             fields.some(f => f.id === action.target_field_id));

                          return (
                            <div key={actionIndex} className="flex items-center gap-2">
                              <div className="grid grid-cols-2 gap-2 flex-1">
                                <Select
                                  value={action.action}
                                  onValueChange={(value) => {
                                    // A target field may be reused across rules — just update the action type.
                                    updateAction(rule.id, actionIndex, { action: value });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="show">Show Field</SelectItem>
                                    <SelectItem value="hide">Hide Field</SelectItem>
                                    <SelectItem value="require">Make Required</SelectItem>
                                    <SelectItem value="enable">Enable Field</SelectItem>
                                    <SelectItem value="disable">Disable Field</SelectItem>
                                    <SelectItem value="set_value">Set Value</SelectItem>
                                  </SelectContent>
                                </Select>

                                <Select
                                  value={currentTargetValid ? action.target_field_id : ''}
                                  onValueChange={(value) => updateAction(rule.id, actionIndex, { target_field_id: value })}
                                >
                                  <SelectTrigger className={!currentTargetValid && action.target_field_id ? 'border-amber-300' : ''}>
                                    <SelectValue placeholder="Target field" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {availableTargets.length > 0 ? (
                                      availableTargets.map(f => (
                                        <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>
                                      ))
                                    ) : (
                                      <div className="px-2 py-1.5 text-sm text-muted-foreground italic">
                                        All fields already have rules assigned
                                      </div>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              
                              {rule.actions.length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeAction(rule.id, actionIndex)}
                                  className="hover:bg-muted hover:text-destructive h-10 w-10 p-0"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => addAction(rule.id)}
                        className="mt-3 border-border"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Action
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Sticky action bar — mirrors the header "Save Rules" action so it stays
          reachable at the bottom of a long list of rules. Layout only. */}
      <div className="ke-glass sticky bottom-0 -mx-1 mt-2 flex items-center justify-end gap-2 rounded-xl px-3 py-3">
        <Button
          onClick={addRule}
          size="sm"
          variant="outline"
          className="border-border"
          data-testid="add-field-rule-btn-sticky"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </Button>
        <Button
          onClick={() => onSave?.()}
          disabled={saving}
          size="sm"
          className="hover:brightness-95"
          style={{ background: 'hsl(var(--accent))', color: '#091D40' }}
          data-testid="save-field-rules-btn-sticky"
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Rules'}
        </Button>
      </div>
    </div>
  );
};

export default FieldRules;
