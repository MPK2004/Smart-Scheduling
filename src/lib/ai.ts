import Groq from "groq-sdk";
import Tesseract from "tesseract.js";

export interface ParsedEvent {
  title: string;
  date: string | null;
  time: string | null;
  description: string;
  category: string;
  recurrence: string;
}

export const parseEventFromAI = async (
  input: string | Blob,
  type: 'text' | 'image' | 'audio'
): Promise<ParsedEvent | null> => {
  try {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("Missing VITE_GROQ_API_KEY in .env");
    }

    const groq = new Groq({
      apiKey,
      dangerouslyAllowBrowser: true, // Required for running in Vite client
    });

    let textToParse = "";

    // 1. Extract raw text based on input type
    if (type === 'audio' && input instanceof Blob) {
      // Audio transcription via Groq Whisper
      const file = new File([input], "audio.webm", { type: input.type || "audio/webm" });
      const transcription = await groq.audio.transcriptions.create({
        file: file,
        model: "whisper-large-v3-turbo",
      });
      textToParse = transcription.text;
    } else if (type === 'image' && typeof input === 'string') {
      // Image OCR via Tesseract.js directly in browser
      // Note: input here is the base64 Data URL or blob URL
      const { data } = await Tesseract.recognize(input, 'eng');
      textToParse = data.text;
    } else if (type === 'text' && typeof input === 'string') {
      textToParse = input;
    }

    if (!textToParse || textToParse.trim() === "") {
      throw new Error("No text could be extracted from input.");
    }

    const todayStr = new Date().toLocaleDateString('en-CA');
    
    // 2. Parse extracted text into structured JSON via Groq LLM
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
      model: "llama-3.1-8b-instant", // Fast logic model
      response_format: { type: "json_object" }, // Guarantee valid JSON
      temperature: 0,
    });

    const jsonString = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(jsonString);
    
    console.log("AI Parsed Raw JSON:", parsed);

    // Strict sanitization to prevent "Invalid Date" crashes
    const sanitizeNull = (val: any) => {
      if (!val || val === "null" || val === "" || val === "undefined") return null;
      return String(val).trim();
    };
    
    let finalDate = sanitizeNull(parsed.date);
    let finalTime = sanitizeNull(parsed.time);

    // Remove any trailing seconds from time if Groq adds them (e.g. "14:30:00" -> "14:30")
    if (finalTime && typeof finalTime === 'string') {
      const parts = finalTime.split(':');
      if (parts.length >= 2) {
        finalTime = parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
      }
    }

    console.log("Final Cleaned Date:", finalDate, "Time:", finalTime);

    return {
      title: parsed.title || "New AI Event",
      date: finalDate,
      time: finalTime,
      description: parsed.description || "",
      category: parsed.category || "",
      recurrence: parsed.recurrence || "none"
    };

  } catch (error) {
    console.error("AI Parsing Error:", error);
    return null;
  }
};
