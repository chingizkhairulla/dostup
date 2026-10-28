import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ChatThread, { type ChatMessage } from "@/components/messages/ChatThread";
import { supportUnreadKey } from "@/hooks/useSupportUnread";
import { uploadChatVideo, type ChatAttachment, type ChatAttachmentKind } from "@/lib/chatUpload";

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

/** Signed links live an hour; reusing one for 45 minutes leaves plenty of margin. */
const LINK_REUSE_MS = 45 * 60 * 1000;

const SupportChat = ({ userType, userRef, displayName, asModerator, threadId: initialThreadId, moderatorToken, variant = "card" }: Props) => {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>(initialThreadId);
  const [loading, setLoading] = useState(true);
  // Each refresh signs the files again; keeping the first link stops photos and videos re-downloading.
  const links = useRef(new Map<string, { url: string; at: number }>());

  const withStableLinks = useCallback((rows: Message[]) => {
    const now = Date.now();
    return rows.map((m) => ({
      ...m,
      attachments: m.attachments?.map((a) => {
        if (!a.url) return a;
        const known = links.current.get(a.path);
        if (known && now - known.at < LINK_REUSE_MS) return { ...a, url: known.url };
        links.current.set(a.path, { url: a.url, at: now });
        return a;
      }),
    }));
  }, []);

  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const headers = useMemo(() => ({ apikey: anonKey, Authorization: `Bearer ${anonKey}` }), [anonKey]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    if (asModerator && initialThreadId) {
      const resp = await fetch(`${baseUrl}/functions/v1/moderator-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "support_get_messages", token: moderatorToken, thread_id: initialThreadId, mark_read: true }),
      });
      const data = await resp.json();
      if (data?.success) setMessages(withStableLinks(data.messages));
    } else {
      const resp = await fetch(`${baseUrl}/functions/v1/support-api`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ action: "get_thread", user_type: userType, user_ref: userRef, display_name: displayName }),
      });
      const data = await resp.json();
      if (data?.success) {
        setThreadId(data.thread.id);
        setMessages(withStableLinks(data.messages));
        // Opening the thread marks the replies as read: the header badge goes out right away.
        queryClient.setQueryData(supportUnreadKey(userType, userRef), 0);
      }
    }
    if (!quiet) setLoading(false);
  }, [asModerator, initialThreadId, moderatorToken, userType, userRef, displayName, baseUrl, headers, withStableLinks, queryClient]);

  // The support tables send no realtime events to the browser, so new replies are picked up every few seconds.
  useEffect(() => {
    void load().catch(() => setLoading(false));
    const timer = window.setInterval(() => {
      // A missed refresh is simply retried on the next tick.
      if (document.visibilityState === "visible") void load(true).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

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
    <ChatThread
      messages={chatMessages}
      loading={loading}
      variant={variant}
      title={asModerator ? displayName : "Тех. поддержка"}
      canAttach={!asModerator}
      uploadFile={uploadFile}
      send={send}
    />
  );
};

export default SupportChat;
