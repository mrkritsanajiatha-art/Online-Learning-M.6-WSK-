import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wzqfrimttfzzjizbxvcg.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6cWZyaW10dGZ6emppemJ4dmNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MDk2MzcsImV4cCI6MjA5NzE4NTYzN30.D0xTXVnMItHP__RZmLjWg6V_yfdR7seNpf5hL29qdzY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
