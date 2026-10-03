import { ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Returns the user to wherever they came from inside the app: the marketplace,
 * a product, a storefront. React Router gives the first page of a session the
 * key "default", so a page opened directly (a shared link, a new tab) has no
 * in-app page behind it and goes to the marketplace instead of leaving the site.
 */
const BackButton = () => {
  const { t } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  const goBack = () => {
    if (location.key !== "default") navigate(-1);
    else navigate("/");
  };

  return (
    <button
      type="button"
      onClick={goBack}
      className="inline-flex items-center gap-2 rounded-md public-meta hover:text-foreground focus-ring"
    >
      <ArrowLeft className="h-4 w-4" />
      <span>{t("back")}</span>
    </button>
  );
};

export default BackButton;
