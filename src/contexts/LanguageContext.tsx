import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { translations, TranslationKey } from "@/lib/translations";
import { Language, Translated, toLanguage } from "@/lib/language";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  /**
   * A phrase written out in all three languages at the point it is used.
   * Every language is required, so a site cannot quietly serve Kazakh to an
   * English reader — which is what the old
   * `language === "ru" ? <ru> : <kk>` shape did the moment English existed.
   */
  l: (phrase: Translated) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

function readStoredLanguage(): Language {
  try {
    // Anything unrecognised — an old value, a hand-edited one — becomes
    // Russian rather than indexing the dictionaries with rubbish.
    return toLanguage(localStorage.getItem("language"));
  } catch {
    return toLanguage(null);
  }
}

export const LanguageProvider = ({ children }: LanguageProviderProps) => {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("language", lang);
    } catch {
      // A blocked storage should not stop the interface from switching.
    }
  };

  const t = (key: TranslationKey, params?: Record<string, string | number>): string => {
    let text: string = translations[language][key] || translations.ru[key] || key;

    if (import.meta.env.DEV && !translations[language][key]) {
      console.warn(`[i18n] "${key}" has no ${language} translation; falling back to Russian`);
    }

    if (params) {
      Object.entries(params).forEach(([paramKey, value]) => {
        text = text.replace(`{${paramKey}}`, String(value));
      });
    }

    return text;
  };

  const l = (phrase: Translated): string => phrase[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, l }}>
      {children}
    </LanguageContext.Provider>
  );
};
