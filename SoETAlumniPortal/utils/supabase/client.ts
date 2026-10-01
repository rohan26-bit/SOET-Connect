import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = 'https://qayzyqthzrvynyxyiwfe.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFheXp5cXRoenJ2eW55eHlpd2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4MDcxNTUsImV4cCI6MjEwMjM4MzE1NX0.YmqW2HgIW-2IHRnon1l48udLgK5WLcJy3Jd8bj_oWX0'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
  )
}
