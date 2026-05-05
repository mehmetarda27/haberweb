const SUPABASE_URL = "https://tzuajwhvmvaewdbjvzhu.supabase.co";
const SUPABASE_KEY = "sb_publishable_qjyPqPtRc9ILOGKvJXY5qQ_pRDA5ktv";

window.supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
