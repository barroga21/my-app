import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Keep this module exportable even when env vars are missing during dev startup.
export const supabase =
  url && anonKey ? createClient(url, anonKey) : null;