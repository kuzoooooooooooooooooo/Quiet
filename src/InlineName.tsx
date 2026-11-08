import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export default function InlineName({
  value,
  label,
  onSave,
  maxLength = 500,
}: {
  value: string;
  label: string;
  onSave: (value: string) => void;
  maxLength?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    }
  }, [editing]);

  function finish(cancel: boolean, restoreFocus = false) {
    if (finished.current) return;
    finished.current = true;
    const next = draft.trim();
    if (!cancel && next && next !== value) onSave(next);
    setEditing(false);
    if (restoreFocus) setTimeout(() => trigger.current?.focus(), 0);
  }

  return editing ? (
    <input
      ref={input}
      className="inline-name-input"
      aria-label={label}
      value={draft}
      maxLength={maxLength}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' || event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === 'Escape', true);
        }
      }}
    />
  ) : (
    <button
      ref={trigger}
      className="inline-name-button"
      aria-label={label}
      title={label}
      onClick={() => {
        finished.current = false;
        setDraft(value);
        setEditing(true);
      }}
    >
      <span>{value}</span>
      <Icon name="edit" size={14} />
    </button>
  );
}
