import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Mic, Image, MessageSquare, Send } from "lucide-react";

interface QuickActionsProps {
  onAddEvent: () => void;
  onVoiceClick: () => void;
  onImageClick: () => void;
  onTextClick: () => void;
  onTelegramClick: () => void;
}

const QuickActions = ({ onAddEvent, onVoiceClick, onImageClick, onTextClick, onTelegramClick }: QuickActionsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="fixed bottom-6 right-6 md:bottom-8 md:right-8 flex flex-col gap-4 z-50 items-end">
      {isOpen && (
        <div className="flex flex-col gap-4 mb-2 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <Button
            variant="outline"
            size="icon"
            className="rounded-full shadow-md w-14 h-14 bg-background"
            onClick={() => { setIsOpen(false); onTextClick(); }}
          >
            <MessageSquare className="h-6 w-6 text-primary" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full shadow-md w-14 h-14 bg-background"
            onClick={() => { setIsOpen(false); onTelegramClick(); }}
          >
            <Send className="h-6 w-6 text-primary" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full shadow-md w-14 h-14 bg-background"
            onClick={() => { setIsOpen(false); onImageClick(); }}
          >
            <Image className="h-6 w-6 text-primary" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full shadow-md w-14 h-14 bg-background"
            onClick={() => { setIsOpen(false); onVoiceClick(); }}
          >
            <Mic className="h-6 w-6 text-primary" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-full shadow-md w-14 h-14 bg-background"
            onClick={() => { setIsOpen(false); onAddEvent(); }}
          >
            <Plus className="h-6 w-6 text-primary" />
          </Button>
        </div>
      )}
      
      {!isOpen && (
        <Button
          size="icon"
          className="rounded-full bg-primary hover:bg-primary/90 shadow-lg w-14 h-14"
          onClick={() => setIsOpen(true)}
        >
          <Plus className="h-8 w-8 text-white" />
        </Button>
      )}
    </div>
  );
};

export default QuickActions;