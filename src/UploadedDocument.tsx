import { useMemo } from 'react';
import type { Document } from './model';
import FilePreview from './FilePreview';
import ActionMenu from './ActionMenu';
import { Icon } from './Icon';
import { t } from './i18n';
export default function UploadedDocument({
  doc,
  size,
  onTitle,
  onRename,
  onDownload,
  onDelete,
}: {
  doc: Document;
  size: string;
  onTitle: (title: string) => void;
  onRename: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  const file = useMemo(() => ({ ...doc.file!, title: doc.file!.name }), [doc.file]);
  return (
    <article className="editor uploaded-document">
      <div className="editor-toolbar">
        <span>
          <Icon name="file" size={14} />
          {file.fileType.toUpperCase()} · {size}
        </span>
        <ActionMenu
          label={t('Дії документа')}
          items={[
            { label: t('Перейменувати'), icon: 'edit', action: onRename },
            { label: t('Завантажити файл'), icon: 'download', action: onDownload },
            { label: t('Видалити документ'), icon: 'trash', danger: true, action: onDelete },
          ]}
        />
      </div>
      <div className="uploaded-document-heading">
        <input
          className="document-title-input"
          aria-label={t('Назва документа')}
          maxLength={200}
          value={doc.title}
          onChange={(e) => onTitle(e.target.value.trim() ? e.target.value : t('Без назви'))}
        />
      </div>
      <FilePreview material={file} />
    </article>
  );
}
