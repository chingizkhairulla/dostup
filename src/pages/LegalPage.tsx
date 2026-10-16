import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import LegalDocumentBody from "@/components/legal/LegalDocumentBody";
import PublicFooter from "@/components/layout/PublicFooter";
import PublicContainer from "@/components/marketplace/PublicContainer";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLegalDocument, type LegalDocId } from "@/lib/legalDocs";

type LegalPageProps = {
  docId: LegalDocId;
};

const LegalPage = ({ docId }: LegalPageProps) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const document = getLegalDocument(docId);

  if (!document) {
    return null;
  }

  const titleKey = docId === "terms" ? "termsPageTitle" : "privacyPageTitle";
  const pageTitle = t(titleKey).startsWith("TODO") ? document.title : t(titleKey);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Sticky header with back button and page title */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border/70">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[#1F2328] transition-colors hover:bg-[#F6F7F8] focus-ring shrink-0"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold text-[#1F2328] truncate">{pageTitle}</span>
        </div>
      </div>
      <main className="flex-1 py-10 md:py-14">
        <PublicContainer>
          <article className="mx-auto max-w-[720px]">
            <h1 className="text-[20px] font-semibold text-[#1F2328]">{pageTitle}</h1>
            <p className="mt-2 text-base text-[#6B7280]">
              {t("legalLastUpdated", { date: document.updated })}
            </p>
            <div className="mt-8">
              <LegalDocumentBody markdown={document.body} />
            </div>
          </article>
        </PublicContainer>
      </main>
      <PublicFooter />
    </div>
  );
};

export default LegalPage;
