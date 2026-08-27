import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Password the operator must type to run a critical, hard-to-undo action
 * (restart, factory reset). This is a guard against an accidental press, not a
 * security boundary — it is checked client-side. Matches the console's admin
 * gate so there is one code to remember.
 */
export const CRITICAL_ACTION_PASSWORD = 'admin123';

interface Props {
  open: boolean;
  title: string;
  detail: string;
  /** Label for the confirm button, e.g. "Restart" or "Factory reset". */
  confirmLabel: string;
  /** True colours the confirm button as destructive. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A self-contained modal (portalled to <body>, fixed overlay) so it renders
 * predictably over the measured design canvas. Requires the critical-action
 * password before it will fire onConfirm.
 */
export function PasswordPrompt({
  open,
  title,
  detail,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset and focus each time it opens.
  useEffect(() => {
    if (open) {
      setValue('');
      setError(false);
      // Focus after the portal mounts.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (value === CRITICAL_ACTION_PASSWORD) {
      onConfirm();
    } else {
      setError(true);
      setValue('');
      inputRef.current?.focus();
    }
  };

  const accent = destructive ? '#b3524a' : '#3f7a8c';

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(3, 10, 16, 0.68)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(420px, 92vw)',
          background: '#0f1e28',
          border: `1px solid ${accent}`,
          borderRadius: 12,
          padding: '22px 22px 18px',
          color: '#dbe9ef',
          font: '400 15px/1.5 system-ui, sans-serif',
          boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        }}
      >
        <h2 style={{ margin: '0 0 8px', font: '600 18px/1.2 system-ui, sans-serif' }}>
          {title}
        </h2>
        <p style={{ margin: '0 0 16px', color: '#a9c1cc' }}>{detail}</p>

        <label
          style={{
            display: 'block',
            font: '600 12px/1 system-ui, sans-serif',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: '#87a3af',
            marginBottom: 6,
          }}
        >
          Administrator password
        </label>
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          aria-invalid={error}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            borderRadius: 8,
            border: `1px solid ${error ? '#e06a5c' : '#33505c'}`,
            background: '#0a161d',
            color: '#eaf3f7',
            font: '400 15px/1.2 system-ui, sans-serif',
          }}
        />
        {error && (
          <p style={{ margin: '8px 0 0', color: '#f0a79f', font: '400 13px/1.3 system-ui' }}>
            Incorrect password.
          </p>
        )}

        <div
          style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: '1px solid #33505c',
              background: 'transparent',
              color: '#cfe0e7',
              font: '600 14px/1 system-ui, sans-serif',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            style={{
              padding: '9px 16px',
              borderRadius: 8,
              border: `1px solid ${accent}`,
              background: accent,
              color: '#fff',
              font: '600 14px/1 system-ui, sans-serif',
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
