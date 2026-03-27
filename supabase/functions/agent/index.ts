import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"
import Groq from "npm:groq-sdk"
import * as chrono from "npm:chrono-node"

declare const Deno: { env: { get(name: string): string | undefined } };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY")!;

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
      description: "Delete event. Returns details first. Pass confirmed=true to confirm.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string" },
          confirmed: { type: "boolean" },
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
  const buildQuery = (searchTerm?: string) => {
    let q = supabase.from('events').select('*').eq('user_id', userId)
      .order('start_date', { ascending: true });

    if (args.start_date && args.end_date) {
      const start = new Date(`${args.start_date}T00:00:00+05:30`).toISOString();
      const end = new Date(`${args.end_date}T23:59:59+05:30`).toISOString();
      q = q.gte('start_date', start).lte('start_date', end);
    }

    if (searchTerm) {
      q = q.or(`title.ilike.%${searchTerm}%,category.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
    }
    return q;
  };

  const formatEvents = (data: any[]) => ({
    count: data.length,
    events: data.map((e: any) => ({
      id: e.id, title: e.title,
      date: e.start_date.split('T')[0],
      time: e.start_date.split('T')[1].substring(0, 5),
    })),
  });

  // Primary search
  const { data, error } = await buildQuery(args.query).limit(20);
  if (error) return { error: error.message };
  if (data && data.length > 0) return formatEvents(data);

  // Fuzzy fallback: if query has multiple words, search each word individually
  if (args.query) {
    const words = args.query.trim().split(/\s+/).filter((w: string) => w.length >= 2);
    if (words.length > 1) {
      const seen = new Set<string>();
      const allMatches: any[] = [];
      for (const word of words) {
        const { data: wordData } = await buildQuery(word).limit(20);
        if (wordData) {
          for (const ev of wordData) {
            if (!seen.has(ev.id)) { seen.add(ev.id); allMatches.push(ev); }
          }
        }
      }
      if (allMatches.length > 0) {
        return { ...formatEvents(allMatches), note: "Fuzzy match — exact query had no results, matched on individual words." };
      }
    }
  }

  return { count: 0, events: [], message: "No matching events found." };
}

async function toolUpdateEvent(userId: string, args: any) {
  const updateData: any = {};
  if (args.title) updateData.title = args.title;
  if (args.description) updateData.description = args.description;
  if (args.category) updateData.category = args.category;
  if (args.date || args.time) {
    const { data: existing } = await supabase.from('events').select('start_date').eq('id', args.event_id).single();
    if (!existing) return { error: "Event not found" };
    const curDate = existing.start_date.split('T')[0];
    const curTime = existing.start_date.split('T')[1].substring(0, 5);
    const newDate = args.date || curDate;
    const newTime = args.time || curTime;
    updateData.start_date = new Date(`${newDate}T${newTime}:00+05:30`).toISOString();
  }

  const { data, error } = await supabase.from('events').update(updateData)
    .eq('id', args.event_id).eq('user_id', userId).select().single();
  if (error) return { error: error.message };
  return {
    updated: true,
    event: { id: data.id, title: data.title, date: data.start_date.split('T')[0], time: data.start_date.split('T')[1].substring(0, 5) },
  };
}

async function toolDeleteEvent(userId: string, args: any) {
  const { data: event } = await supabase.from('events').select('*')
    .eq('id', args.event_id).eq('user_id', userId).single();
  if (!event) return { error: "Event not found" };

  if (!args.confirmed) {
    return {
      requires_confirmation: true,
      event: { id: event.id, title: event.title, date: event.start_date.split('T')[0], time: event.start_date.split('T')[1].substring(0, 5) },
      message: `Are you sure you want to delete "${event.title}" on ${event.start_date.split('T')[0]}?`,
    };
  }

  const { error } = await supabase.from('events').delete().eq('id', args.event_id).eq('user_id', userId);
  if (error) return { error: error.message };
  return { deleted: true, title: event.title };
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
  const allDays = Object.keys(dayCounts);
  for (const day of allDays) {
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

function buildSystemPrompt(todayStr: string) {
  return `You are Maantis, a scheduling agent. Today is ${todayStr}. Year is ${todayStr.split('-')[0]}.

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

serve(async (req: any) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { user_id, message, input_type, file_data, conversation_history } = body;

    if (!user_id) return new Response(JSON.stringify({ error: "user_id required" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const todayStr = new Date().toLocaleDateString('en-CA');
    let userMessage = message || "";

    if (input_type === "voice" && file_data) {
      const binaryData = Uint8Array.from(atob(file_data), c => c.charCodeAt(0));
      const file = new File([binaryData], "voice.ogg", { type: "audio/ogg" });
      const transcription = await groq.audio.transcriptions.create({ file, model: "whisper-large-v3-turbo" });
      userMessage = transcription.text;
    }

    if (input_type === "image" && file_data) {
      const visionCompletion = await groq.chat.completions.create({
        messages: [
          { role: "user", content: [
            { type: "text", text: `Extract any event details (title, date, time, location) from this image. ${userMessage ? "Additional context: " + userMessage : ""}` },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${file_data}` } },
          ]},
        ],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
      });
      userMessage = visionCompletion.choices[0]?.message?.content || userMessage;
    }

    if (!userMessage.trim()) {
      return new Response(JSON.stringify({ error: "No message provided" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const messages: any[] = [
      { role: "system", content: buildSystemPrompt(todayStr) },
    ];

    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history) {
        messages.push(msg);
      }
    }

    messages.push({ role: "user", content: userMessage });

    let maxSteps = 5;
    let finalResponse = "";
    const toolCalls: any[] = [];

    while (maxSteps--) {
      let completion;
      try {
        completion = await groq.chat.completions.create({
          messages,
          model: "llama-3.3-70b-versatile",
          tools: toolDefinitions,
          tool_choice: "auto",
          temperature: 0.2,
        });
      } catch (apiErr: any) {
        console.error("Groq API error, retrying without tools:", apiErr.message);
        const fallback = await groq.chat.completions.create({
          messages,
          model: "llama-3.3-70b-versatile",
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
        toolCalls.push({ tool: fnName, args: fnArgs });

        let result: any;
        try {
          result = await executeTool(user_id, fnName, fnArgs);
        } catch (e: any) {
          console.error("Tool error:", fnName, e.message);
          result = { error: "Tool execution failed: " + e.message };
        }

        console.log("Result:", JSON.stringify(result));

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
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
      });
      finalResponse = summary.choices[0]?.message?.content || "Done.";
    }

    return new Response(JSON.stringify({
      response: finalResponse,
      tool_calls_made: toolCalls,
      transcription: input_type === "voice" ? userMessage : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error("Agent Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
