/**
 * Restores a saved tab order: unknown and repeated keys are dropped, and sections added
 * after the order was saved go right after their default neighbour instead of to the end.
 */
export function mergeNavOrder<K extends string>(saved: unknown, defaults: readonly K[]): K[] {
  if (!Array.isArray(saved) || saved.length === 0) return [...defaults];
  const order = saved.filter(
    (key, i): key is K => defaults.includes(key as K) && saved.indexOf(key) === i,
  );
  defaults.forEach((key, i) => {
    if (order.includes(key)) return;
    const previous = defaults.slice(0, i).reverse().find((k) => order.includes(k));
    order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, key);
  });
  return order;
}
