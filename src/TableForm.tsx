import { useState } from 'react';
import { t } from './i18n';
export default function TableForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, rows: number, columns: number) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(t('Нова таблиця'));
  const [rows, setRows] = useState('3'),
    [columns, setColumns] = useState('2');
  const r = Number(rows),
    c = Number(columns),
    valid =
      !!title.trim() &&
      !!rows.trim() &&
      !!columns.trim() &&
      Number.isInteger(r) &&
      r >= 0 &&
      r <= 500 &&
      Number.isInteger(c) &&
      c >= 1 &&
      c <= 12;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(title.trim(), r, c);
      }}
    >
      <label className="field">
        {t('Назва таблиці')}
        <input
          autoFocus
          required
          maxLength={200}
          value={title}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="table-dimensions">
        <label className="field">
          {t('Рядки')}
          <input
            type="number"
            required
            min={0}
            max={500}
            step={1}
            value={rows}
            onChange={(e) => setRows(e.target.value)}
          />
        </label>
        <label className="field">
          {t('Стовпці')}
          <input
            type="number"
            required
            min={1}
            max={12}
            step={1}
            value={columns}
            onChange={(e) => setColumns(e.target.value)}
          />
        </label>
      </div>
      <div className="modal-actions">
        <button type="button" className="button secondary" onClick={onCancel}>
          {t('Скасувати')}
        </button>
        <button className="button primary" disabled={!valid}>
          {t('Створити таблицю')}
        </button>
      </div>
    </form>
  );
}
