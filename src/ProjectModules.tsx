import { useEffect, useRef, useState } from 'react';
import type { ProjectKit, ModuleId, Snippet, Sheet, Sort } from './projectKit';
import { arrange, moduleIds, moduleLabels, defaultModules } from './projectKit';
import { now, uid } from './model';
import type { Note } from './model';
import { t } from './i18n';
import Notes from './Notes';
import ContextMenu from './ContextMenu';
import type { ContextState } from './ContextMenu';
import { Icon } from './Icon';
import { downloadBlob } from './storage';

export function ModulePicker({
  value,
  onChange,
}: {
  value: ModuleId[];
  onChange: (ids: ModuleId[]) => void;
}) {
  return (
    <fieldset className="module-picker">
      <legend>{t('Модулі проєкту')}</legend>
      <div className="module-presets">
        <button type="button" onClick={() => onChange([...defaultModules])}>
          {t('Стандартний набір')}
        </button>
        <button type="button" onClick={() => onChange([])}>
          {t('Порожній проєкт')}
        </button>
      </div>
      <div className="module-options">
        {moduleIds.map((id) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={value.includes(id)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, id] : value.filter((x) => x !== id))
              }
            />
            {t(moduleLabels[id])}
          </label>
        ))}
      </div>
      <small>{t('Приховані модулі зберігають вміст.')}</small>
    </fieldset>
  );
}
export function SortControl({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  return (
    <select
      className="sort-control"
      aria-label={t('Сортування')}
      value={value}
      onChange={(e) => onChange(e.target.value as Sort)}
    >
      <option value="manual">{t('Власний порядок')}</option>
      <option value="name">{t('За назвою')}</option>
      <option value="newest">{t('Спочатку нові')}</option>
    </select>
  );
}
export function reorder(
  kit: ProjectKit,
  kind: ModuleId,
  ids: string[],
  id: string,
  delta: number,
): ProjectKit {
  const at = ids.indexOf(id),
    next = at + delta;
  if (at < 0 || next < 0 || next >= ids.length) return kit;
  const order = [...ids];
  [order[at], order[next]] = [order[next], order[at]];
  return {
    ...kit,
    preferences: {
      ...kit.preferences,
      sort: { ...kit.preferences.sort, [kind]: 'manual' },
      order: { ...kit.preferences.order, [kind]: order },
    },
  };
}
export default function ProjectModules({
  kind,
  kit,
  onChange,
  onRemove,
  notify,
  onCreateTable,
}: {
  kind: 'notes' | 'snippets' | 'tables';
  kit: ProjectKit;
  onChange: (kit: ProjectKit) => void;
  onRemove: (kind: 'notes' | 'snippets' | 'tables', id: string) => void;
  notify: (message: string) => void;
  onCreateTable: () => void;
}) {
  const [context, setContext] = useState<ContextState | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const rows = arrange<Note | Snippet | Sheet>(kit[kind], kit, kind);
  const active = rows.find((r) => r.id === kit.preferences.active?.[kind]) ?? rows[0];
  useEffect(() => setPage(0), [active?.id]);
  const select = (id: string) => {
    setPage(0);
    onChange({
      ...kit,
      preferences: { ...kit.preferences, active: { ...kit.preferences.active, [kind]: id } },
    });
  };
  const patch = (id: string, value: Partial<Note | Snippet | Sheet>) =>
    onChange({
      ...kit,
      [kind]: kit[kind].map((r) => (r.id === id ? { ...r, ...value, updatedAt: now() } : r)),
    });
  const move = (id: string, delta: number) =>
    onChange(
      reorder(
        kit,
        kind,
        rows.map((r) => r.id),
        id,
        delta,
      ),
    );
  const rename = (id: string) => {
    select(id);
    requestAnimationFrame(() => {
      const input = root.current?.querySelector<HTMLInputElement>(
        '.kit-title,.plain-note-heading input',
      );
      input?.focus();
      input?.select();
    });
  };
  const create = () => {
    if (kind === 'tables') {
      onCreateTable();
      return;
    }
    const stamp = now(),
      base = {
        id: uid(),
        title: t(kind === 'notes' ? 'Нова нотатка' : 'Новий фрагмент коду'),
        createdAt: stamp,
        updatedAt: stamp,
      };
    const row =
      kind === 'notes' ? { ...base, content: '' } : { ...base, content: '', language: 'text' };
    onChange({
      ...kit,
      [kind]: [row, ...kit[kind]],
      preferences: { ...kit.preferences, active: { ...kit.preferences.active, [kind]: row.id } },
    });
    setPage(0);
  };
  const menu = (target: HTMLElement, x: number, y: number) => {
    if (target.closest('input,textarea,[contenteditable]')) return false;
    const element = target.closest<HTMLElement>('[data-kit-id],[data-context-kind="note"]');
    const id = element?.dataset.kitId ?? element?.dataset.contextId;
    if (!element || !id) return false;
    setContext({
      x,
      y,
      target: element,
      actions: [
        { label: t('Відкрити'), icon: 'file', action: () => select(id) },
        { label: t('Перейменувати'), icon: 'edit', action: () => rename(id) },
        { label: t('Вище'), icon: 'arrow', action: () => move(id, -1) },
        { label: t('Нижче'), icon: 'arrow', action: () => move(id, 1) },
        { label: t('Видалити'), icon: 'trash', danger: true, action: () => onRemove(kind, id) },
      ],
    });
    return true;
  };
  const controls = (
    <div className="collection-tools">
      <SortControl
        value={kit.preferences.sort?.[kind] ?? 'manual'}
        onChange={(sort) =>
          onChange({
            ...kit,
            preferences: { ...kit.preferences, sort: { ...kit.preferences.sort, [kind]: sort } },
          })
        }
      />
      {active && (
        <>
          <button
            className="icon-button"
            aria-label={t('Вище')}
            disabled={rows[0]?.id === active.id}
            onClick={() => move(active.id, -1)}
          >
            ↑
          </button>
          <button
            className="icon-button"
            aria-label={t('Нижче')}
            disabled={rows.at(-1)?.id === active.id}
            onClick={() => move(active.id, 1)}
          >
            ↓
          </button>
          <button
            className="icon-button"
            aria-label={t('Видалити')}
            onClick={() => onRemove(kind, active.id)}
          >
            <Icon name="trash" size={16} />
          </button>
        </>
      )}
    </div>
  );
  const sheet = kind === 'tables' ? (active as Sheet | undefined) : undefined;
  const currentPage = Math.min(page, Math.max(0, Math.ceil((sheet?.rows.length ?? 0) / 25) - 1));
  const copy = async () => {
    try {
      await navigator.clipboard.writeText((active as Snippet).content);
      notify(t('Скопійовано.'));
    } catch {
      notify(t('Не вдалося скопіювати.'));
    }
  };
  return (
    <div
      className="kit-module"
      ref={root}
      onContextMenu={(e) => {
        if (menu(e.target as HTMLElement, e.clientX, e.clientY)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyDown={(e) => {
        if (e.shiftKey && e.key === 'F10') {
          const r = (e.target as HTMLElement).getBoundingClientRect();
          if (menu(e.target as HTMLElement, r.left, r.bottom)) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }}
    >
      {controls}
      {kind === 'notes' ? (
        <Notes
          embedded
          notes={rows as Note[]}
          selected={active?.id ?? null}
          onSelect={select}
          onCreate={create}
          onChange={patch}
          onRename={(note) => rename(note.id)}
          onDelete={(note) => onRemove(kind, note.id)}
        />
      ) : (
        <>
          <div className="content-heading">
            <h2>{t(moduleLabels[kind])}</h2>
            <button className="button primary" onClick={create}>
              <Icon name="plus" size={16} />
              {t(kind === 'snippets' ? 'Новий фрагмент' : 'Нова таблиця')}
            </button>
          </div>
          {!!rows.length && (
            <div className="kit-layout">
              <aside className="kit-list">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    data-kit-id={row.id}
                    className={row.id === active?.id ? 'active' : ''}
                    onClick={() => select(row.id)}
                  >
                    {row.title}
                  </button>
                ))}
              </aside>
              {active && (
                <article className="kit-editor">
                  <input
                    className="kit-title"
                    maxLength={200}
                    aria-label={t(kind === 'snippets' ? 'Назва фрагмента' : 'Назва таблиці')}
                    value={active.title}
                    onChange={(e) =>
                      patch(active.id, {
                        title: e.target.value.trim()
                          ? e.target.value
                          : t(kind === 'snippets' ? 'Новий фрагмент коду' : 'Нова таблиця'),
                      })
                    }
                  />
                  {kind === 'snippets' ? (
                    <>
                      <div className="snippet-tools">
                        <select
                          aria-label={t('Мова коду')}
                          value={(active as Snippet).language}
                          onChange={(e) => patch(active.id, { language: e.target.value })}
                        >
                          {[
                            'text',
                            'rust',
                            'javascript',
                            'typescript',
                            'python',
                            'html',
                            'css',
                            'sql',
                            'bash',
                            'json',
                          ].map((l) => (
                            <option key={l} value={l}>
                              {l === 'text' ? 'Plain text' : l}
                            </option>
                          ))}
                        </select>
                        <button className="button secondary" onClick={() => void copy()}>
                          <Icon name="copy" size={16} />
                          {t('Копіювати код')}
                        </button>
                      </div>
                      <textarea
                        className="snippet-code"
                        aria-label={t('Код')}
                        spellCheck={false}
                        maxLength={1_000_000}
                        value={(active as Snippet).content}
                        onChange={(e) => patch(active.id, { content: e.target.value })}
                      />
                    </>
                  ) : (
                    sheet && (
                      <>
                        <div className="sheet-tools">
                          <button
                            className="button secondary"
                            disabled={sheet.columns.length >= 12}
                            onClick={() =>
                              patch(sheet.id, {
                                columns: [
                                  ...sheet.columns,
                                  {
                                    id: uid(),
                                    title: t('Стовпець') + ' ' + (sheet.columns.length + 1),
                                  },
                                ],
                                rows: sheet.rows.map((r) => ({ ...r, cells: [...r.cells, ''] })),
                              })
                            }
                          >
                            {t('Додати стовпець')}
                          </button>
                          <button
                            className="button secondary"
                            disabled={sheet.rows.length >= 500}
                            onClick={() => {
                              setPage(Math.floor(sheet.rows.length / 25));
                              patch(sheet.id, {
                                rows: [
                                  ...sheet.rows,
                                  { id: uid(), cells: sheet.columns.map(() => '') },
                                ],
                              });
                            }}
                          >
                            {t('Додати рядок')}
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              const escape = (v: string) =>
                                '"' +
                                (/^\s*[=+\-@]|^[\t\r]/.test(v) ? "'" : '') +
                                v.replaceAll('"', '""') +
                                '"';
                              const csv =
                                '\uFEFF' +
                                [
                                  sheet.columns.map((c) => c.title),
                                  ...sheet.rows.map((r) => r.cells),
                                ]
                                  .map((r) => r.map(escape).join(','))
                                  .join('\r\n');
                              void downloadBlob(
                                new Blob([csv], { type: 'text/csv;charset=utf-8' }),
                                sheet.title + '.csv',
                              ).catch(() => notify(t('Не вдалося завантажити файл.')));
                            }}
                          >
                            {t('Експорт CSV')}
                          </button>
                        </div>
                        <div className="sheet-scroll">
                          <table className="simple-sheet">
                            <thead>
                              <tr>
                                {sheet.columns.map((col, c) => (
                                  <th key={col.id}>
                                    <input
                                      aria-label={t('Стовпець') + ' ' + (c + 1)}
                                      maxLength={120}
                                      value={col.title}
                                      onChange={(e) =>
                                        patch(sheet.id, {
                                          columns: sheet.columns.map((x) =>
                                            x.id === col.id
                                              ? {
                                                  ...x,
                                                  title: e.target.value.trim()
                                                    ? e.target.value
                                                    : t('Стовпець'),
                                                }
                                              : x,
                                          ),
                                        })
                                      }
                                    />
                                    <button
                                      className="icon-button"
                                      aria-label={t('Видалити стовпець') + ' ' + (c + 1)}
                                      disabled={sheet.columns.length === 1}
                                      onClick={() => {
                                        if (
                                          sheet.rows.some((r) => r.cells[c]) &&
                                          !confirm(t('Видалити стовпець') + '?')
                                        )
                                          return;
                                        patch(sheet.id, {
                                          columns: sheet.columns.filter((x) => x.id !== col.id),
                                          rows: sheet.rows.map((r) => ({
                                            ...r,
                                            cells: r.cells.filter((_, i) => i !== c),
                                          })),
                                        });
                                      }}
                                    >
                                      <Icon name="close" size={12} />
                                    </button>
                                  </th>
                                ))}
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {sheet.rows
                                .slice(currentPage * 25, currentPage * 25 + 25)
                                .map((row, r) => (
                                  <tr key={row.id}>
                                    {row.cells.map((cell, c) => (
                                      <td key={sheet.columns[c].id}>
                                        <input
                                          aria-label={t('Клітинка {row}, {column}', {
                                            row: currentPage * 25 + r + 1,
                                            column: c + 1,
                                          })}
                                          maxLength={10000}
                                          value={cell}
                                          onChange={(e) =>
                                            patch(sheet.id, {
                                              rows: sheet.rows.map((x) =>
                                                x.id === row.id
                                                  ? {
                                                      ...x,
                                                      cells: x.cells.map((v, i) =>
                                                        i === c ? e.target.value : v,
                                                      ),
                                                    }
                                                  : x,
                                              ),
                                            })
                                          }
                                        />
                                      </td>
                                    ))}
                                    <td>
                                      <button
                                        className="icon-button"
                                        aria-label={
                                          t('Видалити рядок') + ' ' + (currentPage * 25 + r + 1)
                                        }
                                        onClick={() => {
                                          if (
                                            row.cells.some(Boolean) &&
                                            !confirm(t('Видалити рядок') + '?')
                                          )
                                            return;
                                          patch(sheet.id, {
                                            rows: sheet.rows.filter((x) => x.id !== row.id),
                                          });
                                        }}
                                      >
                                        <Icon name="trash" size={14} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                        {sheet.rows.length > 25 && (
                          <div className="sheet-paging">
                            <button
                              disabled={!currentPage}
                              onClick={() => setPage(currentPage - 1)}
                            >
                              ←
                            </button>
                            <span>
                              {currentPage + 1} / {Math.ceil(sheet.rows.length / 25)}
                            </span>
                            <button
                              disabled={(currentPage + 1) * 25 >= sheet.rows.length}
                              onClick={() => setPage(currentPage + 1)}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </>
                    )
                  )}
                </article>
              )}
            </div>
          )}
        </>
      )}
      {context && <ContextMenu state={context} close={() => setContext(null)} />}
    </div>
  );
}
