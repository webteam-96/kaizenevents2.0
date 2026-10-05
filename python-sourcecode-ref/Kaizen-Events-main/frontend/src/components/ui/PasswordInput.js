import React, { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from './input';

/**
 * PasswordInput — wraps the standard <Input> with a show/hide eye toggle.
 *
 * Security defaults (per docs/SECURITY.md):
 *  - Always starts hidden (type="password")
 *  - Toggling swaps the same input's `type`, not a separate element →
 *    preserves Chrome/1Password autofill compatibility
 *  - Auto-hides again on blur so a revealed password never lingers
 *  - Eye button has aria-label + tabIndex=-1 so keyboard nav goes
 *    submit → next field, not into the toggle
 *
 * Props: all standard <Input> props pass through (value, onChange,
 * placeholder, disabled, required, autoFocus, className, etc.).
 */
const PasswordInput = forwardRef(({ className = '', onBlur, ...rest }, ref) => {
  const [visible, setVisible] = useState(false);

  const handleBlur = (e) => {
    setVisible(false);   // never linger
    onBlur?.(e);
  };

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        onBlur={handleBlur}
        className={`pr-10 ${className}`}
        {...rest}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
      >
        {visible
          ? <EyeOff className="w-4 h-4" />
          : <Eye    className="w-4 h-4" />}
      </button>
    </div>
  );
});

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
