import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Recent events:", JSON.stringify(data, null, 2));
  
  // also call send-notifications to see if it works
  const res = await supabase.functions.invoke('send-notifications', {});
  console.log("Notification trigger response:", res.data, res.error);
}
main();
