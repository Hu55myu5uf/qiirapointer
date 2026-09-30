import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error(`
    ❌ Supabase credentials not found!
    
    Please set these environment variables in server/.env:
       - SUPABASE_URL        (from Supabase Dashboard → Settings → API)
       - SUPABASE_SERVICE_KEY (service_role key — NOT anon key)
    `);
    process.exit(1);
}

// Use service_role key on the server — bypasses Row Level Security
const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

console.log('✅ Supabase client initialized');

export default supabase;
