import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { kk, ru } from "date-fns/locale";
import { Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";

export interface AppNotification {
  id: string;
  product_id: string | null;
  kind: string;
  title: string;
  body: string;
  created_at: string;
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
  const { language } = useLanguage();
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-foreground">{item.title}</p>
            {item.body && <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>}
            <p className="mt-2 text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: language === "kk" ? kk : ru })}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
