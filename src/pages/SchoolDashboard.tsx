import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import AppShell from "@/components/layout/BuyerAppShell";
import AccountSettingsView from "@/components/account/AccountSettingsView";
import DisplayNameSetupDialog from "@/components/account/DisplayNameSetupDialog";
import AppHeader from "@/components/layout/AppHeader";
import {
  HeaderAccountControl,
  HeaderNotificationsButton,
  HeaderSupportButton,
} from "@/components/layout/HeaderControls";
import { readAuthEmail } from "@/lib/creatorAuth";
import { needsDisplayNamePrompt } from "@/lib/displayName";
import { supabase } from "@/integrations/supabase/client";
import {
  School, Users, GraduationCap, Layers, Calendar, BookOpen,
  ClipboardList, ListChecks, BarChart3, Lock, Bell,
} from "lucide-react";

const SchoolDashboard = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsDisplayName, setNeedsDisplayName] = useState(false);
  const currentUserId = typeof window !== "undefined" ? localStorage.getItem("simple_user_id") || "" : "";

  useEffect(() => {
    const name = localStorage.getItem("creator_name");
    const type = localStorage.getItem("creator_account_type");
    const profileType = localStorage.getItem("profile_type");
    if (!name || (type !== "online_school" && profileType !== "school")) {
      navigate("/");
      return;
    }
    const token = localStorage.getItem("creator_token");
    if (!token) {
      const displayName = localStorage.getItem("profile_display_name") || "";
      setProfileDisplayName(displayName || null);
      setNeedsDisplayName(needsDisplayNamePrompt(displayName, readAuthEmail()));
      setIsLoading(false);
      return;
    }

    void supabase.functions.invoke("validate-creator-session", {
      body: { token, creatorName: name },
    }).then(({ data }) => {
      if (!data?.valid) {
        navigate("/");
        return;
      }
      const displayName =
        typeof data.displayName === "string" ? data.displayName.trim() : localStorage.getItem("profile_display_name") || "";
      if (displayName) localStorage.setItem("profile_display_name", displayName);
      setProfileDisplayName(displayName || null);
      const email = typeof data.email === "string" ? data.email : readAuthEmail();
      setNeedsDisplayName(needsDisplayNamePrompt(displayName, email));
      setIsLoading(false);
    });
  }, [navigate]);

  const features = [
    { icon: Users, label: t("schoolFeatureStudents") },
    { icon: GraduationCap, label: t("schoolFeatureTeachers") },
    { icon: Layers, label: t("schoolFeatureGroups") },
    { icon: Calendar, label: t("schoolFeatureSchedule") },
    { icon: BookOpen, label: t("schoolFeatureMaterials") },
    { icon: ClipboardList, label: t("schoolFeatureHomework") },
    { icon: ListChecks, label: t("schoolFeatureTests") },
    { icon: BarChart3, label: t("schoolFeatureAnalytics") },
    { icon: Lock, label: t("schoolFeatureAccess") },
    { icon: Bell, label: t("schoolFeatureNotifications") },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (needsDisplayName) {
    return (
      <div className="min-h-screen bg-background">
        <DisplayNameSetupDialog
          open
          onSaved={(saved) => {
            setProfileDisplayName(saved);
            setNeedsDisplayName(false);
          }}
        />
      </div>
    );
  }

  return (
    <AppShell>
    <div className="min-h-screen bg-gradient-hero">
      <AppHeader>
        <HeaderSupportButton />
        <HeaderNotificationsButton
          active={false}
          count={0}
          onClick={() => navigate("/school")}
        />
        <HeaderAccountControl />
      </AppHeader>
      <div className="max-w-5xl mx-auto space-y-6 px-4 py-8">
        <Card>
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <School className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">{t("onlineSchoolMode")}</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-2">
            <p className="text-lg font-medium">{t("schoolComingSoonTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("schoolComingSoonDescription")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("schoolFeaturesTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {features.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <Icon className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Account Settings View */}
        <AccountSettingsView
          role="school"
          displayName={profileDisplayName || t("profileSchool")}
          userId={currentUserId}
        />
      </div>
    </div>
    </AppShell>
  );
};

export default SchoolDashboard;
