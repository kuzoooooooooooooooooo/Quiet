import type { Note } from './model';
import { t } from './i18n';
import { Icon } from './Icon';
import ActionMenu from './ActionMenu';
import RichEditor from './RichEditor';
import { documentText, plainTextHtml } from './documentHtml';
import { usePreferences } from './preferences';
export default function Notes({
  embedded = false,
  notes,
  selected,
  onSelect,
  onCreate,
  onChange,
  onRename,
  onDelete,
}: {
  embedded?: boolean;
  notes: Note[];
  selected: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onChange: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'format'>>) => void;
  onRename: (note: Note) => void;
  onDelete: (note: Note) => void;
}) {
  const { autoFormat } = usePreferences();
  const active = notes.find((note) => note.id === selected) ?? notes[0];
  const Root = embedded ? 'section' : 'main';
  return (
    <Root className={embedded ? 'notes-page embedded-notes' : 'main-content notes-page'}>
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
                <small>
                  {documentText(note)
                    .split('\n')
                    .find((line) => line.trim()) || '\u00a0'}
                </small>
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
              <RichEditor
                key={active.id}
                label={t('Текст нотатки')}
                compact
                autoFormat={autoFormat}
                content={active.format === 'html' ? active.content : plainTextHtml(active.content)}
                onChange={(content) => onChange(active.id, { content, format: 'html' })}
              />
            </article>
          )}
        </div>
      )}
    </Root>
  );
}
