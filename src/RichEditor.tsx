import { useEffect, useRef, useState } from 'react';
import { cleanHtml, fonts } from './documentHtml';
import { t } from './i18n';
import { Icon } from './Icon';
import { safeUrl } from './model';
import { openExternal } from './storage';
import { autoFormatInput } from './autoFormat';

export function RichPreview({ content }: { content: string }) {
  const [error, setError] = useState('');
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div
        className="rich-content markdown"
        dangerouslySetInnerHTML={{ __html: cleanHtml(content) }}
        onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest('a');
          if (anchor) {
            event.preventDefault();
            const url = safeUrl(anchor.getAttribute('href') ?? '');
            if (url)
              void openExternal(url).catch(() => setError(t('Не вдалося відкрити посилання.')));
          }
        }}
      />
    </>
  );
}
export default function RichEditor({
  content,
  onChange,
  autoFormat = false,
  label = t('Вміст документа'),
  compact = false,
}: {
  content: string;
  autoFormat?: boolean;
  label?: string;
  compact?: boolean;
  onChange: (content: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const applying = useRef(false),
    composing = useRef(false);
  const range = useRef<Range | null>(null);
  const emitted = useRef<string | null>(null);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [font, setFont] = useState('Arial');
  const [block, setBlock] = useState('p');
  const [size, setSize] = useState('3');
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');
  useEffect(() => {
    if (editor.current && content !== emitted.current)
      editor.current.innerHTML = cleanHtml(content);
  }, [content]);
  useEffect(() => {
    const remember = () => {
      const selection = window.getSelection();
      if (
        !selection?.rangeCount ||
        !editor.current?.contains(selection.anchorNode) ||
        !editor.current.contains(selection.focusNode)
      )
        return;
      range.current = selection.getRangeAt(0).cloneRange();
      setActive(
        Object.fromEntries(
          [
            'bold',
            'italic',
            'underline',
            'insertUnorderedList',
            'insertOrderedList',
            'justifyLeft',
            'justifyCenter',
            'justifyRight',
          ].map((key) => [key, document.queryCommandState(key)]),
        ),
      );
      const format = document.queryCommandValue('formatBlock').toLowerCase();
      setBlock(['h1', 'h2', 'h3'].includes(format) ? format : 'p');
      const value = document.queryCommandValue('fontName').replaceAll('"', '');
      if (fonts.includes(value as (typeof fonts)[number])) setFont(value);
      setSize(document.queryCommandValue('fontSize') || '3');
    };
    document.addEventListener('selectionchange', remember);
    return () => document.removeEventListener('selectionchange', remember);
  }, []);
  function emit() {
    if (!editor.current) return;
    const html = cleanHtml(editor.current.innerHTML);
    emitted.current = html;
    onChange(html);
  }
  function command(name: string, value?: string) {
    editor.current?.focus();
    const selection = window.getSelection();
    if (range.current && selection) {
      selection.removeAllRanges();
      selection.addRange(range.current);
    }
    // Browser editing commands preserve the native undo stack in Chromium/WebView2.
    applying.current = true;
    try {
      document.execCommand(name, false, value);
    } finally {
      applying.current = false;
    }
    if (selection?.rangeCount) range.current = selection.getRangeAt(0).cloneRange();
    emit();
  }
  const buttons = [
    ['bold', 'Жирний', 'B'],
    ['italic', 'Курсив', 'I'],
    ['underline', 'Підкреслення', 'U'],
    ['insertUnorderedList', 'Маркований список', '•'],
    ['insertOrderedList', 'Нумерований список', '1.'],
    ['justifyLeft', 'Ліворуч', '≡'],
    ['justifyCenter', 'По центру', '≡'],
    ['justifyRight', 'Праворуч', '≡'],
  ] as const;
  return (
    <div className={`rich-editor ${compact ? 'compact-editor' : ''}`}>
      <div className="format-toolbar" role="toolbar" aria-label={t('Форматування тексту')}>
        <select
          aria-label={t('Шрифт')}
          value={font}
          onChange={(e) => {
            setFont(e.target.value);
            command('fontName', e.target.value);
          }}
        >
          {fonts.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <select
          aria-label={t('Розмір тексту')}
          value={size}
          onChange={(e) => {
            setSize(e.target.value);
            command('fontSize', e.target.value);
          }}
        >
          {[10, 13, 16, 18, 24, 32, 48].map((value, index) => (
            <option key={value} value={index + 1}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Стиль тексту')}
          value={block}
          onChange={(e) => {
            setBlock(e.target.value);
            command('formatBlock', e.target.value);
          }}
        >
          <option value="p">{t('Звичайний текст')}</option>
          <option value="h1">{t('Заголовок 1')}</option>
          <option value="h2">{t('Заголовок 2')}</option>
          <option value="h3">{t('Заголовок 3')}</option>
        </select>
        {buttons.map(([name, label, text]) => (
          <button
            type="button"
            key={name}
            title={t(label)}
            aria-label={t(label)}
            aria-pressed={!!active[name]}
            className={`format-${name}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => command(name)}
          >
            {name.startsWith('justify') ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path
                  d={
                    name === 'justifyLeft'
                      ? 'M4 5h16M4 10h10M4 15h16M4 20h10'
                      : name === 'justifyRight'
                        ? 'M4 5h16M10 10h10M4 15h16M10 20h10'
                        : 'M4 5h16M7 10h10M4 15h16M7 20h10'
                  }
                />
              </svg>
            ) : (
              text
            )}
          </button>
        ))}
        <button
          type="button"
          aria-label={t('Додати посилання')}
          title={t('Додати посилання')}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            setLinkOpen(!linkOpen);
            setLinkError('');
          }}
        >
          <Icon name="link" size={15} />
        </button>
        <button
          type="button"
          aria-label={t('Скасувати дію')}
          title={t('Скасувати дію')}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command('undo')}
        >
          <Icon name="undo" size={15} />
        </button>
        <button
          type="button"
          aria-label={t('Повторити дію')}
          title={t('Повторити дію')}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command('redo')}
        >
          <Icon name="undo" size={15} style={{ transform: 'scaleX(-1)' }} />
        </button>
        <button
          type="button"
          aria-label={t('Прибрати форматування')}
          title={t('Прибрати форматування')}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => command('removeFormat')}
        >
          Tx
        </button>
      </div>
      {linkOpen && (
        <form
          className="editor-link-form"
          onSubmit={(e) => {
            e.preventDefault();
            const url = safeUrl(link);
            if (!url) {
              setLinkError(t('Вкажи повне посилання з https:// або http://.'));
              return;
            }
            command('createLink', url);
            setLinkOpen(false);
            setLink('');
          }}
        >
          <input
            aria-label={t('Посилання')}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://"
          />
          <button className="button secondary">{t('Додати')}</button>
          <button type="button" className="button secondary" onClick={() => setLinkOpen(false)}>
            {t('Скасувати')}
          </button>
          {linkError && <p role="alert">{linkError}</p>}
        </form>
      )}
      <div
        ref={editor}
        role="textbox"
        aria-label={label}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        className="rich-content"
        spellCheck
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onInput={(event) => {
          if (applying.current) return;
          const input = event.nativeEvent as InputEvent;
          if (
            autoFormat &&
            !composing.current &&
            !input.isComposing &&
            ['insertText', 'insertCompositionText', 'insertReplacementText'].includes(
              input.inputType,
            )
          ) {
            applying.current = true;
            try {
              if (editor.current) autoFormatInput(editor.current);
            } finally {
              applying.current = false;
            }
            const selection = window.getSelection();
            if (selection?.rangeCount) range.current = selection.getRangeAt(0).cloneRange();
          }
          emit();
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('a')) e.preventDefault();
        }}
        onPaste={(e) => {
          e.preventDefault();
          const html = e.clipboardData.getData('text/html');
          const text = e.clipboardData.getData('text/plain');
          if (html) command('insertHTML', cleanHtml(html));
          else command('insertText', text);
        }}
        onDrop={(e) => e.preventDefault()}
      />
    </div>
  );
}
