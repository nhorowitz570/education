import { NextResponse } from 'next/server';
import { z } from 'zod';
import { context, body, fail, HttpError } from '@/lib/server/http';
import { generate } from '@/lib/ai/engine';
import { privatePut } from '@/lib/server/state';
export async function POST(r: Request) {
  try {
    const { user, db } = await context(r),
      v = z
        .object({
          image: z
            .string()
            .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
            .max(2800000),
          portions: z.string().max(1000),
          retentionDays: z.union([z.literal(0), z.literal(7), z.literal(30)]),
          eventId: z.string().uuid(),
        })
        .parse(await body(r, 2900000));
    const bytes = Buffer.from(v.image.split(',')[1], 'base64');
    if (bytes.length > 2097152 || bytes[0] !== 255 || bytes[1] !== 216)
      throw new HttpError('Choose a compressed JPEG smaller than 2 MB.');
    const { data } = await generate({
      task: 'food.estimate',
      userId: user.id,
      schema: z.object({ estimate: z.string() }),
      input: [
        { type: 'input_text', text: v.portions || 'Estimate visible portions only.' },
        { type: 'input_image', image_url: v.image, detail: 'low' },
      ],
    });
    const estimate = data.estimate.slice(0, 1200);
    if (v.retentionDays) {
      const path = `${user.id}/food/${v.eventId}.jpg`;
      const { error } = await db.storage
        .from('fieldwork-private')
        .upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error && !/already exists/.test(error.message))
        throw new Error('The private photo could not be saved.');
      await privatePut('jobs', {
        id: crypto.randomUUID(),
        user_id: user.id,
        job_key: 'delete-photo:' + v.eventId,
        kind: 'delete-photo',
        payload: { path },
        run_after: new Date(Date.now() + v.retentionDays * 864e5).toISOString(),
      });
    }
    return NextResponse.json({ estimate });
  } catch (e) {
    return fail(e);
  }
}
