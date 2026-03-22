import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Groq from "npm:groq-sdk"
import * as chrono from "npm:chrono-node"

declare const Deno: {
  env: {
    get(name: string): string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) {
      throw new Error("Missing GROQ_API_KEY secret in Supabase");
    }

    const groq = new Groq({ apiKey: groqApiKey });
    let textToParse = "";
    let todayStr = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File;
      todayStr = formData.get("today") as string || new Date().toLocaleDateString('en-CA');

      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3-turbo",
      });
      textToParse = transcription.text;
    } else {
      const body = await req.json();
      textToParse = body.text;
      todayStr = body.today || new Date().toLocaleDateString('en-CA');
    }

    if (!textToParse || textToParse.trim() === "") {
      throw new Error("No text provided or extracted");
    }

    const todayDateObj = new Date(todayStr + "T12:00:00Z");
    const todayDayOfWeek = todayDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const fullTodayContext = `${todayStr} (${todayDayOfWeek})`;

    const systemPrompt = `
You are an expert scheduling assistant. Today is ${fullTodayContext}.

CRITICAL: Many users want REMINDERS BEFORE an event or deadline. You MUST separate the anchor date from any offset.

Examples:
- "appointment on 21st, remind 3 days before" → event_date_reference: "21st", offset_days: -3
- "project due May 15, remind a week early" → event_date_reference: "May 15", offset_days: -7 
- "birthday on April 29, arrange money a month before" → event_date_reference: "April 29", offset_days: -30
- "meeting next Friday" → event_date_reference: "next Friday", offset_days: 0
- "gym tomorrow at 6pm" → event_date_reference: "tomorrow", offset_days: 0

Return ONLY this JSON:
{
  "thought_process": "Step-by-step reasoning about the anchor date and any offset",
  "title": "Short clean event title",
  "event_date_reference": "The anchor/base date as text (e.g., '21st', 'next Friday', 'May 15')",
  "offset_days": 0,
  "time": "HH:MM or null",
  "description": "Clean description or empty string",
  "category": "work|personal|family|health|social or empty",
  "recurrence": "none|daily|weekly|monthly|yearly or with until like weekly;until=YYYY-MM-DD"
}

Rules:
- offset_days is NEGATIVE for "before/prior/early/earlier" and POSITIVE for "after/later". Default 0.
- event_date_reference is the ANCHOR date — the event/deadline/birthday itself.
- The title should describe the REMINDER/ACTION, not just the anchor (e.g., "Arrange money for birthday" not "Birthday").
`;

    const userPrompt = "Extract event details from this text:\n" + textToParse;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "llama-3.1-8b-instant",
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const jsonString = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(jsonString);

    // Deterministic date arithmetic
    if (parsed.event_date_reference) {
      const anchorDate = chrono.parseDate(parsed.event_date_reference, todayDateObj, { forwardDate: true });
      if (anchorDate) {
        const offset = parseInt(parsed.offset_days) || 0;
        const finalDate = new Date(anchorDate);
        finalDate.setDate(finalDate.getDate() + offset);
        parsed.date = finalDate.toISOString().split('T')[0];
      }
    }
    // Fallback: legacy date_reference field
    if (!parsed.date && parsed.date_reference) {
      const resultDate = chrono.parseDate(parsed.date_reference, todayDateObj, { forwardDate: true });
      if (resultDate) {
        parsed.date = resultDate.toISOString().split('T')[0];
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
