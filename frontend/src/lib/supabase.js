// One shared Supabase connection for the whole app.
// Import it anywhere:  import { supabase } from '../lib/supabase.js'
import { createClient } from '@supabase/supabase-js'

// Vite only exposes env vars that start with VITE_ (set them in frontend/.env)
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy frontend/.env.example to frontend/.env and fill it in.')
}

export const supabase = createClient(url, key)
