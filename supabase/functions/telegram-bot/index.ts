import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import Groq from "npm:groq-sdk"

declare const Deno: { env: { get(name: string): string | undefined } };

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;
const WEB_APP_URL = "https://smart-scheduling.vercel.app/";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const groq = new Groq({ apiKey: GROQ_API_KEY });

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "create_event",
      description: "Create event. Auto-checks conflicts.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM 24h. Default 09:00" },
          description: { type: "string" },
          category: { type: "string", enum: ["work", "personal", "family", "health", "social", ""] },
          recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly", "yearly"] },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_events",
      description: "Fetch events. Supports date range, keyword search, or both. At least one of start_date or query is required.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
          query: { type: "string", description: "Keyword to search in title, category, description" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_event",
      description: "Update event fields by event_id.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          title: { type: "string" },
          date: { type: "string", description: "YYYY-MM-DD" },
          time: { type: "string", description: "HH:MM" },
          description: { type: "string" },
          category: { type: "string" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_event",
      description: "Delete event by event_id. A confirmation button is shown to the user automatically - do not ask them to confirm in text first.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_schedule",
      description: "Analyze schedule: busiest day, free slots, conflicts.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "YYYY-MM-DD" },
          end_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
];

async function toolCreateEvent(userId: string, args: any) {
  const time = args.time || "09:00";
  const startDate = new Date(`${args.date}T${time}:00+05:30`).toISOString();

  const startCheck = new Date(`${args.date}T00:00:00+05:30`).toISOString();
  const endCheck = new Date(`${args.date}T23:59:59+05:30`).toISOString();
  const { data: existing } = await supabase
    .from('events').select('*').eq('user_id', userId)
    .gte('start_date', startCheck).lte('start_date', endCheck);

  if (existing && existing.length > 0) {
    const newHour = parseInt(time.split(':')[0]);
    const conflicts = existing.filter(e => {
      const eHour = new Date(e.start_date).getUTCHours();
      return Math.abs(eHour - newHour) < 1;
    });
    if (conflicts.length > 0) {
      return {
        conflict: true,
        message: `Time conflict detected on ${args.date}`,
        conflicting_events: conflicts.map(e => ({
          id: e.id, title: e.title,
          date: e.start_date.split('T')[0],
          time: e.start_date.split('T')[1].substring(0, 5),
        })),
        existing_events_that_day: existing.map(e => ({
          id: e.id, title: e.title,
          time: e.start_date.split('T')[1].substring(0, 5),
        })),
      };
    }
  }

  const { data, error } = await supabase.from('events').insert([{
    user_id: userId,
    title: args.title,
    description: args.description || "",
    start_date: startDate,
    category: args.category || "",
    recurrence: args.recurrence || "none",
  }]).select().single();

  if (error) return { error: error.message };
  return {
    created: true,
    event: { id: data.id, title: data.title, date: args.date, time, category: data.category },
  };
}

async function toolGetEvents(userId: string, args: any) {
  let query = supabase.from('events').select('*').eq('user_id', userId)
    .order('start_date', { ascending: true });

  if (args.start_date && args.end_date) {
    const start = new Date(`${args.start_date}T00:00:00+05:30`).toISOString();
    const end = new Date(`${args.end_date}T23:59:59+05:30`).toISOString();
    query = query.gte('start_date', start).lte('start_date', end);
  }

  const { data, error } = await query.limit(100);
  if (error) return { error: error.message };
  if (!data || data.length === 0) return { count: 0, events: [], message: "No matching events found." };

  const formatEvents = (events: any[]) => ({
    count: events.length,
    events: events.map((e: any) => ({
      id: e.id, title: e.title,
      date: e.start_date.split('T')[0],
      time: e.start_date.split('T')[1].substring(0, 5),
    })),
  });

  // If no keyword query, return all fetched events
  if (!args.query) return formatEvents(data);

  const q = args.query.toLowerCase();
  const matchesText = (event: any, term: string) => {
    const t = term.toLowerCase();
    return (event.title || '').toLowerCase().includes(t) ||
           (event.category || '').toLowerCase().includes(t) ||
           (event.description || '').toLowerCase().includes(t);
  };

  // Primary: exact phrase match
  const exactMatches = data.filter((e: any) => matchesText(e, q));
  if (exactMatches.length > 0) return formatEvents(exactMatches);

  // Fallback: match any individual word (handles typos like "Minvith Das" → "Das" still matches)
  const words = args.query.trim().split(/\s+/).filter((w: string) => w.length >= 2);
  if (words.length > 1) {
    const wordMatches = data.filter((e: any) => words.some((w: string) => matchesText(e, w)));
    if (wordMatches.length > 0) {
      return { ...formatEvents(wordMatches), note: "Fuzzy match — matched on individual words." };
    }
  }

  return { count: 0, events: [], message: "No matching events found." };
}

async function toolUpdateEvent(userId: string, args: any) {
  const { data: existing } = await supabase.from('events').select('*').eq('id', args.event_id).eq('user_id', userId).single();
  if (!existing) return { error: "Event not found" };

  const updateData: any = {};
  if (args.title) updateData.title = args.title;
  if (args.description) updateData.description = args.description;
  if (args.category) updateData.category = args.category;
  if (args.date || args.time) {
    const curDate = existing.start_date.split('T')[0];
    const curTime = existing.start_date.split('T')[1].substring(0, 5);
    const newDate = args.date || curDate;
    const newTime = args.time || curTime;
    updateData.start_date = new Date(`${newDate}T${newTime}:00+05:30`).toISOString();
  }

  return {
    requires_confirmation: true,
    action: { type: 'update', event_id: existing.id, data: updateData, title: existing.title },
    event: { id: existing.id, title: existing.title },
    changes: updateData,
    message: `Not applied yet - pending confirmation. If updating multiple events, call update_event for each one; one combined confirmation is shown after you finish. Briefly summarize the change(s), do not ask the user to type yes/no.`,
  };
}

async function toolDeleteEvent(userId: string, args: any) {
  const { data: event } = await supabase.from('events').select('*')
    .eq('id', args.event_id).eq('user_id', userId).single();
  if (!event) return { error: "Event not found" };

  return {
    requires_confirmation: true,
    action: { type: 'delete', event_id: event.id, title: event.title },
    event: { id: event.id, title: event.title, date: event.start_date.split('T')[0], time: event.start_date.split('T')[1].substring(0, 5) },
    message: `Not deleted yet - pending confirmation. If the user asked to delete multiple events, call delete_event for each one; one combined confirmation is shown after you finish all of them. Briefly state what will be deleted, do not ask the user to type yes/no.`,
  };
}

async function toolAnalyzeSchedule(userId: string, args: any) {
  const start = new Date(`${args.start_date}T00:00:00+05:30`).toISOString();
  const end = new Date(`${args.end_date}T23:59:59+05:30`).toISOString();

  const { data: events } = await supabase.from('events').select('*').eq('user_id', userId)
    .gte('start_date', start).lte('start_date', end)
    .order('start_date', { ascending: true });

  if (!events || events.length === 0) {
    return { total_events: 0, busiest_day: null, free_slots: [], conflicts: [], message: "No events in this period." };
  }

  const dayCounts: Record<string, number> = {};
  const dayEvents: Record<string, any[]> = {};
  for (const e of events) {
    const day = e.start_date.split('T')[0];
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    if (!dayEvents[day]) dayEvents[day] = [];
    dayEvents[day].push({ title: e.title, time: e.start_date.split('T')[1].substring(0, 5) });
  }

  const busiestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];

  const conflicts: any[] = [];
  for (const [day, evts] of Object.entries(dayEvents)) {
    for (let i = 0; i < evts.length; i++) {
      for (let j = i + 1; j < evts.length; j++) {
        const h1 = parseInt(evts[i].time.split(':')[0]);
        const h2 = parseInt(evts[j].time.split(':')[0]);
        if (Math.abs(h1 - h2) < 1) {
          conflicts.push({ day, event1: evts[i].title, event2: evts[j].title, overlap: evts[i].time });
        }
      }
    }
  }

  const freeSlots: any[] = [];
  for (const day of Object.keys(dayCounts)) {
    const busyHours = new Set(dayEvents[day].map(e => parseInt(e.time.split(':')[0])));
    const slots: string[] = [];
    for (let h = 9; h < 18; h++) {
      if (!busyHours.has(h)) slots.push(`${h}:00-${h + 1}:00`);
    }
    if (slots.length > 0) freeSlots.push({ day, slots });
  }

  return {
    total_events: events.length,
    busiest_day: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    conflicts,
    free_slots: freeSlots,
  };
}

async function executeTool(userId: string, toolName: string, args: any): Promise<any> {
  switch (toolName) {
    case "create_event": return await toolCreateEvent(userId, args);
    case "get_events": return await toolGetEvents(userId, args);
    case "update_event": return await toolUpdateEvent(userId, args);
    case "delete_event": return await toolDeleteEvent(userId, args);
    case "analyze_schedule": return await toolAnalyzeSchedule(userId, args);
    default: return { error: `Unknown tool: ${toolName}` };
  }
}

function buildSystemPrompt(todayStr: string, timeStr: string) {
  return `You are Maantis, a scheduling agent on Telegram. Today is ${todayStr}. The current time right now is ${timeStr} IST (India Standard Time, 24h). Year is ${todayStr.split('-')[0]}.

All dates/times you pass to tools (date, time, start_date, end_date) are interpreted as IST - always work in IST, never convert to UTC or any other timezone yourself.
For relative times ("in 5 minutes", "in an hour", "tonight"), compute the target time yourself by adding the offset to the current IST time above. NEVER ask the user what time it is - you already know.

You have FULL access to the user's calendar via tools. Act immediately.

BEHAVIOR:
- When user asks about events, schedules, birthdays, meetings, or anything calendar-related: IMMEDIATELY call get_events with appropriate query and/or date range. Do NOT ask permission. Do NOT say "let me check" or "please confirm". Just call the tool and return results.
- For read operations (listing, searching, checking): NEVER ask confirmation. Just do it.
- Only ask confirmation for DELETE operations.
- Check conflicts before creating events.

TOOL USAGE:
- get_events: pass query for keyword search (e.g. query:"birthday"), date range for time filtering, or both. Backend filters server-side and does fuzzy word-by-word fallback automatically.
- If a name/keyword search returns 0 results, try alternate spellings or just the last name or a broader term. For example, if "Minvith Das" returns nothing, try "Das" or "birthday".
- When user mentions multiple topics (e.g. "hiring challenges and meetups"), call get_events ONCE with a broad date range and no query, then filter the results yourself. Or call get_events multiple times with different queries.
- All dates must use year ${todayStr.split('-')[0]}.

CONTEXT:
- If user replies "yes", "ok", "sure", "list them": continue your previous task immediately. Do NOT restart the conversation.
- Return ONLY data from tool responses. Never invent events.
- Be concise. Give direct answers.`;
}

async function sendTelegramMessage(chatId: number, text: string, replyMarkup?: any) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error("sendTelegramMessage: TELEGRAM_BOT_TOKEN is not set");
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', reply_markup: replyMarkup }),
  });
  if (!res.ok) {
    console.error("sendTelegramMessage failed:", res.status, await res.text());
  }
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function getTelegramFileUrl(fileId: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`);
  const { result } = await res.json();
  return `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${result.file_path}`;
}

type AgentResult = { text: string; needsConfirmation: boolean; listedEvents: { id: string; title: string }[] };

async function runAgent(userId: string, userMessage: string, history: any[] = []): Promise<AgentResult> {
  const nowDate = new Date();
  const todayStr = nowDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const timeStr = nowDate.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  const messages: any[] = [
    { role: "system", content: buildSystemPrompt(todayStr, timeStr) },
    ...history,
    { role: "user", content: userMessage },
  ];

  let maxSteps = 5;
  let finalResponse = "";
  let needsConfirmation = false;
  let listedEvents: { id: string; title: string }[] = [];
  let pendingActions: any[] = [];

  while (maxSteps--) {
    let completion;
    try {
      completion = await groq.chat.completions.create({
        messages,
        model: "openai/gpt-oss-120b",
        tools: toolDefinitions,
        tool_choice: "auto",
        temperature: 0.2,
      });
    } catch (apiErr: any) {
      console.error("Groq API error, retrying without tools:", apiErr.message);
      const fallback = await groq.chat.completions.create({
        messages,
        model: "openai/gpt-oss-120b",
        temperature: 0.2,
      });
      finalResponse = fallback.choices[0]?.message?.content || "Sorry, I could not process that request.";
      break;
    }

    const choice = completion.choices[0];

    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
      finalResponse = choice.message.content || "";
      break;
    }

    messages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments);

      console.log("Tool:", fnName, JSON.stringify(fnArgs));

      let result: any;
      try {
        result = await executeTool(userId, fnName, fnArgs);
      } catch (e: any) {
        console.error("Tool error:", fnName, e.message);
        result = { error: "Tool execution failed: " + e.message };
      }

      console.log("Result:", JSON.stringify(result));

      if (result?.requires_confirmation) {
        needsConfirmation = true;
        if (result.action) pendingActions.push(result.action);
      }
      if (fnName === "get_events" && Array.isArray(result?.events) && result.events.length > 0) {
        listedEvents = result.events.map((e: any) => ({ id: e.id, title: e.title }));
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: fnName,
        content: JSON.stringify(result),
      });
    }
  }

  if (!finalResponse && messages.length > 2) {
    const summary = await groq.chat.completions.create({
      messages: [...messages, { role: "user", content: "Summarize what you just did in one concise sentence." }],
      model: "openai/gpt-oss-120b",
      temperature: 0.2,
    });
    finalResponse = summary.choices[0]?.message?.content || "Done.";
  }

  if (pendingActions.length > 0) {
    await supabase.from('profiles')
      .update({ pending_action: JSON.stringify({ type: 'bulk', actions: pendingActions }) })
      .eq('id', userId);
  }

  return { text: finalResponse, needsConfirmation, listedEvents };
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const { data: profile } = await supabase.from('profiles').select('id, username, conversation_history').eq('telegram_chat_id', chatId).single();

  if (!profile) {
    const text = message.text;
    if (text?.startsWith('/link') || text?.startsWith('/start')) {
      const parts = text.split(' ');
      const code = parts.length > 1 ? parts[1] : null;
      if (code && !code.includes('@')) {
        const { data: userData } = await supabase.from('profiles').update({ telegram_chat_id: chatId, link_code: null }).eq('link_code', code.trim().toUpperCase()).select('username').single();
        if (userData) {
          return await sendTelegramMessage(
            chatId,
            `Linked! Welcome @${userData.username}.\n\nYou can now send me events like:\n- "Lunch with Sarah tomorrow at 1pm"\n- Send a voice note\n- Send a photo of a flyer`,
            { inline_keyboard: [[{ text: "🌐 Open Web App", url: WEB_APP_URL }]] },
          );
        }
      }
      return await sendTelegramMessage(chatId, "Welcome! Send /link YOUR-CODE from the web app.",
        { inline_keyboard: [[{ text: "🌐 Open Web App", url: WEB_APP_URL }]] });
    }
    return await sendTelegramMessage(chatId, "Not linked. Send /link YOUR-CODE.",
      { inline_keyboard: [[{ text: "🌐 Open Web App", url: WEB_APP_URL }]] });
  }

  let userMessage = "";

  if (message.text) {
    userMessage = message.text;
  } else if (message.voice) {
    try {
      const fileUrl = await getTelegramFileUrl(message.voice.file_id);
      const response = await fetch(fileUrl);
      const buffer = await response.arrayBuffer();
      const file = new File([buffer], "voice.ogg", { type: "audio/ogg" });
      const transcription = await groq.audio.transcriptions.create({ file, model: "whisper-large-v3-turbo" });
      userMessage = transcription.text;
    } catch (err: any) {
      console.error("Voice transcription error:", err);
      return await sendTelegramMessage(chatId, "Sorry, I couldn't process that voice note: " + err.message);
    }
  } else if (message.photo) {
    try {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const fileUrl = await getTelegramFileUrl(fileId);
      const response = await fetch(fileUrl);
      const buffer = await response.arrayBuffer();
      const base64 = bufferToBase64(buffer);

      const visionCompletion = await groq.chat.completions.create({
        messages: [
          { role: "user", content: [
            { type: "text", text: `Extract any event details from this image. ${message.caption || ""}` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64}` } },
          ]},
        ],
        model: "qwen/qwen3.6-27b",
      });
      userMessage = visionCompletion.choices[0]?.message?.content || message.caption || "";
    } catch (err: any) {
      console.error("Vision processing error:", err);
      return await sendTelegramMessage(chatId, "Sorry, I couldn't process that image: " + err.message);
    }
  }

  if (!userMessage.trim()) return;

  let history: any[] = [];
  try {
    history = JSON.parse(profile.conversation_history || "[]");
  } catch { history = []; }

  try {
    const agentResult = await runAgent(profile.id, userMessage, history);

    let replyMarkup: any = undefined;
    if (agentResult.needsConfirmation) {
      replyMarkup = { inline_keyboard: [[
        { text: "✅ Confirm", callback_data: "confirm_action" },
        { text: "❌ Cancel", callback_data: "cancel_action" },
      ]] };
    } else if (agentResult.listedEvents.length > 0) {
      replyMarkup = {
        inline_keyboard: agentResult.listedEvents.slice(0, 8).map(e => [
          { text: `🗑️ ${e.title.slice(0, 30)}`, callback_data: `delrequest:${e.id}` },
        ]),
      };
    }

    await sendTelegramMessage(chatId, agentResult.text || "Done.", replyMarkup);

    history.push({ role: "user", content: userMessage });
    history.push({ role: "assistant", content: agentResult.text });
    if (history.length > 6) history = history.slice(-6);

    await supabase.from('profiles').update({ conversation_history: JSON.stringify(history) }).eq('id', profile.id);
  } catch (err: any) {
    console.error("Agent error:", err);
    await sendTelegramMessage(chatId, "Sorry, something went wrong: " + err.message);
  }
}

async function answerCallbackQuery(id: string, text?: string) {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: id, text }),
  });
  if (!res.ok) console.error("answerCallbackQuery failed:", res.status, await res.text());
}

// Handles inline button taps. Two kinds of buttons exist:
// - "delrequest:<id>" (from an event list or a reminder): starts a delete
//   confirmation by stashing it in profiles.pending_action.
// - "confirm_action" / "cancel_action": resolves whatever is currently
//   pending (set here, or by toolDeleteEvent/toolUpdateEvent via chat).
async function handleCallbackQuery(cq: any) {
  const chatId = cq.message?.chat?.id;
  const data = cq.data as string;
  if (!chatId || !data) { await answerCallbackQuery(cq.id); return; }

  const { data: profile } = await supabase.from('profiles').select('id, pending_action').eq('telegram_chat_id', chatId).single();
  if (!profile) { await answerCallbackQuery(cq.id, "Not linked."); return; }

  if (data.startsWith('delrequest:')) {
    const eventId = data.slice('delrequest:'.length);
    const { data: event } = await supabase.from('events').select('id,title').eq('id', eventId).eq('user_id', profile.id).single();
    if (!event) { await answerCallbackQuery(cq.id, "Event not found."); return; }

    await supabase.from('profiles')
      .update({ pending_action: JSON.stringify({ type: 'delete', event_id: event.id, title: event.title }) })
      .eq('id', profile.id);

    await answerCallbackQuery(cq.id);
    await sendTelegramMessage(chatId, `Delete *"${event.title}"*?`, {
      inline_keyboard: [[
        { text: "✅ Confirm", callback_data: "confirm_action" },
        { text: "❌ Cancel", callback_data: "cancel_action" },
      ]],
    });
    return;
  }

  if (data === 'confirm_action') {
    if (!profile.pending_action) { await answerCallbackQuery(cq.id, "Nothing pending."); return; }
    const pending = JSON.parse(profile.pending_action);
    await supabase.from('profiles').update({ pending_action: null }).eq('id', profile.id);
    await answerCallbackQuery(cq.id, "Done.");

    const actions: any[] = pending.type === 'bulk' ? pending.actions : [pending];
    let deletedCount = 0, updatedCount = 0;
    for (const action of actions) {
      if (action.type === 'delete') {
        const { error } = await supabase.from('events').delete().eq('id', action.event_id).eq('user_id', profile.id);
        if (!error) deletedCount++;
      } else if (action.type === 'update') {
        const { error } = await supabase.from('events').update(action.data).eq('id', action.event_id).eq('user_id', profile.id);
        if (!error) updatedCount++;
      }
    }

    const parts: string[] = [];
    if (deletedCount > 0) parts.push(`🗑️ Deleted ${deletedCount} event${deletedCount > 1 ? 's' : ''}.`);
    if (updatedCount > 0) parts.push(`✅ Updated ${updatedCount} event${updatedCount > 1 ? 's' : ''}.`);
    await sendTelegramMessage(chatId, parts.join('\n') || "Done.");
    return;
  }

  if (data === 'cancel_action') {
    await supabase.from('profiles').update({ pending_action: null }).eq('id', profile.id);
    await answerCallbackQuery(cq.id, "Cancelled.");
    await sendTelegramMessage(chatId, "Cancelled.");
    return;
  }

  await answerCallbackQuery(cq.id);
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
