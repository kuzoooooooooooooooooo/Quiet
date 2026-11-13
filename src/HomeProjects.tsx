import { useState } from 'react';
import type { Project } from './model';
import type { Preferences } from './preferences';
import { t } from './i18n';
import { Icon } from './Icon';
import ActionMenu from './ActionMenu';
export default function HomeProjects({
  projects,
  preferences,
  onPreferences,
  onCreate,
  onOpen,
  onEdit,
  onDelete,
}: {
  projects: Project[];
  preferences: Preferences;
  onPreferences: (patch: Partial<Preferences>) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  const [query, setQuery] = useState('');
  const terms = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const visible = projects
    .filter((p) =>
      terms.every((term) =>
        (p.name + ' ' + p.description).normalize('NFKC').toLocaleLowerCase().includes(term),
      ),
    )
    .sort((a, b) =>
      preferences.projectSort === 'name'
        ? a.name.localeCompare(b.name)
        : (preferences.recentProjects[b.id] ?? Date.parse(b.createdAt)) -
            (preferences.recentProjects[a.id] ?? Date.parse(a.createdAt)) ||
          a.name.localeCompare(b.name),
    );
  return (
    <main className="main-content home-page" aria-label={t('Головна')}>
      <div className="content-heading">
        <h1>{t('Головна')}</h1>
        <button className="button secondary" aria-label={t('Новий проєкт')} onClick={onCreate}>
          <Icon name="plus" size={16} />
          {t('Новий проєкт')}
        </button>
      </div>
      {!!projects.length && (
        <div className="project-browser-tools">
          <label className="project-filter">
            <Icon name="search" size={16} />
            <input
              type="search"
              aria-label={t('Пошук проєктів')}
              placeholder={t('Пошук проєктів')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            className="sort-control"
            aria-label={t('Сортування проєктів')}
            value={preferences.projectSort}
            onChange={(e) =>
              onPreferences({ projectSort: e.target.value as Preferences['projectSort'] })
            }
          >
            <option value="recent">{t('Нещодавно відкриті')}</option>
            <option value="name">{t('За назвою')}</option>
          </select>
          <div className="segmented project-view" role="group" aria-label={t('Вигляд проєктів')}>
            <button
              aria-label={t('Картки')}
              title={t('Картки')}
              aria-pressed={preferences.projectView === 'cards'}
              onClick={() => onPreferences({ projectView: 'cards' })}
            >
              <Icon name="grid" size={16} />
            </button>
            <button
              aria-label={t('Список')}
              title={t('Список')}
              aria-pressed={preferences.projectView === 'list'}
              onClick={() => onPreferences({ projectView: 'list' })}
            >
              <Icon name="menu" size={16} />
            </button>
          </div>
        </div>
      )}
      <div
        className={`home-project-list ${preferences.projectView === 'list' ? 'project-list-view' : ''}`}
      >
        {visible.map((p) => (
          <article
            className="project-entry"
            key={p.id}
            data-context-kind="project"
            data-context-id={p.id}
          >
            <button className="home-project" onClick={() => onOpen(p.id)}>
              <span className={`project-dot ${p.tone}`} />
              <span>
                <strong>{p.name}</strong>
                {p.description && <small>{p.description}</small>}
              </span>
            </button>
            <ActionMenu
              label={t('Дії проєкту {name}', { name: p.name })}
              items={[
                { label: t('Відкрити'), icon: 'folder', action: () => onOpen(p.id) },
                { label: t('Редагувати проєкт'), icon: 'edit', action: () => onEdit(p) },
                {
                  label: t('Видалити проєкт'),
                  icon: 'trash',
                  danger: true,
                  action: () => onDelete(p),
                },
              ]}
            />
          </article>
        ))}
      </div>
      {!!projects.length && !visible.length && (
        <p className="project-filter-empty" role="status">
          {t('Нічого не знайшлося')}
        </p>
      )}
    </main>
  );
}
