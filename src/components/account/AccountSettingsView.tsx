import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate, Link } from "react-router-dom";
import {
  User,
  Globe,
  Bell,
  Download,
  LogOut,
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  Package,
  Loader2,
  Trash2,
  Check,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { usePWADetection } from "@/hooks/usePWADetection";
import { unregisterPushToken } from "@/lib/firebase";
import AvatarSettings from "@/components/account/AvatarSettings";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationPreferences from "@/components/NotificationPreferences";
import BioSettingsCard from "@/components/account/BioSettingsCard";
import { formatPriceTenge } from "@/lib/catalog";
import { invokeApi } from "@/lib/sessionApi";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type SettingsSectionKey = "profile" | "language" | "notifications" | "app";

interface PurchaseItem {
  id: string;
  created_at: string;
  amount: number | string;
  product?: {
    title?: string;
  } | null;
}

interface AccountSettingsViewProps {
  role: "buyer" | "creator" | "school" | "teacher";
  displayName: string;
  createdAt?: Date | string | null;
  userId?: string;
  purchases?: PurchaseItem[];
  purchasesLoading?: boolean;
  onClose?: () => void;
}

export const AccountSettingsView = ({
  role,
  displayName,
  createdAt,
  userId,
  purchases,
  purchasesLoading = false,
  onClose,
}: AccountSettingsViewProps) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { logout, profileType, profiles, switchProfile, setProfileName, applySession, removeProfile } = useSimpleAuth();
  const isAppInstalled = usePWADetection();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("profile");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteProfileConfirm, setShowDeleteProfileConfirm] = useState(false);
  const [deletingProfile, setDeletingProfile] = useState(false);

  // Profile name editing state
  const [nameInput, setNameInput] = useState(displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setNameInput(displayName || "");
    setNameError(null);
  }, [displayName]);

  const activeProfileId = typeof window !== "undefined" ? localStorage.getItem("profile_id") : null;
  const isSeller = profileType === "creator" || profileType === "school" || role === "creator" || role === "school";

  const sections = useMemo(() => [
    {
      id: "profile" as SettingsSectionKey,
      label: t("profile"),
      icon: User,
      description: language === "ru" ? "Имя, фото профиля и данные аккаунта" : "Аты, профиль фотосы және аккаунт деректері",
      keywords: ["профиль", "аватар", "фото", "имя", "название", "аккаунт", "покупки", "удалить", "profile", "avatar", "name", "account", "purchases", "delete"],
    },
    {
      id: "language" as SettingsSectionKey,
      label: language === "ru" ? "Язык приложения" : "Қолданба тілі",
      icon: Globe,
      description: language === "ru" ? "Выбор языка интерфейса" : "Интерфейс тілін таңдау",
      keywords: ["язык", "русский", "казахский", "қазақша", "language", "locale"],
    },
    {
      id: "notifications" as SettingsSectionKey,
      label: t("notificationSettings"),
      icon: Bell,
      description: language === "ru" ? "Напоминания об уроках и push-уведомления" : "Сабақтар туралы еске салулар және хабарландырулар",
      keywords: ["уведомления", "напоминания", "время", "уроки", "занятия", "notifications", "reminders", "push"],
    },
    {
      id: "app" as SettingsSectionKey,
      label: t("appSettings"),
      icon: Download,
      description: language === "ru" ? "Установка приложения на устройство" : "Қолданбаны құрылғыға орнату",
      keywords: ["приложение", "установить", "скачать", "pwa", "телефон", "app", "install", "download"],
    },
  ], [t, language]);

  const activeSectionObj = useMemo(
    () => sections.find((s) => s.id === activeSection) || sections[0],
    [sections, activeSection],
  );

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (sec) =>
        sec.label.toLowerCase().includes(q) ||
        sec.description.toLowerCase().includes(q) ||
        sec.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  }, [sections, searchQuery]);

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === displayName) return;
    setSavingName(true);
    setNameError(null);
    try {
      const token = localStorage.getItem("creator_token") || "";
      if (token) {
        await invokeApi("manage-profile", {
          action: "set_display_name",
          token,
          displayName: trimmed,
          profileId: activeProfileId,
        });
      }
      setProfileName(trimmed);
      toast.success(t("profileNameSaved"));
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("name_taken") || err?.status === 409) {
        setNameError("Это название уже используется. Выберите другое.");
        toast.error("Это название уже используется. Выберите другое.");
      } else {
        toast.error(language === "ru" ? "Не удалось сохранить имя" : "Атын сақтау мүмкін болмады");
      }
    } finally {
      setSavingName(false);
    }
  };

  const handleDeleteSellerProfile = async () => {
    setDeletingProfile(true);
    try {
      const token = localStorage.getItem("creator_token") || "";
      // Find profileId of the seller profile being deleted (match by role/type)
      const sellerProfile = profiles.find(
        (p) => p.type === role || p.type === profileType
      );
      const currentProfileId =
        sellerProfile?.id ||
        localStorage.getItem("profile_id") ||
        activeProfileId ||
        "";

      if (!token || !currentProfileId) {
        toast.error(language === "ru" ? "Не удалось удалить профиль" : "Профильді жою мүмкін болмады");
        return;
      }

      const res = await invokeApi<{
        ok: boolean;
        deletedProfileId?: string;
        session?: any;
      }>("manage-profile", {
        action: "delete_profile",
        token,
        profileId: currentProfileId,
      });

      if (!res.ok) {
        toast.error(language === "ru" ? "Не удалось удалить профиль" : "Профильді жою мүмкін болмады");
        return;
      }

      // Instantly remove deleted profile from UI and switch to buyer
      removeProfile(
        res.deletedProfileId || currentProfileId,
        res.session ?? null,
      );

      toast.success(language === "ru" ? "Профиль удалён" : "Профиль жойылды");
      setShowDeleteProfileConfirm(false);
      onClose?.();
      navigate("/");
    } catch (err) {
      console.error("Delete profile error:", err);
      toast.error(language === "ru" ? "Не удалось удалить профиль" : "Профильді жою мүмкін болмады");
    } finally {
      setDeletingProfile(false);
    }
  };

  const handleLogout = async () => {
    if (userId) {
      await unregisterPushToken(userId).catch(console.error);
    }
    await logout();
    navigate("/");
  };

  const formattedDate = useMemo(() => {
    if (!createdAt) return null;
    try {
      const date = typeof createdAt === "string" ? parseISO(createdAt) : createdAt;
      return format(date, "LLLL yyyy", { locale: ru });
    } catch {
      return null;
    }
  }, [createdAt]);

  const renderSectionContent = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="flex-1 flex flex-col justify-between min-h-full">
            <div className="space-y-4">
              {/* Profile Information & Avatar */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-primary" />
                    {t("profile")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <AvatarSettings displayName={nameInput || displayName} />

                  {/* Edit Profile Name Field */}
                  <div className="space-y-2 pt-1">
                    <Label htmlFor="settings-profile-name" className="text-sm font-medium">
                      {t("profileName")}
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="settings-profile-name"
                        value={nameInput}
                        onChange={(e) => {
                          setNameInput(e.target.value);
                          if (nameError) setNameError(null);
                        }}
                        placeholder={t("profileName")}
                        maxLength={100}
                        className={cn("rounded-xl max-w-sm", nameError && "border-destructive focus-visible:ring-destructive")}
                      />
                      {nameInput.trim() !== displayName && nameInput.trim().length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveName}
                          disabled={savingName}
                          className="rounded-xl px-4 shrink-0"
                        >
                          {savingName ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Check className="h-4 w-4 mr-1.5" />
                              {t("save")}
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    {nameError && (
                      <p className="text-xs text-destructive font-medium animate-in fade-in">{nameError}</p>
                    )}
                  </div>

                  {formattedDate && (
                    <p className="text-xs text-muted-foreground pt-1">
                      {t("memberSince")} {formattedDate}
                    </p>
                  )}
                </CardContent>
              </Card>

              {isSeller && <BioSettingsCard />}

              {/* Buyer Purchases */}
              {role === "buyer" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="w-5 h-5 text-primary" />
                      {t("myPurchases")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {purchasesLoading ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : purchases && purchases.length > 0 ? (
                      <div className="space-y-3">
                        {purchases.map((purchase) => (
                          <div
                            key={purchase.id}
                            className="p-4 rounded-xl bg-muted/50 border border-border"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h3 className="font-medium text-foreground">
                                  {purchase.product?.title || "Продукт"}
                                </h3>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {t("purchased")}{" "}
                                  {format(parseISO(purchase.created_at), "d MMMM yyyy", { locale: ru })}
                                </p>
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {formatPriceTenge(Number(purchase.amount))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-4">
                        {t("noPurchases")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Seller Delete Profile Section - at the bottom */}
            {isSeller && (
              <div className="mt-auto pt-10">
                <Card className="border-destructive/30 bg-destructive/5">
                  <CardHeader className="p-4 sm:p-5 flex flex-row items-center justify-between gap-4 space-y-0">
                    <div className="space-y-1 min-w-0 flex-1">
                      <CardTitle className="text-base text-destructive">
                        {t("deleteProfile")}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        {t("deleteProfileWarning")}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowDeleteProfileConfirm(true)}
                      className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl shrink-0 transition-colors"
                      title={t("deleteProfile")}
                      aria-label={t("deleteProfile")}
                    >
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </CardHeader>
                </Card>
              </div>
            )}
          </div>
        );

      case "language":
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                {language === "ru" ? "Язык приложения" : "Қолданба тілі"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher />
            </CardContent>
          </Card>
        );

      case "notifications":
        return userId ? (
          <NotificationPreferences userId={userId} />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {t("notificationSettings")}
            </CardContent>
          </Card>
        );

      case "app":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                {t("installApp")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("installAppDescription")}
              </p>
              {isAppInstalled ? (
                <p className="text-sm font-medium text-primary">
                  ✓ {language === "ru" ? "Приложение уже установлено" : "Қолданба орнатылған"}
                </p>
              ) : (
                <Link to="/install">
                  <Button variant="outline" className="w-full">
                    {t("viewInstallInstructions")}
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full h-full flex flex-col min-h-0 flex-1">
      {/* Top Header Row */}
      <header className="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-border/70 shrink-0 bg-background/50">
        {/* Mobile Header */}
        <div className="flex items-center gap-2 md:hidden">
          {mobileSectionOpen ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setMobileSectionOpen(false)}
              className="h-8 w-8 rounded-full text-foreground hover:bg-muted"
              aria-label={t("backToSettings")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 rounded-full text-foreground hover:bg-muted"
              aria-label={t("close")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          ) : null}

          <h2 className="text-base font-semibold text-foreground truncate">
            {mobileSectionOpen ? activeSectionObj.label : t("accountSettings")}
          </h2>
        </div>

        {/* Desktop Header */}
        <div className="hidden md:flex items-center">
          <h2 className="text-base font-semibold text-foreground">
            {t("accountSettings")}
          </h2>
        </div>

        {/* Desktop Close Button */}
        {onClose && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="hidden md:flex h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </header>

      {/* 2-column layout (Sidebar + Content) */}
      <div className="flex flex-col md:flex-row md:items-stretch md:gap-4 lg:gap-6 flex-1 min-h-0 p-3 sm:p-4 md:p-5 overflow-hidden">
        {/* Left Sidebar */}
        <aside
          className={cn(
            "w-full md:w-60 lg:w-64 shrink-0 flex flex-col justify-between rounded-2xl border border-border bg-card/60 p-3 shadow-sm h-full min-h-0",
            mobileSectionOpen && "hidden md:flex",
          )}
        >
          <div className="flex flex-col min-h-0 flex-1">
            {/* Search header */}
            <div className="relative mb-3 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchSettings")}
                className="pl-9 pr-8 h-9 text-sm rounded-xl bg-muted/40 border-border/70"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* List of sections */}
            <nav className="flex flex-col gap-1 overflow-y-auto pr-1 flex-1 min-h-0">
              {filteredSections.map((sec) => {
                const Icon = sec.icon;
                const isActive = activeSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => {
                      setActiveSection(sec.id);
                      setMobileSectionOpen(true);
                    }}
                    className={cn(
                      "group relative flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                        )}
                        strokeWidth={isActive ? 2.25 : 1.75}
                      />
                      <span className="truncate">{sec.label}</span>
                    </div>
                    <ChevronRight
                      className={cn(
                        "h-4 w-4 shrink-0 md:hidden",
                        isActive ? "text-primary" : "text-muted-foreground/40",
                      )}
                    />
                  </button>
                );
              })}

              {filteredSections.length === 0 && (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {t("noSettingsFound")}
                </div>
              )}
            </nav>
          </div>

          {/* Fixed Logout Button at bottom of sidebar */}
          <div className="border-t border-border pt-3 mt-2 shrink-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full justify-start gap-3 h-10 px-3 rounded-xl text-sm font-medium text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="truncate">{t("signOut")}</span>
            </Button>
          </div>
        </aside>

        {/* Right Content Pane */}
        <main
          className={cn(
            "flex-1 min-w-0 overflow-y-auto pr-1 h-full flex flex-col",
            !mobileSectionOpen && "hidden md:flex",
          )}
        >
          <div className="animate-fade-in flex-1 flex flex-col min-h-full">{renderSectionContent()}</div>
        </main>
      </div>

      {/* Logout Confirmation Modal Portal (High z-index) */}
      {showLogoutConfirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 motion-safe:animate-fade-in">
            <div
              className="login-modal-backdrop absolute inset-0"
              onClick={() => setShowLogoutConfirm(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">
                  {t("confirmLogout")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("confirmLogoutDescription")}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="rounded-xl"
                >
                  {t("no")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleLogout}
                  className="rounded-xl"
                >
                  {t("yes")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Delete Seller Profile Confirmation Modal Portal (High z-index) */}
      {showDeleteProfileConfirm &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 motion-safe:animate-fade-in">
            <div
              className="login-modal-backdrop absolute inset-0"
              onClick={() => !deletingProfile && setShowDeleteProfileConfirm(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-md bg-background border border-border rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-destructive flex items-center gap-2">
                  <Trash2 className="w-5 h-5" />
                  {t("deleteProfileConfirmTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t("deleteProfileConfirmDesc")}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDeleteProfileConfirm(false)}
                  disabled={deletingProfile}
                  className="rounded-xl"
                >
                  {t("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteSellerProfile}
                  disabled={deletingProfile}
                  className="rounded-xl"
                >
                  {deletingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("delete")}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default AccountSettingsView;
