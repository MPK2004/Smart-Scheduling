import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseEventFromAI, ParsedEvent } from "@/lib/ai";
import { Image as ImageIcon, Loader2, UploadCloud } from "lucide-react";

interface ImageUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (event: ParsedEvent) => void;
}

const ImageUploadDialog = ({ open, onOpenChange, onParsed }: ImageUploadDialogProps) => {
  const [isParsing, setIsParsing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check if image
    if (!file.type.startsWith('image/')) {
      toast.error("Please upload an image file.");
      return;
    }

    // Convert to base64 Data URL for Puter.js and preview
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setPreview(dataUrl);
      setIsParsing(true);

      try {
        const parsedEvent = await parseEventFromAI(dataUrl, "image");
        if (parsedEvent) {
          onParsed(parsedEvent);
          onOpenChange(false);
          setPreview(null);
        } else {
          toast.error("Could not find event details in the image.");
        }
      } catch (error) {
        toast.error("Failed to parse image.");
      } finally {
        setIsParsing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file.");
    };
    
    reader.readAsDataURL(file);
  };

  const handleReset = () => {
    if (!isParsing) {
      setPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isParsing) {
        onOpenChange(val);
        setPreview(null);
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Scan Event from Image</DialogTitle>
          <DialogDescription>
            Upload a flyer, invitation, or screenshot to automatically create an event.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center justify-center py-6">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />

          {!preview ? (
            <div 
              className="w-full h-48 border-2 border-dashed rounded-lg border-muted-foreground/30 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium">Click to upload image</p>
                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP up to 5MB</p>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center items-center flex-col gap-6">
               <div className="relative w-full max-h-[250px] overflow-hidden rounded-md border shadow-sm">
                 <img src={preview} alt="Upload preview" className="w-full object-contain" />
                 {isParsing && (
                   <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                      <div className="flex flex-col items-center text-primary gap-2 text-center p-4">
                         <Loader2 className="h-10 w-10 animate-spin" />
                         <span className="font-medium">Extracting Text & Analyzing...</span>
                         <span className="text-xs text-muted-foreground mt-1">(This may take a moment the first time it runs)</span>
                      </div>
                   </div>
                 )}
               </div>
               {!isParsing && (
                 <Button variant="outline" onClick={handleReset}>Try Another Image</Button>
               )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImageUploadDialog;
