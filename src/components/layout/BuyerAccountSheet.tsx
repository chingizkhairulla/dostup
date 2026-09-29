import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Loader2,
  MoreHorizontal,
  Users,
  ChevronRight,
  Minus,
  X,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import {
  useBuyerMobileNavItems,
  useCreatorMobileNavItems,
} from "@/lib/mobileNavPreferences";
import {
  initialsFrom,
  profileDisplayLabel,
  profileRoleLabel,
  profilesInSidebarOrder,
  useProfileAccountActions,
} from "@/components/layout/ProfileAccountRows";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import AddSellerProfileDialog from "@/components/layout/AddSellerProfileDialog";
import { type ProfileType } from "@/lib/creatorAuth";
import { cn } from "@/lib/utils";

export interface ExtraSectionItem {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onClick?: () => void;
}

interface AccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onSelectSection?: (section: string) => void;
  extraSections?: ExtraSectionItem[];
}

/** Mobile account sheet — top '+ Новый профиль', profiles list, bottom '… Другие разделы' */
const AccountSheet = ({
  open,
  onOpenChange,
  onOpenSettings,
  onSelectSection,
  extraSections,
}: AccountSheetProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { profileType } = useSimpleAuth();
  const { profiles, runSwitch, createSeller } = useProfileAccountActions();
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<ProfileType | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sectionsDialogOpen, setSectionsDialogOpen] = useState(false);

  const isCreator = profileType === "creator";
  const buyerNav = useBuyerMobileNavItems();
  const creatorNav = useCreatorMobileNavItems();
  const currentNav = isCreator ? creatorNav : buyerNav;
  const { allItems, activeItems, hiddenItems, setOrder } = currentNav;

  type SectionItemType = (typeof allItems)[0];
  const [activeSlots, setActiveSlots] = useState<(SectionItemType | null)[]>([]);
  const [hiddenList, setHiddenList] = useState<SectionItemType[]>([]);

  useEffect(() => {
    if (sectionsDialogOpen) {
      setActiveSlots([
        activeItems[0] || null,
        activeItems[1] || null,
        activeItems[2] || null,
        activeItems[3] || null,
      ]);
      setHiddenList(hiddenItems);
    }
  }, [sectionsDialogOpen]);

  const filledCount = activeSlots.filter(Boolean).length;
  const missingCount = 4 - filledCount;

  const handleNavigateSection = (key: string, to?: string) => {
    if (missingCount > 0) return;
    setSectionsDialogOpen(false);
    onOpenChange(false);
    if (onSelectSection) {
      onSelectSection(key);
    } else if (to) {
      navigate(to);
    } else if (isCreator) {
      navigate(`/creator?tab=${key}`);
    }
  };

  const handleRemoveSlot = (index: number) => {
    const item = activeSlots[index];
    if (!item) return;

    const nextSlots = [...activeSlots];
    nextSlots[index] = null;
    const nextHidden = [...hiddenList, item];

    setActiveSlots(nextSlots);
    setHiddenList(nextHidden);
  };

  const handleAddFromHidden = (key: string) => {
    const itemToAdd = hiddenList.find((h) => h.key === key);
    if (!itemToAdd) return;
    const emptyIndex = activeSlots.findIndex((s) => s === null);
    if (emptyIndex === -1) return;

    const nextSlots = [...activeSlots];
    nextSlots[emptyIndex] = itemToAdd;
    const nextHidden = hiddenList.filter((h) => h.key !== key);

    setActiveSlots(nextSlots);
    setHiddenList(nextHidden);

    if (!nextSlots.includes(null)) {
      const newOrder = [
        ...nextSlots.map((s) => s!.key),
        ...nextHidden.map((h) => h.key),
      ];
      (setOrder as (o: any) => void)(newOrder);
    }
  };

  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") || "" : "";
  const orderedProfiles = profilesInSidebarOrder(profiles);

  const accountHref =
    profileType === "creator"
      ? "/creator?tab=account"
      : profileType === "school"
        ? "/school"
        : "/dashboard/account";

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
          if (Boolean(res?.ok)) {
            setWizardOpen(false);
            onOpenChange(false);
          }
          return res;
        }}
      />

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl p-4 pt-3 [&>button:last-child]:hidden">
          {/* Header: Title on left, Close button (X) in top-right corner */}
          <div className="flex items-center justify-between pb-1 px-1">
            <SheetTitle className="text-base font-semibold text-foreground">
              {t("navProfiles") || "Профили"}
            </SheetTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {/* Top item: Новый профиль with + inside on the left */}
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              disabled={!!creatingType}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border/80 bg-muted/30">
                {creatingType ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <Plus className="h-4 w-4 text-foreground" strokeWidth={2} />
                )}
              </span>
              <span className="truncate text-[15px] font-medium">{t("addSellerProfile")}</span>
            </button>

            {/* List of existing profiles */}
            <div className="flex max-h-[45vh] flex-col gap-1 overflow-y-auto py-1">
              {orderedProfiles.map((profile) => {
                const active = profile.id === activeProfileId;
                const busy = busyProfileId === profile.id;
                const displayName = profileDisplayLabel(profile);
                const role = profileRoleLabel(profile, t);

                return (
                  <button
                    key={profile.id}
                    type="button"
                    disabled={busyProfileId !== null && !busy}
                    onClick={() => {
                      setBusyProfileId(profile.id);
                      void runSwitch(profile, navigate, () => {
                        setBusyProfileId(null);
                        onOpenChange(false);
                      });
                    }}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {active && (
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-[#FF6B00]" aria-hidden />
                    )}
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full overflow-hidden border border-border/80 bg-muted text-foreground font-semibold text-xs select-none">
                      {profile.avatarUrl && !busy ? (
                        <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span>{initialsFrom(displayName)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-left">
                      <p className="truncate text-[15px] font-medium leading-tight">{displayName}</p>
                      <p className="truncate text-[12px] leading-tight text-[#6B7280]">{role}</p>
                    </div>
                    {active && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF6B00]" aria-hidden />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Bottom divider and '… Все разделы' button */}
            <div className="mx-1 my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setSectionsDialogOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/40">
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
              </span>
              <span className="truncate text-[15px]">{t("allSections") || "Все разделы"}</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal Dialog for 'Все разделы' */}
      <Dialog
        open={sectionsDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && missingCount > 0) return;
          setSectionsDialogOpen(nextOpen);
        }}
      >
        <DialogContent
          onPointerDownOutside={(e) => {
            if (missingCount > 0) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (missingCount > 0) e.preventDefault();
          }}
          className={cn(
            "max-w-sm rounded-2xl p-5 max-h-[85vh] overflow-y-auto",
            missingCount > 0 && "[&>button:last-child]:hidden",
          )}
        >
          <DialogHeader className="text-left sm:text-left pb-1">
            <DialogTitle className="text-lg font-semibold text-left">
              {t("allSections") || "Все разделы"}
            </DialogTitle>
          </DialogHeader>

          {/* Group 1: On bottom bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("onBottomNav") || "На нижней панели"}
              </span>
              {missingCount > 0 ? (
                <span className="text-[12px] font-semibold text-destructive animate-pulse">
                  Добавьте ещё {missingCount}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-muted-foreground">
                  4/4
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              {activeSlots.map((item, index) => {
                if (!item) {
                  return (
                    <div
                      key={`empty-slot-${index}`}
                      className="flex items-center justify-between rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-2.5 transition-colors select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-destructive/50 text-destructive/70">
                          <Plus className="h-4 w-4" />
                        </span>
                        <span className="text-[14px] font-medium text-muted-foreground">
                          Пустое место
                        </span>
                      </div>
                    </div>
                  );
                }

                const SecIcon = item.icon;

                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between rounded-xl border border-border/80 bg-card p-2 transition-colors"
                  >
                    <button
                      type="button"
                      disabled={missingCount > 0}
                      onClick={() => handleNavigateSection(item.key, (item as any).to)}
                      className="flex flex-1 items-center gap-2.5 text-left min-w-0 mr-1 disabled:cursor-default"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                        <SecIcon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span className="text-[14px] font-medium truncate">
                        {t(item.labelKey as any)}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveSlot(index);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/80 text-muted-foreground hover:bg-destructive/15 hover:text-destructive active:scale-95 transition-all shrink-0 cursor-pointer"
                      aria-label="Убрать"
                      title="Убрать"
                    >
                      <Minus className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Group 2: Hidden sections */}
          <div className="flex flex-col gap-1.5 pt-3 mt-1 border-t border-border/70">
            <div className="px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("hiddenSections") || "Скрытые разделы"}
              </span>
            </div>

            {hiddenList.length === 0 ? (
              <div className="px-1 py-1.5 text-xs text-muted-foreground italic">
                {t("noHiddenSections") || "Все разделы уже на панели"}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {hiddenList.map((item) => {
                  const SecIcon = item.icon;
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between rounded-xl border border-dashed border-border/80 bg-muted/20 p-2 transition-colors"
                    >
                      <button
                        type="button"
                        disabled={missingCount > 0}
                        onClick={() => handleNavigateSection(item.key, (item as any).to)}
                        className="flex flex-1 items-center gap-2.5 text-left min-w-0 mr-1 disabled:cursor-default"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <SecIcon className="h-4 w-4" strokeWidth={1.75} />
                        </span>
                        <span className="text-[14px] font-medium text-muted-foreground truncate">
                          {t(item.labelKey as any)}
                        </span>
                      </button>

                      {missingCount > 0 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddFromHidden(item.key);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-transform active:scale-95 shrink-0 cursor-pointer"
                          aria-label="Добавить"
                          title="Добавить"
                        >
                          <Plus className="h-4 w-4" strokeWidth={2.5} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AccountSheet;
export { AccountSheet as BuyerAccountSheet };
