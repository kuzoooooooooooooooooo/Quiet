import { Component, lazy, Suspense, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Material } from './model';
import { readAttachment } from './attachments';
import { downloadBlob } from './storage';
import { fileType } from './attachmentLimits';
import { t } from './i18n';
import { Icon } from './Icon';
const Office = lazy(() => import('./OfficePreview'));
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p role="alert" className="preview-error">
        {t('Не вдалося відкрити перегляд цього файлу. Його можна завантажити.')}
      </p>
    ) : (
      this.props.children
    );
  }
}
function Content({ blob, type, title }: { blob: Blob; type: string; title: string }) {
  const [url, setUrl] = useState('');
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [text, setText] = useState('');
  useEffect(() => {
    let live = true;
    let address = '';
    if (type === 'pdf' || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(type)) {
      address = URL.createObjectURL(
        new Blob([blob], {
          type:
            type === 'pdf' ? 'application/pdf' : type === 'jpg' ? 'image/jpeg' : `image/${type}`,
        }),
      );
      setUrl(address);
    } else if (['docx', 'pptx'].includes(type))
      void blob.arrayBuffer().then((value) => {
        if (live) setBytes(value);
      });
    else if (['txt', 'md', 'json', 'csv', 'log'].includes(type) && blob.size < 1024 * 1024)
      void blob.text().then((value) => {
        if (live) setText(value);
      });
    return () => {
      live = false;
      if (address) URL.revokeObjectURL(address);
    };
  }, [blob, type]);
  if (type === 'pdf')
    return url ? <iframe className="pdf-preview" src={url} title={title} /> : null;
  if (['docx', 'pptx'].includes(type))
    return bytes ? (
      <PreviewBoundary>
        <Suspense fallback={<p role="status">{t('Відкриваємо файл…')}</p>}>
          <Office bytes={bytes} />
        </Suspense>
      </PreviewBoundary>
    ) : null;
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(type))
    return url ? <img className="image-preview" src={url} alt={title} /> : null;
  if (['txt', 'md', 'json', 'csv', 'log'].includes(type) && blob.size < 1024 * 1024)
    return <pre className="text-preview">{text}</pre>;
  return <p className="preview-error">{t('Для цього типу файлу доступне завантаження.')}</p>;
}
export default function FilePreview({
  material,
}: {
  material: Pick<Material, 'url' | 'size' | 'title' | 'fileType'>;
}) {
  const [blob, setBlob] = useState<Blob | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    readAttachment(material)
      .then((value) => {
        if (live) setBlob(value);
      })
      .catch(() => {
        if (live) setError(t('Не вдалося прочитати файл.'));
      });
    return () => {
      live = false;
    };
  }, [material]);
  return (
    <div className="file-preview">
      <div className="file-preview-toolbar">
        <span>{fileType(material).toUpperCase()}</span>
        <button
          className="button secondary"
          disabled={!blob}
          onClick={() => {
            if (blob)
              void downloadBlob(blob, material.title).catch(() =>
                setError(t('Не вдалося завантажити файл.')),
              );
          }}
        >
          <Icon name="download" size={16} />
          {t('Завантажити файл')}
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : blob ? (
        <Content blob={blob} type={fileType(material)} title={material.title} />
      ) : (
        <p role="status">{t('Відкриваємо файл…')}</p>
      )}
    </div>
  );
}
