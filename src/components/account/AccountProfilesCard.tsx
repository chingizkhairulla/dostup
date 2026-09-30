import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  initialsFrom,
  profileDisplayLabel,
  profileRoleLabel,
  profilesInSidebarOrder,
  useProfileAccountActions,
} from "@/components/layout/ProfileAccountRows";
import AddSellerProfileDialog from "@/components/layout/AddSellerProfileDialog";
import { type ProfileType } from "@/lib/creatorAuth";
import { cn } from "@/lib/utils";

const AccountProfilesCard = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { profiles, runSwitch, createSeller } = useProfileAccountActions();
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<ProfileType | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") || "" : "";
  const orderedProfiles = profilesInSidebarOrder(profiles);

  return (
    <>
      <AddSellerProfileDialog
        open={wizardOpen}
        creating={!!creatingType}
        onOpenChange={(open) => {
          if (!open && !creatingType) setWizardOpen(false);
        }}
        onConfirm={async (type, displayName, avatarFile) => {
          setCreatingType(type);
          const res = await createSeller(type, displayName, navigate, () => setCreatingType(null), avatarFile);
          if (res?.ok) {
            setWizardOpen(false);
          }
          return res;
        }}
      />

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            {t("manageProfiles")}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWizardOpen(true)}
            disabled={!!creatingType}
            className="h-8 gap-1 text-xs"
          >
            {creatingType ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            <span>{t("addSellerProfile")}</span>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {orderedProfiles.map((profile) => {
            const active = profile.id === activeProfileId;
            const busy = busyProfileId === profile.id;
            const displayName = profileDisplayLabel(profile);
            const role = profileRoleLabel(profile, t);

            return (
              <div
                key={profile.id}
                className={cn(
                  "flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-colors",
                  active ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    {profile.avatarUrl && !busy && (
                      <AvatarImage src={profile.avatarUrl} alt="" />
                    )}
                    <AvatarFallback
                      className={cn(
                        "rounded-full text-xs font-medium",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        initialsFrom(displayName)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium leading-snug">{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{role}</p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {active ? (
                    <Badge variant="secondary" className="gap-1 text-xs font-normal">
                      <Check className="h-3 w-3 text-primary" />
                      {t("currentProfile")}
                    </Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busyProfileId !== null}
                      onClick={() => {
                        setBusyProfileId(profile.id);
                        void runSwitch(profile, navigate, () => setBusyProfileId(null));
                      }}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("switchToProfile")
                      )}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
};

export default AccountProfilesCard;
