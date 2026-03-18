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

    // Help the LLM calculate Days by actively identifying the current weekday
    const todayDateObj = new Date(todayStr + "T12:00:00Z");
    const todayDayOfWeek = todayDateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const fullTodayContext = `${todayStr} (${todayDayOfWeek})`;

    const systemPrompt = `
You are an expert scheduling assistant. Your ONLY job is to extract event details and output an EXACT, valid JSON object.
Context Information: Today's local date is ${fullTodayContext}. 

Use EXACTLY these keys and formats:
- "thought_process": (string) Step 1: Identify the base reference date. Step 2: Apply any math for relative words (e.g., "previous day", "2 months prior"). Step 3: State the exact resulting calendar day (e.g. "13th May", "March 24th").
- "title": (string) A short, clean event title.
- "date_reference": (string) The final absolute calendar date resolved from your thought process. Drop all relational words. (e.g., replace "previous day of 14th May" with strictly "13th May". Replace "next 4 thursdays" with strictly "next thursday"). If no date, return null.
- "description": (string) Clean summary. Remove any junk OCR characters, menus, random symbols. Return "" if none.
- "category": (string) Best match: "work", "personal", "family", "health", "social", or "".
- "recurrence": (string) Base options: "none", "daily", "weekly", "monthly", "yearly". If the user explicitly gives an ending date/duration (like "for 2 months"), try to calculate the end date and append it using ";until=YYYY-MM-DD". Example: "weekly;until=2026-05-18". Default to "none".

Return ONLY JSON. Do not add any text before or after the JSON.
`;

    const userPrompt = "Extract event details from this text:\\n" + textToParse;

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

    // Deep deterministic NLP Date extraction based on the LLM's mathematically translated phrase
    if (parsed.date_reference) {
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
