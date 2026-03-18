import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY
});

const todayStr = "2026-03-18";
const textToParse = "GAMES | FUN | DANCE of ALL ARE CORDIALLY INVITED By ro p a 3 5 A 2 Lad \\n y% “80w. MANAGEMENT | PRINCIPAL | STAFF | STUDENTS «= fg iy il me & Lh A . Pais Ce bliss 7. \\n Event on 20th Oct at 5 PM";

const basePrompt = `
You are an expert scheduling assistant. Extract event details from the following input into a STRICT JSON object.
IMPORTANT: Ignore any junk characters, menus, random symbols, or irrelevant text (especially from OCR). Focus ONLY on the core event details.

Context Information: 
- Today's date is ${todayStr}. Use this to calculate actual dates for relative words like "today", "tomorrow", "Friday", "next week", etc.

Use exactly these keys:
- "title" (string, clean up any messy text into a short, clear title)
- "date" (string, MUST be exactly YYYY-MM-DD format. Example: "2024-05-15". If you cannot determine it, return null)
- "time" (string, MUST be exactly HH:MM format in 24-hour time. Example: "14:30" for 2:30 PM, "09:00" for 9 AM. If you cannot determine it, return null)
- "description" (string, clean summary of any extra context. Do not include random junk characters. If none, return "")
- "category" (string, pick one closest match: "work", "personal", "family", "health", "social", or "")
- "recurrence" (string, one of: "none", "daily", "weekly", "monthly", "yearly", default to "none")

Input Text to Analyze:
"""
${textToParse}
"""
`;

async function main() {
  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: basePrompt }],
    model: "llama-3.1-8b-instant",
    response_format: { type: "json_object" },
    temperature: 0,
  });
  console.log(completion.choices[0]?.message?.content);
}
main();
