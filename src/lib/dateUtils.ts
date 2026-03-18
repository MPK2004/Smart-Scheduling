import { Event } from "@/types/event";

/**
 * Mathematically checks if an event falls on a specific requested date string (YYYY-MM-DD),
 * considering its initial start date, recurrence pattern, maximum until-dates, and explicit exceptions.
 */
export const isEventOnDate = (event: Event, targetDateStr: string): boolean => {
  let recurStr = event.recurrence || "none";
  
  // 1. Guard against explicit single-day exceptions early
  const exceptMatch = recurStr.match(/;except=([0-9,-]+)/);
  if (exceptMatch) {
    const exceptions = exceptMatch[1].split(",");
    if (exceptions.includes(targetDateStr)) return false;
    recurStr = recurStr.replace(exceptMatch[0], "");
  }

  // 2. Parse maximum allowed date
  const untilMatch = recurStr.match(/;until=([0-9,-]+)/);
  let untilDate: Date | null = null;
  if (untilMatch) {
    untilDate = new Date(untilMatch[1]);
    recurStr = recurStr.replace(untilMatch[0], "");
  }

  const targetDate = new Date(targetDateStr);

  if (untilDate && targetDate > untilDate) return false;

  // The base "start" date is always valid UNLESS exempted above
  if (event.date === targetDateStr) return true;

  const eventDate = new Date(event.date);
  if (targetDate < eventDate) return false;

  switch (recurStr) {
    case "daily": return true; 
    case "weekly": return eventDate.getDay() === targetDate.getDay();
    case "monthly": return eventDate.getDate() === targetDate.getDate();
    case "yearly": return eventDate.getMonth() === targetDate.getMonth() && eventDate.getDate() === targetDate.getDate();
    case "none":
    default:
      return false;
  }
};
