import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { profileHomePath } from "@/lib/creatorAuth";

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
      // Get language from localStorage or default to "ru"
      const language = (localStorage.getItem("language") as "ru" | "kk") || "ru";
      
      const translations = {
        ru: {
          title: "Что-то пошло не так",
          message: "Не беспокойтесь, это временная ошибка. Попробуйте еще раз.",
          reloadButton: "Попробовать снова",
          homeButton: "На главную",
        },
        kk: {
          title: "Бірдеңе дұрыс болмады",
          message: "Уайымдамаңыз, бұл уақытша қате. Қайталап көріңіз.",
          reloadButton: "Қайталап көру",
          homeButton: "Басты бетке",
        },
      };

      const t = translations[language];

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-primary" />
              </div>
            </div>

            {/* Title and message */}
            <div className="space-y-1.5">
              <h1 className="text-xl font-bold text-foreground">{t.title}</h1>
              <p className="text-sm text-muted-foreground">{t.message}</p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
              <Button
                onClick={this.handleReload}
                className="gap-2 bg-primary hover:bg-primary/90 text-white font-medium"
              >
                <RefreshCw className="w-4 h-4 text-white" />
                {t.reloadButton}
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoHome}
                className="gap-2 border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium"
              >
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
