export interface ParsedEvent {
  title: string;
  date: string | null;
  time: string | null;
  description: string;
  category: string;
  recurrence: string;
}

declare global {
  interface Window {
    puter: any;
  }
}

export const parseEventFromAI = async (
  input: string | Blob,
  type: 'text' | 'image' | 'audio'
): Promise<ParsedEvent | null> => {
  try {
    const puter = window.puter;
    if (!puter) {
      throw new Error("Puter.js not loaded. Make sure the script is in index.html");
    }

    let textToParse = "";

    // Handle Audio (Speech-to-Text)
    if (type === 'audio' && input instanceof Blob) {
      const file = new File([input], "audio.webm", { type: input.type || "audio/webm" });
      const transcription = await puter.ai.speechToText(file);
      textToParse = transcription?.text || transcription || "";
    } else if (type === 'text' && typeof input === 'string') {
      textToParse = input;
    }

    const basePrompt = `
Extract event scheduling details from the following input into a STRICT JSON object with these precise keys (do not add any other keys):
- "title" (string, a short succinct title)
- "date" (string, format YYYY-MM-DD, use null if not specified)
- "time" (string, format HH:MM in 24-hour time, use null if not specified)
- "description" (string, any extra context, or empty string)
- "category" (string, pick one closest match: "work", "personal", "family", "health", "social", or empty string)
- "recurrence" (string, one of: "none", "daily", "weekly", "monthly", "yearly", default to "none")

Return ONLY the raw JSON object. Do not include markdown formatting like \`\`\`json.
`;

    let aiResponse: any;

    if (type === 'image' && typeof input === 'string') {
      // For images, we pass the image data URL along with the prompt
      aiResponse = await puter.ai.chat([
        {
          role: "user",
          content: [
            { type: "text", text: basePrompt + "\\nExtract details from the attached image." },
            { type: "image_url", image_url: { url: input } }
          ]
        }
      ]);
    } else {
      // For text and transcribed audio
      const prompt = basePrompt + `\\nInput: ${textToParse}`;
      aiResponse = await puter.ai.chat(prompt);
    }

    // Extract text from response (Puter chat might return a string or an object)
    let jsonString = typeof aiResponse === 'string' 
      ? aiResponse 
      : (aiResponse?.message?.content || aiResponse?.text || JSON.stringify(aiResponse));

    // Clean up markdown code blocks if the AI still included them
    jsonString = jsonString.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    
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
