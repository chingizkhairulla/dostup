import { useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Loader2, Megaphone, Package, Radio, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import AnnouncementFeed from "@/components/announcements/AnnouncementFeed";
import { DIRECT_PREFIX, previewOf, SUPPORT_CHAT_ID } from "@/components/messages/chatPreview";
import DirectChat, { useDirectContacts } from "@/components/messages/DirectChat";
import MessengerLayout, { type ChatCategory } from "@/components/messages/MessengerLayout";
import DostupMark from "@/components/brand/DostupMark";
import SupportChat from "@/components/SupportChat";
import { useAccessibleProducts } from "@/hooks/useAccessibleProducts";
import { useAnnouncementsForProducts } from "@/hooks/useAnnouncements";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useSupportUnread } from "@/hooks/useSupportUnread";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";

interface Props {
  onBrowseCourses?: () => void;
}

/**
 * Buyer's messenger: purchased products are read-only channels on the left and the
 * support thread sits under personal chats. The open chat fills the right pane.
 */
const MessagesTab = ({ onBrowseCourses }: Props) => {
  const { t } = useLanguage();
  const { user } = useSimpleAuth();
  const { accessiblePurchases, productIds, isLoading: productsLoading } = useAccessibleProducts();
  const { data: announcements = [], isLoading: announcementsLoading } = useAnnouncementsForProducts(productIds);
  const supportUnread = useSupportUnread("student", user?.id ?? "");
  const { data: sellers = [] } = useDirectContacts("buyer", !!user);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Channels with the freshest post first, so the list opens on what's new.
  const channels = useMemo(() => {
    const latest = new Map<string, { at: number; text: string }>();
    for (const a of announcements) {
      const at = new Date(a.created_at).getTime();
      const seen = latest.get(a.product_id);
      if (!seen || at > seen.at) latest.set(a.product_id, { at, text: previewOf(a.content_html) });
    }
    const titles = new Map<string, string>();
    for (const p of accessiblePurchases) {
      if (p.product && !titles.has(p.product_id)) titles.set(p.product_id, p.product.title);
    }
    return [...titles.entries()]
      .map(([id, title]) => ({ id, title, ...(latest.get(id) ?? { at: 0, text: "" }) }))
      .sort((a, b) => b.at - a.at);
  }, [accessiblePurchases, announcements]);

  const loading = productsLoading || (productIds.length > 0 && announcementsLoading);

  const categories: ChatCategory[] = useMemo(
    () => [
      {
        key: "channels",
        label: t("messagesChannels"),
        icon: Megaphone,
        items: channels.map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.text || t("announcementsChannelEmpty"),
          timestamp: c.at || undefined,
          icon: Package,
        })),
        emptyText: t("announcementsNoProducts"),
      },
      {
        key: "direct",
        label: t("messagesDirect"),
        icon: UserRound,
        items: [
          {
            id: SUPPORT_CHAT_ID,
            title: t("messagesSupport"),
            subtitle: t("messagesSupportSubtitle"),
            unread: supportUnread,
            avatar: <DostupMark className="h-10 w-10" />,
            verified: true,
          },
          ...[...sellers]
            .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "") || a.name.localeCompare(b.name))
            .map((seller) => ({
              id: `${DIRECT_PREFIX}${seller.peer_id}`,
              title: seller.name,
              subtitle: seller.last_message_preview || t("messagesSeller"),
              timestamp: seller.last_message_at ? new Date(seller.last_message_at).getTime() : undefined,
              unread: seller.unread,
              avatarUrl: seller.avatar_url,
            })),
        ],
      },
    ],
    [channels, supportUnread, t, sellers],
  );

  // Open the freshest channel by default, or the support thread when nothing was bought.
  useEffect(() => {
    if (loading) return;
    const stillThere =
      selectedId === SUPPORT_CHAT_ID ||
      channels.some((c) => c.id === selectedId) ||
      sellers.some((c) => `${DIRECT_PREFIX}${c.peer_id}` === selectedId);
    if (!stillThere) setSelectedId(channels[0]?.id ?? SUPPORT_CHAT_ID);
  }, [channels, sellers, loading, selectedId]);

  const directPeer = selectedId?.startsWith(DIRECT_PREFIX) ? selectedId.slice(DIRECT_PREFIX.length) : null;
  const openSeller = directPeer ? sellers.find((c) => c.peer_id === directPeer) : undefined;
  // Personal chats behave like support: no channel feed, their own composer.
  const isSupport = selectedId === SUPPORT_CHAT_ID || !!directPeer;
  const channelPosts = useMemo(
    () => (isSupport ? [] : announcements.filter((a) => a.product_id === selectedId)),
    [announcements, selectedId, isSupport],
  );

  const openChannel = channels.find((c) => c.id === selectedId);

  useStickToBottom(!loading && !isSupport, isSupport ? null : selectedId, channelPosts.length, bodyRef);

  const header = directPeer ? (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {openSeller?.avatar_url ? (
          <img src={openSeller.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          (openSeller?.name ?? "•").charAt(0).toUpperCase()
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{openSeller?.name}</span>
        <span className="block truncate text-xs text-muted-foreground">{t("messagesSeller")}</span>
      </span>
    </div>
  ) : isSupport ? (
    <div className="flex min-w-0 items-center gap-3">
      <DostupMark className="h-9 w-9" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{t("messagesSupport")}</span>
          <BadgeCheck className="h-4 w-4 shrink-0 text-[#FF6B00]" strokeWidth={2} />
        </span>
        <span className="block truncate text-xs text-muted-foreground">{t("messagesSupportSubtitle")}</span>
      </span>
    </div>
  ) : (
    // The chip list already names the channel, so the bar just states the product in full.
    <div className="flex min-w-0 items-center gap-2.5">
      <Package className="h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} />
      <span className="min-w-0 break-words text-sm font-semibold leading-tight text-foreground">
        {openChannel?.title}
      </span>
    </div>
  );

  const body = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      );
    }
    if (directPeer) {
      return <DirectChat key={directPeer} side="buyer" peerId={directPeer} />;
    }
    if (isSupport) {
      return user ? (
        <SupportChat userType="student" userRef={user.id} displayName={user.name} variant="embedded" />
      ) : null;
    }
    if (channels.length === 0) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Megaphone className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">{t("announcementsNoProducts")}</p>
          {onBrowseCourses && <Button onClick={onBrowseCourses}>{t("browseCourses")}</Button>}
        </div>
      );
    }
    return (
      <AnnouncementFeed
        announcements={channelPosts}
        emptyText={t("announcementsChannelEmpty")}
        className="min-h-full rounded-none bg-transparent p-3 sm:p-4"
        emptyClassName="min-h-full rounded-none bg-transparent"
      />
    );
  };

  return (
    <MessengerLayout
      categories={categories}
      selectedId={selectedId}
      onSelect={setSelectedId}
      header={header}
      loading={loading}
      bodyRef={bodyRef}
      footer={
        // A channel only the author writes in: say so, or the empty bottom reads as a bug.
        isSupport || loading || channels.length === 0 ? undefined : (
          <p className="flex items-center justify-center gap-2 py-2 text-center text-xs text-muted-foreground">
            <Radio className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
            {t("messagesChannelReadOnly")}
          </p>
        )
      }
    >
      {body()}
    </MessengerLayout>
  );
};

export default MessagesTab;
