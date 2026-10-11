// One shared Supabase connection for the whole app.
// Import it anywhere:  import { supabase } from './supabaseClient.js'
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env and fill it in.')
}

export const supabase = createClient(url, key)
