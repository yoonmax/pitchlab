import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { X } from 'lucide-react';
import { prefersReducedMotion } from '../board/camera.js';
import { SWATCHES } from '../core/pitch/themes.js';
import { useEditor } from '../state/editorStore.js';

export function Wordmark({ size = 18 }) {
  return (
    <span className="wordmark" aria-label="pitchlab" style={{ fontSize: size }}>
      <svg viewBox="0 0 24 24" width={size * 1.15} height={size * 1.15} aria-hidden="true">
        <path d="M12 2.5v19" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.2" fill="var(--ball)" />
      </svg>
      <span aria-hidden="true">pitchlab</span>
    </span>
  );
}

export function IconButton({ icon: Icon, label, active, onClick, disabled, shortcut, size = 16, className = '', ...rest }) {
  return (
    <button
      type="button" className={`iconbtn ${active ? 'is-active' : ''} ${className}`} aria-label={label} aria-pressed={active === undefined ? undefined : active}
      title={shortcut ? `${label} (${shortcut})` : label} onClick={onClick} disabled={disabled} {...rest}
    >
      <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}

export function Field({ label, children, hint, htmlFor }) {
  const autoId = useId();
  const isInput = isValidElement(children) && (children.type === TextInput || children.type === NumberInput);
  const needsId = isInput && !children.props.id && !htmlFor;
  const control = needsId ? cloneElement(children, { id: autoId }) : children;
  const target = htmlFor ?? (needsId ? autoId : isInput ? children.props.id : null);
  return (
    <div className="field">
      {target ? <label className="field-label" htmlFor={target}>{label}</label> : <span className="field-label">{label}</span>}
      {control}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

/** A segmented control: one choice, always visible. */
export function Segmented({ value, onChange, options, label, small }) {
  return (
    <div className={`seg ${small ? 'seg-sm' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'is-on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberInput({ value, onCommit, min, max, step = 0.1, id, unit, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = fmt(value);
  }, [value]);
  const commit = () => {
    const n = Number(ref.current.value);
    if (!Number.isFinite(n)) { ref.current.value = fmt(value); return; }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    ref.current.value = fmt(clamped);
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <span className="numinput">
      <input
        ref={ref} id={id} type="number" inputMode="decimal" defaultValue={fmt(value)} step={step} min={min} max={max} aria-label={label}
        onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { commit(); e.target.blur(); } e.stopPropagation(); }}
      />
      {unit && <span aria-hidden="true">{unit}</span>}
    </span>
  );
}

const fmt = (v) => (v == null || Number.isNaN(v) ? '' : +(+v).toFixed(2));

export function TextInput({ value, onCommit, id, placeholder, multiline, rows = 3, maxLength, label }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = value ?? '';
  }, [value]);
  const commit = () => { if (ref.current.value !== (value ?? '')) onCommit(ref.current.value); };
  const common = {
    ref, id, placeholder, maxLength, defaultValue: value ?? '', onBlur: commit, className: 'input', 'aria-label': label,
    onKeyDown: (e) => { if (e.key === 'Enter' && !multiline) { commit(); e.target.blur(); } if (e.key === 'Escape') { e.target.value = value ?? ''; e.target.blur(); } e.stopPropagation(); },
  };
  return multiline ? <textarea rows={rows} {...common} /> : <input type="text" {...common} />;
}

export function ColorField({ value, onChange, fallback, label = 'Colour', allowReset = true }) {
  const current = value ?? fallback;
  return (
    <div className="colorfield" role="group" aria-label={label}>
      {SWATCHES.map((c) => (
        <button key={c} type="button" className={`swatch ${current?.toLowerCase() === c ? 'is-on' : ''}`} style={{ background: c }} aria-label={`${label}: ${c}`} aria-pressed={current?.toLowerCase() === c} onClick={() => onChange(c)} />
      ))}
      <label className="swatch swatch-custom" title="Custom colour">
        <input type="color" value={current ?? '#ffffff'} aria-label={`${label}: custom`} onChange={(e) => onChange(e.target.value)} />
      </label>
      {allowReset && value && <button type="button" className="linkbtn" onClick={() => onChange(null)}>Reset</button>}
    </div>
  );
}

export function Check({ checked, onChange, children, id }) {
  return (
    <label className="check" htmlFor={id}>
      <input id={id} type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="section-title">
      <h3>{children}</h3>
      {action}
    </div>
  );
}

/** Slides a panel in when it mounts. Skips the motion if the user prefers none. */
export function usePanelEntrance(ref, from = { x: 12 }, deps = []) {
  useLayoutEffect(() => {
    if (!ref.current || prefersReducedMotion()) return undefined;
    const tween = gsap.from(ref.current, { ...from, opacity: 0, duration: 0.22, ease: 'power2.out', clearProps: 'all' });
    return () => tween.kill();
  }, deps);
}

export function Modal({ title, onClose, children, width = 520, footer }) {
  const panel = useRef(null);
  const previous = useRef(null);
  useLayoutEffect(() => {
    previous.current = document.activeElement;
    panel.current?.focus();
    if (!prefersReducedMotion()) {
      gsap.from(panel.current, { y: 10, opacity: 0, duration: 0.2, ease: 'power2.out', clearProps: 'transform,opacity' });
    }
    return () => previous.current?.focus?.();
  }, []);
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key === 'Tab') {
      const focusable = panel.current.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    e.stopPropagation();
  };
  return (
    <div className="modal-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onKey}>
        <header className="modal-head">
          <h2>{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts);
  const dismiss = useEditor((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'warn' ? 'is-warn' : ''}`}>
          <span>{t.message}</span>
          {t.action && <button type="button" className="toast-action" onClick={() => { t.action.run(); dismiss(t.id); }}>{t.action.label}</button>}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}
