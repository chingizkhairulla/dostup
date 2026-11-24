type ReadableMessage = { id: string; sender: string; read_at?: string | null };

export function directUnreadIds(messages: ReadableMessage[], side: string, visible: boolean, acknowledged: ReadonlySet<string>): string[] {
  if (!visible) return [];
  return messages.filter((message) => message.sender !== side && !message.read_at && !acknowledged.has(message.id)).map((message) => message.id);
}
