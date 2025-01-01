export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  description: string;
  category?: string;
  recurrence?: string;
}