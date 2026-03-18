import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseEventFromAI, ParsedEvent } from "@/lib/ai";
import { Mic, Square, Loader2 } from "lucide-react";

interface VoiceInputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (event: ParsedEvent) => void;
}

const VoiceInputDialog = ({ open, onOpenChange, onParsed }: VoiceInputDialogProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.current.push(e.data);
        }
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' });
        setIsParsing(true);
        
        try {
          const parsedEvent = await parseEventFromAI(audioBlob, "audio");
          if (parsedEvent) {
            onParsed(parsedEvent);
            onOpenChange(false);
          } else {
            toast.error("Could not understand voice event details.");
          }
        } catch (error) {
          toast.error("Failed to parse voice recording.");
        } finally {
          setIsParsing(false);
        }
        
        // Cleanup tracks to release microphone
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access the microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !isParsing && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Event by Voice</DialogTitle>
          <DialogDescription>
            Speak freely to create an event (e.g. "Gym every Monday at 6 PM").
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-8">
          {isParsing ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analyzing your voice...</p>
            </div>
          ) : (
            <>
              <div 
                className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                  isRecording 
                    ? "bg-red-100 dark:bg-red-900/30 animate-pulse" 
                    : "bg-primary/10"
                }`}
              >
                {!isRecording ? (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="w-20 h-20 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 transition-transform" 
                    onClick={startRecording}
                  >
                    <Mic className="h-10 w-10" />
                  </Button>
                ) : (
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="w-20 h-20 rounded-full bg-red-500 text-white hover:bg-red-600 hover:scale-105 transition-transform" 
                    onClick={stopRecording}
                  >
                    <Square className="h-8 w-8" />
                  </Button>
                )}
              </div>
              <p className="mt-6 text-sm font-medium">
                {isRecording ? "Listening... click to stop" : "Click mic to start recording"}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceInputDialog;
