export interface MaterialStorageItem {
  id: string;
  type: string;
  parent_id?: string | null;
  file_size?: number | null;
}

export const formatMaterialBytes = (bytes?: number | null): string => {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export const calculateMaterialFolderSizes = <T extends MaterialStorageItem>(
  items: T[],
): Map<string, number> => {
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    if (!item.parent_id) continue;
    const children = childrenByParent.get(item.parent_id) ?? [];
    children.push(item);
    childrenByParent.set(item.parent_id, children);
  }

  const result = new Map<string, number>();
  const sizeOf = (folderId: string, ancestors: Set<string>): number => {
    if (ancestors.has(folderId)) return 0;
    const nextAncestors = new Set(ancestors).add(folderId);
    let total = 0;
    for (const child of childrenByParent.get(folderId) ?? []) {
      if (child.type === "folder") total += sizeOf(child.id, nextAncestors);
      if (child.type === "file") total += child.file_size ?? 0;
    }
    return total;
  };

  for (const item of items) {
    if (item.type === "folder") result.set(item.id, sizeOf(item.id, new Set()));
  }
  return result;
};
