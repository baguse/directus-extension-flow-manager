/**
 * Recursively cleans a Directus filter object by stripping out any conditions
 * with null or undefined values (e.g. {"_and": [{"id": {"_eq": null}}]}).
 *
 * If an `_and` or `_or` group has all its conditions stripped, the group itself is removed.
 * Returns `null` if no valid filter conditions remain.
 */
export function cleanFilter<T = Record<string, unknown>>(filter: unknown): T | null {
  if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
    return null;
  }

  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(filter as Record<string, unknown>)) {
    if ((key === '_and' || key === '_or') && Array.isArray(val)) {
      const cleanedItems = val
        .map((item) => cleanFilter(item))
        .filter(
          (item): item is Record<string, unknown> => item !== null && Object.keys(item).length > 0,
        );

      if (cleanedItems.length > 0) {
        result[key] = cleanedItems;
      }
    } else if (val === null || val === undefined) {
      // Exclude null and undefined values (e.g. { id: null }, { _eq: null })
      continue;
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      // Recursively clean nested filter objects (field operators or relation filters)
      const cleanedChild = cleanFilter(val);
      if (cleanedChild !== null && Object.keys(cleanedChild).length > 0) {
        result[key] = cleanedChild;
      }
    } else if (Array.isArray(val)) {
      // Filter out null/undefined elements from array-based operators (e.g. _in, _nin, _between)
      const validItems = val.filter((item) => item !== null && item !== undefined);
      if ((key === '_between' || key === '_nbetween') && validItems.length < 2) {
        continue;
      }
      if (validItems.length > 0) {
        result[key] = validItems;
      }
    } else {
      // Retain valid primitive values (string, number, boolean, e.g. { _eq: "active" }, { _null: true })
      result[key] = val;
    }
  }

  return Object.keys(result).length > 0 ? (result as T) : null;
}
