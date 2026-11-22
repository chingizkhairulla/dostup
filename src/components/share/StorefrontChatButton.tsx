import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { rememberAuthNext } from "@/lib/creatorAuth";
import { loginPath, loginState } from "@/lib/loginModal";
import { invokeApi, studentCreds } from "@/lib/sessionApi";

type Props = {
  /** Chat about this product: it lands under the product's tab for the seller. */
  productId?: string;
  /** Chat from the seller's storefront: it lands under "Inactive" for the seller. */
  sellerHandle?: string;
  className?: string;
};

/**
 * "Чат" on a storefront. A guest is sent to sign up first and comes back here; a seller profile
 * switches to the buyer one; then the chat with the seller opens in the buyer's messages.
 */
const StorefrontChatButton = ({ productId, sellerHandle, className }: Props) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user, profileType, profiles, switchProfile } = useSimpleAuth();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    if (!user) {
      const back = `${location.pathname}${location.search}`;
      rememberAuthNext(back);
      navigate(loginPath(back), { state: loginState(location) });
      return;
    }
    setBusy(true);
    try {
      if (profileType !== "buyer") {
        const buyer = profiles.find((p) => p.type === "buyer");
        const switched = buyer ? await switchProfile({ profileId: buyer.id }) : await switchProfile({ createType: "buyer" });
        if ("error" in switched) {
          toast.error(t("switchProfileError"));
          return;
        }
      }
      const { peerId } = await invokeApi<{ peerId: string }>("direct-messages", {
        action: "start",
        as: "buyer",
        ...studentCreds(),
        productId: productId ?? "",
        sellerHandle: sellerHandle ?? "",
      });
      await queryClient.invalidateQueries({ queryKey: ["direct-contacts", "buyer"] });
      navigate(`/dashboard/announcements?chat=${encodeURIComponent(peerId)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("storefrontChatError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" className={className} onClick={() => void open()} disabled={busy}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />}
      <span>{t("storefrontChat")}</span>
    </Button>
  );
};

export default StorefrontChatButton;
