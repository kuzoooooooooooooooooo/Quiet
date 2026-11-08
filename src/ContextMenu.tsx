import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { t } from './i18n';
export type ContextAction = { label: string; icon: IconName; action: () => void; danger?: boolean };
export type ContextState = { x: number; y: number; target: HTMLElement; actions: ContextAction[] };
export default function ContextMenu({ state, close }: { state: ContextState; close: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current!;
    const rect = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(state.x, innerWidth - rect.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(state.y, innerHeight - rect.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button')?.focus();
  }, [state]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    const dismiss = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [close]);
  return createPortal(
    <div
      ref={menu}
      role="menu"
      aria-label={t('Дії')}
      className="dropdown context-menu"
      style={{ left: state.x, top: state.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          event.stopPropagation();
          close();
          state.target.focus();
          return;
        }
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      {state.actions.map((item) => (
        <button
          role="menuitem"
          key={item.label}
          className={item.danger ? 'danger-text' : ''}
          onClick={() => {
            close();
            state.target.focus();
            item.action();
          }}
        >
          <Icon name={item.icon} size={16} />
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

export function RenameForm({
  value,
  maxLength,
  save,
  cancel,
}: {
  value: string;
  maxLength: number;
  save: (value: string) => void;
  cancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.select();
  }, []);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const next = input.current?.value.trim();
        if (next) save(next);
      }}
    >
      <label className="field">
        {t('Назва')}
        <input ref={input} autoFocus required maxLength={maxLength} defaultValue={value} />
      </label>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={cancel}>
          {t('Скасувати')}
        </button>
        <button className="button primary">{t('Зберегти')}</button>
      </div>
    </form>
  );
}
