import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
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
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePWADetection } from "@/hooks/usePWADetection";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";

export type ModeratorSettingsSectionKey = "profile" | "language" | "notifications" | "app";

interface ModeratorSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void;
}

export const ModeratorSettingsDialog = ({
  open,
  onOpenChange,
  onLogout,
}: ModeratorSettingsDialogProps) => {
  const { t, language, l } = useLanguage();
  const isAppInstalled = usePWADetection();
  const [activeSection, setActiveSection] = useState<ModeratorSettingsSectionKey>("profile");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileSectionOpen, setMobileSectionOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const sections = useMemo(
    () => [
      {
        id: "profile" as ModeratorSettingsSectionKey,
        label: t("profile"),
        icon: User,
        description:
          l({ ru: "Данные аккаунта модератора", kk: "Модератор аккаунтының деректері", en: "Moderator account details" }),
        keywords: ["профиль", "аватар", "имя", "аккаунт", "почта", "profile", "name", "account", "email"],
      },
      {
        id: "language" as ModeratorSettingsSectionKey,
        label: l({ ru: "Язык приложения", kk: "Қолданба тілі", en: "App language" }),
        icon: Globe,
        description:
          l({ ru: "Выбор языка интерфейса", kk: "Интерфейс тілін таңдау", en: "Choose the interface language" }),
        keywords: ["язык", "русский", "казахский", "қазақша", "language", "locale"],
      },
      {
        id: "notifications" as ModeratorSettingsSectionKey,
        label: t("notificationSettings"),
        icon: Bell,
        description:
          l({ ru: "Системные уведомления платформы", kk: "Платформаның жүйелік хабарландырулары", en: "Platform system notifications" }),
        keywords: ["уведомления", "оповещения", "напоминания", "notifications"],
      },
      {
        id: "app" as ModeratorSettingsSectionKey,
        label: t("appSettings"),
        icon: Download,
        description:
          l({ ru: "Установка приложения на устройство", kk: "Қолданбаны құрылғыға орнату", en: "Installing the app on your device" }),
        keywords: ["приложение", "установить", "скачать", "pwa", "телефон", "app", "install", "download"],
      },
    ],
    [t, language]
  );

  const activeSectionObj = useMemo(
    () => sections.find((s) => s.id === activeSection) || sections[0],
    [sections, activeSection]
  );

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sections;
    return sections.filter(
      (sec) =>
        sec.label.toLowerCase().includes(q) ||
        sec.description.toLowerCase().includes(q) ||
        sec.keywords.some((k) => k.toLowerCase().includes(q))
    );
  }, [sections, searchQuery]);

  if (!open || typeof document === "undefined") return null;

  const renderSectionContent = () => {
    switch (activeSection) {
      case "profile":
        return (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  {t("profile")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-2xl font-bold border-2 border-primary/30 shadow-xs">
                    M
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-semibold">Модератор Dostup</h3>
                      <Badge variant="outline" className="gap-1 border-primary/30 text-primary bg-primary/5 text-xs">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Администратор
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">dostup.support@gmail.com</p>
                  </div>
                </div>

                <div className="pt-2 border-t space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-muted/40 border text-sm">
                      <span className="text-xs text-muted-foreground block">Роль</span>
                      <span className="font-medium">Модерация и управление</span>
                    </div>
                    <div className="p-3 rounded-xl bg-muted/40 border text-sm">
                      <span className="text-xs text-muted-foreground block">Email для входа</span>
                      <span className="font-medium truncate block">dostup.support@gmail.com</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Этот аккаунт имеет полный административный доступ к проверке продавцов, обращений и жалоб.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      case "language":
        return (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                {l({ ru: "Язык приложения", kk: "Қолданба тілі", en: "App language" })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher />
            </CardContent>
          </Card>
        );

      case "notifications":
        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary" />
                {t("notificationSettings")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Уведомления о новых обращениях в поддержку и жалобах от пользователей приходят в верхнюю панель в реальном времени.
              </p>
              <div className="p-3 rounded-xl bg-muted/40 border flex items-center justify-between">
                <div className="space-y-0.5">
                  <span className="text-sm font-medium">Системные уведомления</span>
                  <p className="text-xs text-muted-foreground">Звуковые и визуальные сигналы при новых сообщениях</p>
                </div>
                <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50/50">
                  Активны
                </Badge>
              </div>
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
                  ✓ {l({ ru: "Приложение уже установлено", kk: "Қолданба орнатылған", en: "The app is already installed" })}
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

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-2 sm:p-4 md:p-6">
      {/* Blurred Backdrop */}
      <div
        className="login-modal-backdrop absolute inset-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      {/* Modal Dialog Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("accountSettings")}
        className="relative z-10 flex h-[88vh] max-h-[720px] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl motion-safe:animate-fade-in sm:h-[85vh]"
      >
        <div className="w-full h-full flex flex-col min-h-0 flex-1">
          {/* Top Header */}
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
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="h-8 w-8 rounded-full text-foreground hover:bg-muted"
                  aria-label={t("close")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}

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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="hidden md:flex h-8 w-8 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
              aria-label={t("close")}
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          {/* 2-column layout (Sidebar + Content) */}
          <div className="flex flex-col md:flex-row md:items-stretch md:gap-4 lg:gap-6 flex-1 min-h-0 p-3 sm:p-4 md:p-5 overflow-hidden">
            {/* Left Sidebar */}
            <aside
              className={cn(
                "w-full md:w-60 lg:w-64 shrink-0 flex flex-col justify-between rounded-2xl border border-border bg-card/60 p-3 shadow-sm h-full min-h-0",
                mobileSectionOpen && "hidden md:flex"
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
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0 transition-colors",
                              isActive
                                ? "text-primary"
                                : "text-muted-foreground group-hover:text-foreground"
                            )}
                            strokeWidth={isActive ? 2.25 : 1.75}
                          />
                          <span className="truncate">{sec.label}</span>
                        </div>
                        <ChevronRight
                          className={cn(
                            "h-4 w-4 shrink-0 md:hidden",
                            isActive ? "text-primary" : "text-muted-foreground/40"
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
                !mobileSectionOpen && "hidden md:flex"
              )}
            >
              <div className="animate-fade-in flex-1 flex flex-col min-h-full">
                {renderSectionContent()}
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm &&
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
                  onClick={onLogout}
                  className="rounded-xl"
                >
                  {t("yes")}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>,
    document.body
  );
};

export default ModeratorSettingsDialog;
