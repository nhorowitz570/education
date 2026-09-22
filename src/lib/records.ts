import { z } from 'zod';
import { dateSchema, timeSchema } from './plan';
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
  if (kind === 'checkin')
    return z
      .object({
        date: dateSchema,
        energy: z.number().int().min(1).max(5),
        mood: z.string().max(80),
        minutes: z.number().int().min(5).max(240),
      })
      .safeParse(data).success;
  if (kind === 'body')
    return z
      .object({ date: dateSchema, kg: z.number().finite().min(20).max(500) })
      .safeParse(data).success;
  if (kind === 'busy')
    return z
      .object({ date: dateSchema, start: timeSchema, end: timeSchema })
      .refine((x) => x.end > x.start)
      .safeParse(data).success;
  if (
    kind === 'food' &&
    data.protein !== undefined &&
    (!Number.isInteger(data.protein) ||
      Number(data.protein) < 0 ||
      Number(data.protein) > 3)
  )
    return false;
  if (
    kind === 'food' &&
    data.produce !== undefined &&
    (!Number.isInteger(data.produce) ||
      Number(data.produce) < 0 ||
      Number(data.produce) > 2)
  )
    return false;
  if (kind === 'workout')
    return z
      .object({
        name: z.string().max(100),
        date: dateSchema,
        index: z.number().int().min(0).max(30),
        comfort: z.enum(['Comfortable', 'Uncertain or unstable', 'Discomfort']),
        notes: z.string().max(1500),
        complete: z.boolean(),
        exercises: z
          .array(
            z.object({
              name: z.string().max(100),
              skipped: z.boolean().optional(),
              sets: z
                .array(
                  z.object({
                    reps: z
                      .string()
                      .max(8)
                      .refine(
                        (s) =>
                          s === '' ||
                          (Number.isFinite(Number(s)) &&
                            Number(s) >= 0 &&
                            Number(s) <= 200),
                      ),
                    load: z
                      .string()
                      .max(8)
                      .refine(
                        (s) =>
                          s === '' ||
                          (Number.isFinite(Number(s)) &&
                            Number(s) >= 0 &&
                            Number(s) <= 500),
                      ),
                    done: z.boolean(),
                  }),
                )
                .max(20),
            }),
          )
          .min(1)
          .max(30),
      })
      .safeParse(data).success;
  if (kind === 'settings') {
    for (const key of ['morning', 'followup', 'quietStart', 'quietEnd'])
      if (data[key] !== undefined && !timeSchema.safeParse(data[key]).success)
        return false;
  }
  return true;
}
export function validGymSettings(data: Record<string, unknown>) {
  return z
    .object({
      reviewed: z.boolean(),
      time: timeSchema,
      days: z.array(z.string().min(1).max(20)).length(3),
      exercises: z
        .array(z.array(z.string().min(1).max(100)).min(1).max(20))
        .length(3),
      restrictions: z.string().max(1500),
    })
    .safeParse(data).success;
}
