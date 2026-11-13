import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Task } from './model';
import { t } from './i18n';
export default function CompletedTasks({
  tasks,
  expanded,
  onExpanded,
  render,
}: {
  tasks: Task[];
  expanded: boolean;
  onExpanded: (open: boolean) => void;
  render: (task: Task) => ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.open = expanded;
  }, [expanded, tasks.length]);
  if (!tasks.length) return null;
  return (
    <details
      className="completed-tasks"
      ref={ref}
      onToggle={(e) => onExpanded(e.currentTarget.open)}
    >
      <summary>
        <span>{t('Виконані')}</span>
        <span className="completed-count">{tasks.length}</span>
      </summary>
      <div className="task-list">{tasks.map(render)}</div>
    </details>
  );
}
