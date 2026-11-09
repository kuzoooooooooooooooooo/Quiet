import type { Note } from './model';
import { t } from './i18n';
import { Icon } from './Icon';
import ActionMenu from './ActionMenu';
export default function Notes({
  notes,
  selected,
  onSelect,
  onCreate,
  onChange,
  onRename,
  onDelete,
}: {
  notes: Note[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onChange: (id: string, patch: Partial<Pick<Note, 'title' | 'content'>>) => void;
  onRename: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const active = notes.find((note) => note.id === selected) ?? notes[0];
  return (
    <main className="main-content notes-page">
      <div className="content-heading">
        <h1>{t('Нотатки')}</h1>
        <button className="button primary" onClick={onCreate}>
          <Icon name="plus" size={16} />
          {t('Створити нотатку')}
        </button>
      </div>
      {!!notes.length && (
        <div className="notes-layout">
          <aside className="note-list" aria-label={t('Нотатки')}>
            {notes.map((note) => (
              <button
                key={note.id}
                className={`note-item ${active?.id === note.id ? 'active' : ''}`}
                onClick={() => onSelect(note.id)}
                data-context-kind="note"
                data-context-id={note.id}
              >
                <strong>{note.title}</strong>
                <small>{note.content.split('\n').find((line) => line.trim()) || '\u00a0'}</small>
              </button>
            ))}
          </aside>
          {active && (
            <article className="plain-note">
              <div className="plain-note-heading">
                <input
                  aria-label={t('Назва нотатки')}
                  maxLength={200}
                  value={active.title}
                  onChange={(event) =>
                    onChange(active.id, {
                      title: event.target.value.trim() ? event.target.value : t('Нова нотатка'),
                    })
                  }
                />
                <ActionMenu
                  label={t('Дії нотатки')}
                  items={[
                    { label: t('Перейменувати'), icon: 'edit', action: () => onRename(active) },
                    {
                      label: t('Видалити нотатку'),
                      icon: 'trash',
                      danger: true,
                      action: () => onDelete(active),
                    },
                  ]}
                />
              </div>
              <textarea
                key={active.id}
                aria-label={t('Текст нотатки')}
                value={active.content}
                maxLength={1000000}
                onChange={(event) => onChange(active.id, { content: event.target.value })}
              />
            </article>
          )}
        </div>
      )}
    </main>
  );
}
