import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Search, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Language } from "@/lib/language";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { language } = useLanguage();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  // Typed by Language so a language without its block cannot compile —
  // untyped, English read `undefined` here and the page threw instead of rendering.
  const translations: Record<Language, { title: string; message: string; goBack: string; goHome: string }> = {
    en: {
      title: "Page not found",
      message: "Oops! This page doesn't exist or has been moved.",
      goBack: "Go back",
      goHome: "Home",
    },
    ru: {
      title: "Страница не найдена",
      message: "Упс! Похоже, эта страница не существует или была перемещена.",
      goBack: "Вернуться назад",
      goHome: "На главную",
    },
    kk: {
      title: "Бет табылмады",
      message: "Кешіріңіз! Бұл бет жоқ немесе жылжытылған сияқты.",
      goBack: "Артқа қайту",
      goHome: "Басты бетке",
    },
  };

  const t = translations[language];

  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
            <Search className="w-12 h-12 text-muted-foreground" />
          </div>
        </div>

        {/* 404 Badge */}
        <div className="inline-block">
          <span className="text-6xl font-bold text-primary">404</span>
        </div>

        {/* Title and message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
          <p className="text-muted-foreground">{t.message}</p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button variant="outline" onClick={handleGoBack} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t.goBack}
          </Button>
          <Button onClick={() => navigate("/")} className="gap-2">
            <Home className="w-4 h-4" />
            {t.goHome}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
