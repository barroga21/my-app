import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export default async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({
      ok: false,
      error: 'Missing Supabase env vars. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local, then restart next dev.',
    });
  }

  const requiredTables = ['calendar_notes', 'habit_checks', 'user_habits', 'profiles'];
  const checks = await Promise.all(
    requiredTables.map(async (table) => {
      const { error } = await supabase.from(table).select('*', { head: true, count: 'exact' });
      return {
        table,
        ok: !error,
        error: error?.message || null,
      };
    })
  );

  const failing = checks.filter((c) => !c.ok);
  if (failing.length > 0) {
    return res.status(500).json({
      ok: false,
      message:
        'Supabase is reachable, but one or more app tables are missing or blocked by policies. Run supabase/rls_personal_tracker.sql in the Supabase SQL Editor and try again.',
      checks,
    });
  }

  return res.status(200).json({
    ok: true,
    message: 'Supabase env vars and app tables look configured.',
    checks,
  });
}