import { Inflate } from 'fflate';
type Entry = { offset: number; compressed: number; size: number; method: number; flags: number };
export class OfficeArchive {
  private entries = new Map<string, Entry>();
  private readBytes = 0;
  constructor(private data: Uint8Array) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let end = -1;
    for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--)
      if (view.getUint32(i, true) === 0x06054b50) {
        end = i;
        break;
      }
    if (end < 0) throw Error('Invalid Office archive');
    const count = view.getUint16(end + 10, true);
    let position = view.getUint32(end + 16, true);
    if (count > 4000) throw Error('Office archive is too complex');
    for (let i = 0; i < count; i++) {
      if (position + 46 > data.length || view.getUint32(position, true) !== 0x02014b50)
        throw Error('Invalid Office directory');
      const nameLength = view.getUint16(position + 28, true),
        extra = view.getUint16(position + 30, true),
        comment = view.getUint16(position + 32, true);
      const name = new TextDecoder().decode(
        data.subarray(position + 46, position + 46 + nameLength),
      );
      if (this.entries.has(name)) throw Error('Duplicate Office archive part');
      this.entries.set(name, {
        flags: view.getUint16(position + 8, true),
        method: view.getUint16(position + 10, true),
        compressed: view.getUint32(position + 20, true),
        size: view.getUint32(position + 24, true),
        offset: view.getUint32(position + 42, true),
      });
      position += 46 + nameLength + extra + comment;
    }
  }
  resetBudget() {
    this.readBytes = 0;
  }
  names() {
    return [...this.entries.keys()];
  }
  has(name: string) {
    return this.entries.has(name);
  }
  bytes(name: string): Uint8Array {
    const entry = this.entries.get(name);
    if (
      !entry ||
      entry.flags & 1 ||
      entry.size > 8 * 1024 * 1024 ||
      this.readBytes + entry.size > 40 * 1024 * 1024
    )
      throw Error('Office preview size limit reached');
    const view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength),
      p = entry.offset;
    if (p + 30 > this.data.length || view.getUint32(p, true) !== 0x04034b50)
      throw Error('Invalid Office part');
    const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true);
    if (start + entry.compressed > this.data.length) throw Error('Incomplete Office part');
    const input = this.data.subarray(start, start + entry.compressed);
    let output: Uint8Array;
    if (entry.method === 0) output = input;
    else if (entry.method === 8) {
      const chunks: Uint8Array[] = [];
      let size = 0;
      const inflater = new Inflate((chunk) => {
        size += chunk.length;
        if (size > entry.size || size > 8 * 1024 * 1024)
          throw Error('Office part exceeds its declared size');
        chunks.push(chunk);
      });
      for (let i = 0; i < input.length; i += 1024)
        inflater.push(input.subarray(i, i + 1024), i + 1024 >= input.length);
      output = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        output.set(chunk, at);
        at += chunk.length;
      }
    } else throw Error('Unsupported Office compression');
    if (output.length !== entry.size) throw Error('Invalid Office part size');
    this.readBytes += output.length;
    return output;
  }
  private xmlCache = new Map<string, Document>();
  xml(name: string): Document {
    const old = this.xmlCache.get(name);
    if (old) return old;
    const text = new TextDecoder().decode(this.bytes(name));
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Unsupported XML declaration');
    if (text.length > 4 * 1024 * 1024) throw Error('Office XML is too large');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw Error('Invalid Office XML');
    const walker = doc.createTreeWalker(doc, NodeFilter.SHOW_ELEMENT);
    let nodes = 0;
    while (walker.nextNode()) {
      if (++nodes > 30000) throw Error('Office XML is too complex');
    }
    if (this.xmlCache.size >= 12) this.xmlCache.delete(this.xmlCache.keys().next().value!);
    this.xmlCache.set(name, doc);
    return doc;
  }
  relationships(part: string): Map<string, string> {
    const slash = part.lastIndexOf('/'),
      path = part.slice(0, slash + 1) + '_rels/' + part.slice(slash + 1) + '.rels';
    const result = new Map<string, string>();
    if (!this.has(path)) return result;
    for (const rel of all(this.xml(path), 'Relationship')) {
      const target = rel.getAttribute('Target') ?? '';
      if (rel.getAttribute('TargetMode') === 'External' || /^[a-z]+:/i.test(target)) continue;
      const parts = (
        target.startsWith('/') ? target.slice(1) : part.slice(0, slash + 1) + target
      ).split('/');
      const normalized: string[] = [];
      for (const p of parts) {
        if (p === '..') normalized.pop();
        else if (p && p !== '.') normalized.push(p);
      }
      result.set(rel.getAttribute('Id') ?? '', normalized.join('/'));
    }
    return result;
  }
}
export function all(node: Document | Element, name: string): Element[] {
  return [...node.getElementsByTagNameNS('*', name)];
}
export function first(node: Document | Element | undefined, name: string): Element | undefined {
  return node ? all(node, name)[0] : undefined;
}
export function children(node: Element | undefined, name?: string): Element[] {
  return node ? [...node.children].filter((child) => !name || child.localName === name) : [];
}
export function attr(node: Element | undefined, name: string): string {
  return (
    node?.getAttribute(name) ??
    [...(node?.attributes ?? [])].find((a) => a.localName === name)?.value ??
    ''
  );
}
export function number(value: string, fallback: number, min = 0, max = 1e9) {
  const n = Number(value);
  return value && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
