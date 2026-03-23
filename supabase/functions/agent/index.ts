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
      description: "Create a new calendar event. Backend automatically checks for conflicts before creating.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Event title" },
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          time: { type: "string", description: "Time in HH:MM format (24h). Default 09:00" },
          description: { type: "string", description: "Event description" },
          category: { type: "string", enum: ["work", "personal", "family", "health", "social", ""], description: "Event category" },
          recurrence: { type: "string", enum: ["none", "daily", "weekly", "monthly", "yearly"], description: "Recurrence pattern. Default none" },
        },
        required: ["title", "date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_events",
      description: "Fetch calendar events within a date range. Use to check schedule, find conflicts, or list events.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date (YYYY-MM-DD)" },
          end_date: { type: "string", description: "End date (YYYY-MM-DD)" },
          search_term: { type: "string", description: "Optional: filter by title (fuzzy match)" },
        },
        required: ["start_date", "end_date"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_event",
      description: "Update an existing event. Pass the event_id and any fields to change.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "The UUID of the event to update" },
          title: { type: "string", description: "New title (optional)" },
          date: { type: "string", description: "New date YYYY-MM-DD (optional)" },
          time: { type: "string", description: "New time HH:MM (optional)" },
          description: { type: "string", description: "New description (optional)" },
          category: { type: "string", description: "New category (optional)" },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_event",
      description: "Delete an event. First call returns event details for confirmation. Call again with confirmed=true to actually delete.",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "UUID of event to delete" },
          confirmed: { type: "boolean", description: "Set to true to confirm deletion. Default false." },
        },
        required: ["event_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "analyze_schedule",
      description: "Analyze the user's schedule. Returns busiest day, free slots, conflicts, and total events for the given period.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Analysis period start (YYYY-MM-DD)" },
          end_date: { type: "string", description: "Analysis period end (YYYY-MM-DD)" },
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
  const start = new Date(`${args.start_date}T00:00:00+05:30`).toISOString();
  const end = new Date(`${args.end_date}T23:59:59+05:30`).toISOString();

  let query = supabase.from('events').select('*').eq('user_id', userId)
    .gte('start_date', start).lte('start_date', end)
    .order('start_date', { ascending: true });

  if (args.search_term) {
    query = query.ilike('title', `%${args.search_term}%`);
  }

  const { data, error } = await query.limit(20);
  if (error) return { error: error.message };

  return {
    count: data?.length || 0,
    events: (data || []).map(e => ({
      id: e.id,
      title: e.title,
      date: e.start_date.split('T')[0],
      time: e.start_date.split('T')[1].substring(0, 5),
      category: e.category || "",
      description: e.description || "",
    })),
  };
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
  return `You are Maantis, an AI scheduling assistant. Today is ${todayStr}.

You can: create, update, delete events, analyze schedules, detect conflicts.

RULES:
1. ALWAYS call get_events before creating to check for time conflicts.
2. If a conflict exists, suggest 2-3 alternative times. Do NOT auto-create over a conflict.
3. For DELETE: show what will be deleted and ask "Should I proceed?". Only call delete_event with confirmed=true after the user says yes.
4. Use tools whenever real data is needed. NEVER guess or hallucinate event data.
5. Be concise but helpful.
6. When resolving dates like "tomorrow", "next Friday", compute the actual YYYY-MM-DD date.
7. For "plan my week" or "what's my schedule": call get_events with the appropriate date range.
8. For "when am I most busy?" or schedule insights: call analyze_schedule.
9. If user says "move/reschedule [event]": first get_events to find it, then update_event.
10. Always respond with the final result in natural language.`;
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
      const completion = await groq.chat.completions.create({
        messages,
        model: "llama-3.3-70b-versatile",
        tools: toolDefinitions,
        tool_choice: "auto",
        temperature: 0.2,
      });

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
