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
  errorInfo?: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error);
    console.error("Component stack:", errorInfo?.componentStack);
    this.setState({ errorInfo });
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
      if (import.meta.env.DEV) {
        return (
          <div className="min-h-screen bg-background text-foreground p-6 overflow-auto font-mono text-sm space-y-4">
            <h1 className="text-xl font-bold text-destructive">Ошибка приложения (Development Mode)</h1>
            <div className="bg-destructive/10 text-destructive border border-destructive/30 p-4 rounded-lg">
              <p className="font-semibold">{this.state.error?.toString() || "Unknown error"}</p>
            </div>
            {this.state.error?.stack && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-1">Error Stack:</h2>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
              </div>
            )}
            {this.state.errorInfo?.componentStack && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-1">Component Stack:</h2>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto whitespace-pre-wrap">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Перезагрузить страницу
              </Button>
              <Button variant="outline" onClick={this.handleGoHome} className="gap-2">
                <Home className="w-4 h-4" />
                На главную
              </Button>
            </div>
          </div>
        );
      }
      // Get language from localStorage or default to "ru"
      const language = (localStorage.getItem("language") as "ru" | "kk") || "ru";
      
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
