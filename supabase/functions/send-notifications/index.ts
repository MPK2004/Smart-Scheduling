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

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup }),
  });
  if (!res.ok) console.error("sendTelegramMessage failed:", res.status, await res.text());
}

// Three reminder stages per event: 2 days before, 1 day before, and at the
// exact start time. Each has its own "already sent" column so they fire
// independently and exactly once.
type Stage = {
  column: 'notified_2d' | 'notified_1d' | 'notified';
  windowEndOffsetMs: number;
  buildText: (title: string, dateStr: string, timeStr: string) => string;
  withDeleteButton: boolean;
};

const stages: Stage[] = [
  {
    column: 'notified_2d',
    windowEndOffsetMs: 2 * 24 * 60 * 60 * 1000,
    buildText: (title, dateStr, timeStr) => `📅 *Upcoming Reminder*\n\n*${title}*\nis in 2 days, on ${dateStr} at ${timeStr}`,
    withDeleteButton: true,
  },
  {
    column: 'notified_1d',
    windowEndOffsetMs: 24 * 60 * 60 * 1000,
    buildText: (title, dateStr, timeStr) => `📅 *Upcoming Reminder*\n\n*${title}*\nis tomorrow, ${dateStr} at ${timeStr}`,
    withDeleteButton: true,
  },
  {
    column: 'notified',
    windowEndOffsetMs: 0,
    buildText: (title, _dateStr, timeStr) => `🔔 *Reminder!*\n\n*${title}*\n⏰ Current Time reached (${timeStr})`,
    withDeleteButton: false,
  },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    let sentCount = 0;

    for (const stage of stages) {
      const threshold = new Date(Date.now() + stage.windowEndOffsetMs).toISOString();

      const { data: events, error: fetchError } = await supabase
        .from('events')
        .select('*, profiles!events_user_id_fkey(telegram_chat_id)')
        .eq(stage.column, false)
        .lte('start_date', threshold);

      if (fetchError) throw fetchError;
      if (!events || events.length === 0) continue;

      for (const event of events) {
        const chatId = event.profiles?.telegram_chat_id;
        if (!chatId) continue; // Skip if user hasn't linked Telegram

        const startDate = new Date(event.start_date);
        const dateStr = startDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        const timeStr = startDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
        const text = stage.buildText(event.title, dateStr, timeStr);
        const replyMarkup = stage.withDeleteButton
          ? { inline_keyboard: [[{ text: "🗑️ Delete Event", callback_data: `delrequest:${event.id}` }]] }
          : undefined;

        try {
          await sendTelegramMessage(chatId, text, replyMarkup);
          await supabase.from('events').update({ [stage.column]: true }).eq('id', event.id);
          sentCount++;
        } catch (err) {
          console.error(`Failed to send ${stage.column} notification for event ${event.id}:`, err);
        }
      }
    }

    // Sweep bot messages scheduled for auto-deletion (see sendTelegramMessage
    // in telegram-bot) - keeps the chat clean without needing a background
    // timer, since this function already runs every minute via cron.
    let cleanedCount = 0;
    const { data: dueDeletes } = await supabase
      .from('telegram_pending_deletes')
      .select('*')
      .lte('delete_at', new Date().toISOString())
      .limit(200);

    if (dueDeletes) {
      for (const row of dueDeletes) {
        try {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: row.chat_id, message_id: row.message_id }),
          });
          cleanedCount++;
        } catch (err) {
          console.error(`Failed to clean up message ${row.message_id}:`, err);
        }
        await supabase.from('telegram_pending_deletes').delete().eq('id', row.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent: sentCount, cleaned: cleanedCount }), {
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
