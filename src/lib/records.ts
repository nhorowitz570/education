import { z } from 'zod';
import { dateSchema, timeSchema } from './plan';
import { validZone } from './zone';
const finiteJson = (value: unknown, depth = 0): boolean =>
  depth < 12 &&
  (value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) &&
      value.length <= 1000 &&
      value.every((v) => finiteJson(v, depth + 1))) ||
    (typeof value === 'object' &&
      Object.values(value).every((v) => finiteJson(v, depth + 1))));
export function validRecord(
  kind: string,
  data: Record<string, unknown>,
): boolean {
  if (!finiteJson(data) || JSON.stringify(data).length > 30000) return false;
  if (kind === 'busy')
    return z
      .object({ date: dateSchema, start: timeSchema, end: timeSchema })
      .refine((x) => x.end > x.start)
      .safeParse(data).success;
  if (kind === 'settings') {
    for (const key of ['morning', 'followup', 'quietStart', 'quietEnd'])
      if (data[key] !== undefined && !timeSchema.safeParse(data[key]).success)
        return false;
    if (data.timezone !== undefined && !validZone(data.timezone)) return false;
  }
  return true;
}
