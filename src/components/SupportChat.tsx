import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

interface Message {
  id: string;
  sender: "user" | "moderator";
  text: string;
  created_at: string;
}

interface Props {
  userType: "creator" | "teacher" | "student";
  userRef: string;
  displayName: string;
  asModerator?: boolean;
  threadId?: string;
  moderatorToken?: string;
}

const SupportChat = ({ userType, userRef, displayName, asModerator, threadId: initialThreadId, moderatorToken }: Props) => {
  const { l } = useLanguage();
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const load = useCallback(async () => {
    setLoading(true);
    if (asModerator && threadId) {
      const resp = await fetch(`${baseUrl}/functions/v1/moderator-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: "support_get_messages", token: moderatorToken, thread_id: threadId, mark_read: true }),
      });
      const data = await resp.json();
      if (data?.success) setMessages(data.messages);
    } else {
      const resp = await fetch(`${baseUrl}/functions/v1/support-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: "get_thread", user_type: userType, user_ref: userRef, display_name: displayName }),
      });
      const data = await resp.json();
      if (data?.success) {
        setThreadId(data.thread.id);
        setMessages(data.messages);
      }
    }
    setLoading(false);
  }, [asModerator, threadId, moderatorToken, userType, userRef, displayName, baseUrl, anonKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`support-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          setMessages((prev) => prev.some(m => m.id === (payload.new as any).id) ? prev : [...prev, payload.new as Message]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    if (asModerator) {
      await fetch(`${baseUrl}/functions/v1/moderator-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: "support_send_message", token: moderatorToken, thread_id: threadId, text: t }),
      });
    } else {
      await fetch(`${baseUrl}/functions/v1/support-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ action: "send_message", user_type: userType, user_ref: userRef, display_name: displayName, text: t }),
      });
    }
    setText("");
    setSending(false);
  };

  return (
    <div className="flex flex-col h-[70vh] max-h-[70vh] border rounded-lg bg-card">
      <div className="px-4 py-3 border-b font-semibold">
        {asModerator ? displayName : l({ ru: "Тех. поддержка", kk: "Техникалық қолдау", en: "Support" })}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex justify-center pt-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm pt-8">{l({ ru: "Нет сообщений. Напишите первое сообщение.", kk: "Хабарламалар жоқ. Алғашқы хабарламаны жазыңыз.", en: "No messages yet. Write the first one." })}</div>
        ) : (
          messages.map((m) => {
            const mine = asModerator ? m.sender === "moderator" : m.sender === "user";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap break-words ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                  {m.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={l({ ru: "Напишите сообщение...", kk: "Хабарлама жазыңыз...", en: "Write a message..." })}
          disabled={sending}
        />
        <Button onClick={send} disabled={sending || !text.trim()} size="icon">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
};

export default SupportChat;