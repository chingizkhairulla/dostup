import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import { invokeApi } from "@/lib/sessionApi";
import { isDisplayNameValid } from "@/lib/displayName";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DisplayNameSetupDialogProps {
  open: boolean;
  onSaved: (displayName: string, handle?: string | null) => void;
}

const DisplayNameSetupDialog = ({ open, onSaved }: DisplayNameSetupDialogProps) => {
  const { t } = useLanguage();
  const [value, setValue] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = isDisplayNameValid(value);

  const save = async () => {
    const displayName = value.trim();
    if (!valid || saving) return;
    setSaving(true);
    setErrorText(null);
    try {
      const data = await invokeApi<{ displayName?: string; handle?: string | null }>("manage-profile", {
        action: "set_display_name",
        token: localStorage.getItem("creator_token") || "",
        profileId: localStorage.getItem("profile_id") || "",
        displayName,
      });
      const saved = data.displayName || displayName;
      localStorage.setItem("profile_display_name", saved);
      if (data.handle) {
        localStorage.setItem("profile_handle", data.handle);
      } else if (data.handle === null) {
        localStorage.removeItem("profile_handle");
      }
      toast.success(t("displayNameSaved"));
      onSaved(saved, data.handle);
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("name_taken") || err?.status === 409) {
        setErrorText("Это название уже используется. Выберите другое.");
        toast.error("Это название уже используется. Выберите другое.");
      } else {
        toast.error(t("displayNameSaveError"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("displayNameRequiredTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("displayNameRequiredDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="setup-display-name">{t("sellerNameLabel")}</Label>
          <Input
            id="setup-display-name"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (errorText) setErrorText(null);
            }}
            placeholder={t("sellerNamePlaceholder")}
            maxLength={100}
            autoFocus
            className={cn(errorText && "border-destructive focus-visible:ring-destructive")}
          />
          {errorText && (
            <p className="text-xs text-destructive font-medium animate-in fade-in">{errorText}</p>
          )}
        </div>
        <AlertDialogFooter>
          <Button type="button" onClick={() => void save()} disabled={!valid || saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {t("continue")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default DisplayNameSetupDialog;
