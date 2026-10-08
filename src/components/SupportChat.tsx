import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import ChatThread, { type ChatMessage } from "@/components/messages/ChatThread";
import { uploadChatVideo, type ChatAttachment, type ChatAttachmentKind } from "@/lib/chatUpload";
import MessengerInstallHint from "@/components/messages/MessengerInstallHint";

interface Message {
  id: string;
  sender: "user" | "moderator";
  text: string;
  created_at: string;
  attachments?: ChatAttachment[];
}

interface Props {
  userType: "creator" | "teacher" | "student";
  userRef: string;
  displayName: string;
  asModerator?: boolean;
  threadId?: string;
  moderatorToken?: string;
  /** "embedded" drops the card chrome and title bar so the chat fills a messenger pane. */
  variant?: "card" | "embedded";
}

const SupportChat = ({ userType, userRef, displayName, asModerator, threadId: initialThreadId, moderatorToken, variant = "card" }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [loading, setLoading] = useState(true);

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const headers = useMemo(() => ({ apikey: anonKey, Authorization: `Bearer ${anonKey}` }), [anonKey]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (asModerator && threadId) {
      const resp = await fetch(`${baseUrl}/functions/v1/moderator-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "support_get_messages", token: moderatorToken, thread_id: threadId, mark_read: true }),
      });
      const data = await resp.json();
      if (data?.success) setMessages(data.messages);
    } else {
      const resp = await fetch(`${baseUrl}/functions/v1/support-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "get_thread", user_type: userType, user_ref: userRef, display_name: displayName }),
      });
      const data = await resp.json();
      if (data?.success) {
        setThreadId(data.thread.id);
        setMessages(data.messages);
      }
    }
    if (!quiet) setLoading(false);
  }, [asModerator, threadId, moderatorToken, userType, userRef, displayName, baseUrl, headers]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!threadId) return;
    const channel = supabase
      .channel(`support-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as Message;
          // Realtime carries raw storage paths, so a message with files needs a signed reload.
          if (row.attachments?.length) {
            void load(true);
            return;
          }
          setMessages((prev) => prev.some((m) => m.id === row.id) ? prev : [...prev, row]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [threadId, load]);

  const who = { user_type: userType, user_ref: userRef, display_name: displayName };

  const uploadFile = async (file: File, kind: ChatAttachmentKind, signal: AbortSignal): Promise<ChatAttachment> => {
    if (kind === "video") {
      return uploadChatVideo(
        file,
        async (meta) => {
          const resp = await fetch(`${baseUrl}/functions/v1/support-upload`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ action: "presign_video", ...who, ...meta }),
            signal,
          });
          const data = await resp.json();
          if (!resp.ok || !data?.uploadUrl) throw new Error(data?.error || "Upload failed");
          return data;
        },
        signal,
      );
    }
    const form = new FormData();
    form.append("file", file);
    form.append("user_type", userType);
    form.append("user_ref", userRef);
    form.append("display_name", displayName);
    const resp = await fetch(`${baseUrl}/functions/v1/support-upload`, {
      method: "POST",
      headers,
      body: form,
      signal,
    });
    const data = await resp.json();
    if (!resp.ok || !data?.attachment) throw new Error(data?.error || "Upload failed");
    return data.attachment;
  };

  const send = async (text: string, attachments: ChatAttachment[]) => {
    if (asModerator) {
      await fetch(`${baseUrl}/functions/v1/moderator-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "support_send_message", token: moderatorToken, thread_id: threadId, text }),
      });
      return;
    }
    const resp = await fetch(`${baseUrl}/functions/v1/support-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ action: "send_message", ...who, text, attachments }),
    });
    if (!resp.ok) throw new Error("Send failed");
    if (attachments.length) await load(true);
  };

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    mine: asModerator ? m.sender === "moderator" : m.sender === "user",
    text: m.text,
    created_at: m.created_at,
    attachments: m.attachments,
  }));

  return (
    <>
    {!asModerator && variant === "card" && <MessengerInstallHint />}
    <ChatThread
      messages={chatMessages}
      loading={loading}
      variant={variant}
      title={asModerator ? displayName : "Тех. поддержка"}
      canAttach={!asModerator}
      uploadFile={uploadFile}
      send={send}
    />
    </>
  );
};

export default SupportChat;
