import { supabase } from "@/integrations/supabase/client";
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
    let responseData: any = null;
    const todayStr = new Date().toLocaleDateString('en-CA');

    // 1. Prepare data and securely send to Supabase Edge Function
    if (type === 'audio' && input instanceof Blob) {
      // Send audio blob as multipart/form-data
      const formData = new FormData();
      formData.append('file', input, 'audio.webm');
      formData.append('today', todayStr);
      
      const { data, error } = await supabase.functions.invoke('analyze-event', {
        body: formData,
      });
      if (error) throw new Error(error.message);
      responseData = data;
      
    } else {
      // Local Pre-Processing (OCR if image, or just raw text)
      let textToParse = "";
      if (type === 'image' && typeof input === 'string') {
        const { data } = await Tesseract.recognize(input, 'eng');
        textToParse = data.text;
      } else if (type === 'text' && typeof input === 'string') {
        textToParse = input;
      }

      if (!textToParse || textToParse.trim() === "") {
        throw new Error("No text could be extracted from input.");
      }

      // Send standard JSON payload to Edge Function
      const { data, error } = await supabase.functions.invoke('analyze-event', {
        body: { text: textToParse, today: todayStr }
      });
      if (error) throw new Error(error.message);
      responseData = data;
    }

    // 2. Safely unpack response from edge function
    console.log("Edge Function Response Data:", responseData);

    const sanitizeNull = (val: any) => {
      if (!val || val === "null" || val === "" || val === "undefined") return null;
      return String(val).trim();
    };
    
    let finalDate = sanitizeNull(responseData.date);
    let finalTime = sanitizeNull(responseData.time);

    if (finalTime && typeof finalTime === 'string') {
      const parts = finalTime.split(':');
      if (parts.length >= 2) {
        finalTime = parts[0].padStart(2, '0') + ':' + parts[1].padStart(2, '0');
      }
    }

    console.log("Final Cleaned Date:", finalDate, "Time:", finalTime);

    return {
      title: responseData.title || "New AI Event",
      date: finalDate,
      time: finalTime,
      description: responseData.description || "",
      category: responseData.category || "",
      recurrence: responseData.recurrence || "none"
    };

  } catch (error) {
    console.error("AI Parsing Edge Function Error:", error);
    return null;
  }
};
