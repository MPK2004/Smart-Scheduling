import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import Groq from "npm:groq-sdk"
import * as chrono from "npm:chrono-node"

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const groq = new Groq({ apiKey: GROQ_API_KEY });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const update = await req.json();
    if (update.message) await handleMessage(update.message);
    else if (update.callback_query) await handleCallbackQuery(update.callback_query);
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  } catch (error: any) {
    console.error("Update Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
  }
});

// ── Fix 4: Extract event ID from a replied-to bot message ──
function extractEventIdFromReply(replyMessage: any): string | null {
  if (!replyMessage) return null;
  // Check callback_data in inline keyboards
  if (replyMessage.reply_markup?.inline_keyboard) {
    for (const row of replyMessage.reply_markup.inline_keyboard) {
      for (const btn of row) {
        if (btn.callback_data?.startsWith('del_')) {
          return btn.callback_data.replace('del_', '');
        }
      }
    }
  }
  return null;
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const { data: profile } = await supabase.from('profiles').select('id, username, last_event_id').eq('telegram_chat_id', chatId).single();

  if (!profile) {
    const text = message.text;
    if (text?.startsWith('/link') || text?.startsWith('/start')) {
      const parts = text.split(' ');
      const code = parts.length > 1 ? parts[1] : null;
      if (code && !code.includes('@')) {
        const { data: userData } = await supabase.from('profiles').update({ telegram_chat_id: chatId, link_code: null }).eq('link_code', code.trim().toUpperCase()).select('username').single();
        if (userData) return await sendTelegramMessage(chatId, `🎉 *Linked!* Welcome @${userData.username}.`);
      }
      return await sendTelegramMessage(chatId, "👋 Welcome! Send `/link YOUR-CODE` from the web app.");
    }
    return await sendTelegramMessage(chatId, "⚠️ Not linked. Send `/link YOUR-CODE`.");
  }

  // Fix 4: Check if replying to a bot message → extract that event's ID
  let replyEventId: string | null = null;
  if (message.reply_to_message) {
    replyEventId = extractEventIdFromReply(message.reply_to_message);
  }

  // Fix 5: Read caption from photos
  const caption = message.caption || "";

  if (message.text) {
    await processEvent(chatId, { type: 'text', content: message.text }, profile, replyEventId);
  } else if (message.voice) {
    await processEvent(chatId, { type: 'voice', fileId: message.voice.file_id }, profile, replyEventId);
  } else if (message.photo) {
    const fileId = message.photo[message.photo.length - 1].file_id;
    await processEvent(chatId, { type: 'photo', fileId, caption }, profile, replyEventId);
  }
}

async function processEvent(chatId: number, input: any, profile: any, replyEventId: string | null) {
  try {
    let textToParse = "";
    let base64Image = "";
    const todayStr = new Date().toLocaleDateString('en-CA');

    if (input.type === 'text') {
      textToParse = input.content;
    } else if (input.type === 'voice') {
      await sendTelegramMessage(chatId, "👂 Listening to your voice note...");
      const fileUrl = await getTelegramFileUrl(input.fileId);
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const file = new File([blob], "voice.ogg", { type: "audio/ogg" });
      const transcription = await groq.audio.transcriptions.create({ file, model: "whisper-large-v3-turbo" });
      textToParse = transcription.text;
    } else if (input.type === 'photo') {
      await sendTelegramMessage(chatId, "🔍 Analyzing photo...");
      const fileUrl = await getTelegramFileUrl(input.fileId);
      const response = await fetch(fileUrl);
      const buffer = await response.arrayBuffer();
      base64Image = encode(new Uint8Array(buffer));
      // Fix 5: Include caption as text context
      if (input.caption) textToParse = input.caption;
    }

    const todayDateObj = new Date(todayStr + "T12:00:00Z");

    // Context: last event OR replied-to event
    let contextEvent = null;
    let contextEventId = replyEventId || profile.last_event_id;
    let lastEventContext = "None";
    if (contextEventId) {
      const { data } = await supabase.from('events').select('*').eq('id', contextEventId).single();
      if (data) {
        contextEvent = data;
        lastEventContext = `ID: ${data.id}, Title: "${data.title}", Date: ${data.start_date.split('T')[0]}`;
      }
    }

    const systemPrompt = `
You are a smart scheduling assistant. Today: ${todayStr}.
${replyEventId ? `The user is REPLYING to this specific event → ${lastEventContext}. Treat as UPDATE unless clearly a new event.` : `Last Active Event: ${lastEventContext}.`}

CRITICAL RULES:
1. Separate the ANCHOR DATE from any OFFSET:
   - "remind 3 days before the 21st" → intent: CREATE, event_date_reference: "21st", offset_days: -3
   - "deadline May 15, remind a week early" → intent: CREATE, event_date_reference: "May 15", offset_days: -7  
   - "meeting next Friday" → intent: CREATE, event_date_reference: "next Friday", offset_days: 0

2. UPDATE means modifying the LAST ACTIVE EVENT. Use offset_days relative to that event:
   - "make it a week earlier" → intent: UPDATE, event_date_reference: null, offset_days: -7
   - "push it back 3 days" → intent: UPDATE, event_date_reference: null, offset_days: 3
   - "change date to March 25" → intent: UPDATE, event_date_reference: "March 25", offset_days: 0
   - IMPORTANT: If user says something like "make the month march but a week before" and the event is ALREADY in March, set event_date_reference to null, offset_days: -7. Do NOT set event_date_reference to just a month name like "March" — that would resolve to the 1st of the month.
   - Only set event_date_reference to a SPECIFIC DATE (e.g., "March 25", "next Friday"), never just a bare month name.

3. RESCHEDULE means finding an OLD event BY NAME and changing it:
   - "reschedule my [event name] to Friday" → intent: RESCHEDULE, search_term: "[event name]"
   - Only use RESCHEDULE when the user mentions a specific event name that is NOT the last active event.

4. Do NOT invent event names. search_term must come from the user's actual words.

Return JSON:
{
  "intent": "CREATE" | "UPDATE" | "LIST" | "DELETE" | "SEARCH" | "RESCHEDULE",
  "title": string,
  "event_date_reference": string or null,
  "offset_days": number (default 0),
  "time": string (HH:MM, default 09:00),
  "description": string,
  "category": string,
  "recurrence": string,
  "search_term": string,
  "list_range": "day" | "week" | "month" | "all"
}
`;

    let completion;
    if (base64Image) {
      const userContent: any[] = [];
      if (textToParse) userContent.push({ type: "text", text: `Additional context from user: "${textToParse}". Extract event details from this image.` });
      else userContent.push({ type: "text", text: "Extract event details from this image." });
      userContent.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } });
      
      completion = await groq.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        response_format: { type: "json_object" },
      });
    } else {
      completion = await groq.chat.completions.create({
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: textToParse }],
        model: "llama-3.1-8b-instant",
        response_format: { type: "json_object" },
      });
    }

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    console.log("LLM Output:", JSON.stringify(parsed));

    // ── Route by Intent ──
    if (parsed.intent === "LIST") return await handleList(chatId, parsed, profile, todayDateObj);
    if (parsed.intent === "SEARCH") return await handleSearch(chatId, parsed, profile);
    if (parsed.intent === "DELETE") return await handleDelete(chatId, parsed, profile, todayDateObj);

    // ── Deterministic Date Arithmetic ──
    const offset = parseInt(parsed.offset_days) || 0;
    let referenceDate = todayDateObj;
    if ((parsed.intent === "UPDATE" || parsed.intent === "RESCHEDULE") && contextEvent) {
      referenceDate = new Date(contextEvent.start_date);
    }

    // Detect bare month names that would resolve to the 1st of the month (e.g., "March", "April")
    const bareMonthNames = ["january","february","march","april","may","june","july","august","september","october","november","december"];
    let dateRef = parsed.event_date_reference;
    if (dateRef && typeof dateRef === "string") {
      const trimmed = dateRef.trim().toLowerCase();
      if (bareMonthNames.includes(trimmed) && (parsed.intent === "UPDATE" || parsed.intent === "RESCHEDULE")) {
        // Bare month name during UPDATE → ignore it, use offset from current event
        dateRef = null;
      }
    }

    if (dateRef && dateRef !== "null" && dateRef.trim() !== "") {
      const anchorDate = chrono.parseDate(dateRef, referenceDate, { forwardDate: true });
      if (anchorDate) {
        const finalDate = new Date(anchorDate);
        finalDate.setDate(finalDate.getDate() + offset);
        parsed.date = finalDate.toISOString().split('T')[0];
      }
    } else if (offset !== 0 && contextEvent) {
      // No explicit date given, but offset provided → apply offset to the CURRENT event's date
      const currentDate = new Date(contextEvent.start_date);
      currentDate.setDate(currentDate.getDate() + offset);
      parsed.date = currentDate.toISOString().split('T')[0];
    }
    // Fallback for legacy field
    if (!parsed.date && parsed.date_reference) {
      const res = chrono.parseDate(parsed.date_reference, referenceDate, { forwardDate: true });
      if (res) parsed.date = res.toISOString().split('T')[0];
    }

    // ── Fix 3: RESCHEDULE (search by name, then update) ──
    if (parsed.intent === "RESCHEDULE") {
      const term = parsed.search_term || parsed.title;
      if (!term) return await sendTelegramMessage(chatId, "🤔 Which event should I reschedule? Give me the name.");
      const { data: matches } = await supabase.from('events').select('*').eq('user_id', profile.id).ilike('title', `%${term}%`).limit(5);
      if (!matches || matches.length === 0) return await sendTelegramMessage(chatId, `⚠️ No event matching "${term}" found.`);
      if (matches.length > 1) {
        const btns = matches.map(m => [{ text: `📝 ${m.title} (${m.start_date.split('T')[0]})`, callback_data: `resch_${m.id}_${parsed.date || ''}_${parsed.time || ''}` }]);
        return await sendTelegramMessage(chatId, "Multiple matches. Which one to reschedule?", { inline_keyboard: btns });
      }
      const target = matches[0];
      const updateData: any = {};
      if (parsed.title && parsed.title.toLowerCase() !== term.toLowerCase()) updateData.title = parsed.title;
      const resDate = parsed.date || target.start_date.split('T')[0];
      const resTime = parsed.time || target.start_date.split('T')[1].substring(0, 5);
      updateData.start_date = new Date(`${resDate}T${resTime}:00Z`).toISOString();
      await supabase.from('events').update(updateData).eq('id', target.id);
      await supabase.from('profiles').update({ last_event_id: target.id }).eq('id', profile.id);
      return await sendTelegramMessage(chatId, `✅ *Rescheduled:* ${target.title}\n📅 ${resDate} @ ${resTime}`);
    }

    // ── UPDATE (last event or replied-to event) ──
    if (parsed.intent === "UPDATE" && contextEventId && contextEvent) {
      const updateData: any = {};
      if (parsed.title) updateData.title = parsed.title;
      const resDate = parsed.date || contextEvent.start_date.split('T')[0];
      const resTime = parsed.time || contextEvent.start_date.split('T')[1].substring(0, 5);
      updateData.start_date = new Date(`${resDate}T${resTime}:00Z`).toISOString();
      await supabase.from('events').update(updateData).eq('id', contextEventId);
      return await sendTelegramMessage(chatId, `✅ *Updated:* ${updateData.title || contextEvent.title}\n📅 ${resDate} @ ${resTime}`);
    }

    // ── CREATE ──
    if (!parsed.title || !parsed.date) return await sendTelegramMessage(chatId, "🤔 I couldn't find clear event details. Could you be more specific?");
    const { data, error } = await supabase.from('events').insert([{
      user_id: profile.id,
      title: parsed.title,
      description: parsed.description || "",
      start_date: new Date(`${parsed.date}T${parsed.time || '09:00'}:00Z`).toISOString(),
      category: parsed.category || "",
      recurrence: parsed.recurrence || "none"
    }]).select().single();
    if (!error) {
      await supabase.from('profiles').update({ last_event_id: data.id }).eq('id', profile.id);
      await sendTelegramMessage(chatId, `📅 *Saved:* ${parsed.title}\n📅 ${parsed.date} @ ${parsed.time || '09:00'}`, {
        inline_keyboard: [[{ text: "🗑️ Delete", callback_data: `del_${data.id}` }]]
      });
    }
  } catch (err: any) {
    console.error(err);
    await sendTelegramMessage(chatId, "⚠️ Sorry, something went wrong. (" + err.message + ")");
  }
}

// ── LIST ──
async function handleList(chatId: number, parsed: any, profile: any, today: Date) {
  let query = supabase.from('events').select('*').eq('user_id', profile.id).order('start_date', { ascending: true });
  if (parsed.event_date_reference || parsed.date_reference) {
    const ref = parsed.event_date_reference || parsed.date_reference;
    const resDate = chrono.parseDate(ref, today);
    if (resDate) {
      const start = new Date(resDate); start.setHours(0,0,0,0);
      const end = new Date(resDate); end.setHours(23,59,59,999);
      if (parsed.list_range === "month") { start.setDate(1); end.setMonth(end.getMonth() + 1); end.setDate(0); }
      query = query.gte('start_date', start.toISOString()).lte('start_date', end.toISOString());
    }
  } else { query = query.gte('start_date', new Date().toISOString()); }
  const { data: events } = await query.limit(15);
  if (!events || events.length === 0) return await sendTelegramMessage(chatId, "📭 No events found.");
  const list = events.map(e => `• *${e.title}*\n  📅 ${e.start_date.split('T')[0]} @ ${e.start_date.split('T')[1].substring(0,5)}`).join("\n\n");
  await sendTelegramMessage(chatId, `🗓️ *Schedule:*\n\n${list}`);
}

// ── SEARCH ──
async function handleSearch(chatId: number, parsed: any, profile: any) {
  const term = parsed.search_term || parsed.title;
  const { data: results } = await supabase.from('events').select('*').eq('user_id', profile.id).ilike('title', `%${term}%`).limit(5);
  if (!results || results.length === 0) return await sendTelegramMessage(chatId, "🔍 No matching events found.");
  const list = results.map(e => `• *${e.title}*\n  📅 ${e.start_date.split('T')[0]} @ ${e.start_date.split('T')[1].substring(0,5)}`).join("\n\n");
  await sendTelegramMessage(chatId, `🔍 *Found:*\n\n${list}`);
}

// ── DELETE ──
async function handleDelete(chatId: number, parsed: any, profile: any, today: Date) {
  let query = supabase.from('events').select('*').eq('user_id', profile.id);
  if (parsed.event_date_reference || parsed.date_reference) {
    const ref = parsed.event_date_reference || parsed.date_reference;
    const resDate = chrono.parseDate(ref, today);
    if (resDate) {
      const start = new Date(resDate); start.setHours(0,0,0,0);
      const end = new Date(resDate); end.setHours(23,59,59,999);
      query = query.gte('start_date', start.toISOString()).lte('start_date', end.toISOString());
    }
  }
  if (parsed.search_term || parsed.title) query = query.ilike('title', `%${parsed.search_term || parsed.title}%`);
  const { data: matches } = await query.limit(5);
  if (!matches || matches.length === 0) return await sendTelegramMessage(chatId, "⚠️ Couldn't find that event to delete.");
  if (matches.length > 1) {
    const btns = matches.map(m => [{ text: `🗑️ ${m.title} (${m.start_date.split('T')[0]})`, callback_data: `del_${m.id}` }]);
    return await sendTelegramMessage(chatId, "Multiple matches. Which to delete?", { inline_keyboard: btns });
  }
  await supabase.from('events').delete().eq('id', matches[0].id);
  await sendTelegramMessage(chatId, `🗑️ Deleted: *${matches[0].title}*`);
}

// ── Helpers ──
async function getTelegramFileUrl(fileId: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const { result } = await res.json();
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${result.file_path}`;
}

async function handleCallbackQuery(callbackQuery: any) {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  if (data.startsWith('del_')) {
    const eventId = data.split('_')[1];
    await supabase.from('events').delete().eq('id', eventId);
    await editTelegramMessage(chatId, callbackQuery.message.message_id, "🗑️ Event deleted.");
  }
  if (data.startsWith('resch_')) {
    const parts = data.split('_');
    const eventId = parts[1];
    const newDate = parts[2] || null;
    const newTime = parts[3] || null;
    if (newDate || newTime) {
      const { data: target } = await supabase.from('events').select('*').eq('id', eventId).single();
      if (target) {
        const resDate = newDate || target.start_date.split('T')[0];
        const resTime = newTime || target.start_date.split('T')[1].substring(0, 5);
        await supabase.from('events').update({ start_date: new Date(`${resDate}T${resTime}:00Z`).toISOString() }).eq('id', eventId);
        await editTelegramMessage(chatId, callbackQuery.message.message_id, `✅ Rescheduled: *${target.title}* → ${resDate} @ ${resTime}`);
      }
    }
  }
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup }),
  });
}

async function editTelegramMessage(chatId: number, messageId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown' }),
  });
}
