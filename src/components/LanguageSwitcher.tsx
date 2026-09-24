import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGES } from "@/lib/language";
import { Button } from "@/components/ui/button";

// The settings switcher. Each language is offered under its own name, in the
// order LANGUAGES declares — Russian, Kazakh, then English.
const LanguageSwitcher = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex gap-2">
      {LANGUAGES.map((entry) => (
        <Button
          key={entry.code}
          variant={language === entry.code ? "default" : "outline"}
          size="sm"
          onClick={() => setLanguage(entry.code)}
          className="flex-1"
        >
          {entry.label}
        </Button>
      ))}
    </div>
  );
};

export default LanguageSwitcher;
