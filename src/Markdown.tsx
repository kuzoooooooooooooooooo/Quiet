import { t } from './i18n';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { useState } from 'react';
import { openExternal } from './storage';

export default function Markdown({ content }: { content: string }) {
  const [error, setError] = useState('');
  const html = DOMPurify.sanitize(marked.parse(content, { async: false, breaks: true }), {
    FORBID_TAGS: ['img', 'input', 'style', 'form', 'iframe', 'video', 'audio'],
    FORBID_ATTR: ['style', 'id', 'name', 'target'],
  });
  return (
    <>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div
        className="markdown"
        onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest('a');
          if (anchor) {
            event.preventDefault();
            const href = anchor.getAttribute('href');
            if (href && /^https?:\/\//i.test(href))
              void openExternal(href).catch(() => setError(t('Не вдалося відкрити посилання.')));
          }
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
