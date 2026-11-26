export interface MaterialOrderItem {
  parent_id?: string | null;
  order_index?: number | null;
  deleted_at?: string | null;
}

/** Append within the selected folder, preserving manual ordering and selection order. */
export function nextMaterialOrder(items: MaterialOrderItem[], parentId: string | null): number {
  const indexes = items.filter(item => !item.deleted_at && (item.parent_id ?? null) === parentId)
    .map(item => item.order_index ?? 0).filter(Number.isFinite);
  return indexes.length ? Math.max(...indexes) + 1 : 0;
}

export function localMaterialDateTime(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function scheduledMaterialDate(enabled: boolean, dateTime: string): string | null {
  if (!enabled) return null;
  const date = new Date(dateTime);
  if (!dateTime || !Number.isFinite(date.getTime())) throw new Error('Выберите дату и время добавления');
  return date.toISOString();
}
