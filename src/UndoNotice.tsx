import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { t } from './i18n';
import type { Message } from './i18n';
import type { Workspace } from './model';

export interface UndoAction {
  id: string;
  label: Message;
  restore: (workspace: Workspace) => Workspace;
}

export default function UndoNotice({
  action,
  onUndo,
  onDismiss,
}: {
  action: UndoAction;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => dismiss.current(), 12_000);
    return () => clearTimeout(id);
  }, [paused]);
  useEffect(() => {
    const onVisibility = () =>
      setPaused(
        document.hidden ||
          !!ref.current?.contains(document.activeElement) ||
          !!ref.current?.matches(':hover'),
      );
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
  return (
    <div
      ref={ref}
      className="undo-notice"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() =>
        setPaused(!!ref.current?.contains(document.activeElement) || document.hidden)
      }
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(event.currentTarget.matches(':hover') || document.hidden);
      }}
    >
      <Icon name="trash" size={16} />
      <span>{t(action.label)}</span>
      <button className="undo-button" onClick={onUndo}>
        <Icon name="undo" size={15} />
        {t('Повернути')}
      </button>
      <button className="icon-button" aria-label={t('Закрити повідомлення')} onClick={onDismiss}>
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}
