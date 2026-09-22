import { NextResponse } from 'next/server';
import { context, fail } from '@/lib/server/http';
export async function GET(r: Request) {
  try {
    const { user, db } = await context(r);
    const tables = [
      'profiles',
      'plan_versions',
      'workspaces',
      'attempts',
      'lesson_versions',
    ];
    const records = await Promise.all(
      tables.map(async (t) => {
        const { data, error } = await db
          .from(t)
          .select('*')
          .eq('user_id', user.id);
        if (error) throw error;
        return [t, data];
      }),
    );
    return NextResponse.json(
      { exported_at: new Date().toISOString(), ...Object.fromEntries(records) },
      {
        headers: {
          'Content-Disposition':
            'attachment; filename="fieldwork-account.json"',
        },
      },
    );
  } catch (e) {
    return fail(e);
  }
}
