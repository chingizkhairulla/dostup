import { useLanguage } from "@/contexts/LanguageContext";
import { useSimplePurchases } from "@/hooks/useSimplePurchases";
import AccountSettingsView, { SettingsSectionKey } from "@/components/account/AccountSettingsView";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

export function openAccountSettings(section?: SettingsSectionKey) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("open-account-settings", { detail: { section } })
    );
  }
}

interface AccountSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "buyer" | "creator" | "school" | "teacher";
  displayName: string;
  createdAt?: Date | string | null;
  userId?: string;
  initialSection?: SettingsSectionKey;
}

export const AccountSettingsDialog = ({
  open,
  onOpenChange,
  role,
  displayName,
  createdAt,
  userId,
  initialSection,
}: AccountSettingsDialogProps) => {
  const { t } = useLanguage();
  const { data: purchases, isLoading: purchasesLoading } = useSimplePurchases();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        overlayClassName="login-modal-backdrop z-[90]"
        className="z-[90] max-w-4xl h-[88vh] max-h-[720px] sm:h-[85vh] p-0 border border-border/80 overflow-hidden rounded-2xl shadow-2xl bg-background flex flex-col"
      >
        <VisuallyHidden>
          <DialogTitle>{t("accountSettings")}</DialogTitle>
        </VisuallyHidden>
        <AccountSettingsView
          role={role}
          displayName={displayName}
          createdAt={createdAt}
          userId={userId}
          purchases={purchases}
          purchasesLoading={purchasesLoading}
          onClose={() => onOpenChange(false)}
          initialSection={initialSection}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AccountSettingsDialog;
