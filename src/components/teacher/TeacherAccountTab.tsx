import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { User, LogOut, Loader2, Download, Globe, Clock } from "lucide-react";
import { unregisterPushToken } from "@/lib/firebase";
import { usePWADetection } from "@/hooks/usePWADetection";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import TimezoneSelector from "@/components/account/TimezoneSelector";
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

interface TeacherAccountTabProps {
  teacherName: string;
  teacherId?: string;
}

const TeacherAccountTab = ({ teacherName, teacherId }: TeacherAccountTabProps) => {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const isAppInstalled = usePWADetection();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    // Удаляем push-токены при выходе
    if (teacherId) {
      await unregisterPushToken(teacherId).catch(console.error);
    }
    
    localStorage.removeItem("teacher_data");
    localStorage.removeItem("teacher_notifications_last_viewed");
    localStorage.removeItem("simple_session_token");
    localStorage.removeItem("simple_user_id");
    navigate("/");
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">{t("account")}</h2>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-5 h-5" />
            {t("profile")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">{teacherName}</p>
              <p className="text-sm text-muted-foreground">
                {language === "ru" ? "Учитель" : "Мұғалім"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Language Switcher */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" />
            {language === "ru" ? "Язык приложения" : "Қолданба тілі"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LanguageSwitcher />
        </CardContent>
      </Card>

      {/* Timezone */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-4 h-4" />
            {language === "ru" ? "Часовой пояс" : "Уақыт белдеуі"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TimezoneSelector />
        </CardContent>
      </Card>

      {/* Install App - only show if not installed */}
      {!isAppInstalled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="w-5 h-5" />
              {t("installApp")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              {t("installAppDescription")}
            </p>
            <Link to="/install">
              <Button variant="outline" className="w-full">
                {t("viewInstallInstructions")}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Logout Button */}
      <Button
        variant="outline"
        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setShowLogoutConfirm(true)}
      >
        <LogOut className="w-4 h-4 mr-2" />
        {t("signOut")}
      </Button>

      {/* Logout Confirmation */}
      <AlertDialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmLogout")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmLogoutDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLogout}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isLoggingOut ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("signOut")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeacherAccountTab;
