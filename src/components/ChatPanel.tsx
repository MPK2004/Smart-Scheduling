import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Send, Mic, Image, Square, Loader2, Bot, User, Wrench } from "lucide-react";

interface Message {
  role: "user" | "assistant" | "status";
  content: string;
  toolCalls?: { tool: string; args: any }[];
}

interface ChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEventChanged?: () => void;
}

const ChatPanel = ({ open, onOpenChange, onEventChanged }: ChatPanelProps) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "👋 Hey! I'm Maantis, your AI scheduling assistant. I can create events, check your schedule, resolve conflicts, and more. What can I help with?" }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const conversationHistory = useRef<any[]>([]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendToAgent = async (userMessage: string, inputType: string = "text", fileData?: string) => {
    setIsLoading(true);
    setMessages(prev => [...prev, { role: "status", content: "🧠 Thinking..." }]);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in first");
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('agent', {
        body: {
          user_id: user.id,
          message: userMessage,
          input_type: inputType,
          file_data: fileData,
          conversation_history: conversationHistory.current.slice(-10), // Last 10 messages for context
        },
      });

      if (error) throw new Error(error.message);

      // Remove the "thinking" status
      setMessages(prev => prev.filter(m => m.role !== "status"));

      // Add transcription note if voice
      if (data.transcription && inputType === "voice") {
        setMessages(prev => [...prev, { role: "status", content: `🎤 Heard: "${data.transcription}"` }]);
      }

      // Add the response
      const assistantMsg: Message = {
        role: "assistant",
        content: data.response || "I processed your request.",
        toolCalls: data.tool_calls_made,
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Update conversation history for context
      conversationHistory.current.push({ role: "user", content: userMessage });
      conversationHistory.current.push({ role: "assistant", content: data.response });

      // Refresh events in the calendar if tools modified data
      if (data.tool_calls_made?.some((t: any) => ["create_event", "update_event", "delete_event"].includes(t.tool))) {
        onEventChanged?.();
      }

    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.role !== "status"));
      setMessages(prev => [...prev, { role: "assistant", content: `⚠️ Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    await sendToAgent(msg);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());

        // Convert to base64
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = (reader.result as string).split(',')[1];
          setMessages(prev => [...prev, { role: "user", content: "🎤 Voice message" }]);
          await sendToAgent("", "voice", base64);
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      toast.error("Could not access microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      setMessages(prev => [...prev, { role: "user", content: `📷 Image: ${file.name}` }]);
      await sendToAgent(input || "", "image", base64);
      setInput("");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] h-[600px] flex flex-col p-0 gap-0">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b bg-primary/5">
          <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
            <Bot className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Maantis Agent</h3>
            <p className="text-xs text-muted-foreground">AI Scheduling Assistant</p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : msg.role === "status"
                    ? "bg-muted text-muted-foreground italic text-xs py-1.5"
                    : "bg-muted rounded-bl-md"
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                        <Wrench className="h-3 w-3" /> Tools used
                      </p>
                      {msg.toolCalls.map((tc, j) => (
                        <span key={j} className="inline-block text-[11px] bg-background rounded px-1.5 py-0.5 mr-1 mb-0.5 font-mono">
                          {tc.tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-4 w-4 text-white" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Bar */}
        <div className="p-3 border-t bg-background">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 h-9 w-9"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
            >
              <Image className="h-4 w-4 text-muted-foreground" />
            </Button>

            {isRecording ? (
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="shrink-0 h-9 w-9 animate-pulse"
                onClick={stopRecording}
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 h-9 w-9"
                onClick={startRecording}
                disabled={isLoading}
              >
                <Mic className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}

            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask me anything..."
              disabled={isLoading || isRecording}
              className="h-9 text-sm"
            />

            <Button
              type="submit"
              size="icon"
              className="shrink-0 h-9 w-9"
              disabled={isLoading || !input.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ChatPanel;
