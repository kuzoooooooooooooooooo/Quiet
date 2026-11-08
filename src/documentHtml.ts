import DOMPurify from 'dompurify';
import type { Document } from './model';
export const fonts = ['Arial', 'Georgia', 'Verdana', 'Courier New'] as const;
const sizes = ['10px', '13px', '16px', '18px', '24px', '32px', '48px'];
export function cleanHtml(value: string): string {
  const fragment = DOMPurify.sanitize(value, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: [
      'p',
      'div',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'u',
      's',
      'strike',
      'span',
      'font',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'a',
    ],
    ALLOWED_ATTR: ['style', 'face', 'size', 'href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
  for (const element of fragment.querySelectorAll<HTMLElement>('*')) {
    const style = document.createElement('span').style;
    const font =
      element.getAttribute('face') ??
      element.style.fontFamily.replaceAll('"', '').replaceAll("'", '');
    if (fonts.includes(font as (typeof fonts)[number])) style.fontFamily = font;
    const size =
      element.tagName === 'FONT'
        ? sizes[Number(element.getAttribute('size')) - 1]
        : element.style.fontSize;
    if ([...sizes, '12px', '14px'].includes(size)) style.fontSize = size;
    if (['left', 'center', 'right'].includes(element.style.textAlign))
      style.textAlign = element.style.textAlign;
    if (['bold', '700'].includes(element.style.fontWeight)) style.fontWeight = 'bold';
    if (element.style.fontStyle === 'italic') style.fontStyle = 'italic';
    if (['underline', 'line-through'].includes(element.style.textDecorationLine))
      style.textDecorationLine = element.style.textDecorationLine;
    element.removeAttribute('style');
    element.removeAttribute('face');
    element.removeAttribute('size');
    if (style.cssText) element.setAttribute('style', style.cssText);
    if (element.tagName === 'A') {
      const href = element.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) element.removeAttribute('href');
    }
    if (element.tagName === 'FONT') {
      const span = document.createElement('span');
      span.style.cssText = style.cssText;
      span.append(...element.childNodes);
      element.replaceWith(span);
    }
  }
  const holder = document.createElement('div');
  holder.append(fragment);
  return holder.innerHTML;
}
export async function markdownHtml(value: string) {
  const { marked } = await import('marked');
  return cleanHtml(marked.parse(value, { async: false, breaks: true }));
}
export function documentText(doc: Pick<Document, 'content' | 'format'>): string {
  if (doc.format !== 'html') return doc.content;
  const holder = document.createElement('div');
  holder.innerHTML = cleanHtml(doc.content);
  for (const node of holder.querySelectorAll('p,div,li,h1,h2,h3,br,blockquote,pre'))
    node.append(document.createTextNode('\n'));
  return holder.textContent ?? '';
}
export function documentFile(doc: Document): { blob: Blob; name: string } {
  if (doc.format !== 'html')
    return {
      blob: new Blob([doc.content], { type: 'text/markdown;charset=utf-8' }),
      name: `${doc.title}.md`,
    };
  const title = doc.title.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width"><style>body{font:16px/1.7 Arial,sans-serif;max-width:760px;margin:40px auto;padding:0 24px;overflow-wrap:anywhere}pre{white-space:pre-wrap}a{color:inherit}</style></head><body>${cleanHtml(doc.content)}</body></html>`;
  return { blob: new Blob([html], { type: 'text/html;charset=utf-8' }), name: `${doc.title}.html` };
}
