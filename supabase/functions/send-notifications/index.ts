import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  
  try {
    const now = new Date().toISOString();
    
    // We want events whose start_date is in the past or exactly now, and that haven't been notified yet
    // Example: if start_date is 09:00:00, and it's currently 09:00:15, it should trigger.
    const { data: events, error: fetchError } = await supabase
      .from('events')
      .select('*, profiles(telegram_chat_id)')
      .eq('notified', false)
      .lte('start_date', now);

    if (fetchError) throw fetchError;
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No pending notifications." }), { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
        status: 200 
      });
    }

    let sentCount = 0;
    
    for (const event of events) {
      const chatId = event.profiles?.telegram_chat_id;
      if (!chatId) continue; // Skip if user hasn't linked Telegram

      const timeStr = event.start_date.split('T')[1]?.substring(0, 5) || '00:00';
      const text = `🔔 *Reminder!*\n\n*${event.title}*\n⏰ Current Time reached (${timeStr})`;
      
      try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
        });
        
        // Mark as notified so we don't spam them every minute
        await supabase.from('events').update({ notified: true }).eq('id', event.id);
        sentCount++;
      } catch (err) {
        console.error(`Failed to send notification for event ${event.id}:`, err);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 200 
    });

  } catch (error: any) {
    console.error("Notification Engine Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 500 
    });
  }
});
