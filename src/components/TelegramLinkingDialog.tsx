import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Send, CheckCircle, RefreshCw, Copy, Plus } from "lucide-react";
import { toast } from "sonner";

interface TelegramLinkingDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const TelegramLinkingDialog = ({ isOpen, onClose }: TelegramLinkingDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setProfile(data);
      } else if (error && error.code === 'PGRST116') { // No rows found
        // Create a default profile if it doesn't exist
        const defaultUsername = user.email?.split('@')[0] || "user_" + user.id.slice(0, 5);
        const { data: newProfile, error: insertError } = await supabase
          .from('profiles')
          .insert({ id: user.id, username: defaultUsername })
          .select()
          .single();
        
        if (newProfile) {
          setProfile(newProfile);
        } else if (insertError) {
          console.error("Error creating profile:", insertError);
        }
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
    }
  }, [isOpen]);

  const generateCode = async () => {
    setGenerating(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const { error } = await supabase
        .from('profiles')
        .update({ link_code: code })
        .eq('id', user.id);
      
      if (error) {
        toast.error("Failed to generate code: " + error.message);
      } else {
        setProfile({ ...profile, link_code: code });
        toast.success("New linking code generated!");
      }
    }
    setGenerating(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Code copied to clipboard!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-width-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-sky-500" />
            Link Telegram Bot
          </DialogTitle>
          <DialogDescription>
            Connect your account to the Maantis Telegram bot to schedule events via chat, voice, or photos.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 flex flex-col items-center gap-6">
          {loading ? (
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : !profile ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <Plus className="h-12 w-12 text-muted-foreground" />
              <h3 className="font-semibold text-lg">Login Required</h3>
              <p className="text-sm text-muted-foreground">
                Please sign in to your account to link Telegram.
              </p>
            </div>
          ) : profile?.telegram_chat_id ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h3 className="font-semibold text-lg">Connected!</h3>
              <p className="text-sm text-muted-foreground">
                Your account is successfully linked to Telegram.
              </p>
            </div>
          ) : (
            <div className="w-full space-y-4">
              <div className="bg-red-50 border border-red-100 p-3 rounded text-xs text-red-600 font-medium">
                ⚠️ IMPORTANT: Do NOT send your email to the bot. Use the generated code below.
              </div>
              
              <div className="bg-muted p-4 rounded-lg flex flex-col items-center gap-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Linking Code</span>
                {profile?.link_code ? (
                  <div className="flex items-center gap-3 bg-background border rounded-md px-4 py-2 w-full justify-between">
                    <span className="font-mono text-2xl font-bold tracking-widest">{profile.link_code}</span>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(`/link ${profile.link_code}`)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-sm italic text-muted-foreground">No code generated yet</span>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={generateCode} 
                  disabled={generating}
                  className="w-full"
                >
                  {generating ? "Generating..." : profile?.link_code ? "Regenerate Code" : "Generate Code"}
                </Button>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold">How to link:</h4>
                <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
                  <li>Open the <a href="https://t.me/maantis_bot" target="_blank" className="text-primary hover:underline">Maantis Bot</a> on Telegram.</li>
                  <li>Click **Start** or type **/start**.</li>
                  <li>Send your linking code: <code className="bg-muted px-1 rounded">/link {profile?.link_code || "XXXXXX"}</code></li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="secondary">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TelegramLinkingDialog;
