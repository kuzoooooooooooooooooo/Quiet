import type { ReactNode } from 'react';
import type { Document, Material, Project, Task, Tab } from './model';
import { enabled, getKit, moduleLabels, moduleIds } from './projectKit';
import type { ModuleId } from './projectKit';
import { t, formatCount } from './i18n';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import ActionMenu from './ActionMenu';
import CompletedTasks from './CompletedTasks';
import { documentText } from './documentHtml';
import { fileType } from './attachmentLimits';

type Props = {
  project: Project;
  tasks: Task[];
  documents: Document[];
  materials: Material[];
  renderTask: (task: Task) => ReactNode;
  completedOpen: boolean;
  onCompleted: (open: boolean) => void;
  onAddTask: () => void;
  onCreateDocument: () => void;
  onUploadDocument: () => void;
  onOpenDocument: (id: string) => void;
  onOpenMaterial: (material: Material) => void;
  onDownloadMaterial: (material: Material) => void;
  onRenameMaterial: (material: Material) => void;
  onDeleteMaterial: (material: Material) => void;
  onAddFile: () => void;
  onAddLink: () => void;
  onTab: (tab: Tab) => void;
  formatSize: (bytes: number) => string;
  shortDate: (date: string) => string;
};
export default function ProjectOverview(p: Props) {
  const active = p.tasks.filter((task) => !task.done),
    completed = p.tasks.filter((task) => task.done);
  const hasTasks = enabled(p.project, 'tasks'),
    hasMaterials = enabled(p.project, 'materials'),
    hasDocuments = enabled(p.project, 'documents');
  const filledCount =
    Number(hasTasks && p.tasks.length > 0) + Number(hasMaterials && p.materials.length > 0);
  const documentActions = [
    { label: t('Новий документ'), icon: 'file' as const, action: p.onCreateDocument },
    { label: t('Завантажити документ'), icon: 'upload' as const, action: p.onUploadDocument },
  ];
  const materialActions = [
    { label: t('Файл'), icon: 'upload' as const, action: p.onAddFile },
    { label: t('Посилання'), icon: 'link' as const, action: p.onAddLink },
  ];
  const count = (module: ModuleId) =>
    ({
      tasks: p.tasks.length,
      documents: p.documents.length,
      materials: p.materials.length,
      notes: getKit(p.project).notes.length,
      snippets: getKit(p.project).snippets.length,
      tables: getKit(p.project).tables.length,
    })[module];
  const extras = moduleIds.filter(
    (id) => ['notes', 'snippets', 'tables'].includes(id) && enabled(p.project, id),
  );
  const extraIcons: Partial<Record<ModuleId, IconName>> = {
    notes: 'note',
    snippets: 'file',
    tables: 'grid',
  };
  return (
    <div className="overview-content project-overview">
      {filledCount > 0 && (
        <div className={`overview-grid ${filledCount === 1 ? 'single-card' : ''}`}>
          {hasTasks && p.tasks.length > 0 && (
            <section className="overview-card overview-tasks" aria-label={t('Завдання')}>
              <div className="overview-heading">
                <h2>
                  <Icon name="circle" size={18} />
                  {t('Завдання')}
                </h2>
                <span>
                  {completed.length} / {p.tasks.length}
                </span>
              </div>
              {active.length ? (
                <div className="task-preview">{active.slice(0, 5).map(p.renderTask)}</div>
              ) : (
                <p className="overview-muted">{t('Усе виконано')}</p>
              )}
              <CompletedTasks
                tasks={completed}
                expanded={p.completedOpen}
                onExpanded={p.onCompleted}
                render={p.renderTask}
              />
              {active.length > 5 && (
                <button className="overview-more" onClick={() => p.onTab('tasks')}>
                  {t('Усі завдання')} ({active.length})<Icon name="arrow" size={15} />
                </button>
              )}
              <button className="panel-add" onClick={p.onAddTask}>
                <Icon name="plus" size={16} />
                {t('Додати завдання')}
              </button>
            </section>
          )}
          {hasMaterials && p.materials.length > 0 && (
            <section className="overview-card overview-materials" aria-label={t('Матеріали')}>
              <div className="overview-heading">
                <h2>
                  <Icon name="link" size={18} />
                  {t('Матеріали')}
                </h2>
                <span>{formatCount('material', p.materials.length)}</span>
              </div>
              <div className="overview-material-list">
                {p.materials.slice(0, 4).map((material) => (
                  <div
                    className="overview-material-row"
                    key={material.id}
                    data-context-kind="material"
                    data-context-id={material.id}
                  >
                    <Icon name={material.kind === 'link' ? 'link' : 'file'} size={19} />
                    <button
                      className="overview-material-open"
                      onClick={() => p.onOpenMaterial(material)}
                    >
                      <strong>{material.title}</strong>
                      <small>
                        {material.kind === 'file'
                          ? `${fileType(material).toUpperCase()} · ${p.formatSize(material.size)}`
                          : new URL(material.url).hostname}
                      </small>
                    </button>
                    <ActionMenu
                      label={t('Дії матеріалу {title}', { title: material.title })}
                      items={[
                        {
                          label: t('Перейменувати'),
                          icon: 'edit',
                          action: () => p.onRenameMaterial(material),
                        },
                        {
                          label: t(material.kind === 'file' ? 'Завантажити файл' : 'Відкрити'),
                          icon: material.kind === 'file' ? 'download' : 'external',
                          action: () => p.onDownloadMaterial(material),
                        },
                        {
                          label: t('Видалити'),
                          icon: 'trash',
                          danger: true,
                          action: () => p.onDeleteMaterial(material),
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
              {p.materials.length > 4 && (
                <button className="overview-more" onClick={() => p.onTab('materials')}>
                  {t('Усі матеріали')} ({p.materials.length})<Icon name="arrow" size={15} />
                </button>
              )}
            </section>
          )}
        </div>
      )}
      {hasDocuments && p.documents.length > 0 && (
        <section className="overview-card overview-documents" aria-label={t('Документи')}>
          <div className="overview-heading">
            <h2>
              <Icon name="file" size={18} />
              {t('Документи')}
            </h2>
            <ActionMenu label={t('Додати документ')} items={documentActions} showLabel />
          </div>
          <div className="overview-document-list">
            {p.documents.slice(0, 4).map((doc) => (
              <button
                key={doc.id}
                className="document-card"
                data-context-kind="document"
                data-context-id={doc.id}
                onClick={() => p.onOpenDocument(doc.id)}
              >
                <span className="document-icon">
                  <Icon name="file" size={19} />
                </span>
                <span>
                  <strong>{doc.title}</strong>
                  <small>
                    {doc.file
                      ? `${doc.file.fileType.toUpperCase()} · ${p.formatSize(doc.file.size)}`
                      : documentText(doc)
                          .split('\n')
                          .find((line) => line.trim())
                          ?.trim()
                          .replace(/[*_`]/g, '')
                          .slice(0, 85) || p.shortDate(doc.updatedAt)}
                  </small>
                </span>
                <Icon name="chevron" size={15} />
              </button>
            ))}
          </div>
          {p.documents.length > 4 && (
            <button className="overview-more" onClick={() => p.onTab('documents')}>
              {t('Усі документи')} ({p.documents.length})<Icon name="arrow" size={15} />
            </button>
          )}
        </section>
      )}
      <div className="overview-empty-sections">
        {hasTasks && !p.tasks.length && (
          <section className="overview-empty" aria-label={t('Завдання')}>
            <div>
              <Icon name="circle" size={18} />
              <h2>{t('Завдання')}</h2>
              <span>{t('Поки порожньо')}</span>
            </div>
            <button className="button secondary" onClick={p.onAddTask}>
              <Icon name="plus" size={16} />
              {t('Додати завдання')}
            </button>
          </section>
        )}
        {hasMaterials && !p.materials.length && (
          <section className="overview-empty" aria-label={t('Матеріали')}>
            <div>
              <Icon name="link" size={18} />
              <h2>{t('Матеріали')}</h2>
              <span>{t('Поки порожньо')}</span>
            </div>
            <ActionMenu label={t('Додати матеріали')} items={materialActions} showLabel />
          </section>
        )}
        {hasDocuments && !p.documents.length && (
          <section className="overview-empty overview-empty-documents" aria-label={t('Документи')}>
            <div>
              <Icon name="file" size={18} />
              <h2>{t('Документи')}</h2>
              <span>{t('Поки порожньо')}</span>
            </div>
            <ActionMenu label={t('Додати документ')} items={documentActions} showLabel />
          </section>
        )}
      </div>
      {extras.length > 0 && (
        <div className="overview-module-shortcuts">
          {extras.map((id) => (
            <button className="overview-module-link" key={id} onClick={() => p.onTab(id)}>
              <Icon name={extraIcons[id]!} size={18} />
              {t(moduleLabels[id])}
              <span>{count(id)}</span>
              <Icon name="chevron" size={15} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
