import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, Loader2, Megaphone, MoreVertical, Package, Pencil, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AnnouncementFeed from "@/components/announcements/AnnouncementFeed";
import MessengerLayout, { type ChatCategory } from "@/components/messages/MessengerLayout";
import SupportChat from "@/components/SupportChat";
import DirectChat, { useDirectContacts } from "@/components/messages/DirectChat";
import NoProductsEmptyState from "./NoProductsEmptyState";
import AnnouncementComposer from "./AnnouncementComposer";
import DostupMark from "@/components/brand/DostupMark";
import { parseAnnouncement } from "@/components/announcements/parseAnnouncement";
import { DIRECT_PREFIX, previewOf, SUPPORT_CHAT_ID } from "@/components/messages/chatPreview";
import { useCreatorProducts } from "@/hooks/useProducts";
import {
  useAnnouncements,
  useAnnouncementsForProducts,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
  type Announcement,
} from "@/hooks/useAnnouncements";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { useSupportUnread } from "@/hooks/useSupportUnread";
import { useLanguage } from "@/contexts/LanguageContext";

const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : null);

interface Props {
  creatorName: string;
  supportDisplayName?: string;
  onGoToProducts?: () => void;
}

/**
 * Author's messenger: one channel per product on the left, the support thread under
 * personal chats, and the open channel with its composer on the right.
 */
const CreatorMessagesTab = ({ creatorName, supportDisplayName, onGoToProducts }: Props) => {
  const { t } = useLanguage();
  const { data: products = [], isLoading: productsLoading } = useCreatorProducts();
  const supportUnread = useSupportUnread("creator", creatorName);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const productIds = useMemo(() => products.map((p) => p.id), [products]);
  const { data: allPosts = [] } = useAnnouncementsForProducts(productIds);

  const { data: contacts = [] } = useDirectContacts("creator", !productsLoading && products.length > 0);

  const isSupport = selectedId === SUPPORT_CHAT_ID;
  const directPeer = selectedId?.startsWith(DIRECT_PREFIX) ? selectedId.slice(DIRECT_PREFIX.length) : null;
  const isChannel = !isSupport && !directPeer;
  const productId = isChannel ? selectedId ?? undefined : undefined;

  const { data: announcements = [], isLoading: channelLoading } = useAnnouncements(productId);
  const createMut = useCreateAnnouncement();
  const updateMut = useUpdateAnnouncement();
  const deleteMut = useDeleteAnnouncement();

  const [editing, setEditing] = useState<Announcement | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Channels with the freshest post first, like any messenger's chat list.
  const channels = useMemo(() => {
    const latest = new Map<string, { at: number; text: string }>();
    for (const a of allPosts) {
      const at = new Date(a.created_at).getTime();
      const seen = latest.get(a.product_id);
      if (!seen || at > seen.at) latest.set(a.product_id, { at, text: previewOf(a.content_html) });
    }
    return products
      .map((p) => ({ id: p.id, title: p.title, ...(latest.get(p.id) ?? { at: 0, text: "" }) }))
      .sort((a, b) => b.at - a.at);
  }, [products, allPosts]);

  const productTitles = useCallback(
    (ids: string[]) => ids.map((id) => products.find((p) => p.id === id)?.title).filter(Boolean).join(", "),
    [products],
  );

  const categories: ChatCategory[] = useMemo(
    () => [
      {
        key: "channels",
        label: t("messagesChannels"),
        icon: Megaphone,
        items: channels.map((c) => ({
          id: c.id,
          title: c.title,
          subtitle: c.text || t("announcementsCreatorEmpty"),
          timestamp: c.at || undefined,
          icon: Package,
        })),
      },
      {
        key: "direct",
        label: t("messagesDirect"),
        icon: UserRound,
        // Each product shows its buyers who still have access; lapsed ones sit under "Inactive".
        filters: [
          ...products
            .filter((p) => contacts.some((c) => c.active && c.product_ids.includes(p.id)))
            .map((p) => ({ key: p.id, label: p.title })),
          ...(contacts.some((c) => !c.active) ? [{ key: "inactive", label: t("messagesFilterInactive") }] : []),
        ],
        items: [
          {
            id: SUPPORT_CHAT_ID,
            title: t("messagesSupport"),
            subtitle: t("messagesSupportSubtitle"),
            unread: supportUnread,
            avatar: <DostupMark className="h-10 w-10" />,
            verified: true,
            pinned: true,
          },
          ...[...contacts]
            .sort((a, b) => (b.last_message_at ?? "").localeCompare(a.last_message_at ?? "") || a.name.localeCompare(b.name))
            .map((c) => ({
              id: `${DIRECT_PREFIX}${c.peer_id}`,
              title: c.name,
              subtitle: c.last_message_preview || productTitles(c.product_ids),
              timestamp: c.last_message_at ? new Date(c.last_message_at).getTime() : undefined,
              unread: c.unread,
              avatarUrl: c.avatar_url,
              filterKeys: c.active ? c.product_ids : ["inactive"],
            })),
        ],
      },
    ],
    [channels, supportUnread, t, contacts, products, productTitles],
  );

  useEffect(() => {
    if (productsLoading) return;
    const stillThere =
      selectedId === SUPPORT_CHAT_ID ||
      channels.some((c) => c.id === selectedId) ||
      contacts.some((c) => `${DIRECT_PREFIX}${c.peer_id}` === selectedId);
    if (!stillThere) setSelectedId(channels[0]?.id ?? SUPPORT_CHAT_ID);
  }, [channels, contacts, productsLoading, selectedId]);

  // Switching channels must not carry an unfinished edit over to another product.
  useEffect(() => {
    setEditing(null);
    setDeletingId(null);
  }, [selectedId]);

  useStickToBottom(!channelLoading && isChannel, productId ?? null, announcements.length, bodyRef);

  const handleSubmit = async (html: string) => {
    if (!productId) return false;
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, productId, contentHtml: html });
        setEditing(null);
        toast.success(t("announcementSaved"));
      } else {
        await createMut.mutateAsync({ productId, contentHtml: html });
      }
      return true;
    } catch (e) {
      toast.error(errorMessage(e) || t("announcementError"));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!deletingId || !productId) return;
    try {
      await deleteMut.mutateAsync({ id: deletingId, productId });
      if (editing?.id === deletingId) setEditing(null);
      setDeletingId(null);
      toast.success(t("announcementDeleted"));
    } catch (e) {
      toast.error(errorMessage(e) || t("announcementError"));
    }
  };

  const renderActions = (a: Announcement) => {
    const canEdit = parseAnnouncement(a.content_html).text.trim().length > 0;
    return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("announcementActions")}
          className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-opacity hover:bg-background hover:text-foreground focus-ring data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      {/* Keep focus in the input when "Edit" loads the post into it. */}
      <DropdownMenuContent align="start" className="min-w-[180px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        {canEdit && (
          <DropdownMenuItem className="gap-2" onSelect={() => setEditing(a)}>
            <Pencil className="h-4 w-4" />
            {t("edit")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          onSelect={() => setDeletingId(a.id)}
        >
          <Trash2 className="h-4 w-4" />
          {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    );
  };

  if (!productsLoading && products.length === 0) {
    return (
      <div className="space-y-3 px-4 py-6 md:px-6">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("messages")}</h2>
        </div>
        <NoProductsEmptyState section="announcements" onGoToProducts={onGoToProducts} />
      </div>
    );
  }

  const openChannel = channels.find((c) => c.id === selectedId);
  const openContact = directPeer ? contacts.find((c) => c.peer_id === directPeer) : undefined;

  const header = directPeer ? (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
        {openContact?.avatar_url ? (
          <img src={openContact.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          (openContact?.name ?? "•").charAt(0).toUpperCase()
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{openContact?.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {openContact && !openContact.active ? t("messagesFilterInactive") : productTitles(openContact?.product_ids ?? [])}
        </span>
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

  return (
    <>
      <MessengerLayout
        categories={categories}
        selectedId={selectedId}
        onSelect={setSelectedId}
        header={header}
        loading={productsLoading}
        bodyRef={bodyRef}
        footer={
          !isChannel || !productId ? undefined : (
            <AnnouncementComposer
              productId={productId}
              editing={editing ? { id: editing.id, html: editing.content_html } : null}
              onCancelEdit={() => setEditing(null)}
              onSubmit={handleSubmit}
              saving={createMut.isPending || updateMut.isPending}
            />
          )
        }
      >
        {directPeer ? (
          <DirectChat key={directPeer} side="creator" peerId={directPeer} />
        ) : isSupport ? (
          <SupportChat
            userType="creator"
            userRef={creatorName}
            displayName={supportDisplayName || creatorName}
            variant="embedded"
          />
        ) : channelLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AnnouncementFeed
            announcements={announcements}
            emptyText={t("announcementsCreatorEmpty")}
            renderActions={renderActions}
            highlightedId={editing?.id}
            className="min-h-full rounded-none bg-transparent p-3 sm:p-4"
            emptyClassName="min-h-full rounded-none bg-transparent"
          />
        )}
      </MessengerLayout>

      <AlertDialog open={!!deletingId} onOpenChange={(open) => !open && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("announcementDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("announcementDeleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default CreatorMessagesTab;
