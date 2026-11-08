// Restore only the removed records; unrelated edits made after deletion survive.
export function restoreAt<T extends { id: string }>(rows: T[], item: T, index: number): T[] {
  if (rows.some((row) => row.id === item.id)) return rows;
  const next = [...rows];
  next.splice(Math.min(index, next.length), 0, item);
  return next;
}

export function capture<T>(rows: T[], predicate: (item: T) => boolean) {
  return rows.map((item, index) => ({ item, index })).filter((row) => predicate(row.item));
}

export function restoreMany<T extends { id: string }>(
  rows: T[],
  removed: { item: T; index: number }[],
): T[] {
  return removed.reduce((current, row) => restoreAt(current, row.item, row.index), rows);
}
