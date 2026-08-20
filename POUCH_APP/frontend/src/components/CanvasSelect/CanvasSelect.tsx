import { useEffect, useRef, useState } from 'react';

import './CanvasSelect.scss';

export interface CanvasSelectOption {
  value: string;
  label: string;
}

interface CanvasSelectProps {
  value: string;
  options: CanvasSelectOption[];
  onChange: (value: string) => void;
  /** Applied to the root; existing select styling (position/size/chevron) reuses. */
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
}

/**
 * A dropdown that lives entirely inside the scaled 1920x1200 canvas.
 *
 * Native <select> popups are OS windows: they ignore the canvas's
 * transform: scale() and render at raw design-pixel sizes multiplied by the OS
 * display scaling — on the bench that produced a full-screen dropdown. This
 * renders its menu as a normal absolutely-positioned element, so it scales with
 * everything else.
 */
export function CanvasSelect({
  value,
  options,
  onChange,
  className = '',
  disabled = false,
  placeholder = '—',
  id,
  ariaLabel,
}: CanvasSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;

  return (
    <div ref={rootRef} id={id} className={`canvas-select ${className}`}>
      <button
        type="button"
        className="canvas-select__control"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="canvas-select__value">
          {selected?.label ?? placeholder}
        </span>
      </button>

      {open && (
        <ul className="canvas-select__menu" role="listbox">
          <li
            role="option"
            aria-selected={selected === null}
            className={`canvas-select__option${selected === null ? ' is-selected' : ''}`}
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {placeholder}
          </li>
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`canvas-select__option${
                option.value === value ? ' is-selected' : ''
              }`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
