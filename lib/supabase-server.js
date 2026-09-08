import { createClient } from '@supabase/supabase-js';
export function adminClient(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Supabase server environment belum lengkap.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export function publicClient(){
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
}
