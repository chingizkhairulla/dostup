export default function MessageUnreadBadge({ count }: { count: number }) {
  if (!count) return null;
  return <span aria-label={`Непрочитанных сообщений: ${count}`} className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span>;
}
