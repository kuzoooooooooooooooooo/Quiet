// Small input-only Markdown shortcuts. A single native editing operation keeps undo usable.
export function autoFormatInput(host: HTMLElement): boolean {
  const selection = window.getSelection();
  if (
    !selection?.isCollapsed ||
    !selection.rangeCount ||
    !selection.anchorNode ||
    !host.contains(selection.anchorNode)
  )
    return false;
  const caret = selection.getRangeAt(0),
    parent =
      selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? (selection.anchorNode as Element)
        : selection.anchorNode.parentElement;
  if (!parent || parent.closest('pre,code,a')) return false;
  const block = parent.closest('p,div,h1,h2,h3');
  const marker = crypto.randomUUID();
  function insert(range: Range, html: string, inline = false) {
    selection!.removeAllRanges();
    selection!.addRange(range);
    if (!document.execCommand('insertHTML', false, html)) return false;
    const node = host.querySelector<HTMLElement>(`[data-quiet-auto="${marker}"]`);
    if (!node) return false;
    node.removeAttribute('data-quiet-auto');
    const next = document.createRange();
    if (inline) next.setStartAfter(node);
    else next.setStart(node, 0);
    next.collapse(true);
    selection!.removeAllRanges();
    selection!.addRange(next);
    if (inline && document.queryCommandState('bold')) document.execCommand('bold', false);
    return true;
  }
  if (block && (block === host || host.contains(block)) && !parent.closest('li,h1,h2,h3')) {
    const before = document.createRange();
    before.selectNodeContents(block);
    before.setEnd(caret.startContainer, caret.startOffset);
    const text = before.toString().replaceAll('\u00a0', ' ');
    if (
      /^(#{1,3}|[-*]|1\.) $/.test(text) &&
      text === (block.textContent ?? '').replaceAll('\u00a0', ' ')
    ) {
      const prefix = text.trim();
      const html = prefix.startsWith('#')
        ? `<h${prefix.length} data-quiet-auto="${marker}"><br></h${prefix.length}>`
        : `<${prefix === '1.' ? 'ol' : 'ul'}><li data-quiet-auto="${marker}"><br></li></${prefix === '1.' ? 'ol' : 'ul'}>`;
      return insert(before, html);
    }
  }
  if (caret.startContainer.nodeType !== Node.TEXT_NODE || parent.closest('b,strong')) return false;
  const before = (caret.startContainer.textContent ?? '').slice(0, caret.startOffset);
  const match = before.match(/(?:^|\s)\*\*([^*\n]+)\*\*$/);
  if (!match) return false;
  const start = before.length - match[1].length - 4;
  const range = caret.cloneRange();
  range.setStart(caret.startContainer, start);
  const strong = document.createElement('strong');
  strong.setAttribute('data-quiet-auto', marker);
  strong.textContent = match[1];
  return insert(range, strong.outerHTML, true);
}
