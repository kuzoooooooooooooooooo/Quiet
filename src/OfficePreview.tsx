import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { OfficeArchive, all, first, children, attr, number } from './officeArchive';
import { t } from './i18n';
import { Icon } from './Icon';

function LocalImage({
  archive,
  path,
  style,
}: {
  archive: OfficeArchive;
  path: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    let address = '';
    let live = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        try {
          if (!/\.(png|jpe?g|gif|webp)$/i.test(path)) return;
          const type = /\.png$/i.test(path)
            ? 'image/png'
            : /\.gif$/i.test(path)
              ? 'image/gif'
              : /\.webp$/i.test(path)
                ? 'image/webp'
                : 'image/jpeg';
          address = URL.createObjectURL(new Blob([new Uint8Array(archive.bytes(path))], { type }));
          if (live) setUrl(address);
        } catch {
          /* Keep the readable text when an image is unsupported or oversized. */
        }
      },
      { rootMargin: '150px' },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      live = false;
      observer.disconnect();
      if (address) URL.revokeObjectURL(address);
    };
  }, [archive, path]);
  return (
    <span ref={ref} className="office-image" style={style}>
      {url && <img src={url} alt={t('Зображення')} loading="lazy" />}
    </span>
  );
}
function Docx({ archive }: { archive: OfficeArchive }) {
  const content = useMemo(() => {
    const xml = archive.xml('word/document.xml'),
      body = first(xml, 'body'),
      rels = archive.relationships('word/document.xml');
    let count = 0;
    const counters = new Map<string, number>();
    function inline(node: Element, index: number): ReactNode {
      if (node.localName === 't') return node.textContent;
      if (node.localName === 'tab') return '\t';
      if (['br', 'cr'].includes(node.localName)) return <br key={index} />;
      if (node.localName === 'drawing') {
        const id = attr(first(node, 'blip'), 'embed'),
          path = rels.get(id);
        return path ? <LocalImage key={index} archive={archive} path={path} /> : null;
      }
      if (node.localName === 'r') {
        const props = children(node, 'rPr')[0],
          size = attr(first(props, 'sz'), 'val'),
          font = attr(first(props, 'rFonts'), 'ascii');
        const on = (name: string) => {
          const el = first(props, name);
          return !!el && !['0', 'false', 'none'].includes(attr(el, 'val'));
        };
        const style: CSSProperties = {
          fontWeight: on('b') ? 'bold' : undefined,
          fontStyle: on('i') ? 'italic' : undefined,
          textDecoration: on('u') ? 'underline' : on('strike') ? 'line-through' : undefined,
          fontSize: size ? `${number(size, 24, 16, 96) / 2}pt` : undefined,
          fontFamily: /^[\w -]{1,40}$/.test(font) ? font : undefined,
        };
        return (
          <span key={index} style={style}>
            {children(node)
              .filter((n) => n.localName !== 'rPr')
              .map(inline)}
          </span>
        );
      }
      return <span key={index}>{children(node).map(inline)}</span>;
    }
    function block(node: Element, index: number): ReactNode {
      if (++count > 5000) throw Error('Document has too many blocks');
      if (node.localName === 'p') {
        const props = children(node, 'pPr')[0],
          alignment = attr(first(props, 'jc'), 'val'),
          heading = attr(first(props, 'pStyle'), 'val'),
          num = first(props, 'numPr');
        const style: CSSProperties = {
          textAlign: ['left', 'center', 'right', 'justify'].includes(alignment)
            ? (alignment as CSSProperties['textAlign'])
            : undefined,
        };
        const text = children(node)
          .filter((n) => n.localName !== 'pPr')
          .map(inline);
        if (num) {
          const id = attr(first(num, 'numId'), 'val') + ':' + attr(first(num, 'ilvl'), 'val');
          const next = (counters.get(id) ?? 0) + 1;
          counters.set(id, next);
          return (
            <div
              key={index}
              className="docx-list"
              style={{
                ...style,
                paddingLeft: `${number(attr(first(num, 'ilvl'), 'val'), 0, 0, 8) * 18}px`,
              }}
            >
              <span>{next}.</span>
              <div>{text}</div>
            </div>
          );
        }
        if (/heading\s*1/i.test(heading))
          return (
            <h1 key={index} style={style}>
              {text}
            </h1>
          );
        if (/heading\s*2/i.test(heading))
          return (
            <h2 key={index} style={style}>
              {text}
            </h2>
          );
        if (/heading\s*3/i.test(heading))
          return (
            <h3 key={index} style={style}>
              {text}
            </h3>
          );
        return (
          <p key={index} style={style}>
            {text.length ? text : <br />}
          </p>
        );
      }
      if (node.localName === 'tbl')
        return (
          <table key={index}>
            <tbody>
              {children(node, 'tr').map((row, i) => (
                <tr key={i}>
                  {children(row, 'tc').map((cell, j) => (
                    <td key={j}>
                      {children(cell)
                        .filter((n) => ['p', 'tbl'].includes(n.localName))
                        .map(block)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      return null;
    }
    return children(body).map(block);
  }, [archive]);
  return <div className="docx-preview">{content}</div>;
}
function Presentation({ archive }: { archive: OfficeArchive }) {
  const [index, setIndex] = useState(0);
  const { slides, width, height, theme } = useMemo(() => {
    const doc = archive.xml('ppt/presentation.xml'),
      rels = archive.relationships('ppt/presentation.xml');
    const slides = all(doc, 'sldId')
      .map((node) => rels.get(node.getAttribute('r:id') || attr(node, 'id')))
      .filter((path): path is string => !!path);
    if (!slides.length || slides.length > 200) throw Error('Unsupported slide count');
    const size = first(doc, 'sldSz'),
      theme: Record<string, string> = {
        dk1: '#222222',
        lt1: '#ffffff',
        tx1: '#222222',
        bg1: '#ffffff',
      };
    const themeFile = archive.names().find((name) => /^ppt\/theme\/theme\d+\.xml$/.test(name));
    if (themeFile)
      for (const color of children(first(archive.xml(themeFile), 'clrScheme'))) {
        const value =
          attr(first(color, 'srgbClr'), 'val') || attr(first(color, 'sysClr'), 'lastClr');
        if (/^[a-f0-9]{6}$/i.test(value)) theme[color.localName] = '#' + value;
      }
    theme.tx1 = theme.dk1;
    theme.bg1 = theme.lt1;
    return {
      slides,
      width: number(attr(size, 'cx'), 9144000, 1000) / 9525,
      height: number(attr(size, 'cy'), 5143500, 1000) / 9525,
      theme,
    };
  }, [archive]);
  const slide = useMemo(() => {
    archive.resetBudget();
    const part = slides[index],
      xml = archive.xml(part),
      rels = archive.relationships(part);
    const layoutPath = [...rels.values()].find((path) => path.includes('/slideLayouts/'));
    const layout = layoutPath && archive.has(layoutPath) ? archive.xml(layoutPath) : undefined;
    const layoutRels = layoutPath ? archive.relationships(layoutPath) : new Map<string, string>();
    const masterPath = [...layoutRels.values()].find((path) => path.includes('/slideMasters/'));
    const master = masterPath && archive.has(masterPath) ? archive.xml(masterPath) : undefined;
    const color = (node: Element | undefined, fallback = 'transparent') => {
      const srgb = attr(first(node, 'srgbClr'), 'val');
      if (/^[a-f0-9]{6}$/i.test(srgb)) return '#' + srgb;
      return theme[attr(first(node, 'schemeClr'), 'val')] ?? fallback;
    };
    const background = color(
      first(first(xml, 'bg'), 'solidFill'),
      color(
        first(first(layout ?? xml, 'bg'), 'solidFill'),
        color(first(first(master ?? xml, 'bg'), 'solidFill'), '#ffffff'),
      ),
    );
    function shape(node: Element, i: number): ReactNode {
      const ph = first(node, 'ph');
      const match = (doc: Document | undefined) =>
        doc &&
        all(doc, 'sp').find((candidate) => {
          const p = first(candidate, 'ph');
          return p && (attr(p, 'idx') === attr(ph, 'idx') || attr(p, 'type') === attr(ph, 'type'));
        });
      const inherited = match(layout) || match(master);
      const xfrm =
        first(children(node, 'spPr')[0], 'xfrm') ||
        children(node, 'xfrm')[0] ||
        first(inherited, 'xfrm');
      const off = first(xfrm, 'off'),
        ext = first(xfrm, 'ext');
      const title = ['title', 'ctrTitle'].includes(attr(ph, 'type'));
      const x = number(attr(off, 'x'), 0) / 9525,
        y = number(attr(off, 'y'), i * 500000) / 9525,
        w = number(attr(ext, 'cx'), width * 9525, 1000) / 9525,
        h = number(attr(ext, 'cy'), (height * 9525) / 4, 1000) / 9525;
      const style: CSSProperties = {
        position: 'absolute',
        left: `${(x / width) * 100}%`,
        top: `${(y / height) * 100}%`,
        width: `${(w / width) * 100}%`,
        height: `${(h / height) * 100}%`,
        overflow: 'hidden',
        background: color(first(children(node, 'spPr')[0], 'solidFill')),
        padding: '0.4%',
        boxSizing: 'border-box',
      };
      if (node.localName === 'pic') {
        const path = rels.get(attr(first(node, 'blip'), 'embed'));
        return path ? (
          <div key={i} style={style}>
            <LocalImage archive={archive} path={path} style={{ width: '100%', height: '100%' }} />
          </div>
        ) : null;
      }
      if (node.localName === 'grpSp')
        return (
          <div key={i}>
            {children(node)
              .filter((child) => ['sp', 'pic', 'graphicFrame'].includes(child.localName))
              .map(shape)}
          </div>
        );
      const paragraphs = all(node, 'p').filter((p) => p.namespaceURI?.includes('drawingml'));
      const body = first(node, 'bodyPr');
      style.display = 'flex';
      style.flexDirection = 'column';
      style.justifyContent =
        attr(body, 'anchor') === 'ctr'
          ? 'center'
          : attr(body, 'anchor') === 'b'
            ? 'flex-end'
            : 'flex-start';
      return (
        <div key={i} style={style}>
          {paragraphs.map((p, j) => {
            const pp = children(p, 'pPr')[0],
              defaultProps =
                first(pp, 'defRPr') || first(node, 'defRPr') || first(inherited, 'defRPr');
            const align = attr(pp, 'algn');
            const pieces = children(p).filter((n) => ['r', 'br', 'fld'].includes(n.localName));
            return (
              <p
                key={j}
                style={{
                  margin: '0 0 .15em',
                  textAlign: align === 'ctr' ? 'center' : align === 'r' ? 'right' : 'left',
                  fontSize: `${(((number(attr(defaultProps, 'sz'), title ? 3200 : 1800, 600, 9600) / 100) * 96) / 72 / width) * 100}cqw`,
                  color: color(first(defaultProps, 'solidFill'), theme.dk1),
                }}
              >
                {first(pp, 'buChar') && '• '}
                {pieces.map((run, k) => {
                  if (run.localName === 'br') return <br key={k} />;
                  const props = first(run, 'rPr'),
                    size = attr(props, 'sz');
                  return (
                    <span
                      key={k}
                      style={{
                        fontWeight: attr(props, 'b') === '1' ? 'bold' : undefined,
                        fontStyle: attr(props, 'i') === '1' ? 'italic' : undefined,
                        textDecoration:
                          attr(props, 'u') && attr(props, 'u') !== 'none' ? 'underline' : undefined,
                        color: color(first(props, 'solidFill'), 'inherit'),
                        fontSize: size
                          ? `${(((number(size, 1800, 600, 9600) / 100) * 96) / 72 / width) * 100}cqw`
                          : undefined,
                      }}
                    >
                      {all(run, 't')
                        .map((t) => t.textContent)
                        .join('')}
                    </span>
                  );
                })}
              </p>
            );
          })}
        </div>
      );
    }
    const tree = first(xml, 'spTree');
    return {
      background,
      nodes: children(tree)
        .filter((n) => ['sp', 'pic', 'graphicFrame', 'grpSp'].includes(n.localName))
        .map(shape),
    };
  }, [archive, index, slides, width, height, theme]);
  return (
    <div className="pptx-preview">
      <div className="slide-controls">
        <button
          className="icon-button"
          aria-label={t('Попередній слайд')}
          disabled={!index}
          onClick={() => setIndex(index - 1)}
        >
          <Icon name="chevron" style={{ transform: 'rotate(180deg)' }} />
        </button>
        <span>{t('Слайд {current} з {total}', { current: index + 1, total: slides.length })}</span>
        <button
          className="icon-button"
          aria-label={t('Наступний слайд')}
          disabled={index === slides.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <div
        className="slide-stage"
        key={index}
        style={{ aspectRatio: `${width}/${height}`, background: slide.background }}
      >
        {slide.nodes}
      </div>
    </div>
  );
}
export default function OfficePreview({ bytes }: { bytes: ArrayBuffer }) {
  const archive = useMemo(() => new OfficeArchive(new Uint8Array(bytes)), [bytes]);
  if (archive.has('word/document.xml')) return <Docx archive={archive} />;
  if (archive.has('ppt/presentation.xml')) return <Presentation archive={archive} />;
  throw Error('Unsupported Office file');
}
