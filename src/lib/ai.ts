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

    // 2. Parse extracted text into structured JSON via Groq LLM
    const basePrompt = `
You are an expert scheduling assistant. Extract event details from the following input into a STRICT JSON object.
IMPORTANT: Ignore any junk characters, menus, random symbols, or irrelevant text (especially from OCR). Focus ONLY on the core event details.

Use exactly these keys:
- "title" (string, clean up any messy text into a short, clear title)
- "date" (string, MUST be exactly YYYY-MM-DD format. If unknown or not found, return null)
- "time" (string, MUST be exactly HH:MM in 24-hour time format. If unknown or not found, return null)
- "description" (string, clean summary of any extra context. Do not include random junk characters. If none, return "")
- "category" (string, pick one closest match: "work", "personal", "family", "health", "social", or "")
- "recurrence" (string, one of: "none", "daily", "weekly", "monthly", "yearly", default to "none")

Input Text to Analyze:
"""
${textToParse}
"""
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: basePrompt }],
      model: "llama-3.1-8b-instant", // Fast logic model
      response_format: { type: "json_object" }, // Guarantee valid JSON
      temperature: 0,
    });

    const jsonString = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(jsonString);
    
    // Strict sanitization to prevent "Invalid Date" crashes
    const sanitizeNull = (val: any) => (val === "null" || val === "" || val === "undefined" ? null : val);
    
    let finalDate = sanitizeNull(parsed.date);
    let finalTime = sanitizeNull(parsed.time);

    // Validate format using regex, if it fails, set to null so the fallback UI triggers
    if (finalDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(finalDate)) {
      finalDate = null; 
    }
    if (finalTime && !/^\\d{2}:\\d{2}$/.test(finalTime)) {
      finalTime = null;
    }

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
