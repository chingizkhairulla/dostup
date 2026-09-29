import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ChatThread, { type ChatMessage } from "@/components/messages/ChatThread";
import { creatorCreds, invokeApi, studentCreds } from "@/lib/sessionApi";
import { uploadChatVideo, type ChatAttachment, type ChatAttachmentKind } from "@/lib/chatUpload";

export type DirectSide = "creator" | "buyer";

export interface DirectContact {
  /** Buyer profile id for a seller, creator account id for a buyer. */
  peer_id: string;
  name: string;
  avatar_url: string | null;
  product_ids: string[];
  /** Has at least one product they can still open. */
  active: boolean;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread: number;
}

const creds = (side: DirectSide) =>
  side === "creator" ? { as: "creator", ...creatorCreds() } : { as: "buyer", ...studentCreds() };

export const directApi = <T,>(side: DirectSide, body: Record<string, unknown>) =>
  invokeApi<T>("direct-messages", { ...creds(side), ...body });

/** Seller's buyers or buyer's sellers, with the last message and unread count per chat. */
export function useDirectContacts(side: DirectSide, enabled = true) {
  return useQuery({
    queryKey: ["direct-contacts", side],
    queryFn: async () => (await directApi<{ contacts: DirectContact[] }>(side, { action: "list_contacts" })).contacts ?? [],
    enabled,
    refetchInterval: 20_000,
  });
}

interface StoredMessage {
  id: string;
  sender: "creator" | "buyer";
  text: string;
  created_at: string;
  attachments?: ChatAttachment[];
}

/** One personal chat between a seller and a buyer; new messages are picked up every few seconds. */
const DirectChat = ({ side, peerId }: { side: DirectSide; peerId: string }) => {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        const data = await directApi<{ messages: StoredMessage[] }>(side, { action: "get_thread", peerId });
        setMessages(data.messages ?? []);
        queryClient.invalidateQueries({ queryKey: ["direct-contacts", side] });
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [side, peerId, queryClient],
  );

  useEffect(() => {
    setMessages([]);
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const uploadFile = async (file: File, kind: ChatAttachmentKind, signal: AbortSignal): Promise<ChatAttachment> => {
    if (kind === "video") {
      return uploadChatVideo(
        file,
        (meta) =>
          directApi<{ uploadUrl: string; attachment: ChatAttachment }>(side, { action: "presign_video", peerId, ...meta }),
        signal,
      );
    }
    const form = new FormData();
    form.append("file", file);
    form.append("action", "upload");
    form.append("peerId", peerId);
    for (const [key, value] of Object.entries(creds(side))) form.append(key, String(value));
    const { data, error } = await supabase.functions.invoke("direct-messages", { body: form, signal });
    if (error || !data?.attachment) throw error || new Error(data?.error || "Upload failed");
    return data.attachment as ChatAttachment;
  };

  const send = async (text: string, attachments: ChatAttachment[]) => {
    await directApi(side, { action: "send_message", peerId, text, attachments });
    await load(true);
  };

  const chatMessages: ChatMessage[] = messages.map((m) => ({
    id: m.id,
    mine: m.sender === side,
    text: m.text,
    created_at: m.created_at,
    attachments: m.attachments,
  }));

  return (
    <ChatThread
      messages={chatMessages}
      loading={loading}
      variant="embedded"
      canAttach
      uploadFile={uploadFile}
      send={send}
    />
  );
};

export default DirectChat;
