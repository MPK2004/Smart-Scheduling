import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Groq from "npm:groq-sdk"

// Declare Deno global to fix TypeScript errors in standard IDE setups
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

    // Check if the request contains audio (FormData) or raw text (JSON)
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

    const systemPrompt = `
You are an expert scheduling assistant. Your ONLY job is to extract event details and output an EXACT, valid JSON object.
Context Information: Today's local date is ${todayStr}. Use this to exactly calculate actual dates for relative words like "today", "tomorrow", "Friday", "next week", etc.

Use EXACTLY these keys and formats:
- "title": (string) A short, clean event title.
- "date": (string) MUST be EXACTLY "YYYY-MM-DD". Calculate the date precisely. If totally unknown, return null.
- "time": (string) MUST be EXACTLY "HH:MM" (24-hour time). E.g., "14:30" (2:30 PM), "09:00" (9 AM). If totally unknown, return null.
- "description": (string) Clean summary. Remove any junk OCR characters, menus, random symbols. Return "" if none.
- "category": (string) Best match: "work", "personal", "family", "health", "social", or "".
- "recurrence": (string) "none", "daily", "weekly", "monthly", "yearly". Default "none".

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
