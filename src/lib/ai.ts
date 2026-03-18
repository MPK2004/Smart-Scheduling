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
Use these precise keys:
- "title" (string, a short succinct title)
- "date" (string, format YYYY-MM-DD, use null if not specified)
- "time" (string, format HH:MM in 24-hour time, use null if not specified)
- "description" (string, any extra context, or empty string)
- "category" (string, pick one closest match: "work", "personal", "family", "health", "social", or empty string)
- "recurrence" (string, one of: "none", "daily", "weekly", "monthly", "yearly", default to "none")

Input Text to Analyze:
"""
${textToParse}
"""
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: basePrompt }],
      model: "llama3-8b-8192", // Fast logic model
      response_format: { type: "json_object" }, // Guarantee valid JSON
      temperature: 0,
    });

    const jsonString = completion.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(jsonString);
    
    return {
      title: parsed.title || "New AI Event",
      date: parsed.date || null,
      time: parsed.time || null,
      description: parsed.description || "",
      category: parsed.category || "",
      recurrence: parsed.recurrence || "none"
    };

  } catch (error) {
    console.error("AI Parsing Error:", error);
    return null;
  }
};
