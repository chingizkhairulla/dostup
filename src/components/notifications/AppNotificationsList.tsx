import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import type { TranslationKey } from "@/lib/translations";

export interface AppNotification {
  id: string;
  product_id: string | null;
  kind: string;
  title: string;
  body: string;
  /** Product title, person's name, count: the text is built in the reader's language from these. */
  params?: Record<string, string | number> | null;
  created_at: string;
}

type Texts = { title: TranslationKey; body?: TranslationKey | "product" };

/** How each kind of notification reads; unknown kinds fall back to the stored Russian text. */
const TEXTS: Record<string, Texts> = {
  payment_allowed: { title: "notif_payment_allowed_title", body: "notif_payment_allowed_body" },
  waitlist_removed: { title: "notif_waitlist_removed_title", body: "product" },
  waitlist_left: { title: "notif_waitlist_left_title", body: "product" },
  seat_opened: { title: "notif_seat_opened_title", body: "notif_seat_opened_body" },
  seats_auto_opened: { title: "notif_seats_title", body: "notif_seats_auto_opened_body" },
  seats_free: { title: "notif_seats_title", body: "notif_seats_free_body" },
  trial_ended: { title: "notif_trial_ended_title", body: "product" },
};

function localized(
  item: AppNotification,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): { title: string; body: string } {
  const texts = TEXTS[item.kind];
  const params = item.params ?? {};
  if (!texts || !Object.keys(params).length) return { title: item.title, body: item.body };
  const body =
    texts.body === "product" ? String(params.product ?? item.body ?? "") : texts.body ? t(texts.body, params) : item.body;
  return { title: t(texts.title, params), body };
}

/** Platform notifications ("Пробный доступ окончен", "Места освободились…") of a buyer or seller. */
export function useAppNotifications(side: "buyer" | "creator", enabled = true) {
  return useQuery({
    queryKey: ["app-notifications", side],
    queryFn: async () => {
      const res =
        side === "creator"
          ? await invokeApi<{ notifications: AppNotification[] }>("manage-products", {
              action: "list_notifications",
              ...creatorCreds(),
            })
          : await invokeApi<{ notifications: AppNotification[] }>("checkout", {
              action: "list_notifications",
              sessionToken: localStorage.getItem("creator_token") || "",
            });
      return res.notifications ?? [];
    },
    enabled,
  });
}

export const AppNotificationCard = ({ item }: { item: AppNotification }) => {
  const { t, language } = useLanguage();
  const { title, body } = localized(item, t);
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-foreground">{title}</p>
            {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: language === "kk" ? kk : ru })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
