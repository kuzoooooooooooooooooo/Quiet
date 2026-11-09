import type { ReactNode } from 'react';
import type { Task } from './model';
import { t } from './i18n';
export type Stage = 'todo' | 'doing' | 'done';
export const taskStage = (task: Task): Stage =>
  task.done ? 'done' : task.stage === 'doing' ? 'doing' : 'todo';
export default function TaskBoard({
  tasks,
  onMove,
  render,
}: {
  tasks: Task[];
  onMove: (id: string, stage: Stage) => void;
  render: (task: Task) => ReactNode;
}) {
  const stages = [
    { id: 'todo', label: 'До роботи' },
    { id: 'doing', label: 'У роботі' },
    { id: 'done', label: 'Виконано' },
  ] as const;
  return (
    <div className="task-board">
      {stages.map((stage) => (
        <section
          key={stage.id}
          className="board-column"
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-quiet-task')) e.preventDefault();
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData('application/x-quiet-task');
            if (tasks.some((t) => t.id === id)) {
              e.preventDefault();
              e.stopPropagation();
              onMove(id, stage.id);
            }
          }}
        >
          <h3>
            {t(stage.label)}
            <span>{tasks.filter((t) => taskStage(t) === stage.id).length}</span>
          </h3>
          {tasks
            .filter((t) => taskStage(t) === stage.id)
            .map((task) => (
              <div
                className="board-card"
                key={task.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/x-quiet-task', task.id)}
              >
                {render(task)}
                <select
                  aria-label={t('Стан завдання') + ' ' + task.title}
                  value={taskStage(task)}
                  onChange={(e) => onMove(task.id, e.target.value as Stage)}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {t(s.label)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}
