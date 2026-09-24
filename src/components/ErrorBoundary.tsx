import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileHomePath } from "@/lib/creatorAuth";
import { toLanguage } from "@/lib/language";

/** Storage can throw in a private window; an error screen must never add one. */
function safeStoredLanguage(): string | null {
  try {
    return localStorage.getItem("language");
  } catch {
    return null;
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    const profileType = localStorage.getItem("profile_type") || "buyer";
    const accountType = localStorage.getItem("creator_account_type");
    window.location.href = profileHomePath(profileType, accountType);
  };

  public render() {
    if (this.state.hasError) {
      // This screen renders outside the language provider, so it reads storage
      // itself — through the guard, since an unrecognised value here would
      // index the table below with undefined and blank the error page.
      const language = toLanguage(safeStoredLanguage());

      const translations = {
        ru: {
          title: "Что-то пошло не так",
          message: "Не беспокойтесь! Это временная техническая проблема.",
          tryThese: "Попробуйте:",
          option1: "Перезагрузить страницу",
          option2: "Подождать пару минут и попробовать снова",
          reloadButton: "Перезагрузить страницу",
          homeButton: "На главную",
        },
        kk: {
          title: "Бірдеңе дұрыс болмады",
          message: "Уайымдамаңыз! Бұл уақытша техникалық мәселе.",
          tryThese: "Мынаны көріңіз:",
          option1: "Бетті қайта жүктеу",
          option2: "Бірнеше минут күтіп, қайта көріңіз",
          reloadButton: "Бетті қайта жүктеу",
          homeButton: "Басты бетке",
        },
        en: {
          title: "Something went wrong",
          message: "Do not worry — this is a temporary technical problem.",
          tryThese: "Try this:",
          option1: "Reload the page",
          option2: "Wait a couple of minutes and try again",
          reloadButton: "Reload the page",
          homeButton: "Go home",
        },
      };

      const t = translations[language];

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-warning/10 flex items-center justify-center">
                <AlertTriangle className="w-10 h-10 text-warning" />
              </div>
            </div>

            {/* Title and message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
              <p className="text-muted-foreground">{t.message}</p>
            </div>

            {/* Tips */}
            <div className="bg-muted/50 rounded-lg p-4 text-left">
              <p className="font-medium text-foreground mb-2">{t.tryThese}</p>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• {t.option1}</li>
                <li>• {t.option2}</li>
              </ul>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                {t.reloadButton}
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home className="w-4 h-4" />
                {t.homeButton}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
