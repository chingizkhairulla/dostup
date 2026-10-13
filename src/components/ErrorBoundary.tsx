import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  resetKeys?: unknown[];
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const PREFILL = 'Здравствуйте! Вышел экран "Что-то пошло не так", после того как ';

function openSupportChat() {
  try {
    sessionStorage.setItem("support_prefill", PREFILL);
  } catch {
    // ignore
  }
  const profileType = localStorage.getItem("profile_type");
  if (profileType === "creator") {
    window.location.href = "/creator?tab=announcements&chat=support&prefill=1";
  } else {
    window.location.href = "/dashboard/announcements?chat=support&prefill=1";
  }
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

  public componentDidMount() {
    window.addEventListener("storage", this.handleStorage);
  }

  public componentWillUnmount() {
    window.removeEventListener("storage", this.handleStorage);
  }

  private handleStorage = () => {
    if (this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  };

  public componentDidUpdate(prevProps: Props) {
    const { resetKeys, onReset } = this.props;
    if (this.state.hasError && resetKeys && prevProps.resetKeys) {
      const changed = resetKeys.some((key, i) => key !== prevProps.resetKeys![i]);
      if (changed) {
        this.setState({ hasError: false, error: null });
        onReset?.();
      }
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const language = (localStorage.getItem("language") as "ru" | "kk") || "ru";

      const translations = {
        ru: {
          title: "Что-то пошло не так",
          message: "Не беспокойтесь! Это временная техническая проблема.",
          tryThese: "Попробуйте:",
          option1: "Перезагрузить страницу",
          option2: "Подождать пару минут и попробовать снова",
          writeSupport: "Написать поддержке",
          reloadButton: "Перезагрузить страницу",
          supportButton: "Поддержка",
        },
        kk: {
          title: "Бірдеңе дұрыс болмады",
          message: "Уайымдамаңыз! Бұл уақытша техникалық мәселе.",
          tryThese: "Мынаны көріңіз:",
          option1: "Бетті қайта жүктеу",
          option2: "Бірнеше минут күтіп, қайта көріңіз",
          writeSupport: "Қолдауға жазу",
          reloadButton: "Бетті қайта жүктеу",
          supportButton: "Қолдау",
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
                <li>
                  •{" "}
                  <button
                    type="button"
                    onClick={openSupportChat}
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                  >
                    {t.writeSupport}
                  </button>
                </li>
              </ul>
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
                onClick={openSupportChat}
                className="gap-2 border-border hover:bg-primary/10 hover:text-primary hover:border-primary/40 font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                {t.supportButton}
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
