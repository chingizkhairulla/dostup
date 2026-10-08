import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { AutoResizeTextarea } from "@/components/ui/AutoResizeTextarea";
import AfterAccessFields from "./AfterAccessFields";
import { normalizeGroupLink } from "@/lib/groupLink";

import { useCreatorProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from "@/hooks/useProducts";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPriceTenge, categoryLabel, subcategoryLabel, type BillingPeriod, type CatalogCategory, type LessonFormat } from "@/lib/catalog";
import { useCatalogTaxonomy } from "@/hooks/useCatalogTaxonomy";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, Package, Loader2, Edit, Trash2, ChevronDown, ChevronRight, ChevronLeft, Check, Globe, Lock, DollarSign, PauseCircle, PlayCircle, Sparkles, Wand2, ArrowRight } from "lucide-react";
import { predictProductCategory, isTopicMatch, isExactTopicMatch, type CategoryPrediction, suggestCustomTopicWithEmoji } from "@/lib/aiCategory";
import { getPresetTopics, getPresetTopicsForCategory, TAXONOMY_DEFINITIONS } from "@/lib/taxonomyData";
import { validateNewTopic, parseTopicsList, serializeTopicsList } from "@/utils/normalizeTopic";
import ShareProductButton from "@/components/share/ShareProductButton";
import ProductVisibilityDialog from "./ProductVisibilityDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import ProductMaterialsManager from "./ProductMaterialsManager";
import CreatorPendingPayments from "./CreatorPendingPayments";
import { uploadProductMedia, getVideoDuration, MAX_VIDEO_DURATION_SECONDS } from "@/lib/productMediaUpload";
import { compressVideoIfNeeded, COMPRESSION_THRESHOLD } from "@/lib/videoCompressor";
import { ImageIcon, Video as VideoIcon, X as XIcon, HelpCircle, Play } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { creatorCreds, invokeApi } from "@/lib/sessionApi";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  KASPI_METHOD_ORDER,
  KASPI_METHOD_LABELS,
  BANK_OPTIONS,
  DEFAULT_BANK,
  formatCardNumber,
  cardDigits,
  isValidCardNumber,
  isPaymentBank,
  type KaspiMethod,
  type PaymentBank,
} from "@/lib/paymentMethods";
import { useCoverCrop, type CoverCropResult } from "@/hooks/useCoverCrop";
import CoverCropEditor from "./CoverCropEditor";
import ProductVideoPlayer, { videoBlobCache } from "@/components/media/ProductVideoPlayer";

export interface PricingOptionFormItem {
  id: string;
  paymentType: "one_time" | "recurring";
  price: string;
  recurringInterval: string;
  recurringCustomDays: number;
  hasFreeTrial: boolean;
  trialPreset: "3" | "7" | "30" | "custom";
  trialCustomDays: number;
  kaspiMethods: KaspiMethod[];
  kaspiLink: string;
  kaspiPhone: string;
  kaspiCard: string;
  bank: PaymentBank;
  bankName: string;
}

export interface DefaultKaspiSettings {
  methods?: KaspiMethod[];
  link?: string;
  phone?: string;
  card?: string;
  bank?: PaymentBank;
  bankName?: string;
}

export const createDefaultPricingOption = (
  id?: string,
  defaultKaspi?: DefaultKaspiSettings
): PricingOptionFormItem => ({
  id: id || Math.random().toString(36).slice(2, 10),
  paymentType: "recurring",
  price: "49000",
  recurringInterval: "1m",
  recurringCustomDays: 30,
  hasFreeTrial: false,
  trialPreset: "7",
  trialCustomDays: 7,
  kaspiMethods: defaultKaspi?.methods?.length ? [...defaultKaspi.methods] : ["link"],
  kaspiLink: defaultKaspi?.link || "",
  kaspiPhone: defaultKaspi?.phone || "",
  kaspiCard: defaultKaspi?.card || "",
  bank: defaultKaspi?.bank || DEFAULT_BANK,
  bankName: defaultKaspi?.bankName || "",
});

/** Преобразует сохранённый вариант тарифа (JSON из pricing_options / поля продукта) в настройки формы. */
export const kaspiSettingsFromStored = (
  po: { kaspi_link?: string | null; kaspi_phone?: string | null; kaspi_card?: string | null; bank?: string | null; bank_name?: string | null } | null | undefined,
  fallback?: { kaspi_link?: string | null; kaspi_phone?: string | null; kaspi_card?: string | null; bank?: string | null; bank_name?: string | null } | null,
): Required<DefaultKaspiSettings> => {
  const src = po && (po.kaspi_link || po.kaspi_phone || po.kaspi_card) ? po : (fallback || po || {});
  const methods: KaspiMethod[] = [];
  if (src.kaspi_link) methods.push("link");
  if (src.kaspi_phone) methods.push("phone");
  if (src.kaspi_card) methods.push("card");
  return {
    methods: methods.length ? methods : ["link"],
    link: src.kaspi_link || "",
    phone: src.kaspi_phone || "",
    card: cardDigits(src.kaspi_card),
    bank: isPaymentBank(src.bank) ? src.bank : DEFAULT_BANK,
    bankName: src.bank_name || "",
  };
};

/** Поля способа оплаты для сохранения в pricing_options. */
export const serializeKaspiFields = (opt: PricingOptionFormItem) => {
  const m = new Set(opt.kaspiMethods);
  // Банк выбирается только вместе с картой; перевод по номеру без карты — Kaspi по умолчанию.
  const usesCard = m.has("card");
  return {
    kaspi_link: m.has("link") ? (opt.kaspiLink.trim() || null) : null,
    kaspi_phone: m.has("phone") ? (opt.kaspiPhone.trim() || null) : null,
    kaspi_card: usesCard ? (cardDigits(opt.kaspiCard) || null) : null,
    bank: usesCard ? opt.bank : m.has("phone") ? DEFAULT_BANK : null,
    bank_name: usesCard && opt.bank === "other" ? (opt.bankName.trim() || null) : null,
  };
};

export function getPricingOptionSummary(opt: PricingOptionFormItem) {
  const priceNum = Number(opt.price) || 0;
  const priceStr = formatPriceTenge(priceNum);
  if (opt.paymentType === "one_time") {
    return `${priceStr} разово`;
  }
  let periodStr = "в месяц";
  if (opt.recurringInterval === "7d") periodStr = "каждые 7 дней";
  else if (opt.recurringInterval === "14d") periodStr = "каждые 14 дней";
  else if (opt.recurringInterval === "1m") periodStr = "в месяц";
  else if (opt.recurringInterval === "3m") periodStr = "каждые 3 месяца";
  else if (opt.recurringInterval === "1y") periodStr = "в год";
  else if (opt.recurringInterval === "custom") periodStr = `каждые ${opt.recurringCustomDays || 30} дн.`;
  return `${priceStr} ${periodStr}`;
}

interface Product {
  id: string;
  title: string;
  headline: string | null;
  description: string | null;
  price: number;
  kaspi_link: string | null;
  telegram_link: string | null;
  after_access_enabled?: boolean;
  after_access_url?: string | null;
  has_schedule: boolean;
  is_active: boolean;
  is_published?: boolean;
  image_url?: string | null;
  video_url?: string | null;
  media?: Array<{ type: "image" | "video"; url: string; objectPosition?: string }> | null;
  faq?: Array<{ question: string; answer: string }> | null;
  kaspi_phone?: string | null;
  access_duration_days?: number | null;
  is_paused?: boolean;
  paused_message?: string | null;
  billing_period?: string | null;
  payment_type?: string | null;
  recurring_interval?: string | null;
  has_free_trial?: boolean;
  trial_days?: number | null;
  pricing_options?: any[] | null;
  category_id?: string | null;
  subcategory_id?: string | null;
  event_starts_at?: string | null;
  lesson_format?: LessonFormat | string | null;
  capacity?: number | string | null;
  topic?: string | null;
  slug?: string | null;
}

export interface ProductMediaItem {
  id: string;
  type: "image" | "video";
  url: string;
  file?: File;
  previewUrl?: string;
  objectPosition?: string;
}

interface FormData {
  categoryId: string;
  subcategoryId: string;
  topic: string;
  lessonFormat: LessonFormat | "";
  eventStartsAt: string;
  capacity: string;
  billingPeriod: "month" | "quarter" | "year" | "";
  title: string;
  headline: string;
  description: string;
  price: string;
  kaspiLink: string;
  telegramLink: string;
  afterAccessEnabled: boolean;
  afterAccessUrl: string;
  imageUrl: string;
  videoUrl: string;
  media: ProductMediaItem[];
  faq: Array<{ question: string; answer: string }>;
  isPaid: boolean;
  kaspiMethods: KaspiMethod[];
  kaspiPhone: string;
  kaspiCard: string;
  bank: PaymentBank;
  bankName: string;
  paymentType: "one_time" | "recurring";
  recurringInterval: string;
  recurringCustomDays: number;
  hasFreeTrial: boolean;
  trialPreset: "3" | "7" | "30" | "custom";
  trialCustomDays: number;
  pricingOptions: PricingOptionFormItem[];
}

interface ProductFormProps {
  onSubmit: (e: React.FormEvent) => void;
  isEdit?: boolean;
  formData: FormData;
  setFormData: React.Dispatch<React.SetStateAction<FormData>>;
  isPending: boolean;
  t: (key: string) => string;
  editingProductId?: string | null;
  pendingImageFile?: File | null;
  pendingVideoFile?: File | null;
  setPendingImageFile?: (f: File | null) => void;
  setPendingVideoFile?: (f: File | null) => void;
  taxonomyCategories?: CatalogCategory[];
  onCroppingChange?: (isCropping: boolean) => void;
}

function categorySlugById(categories: CatalogCategory[], categoryId: string) {
  return categories.find((category) => category.id === categoryId)?.slug ?? "";
}

function buildTaxonomyPayload(
  formData: FormData,
  categories: CatalogCategory[],
) {
  const currentCategory = categories.find((c) => c.id === formData.categoryId);
  const currentSubcategory = currentCategory?.subcategories.find((s) => s.id === formData.subcategoryId);
  const isLessons = currentCategory?.slug === "online-lessons";

  return {
    category_id: formData.categoryId,
    subcategory_id: formData.subcategoryId,
    lesson_format: isLessons ? (currentSubcategory?.slug === "group" ? "group" : "individual") : null,
    event_starts_at: null,
    capacity: null,
    billing_period: null,
    topic: formData.topic || null,
  };
}

function validateTaxonomyFields(formData: FormData, _categories: CatalogCategory[]) {
  if (!formData.categoryId || !formData.subcategoryId) {
    return "Выберите категорию и подкатегорию";
  }
  return null;
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").trim();
}

const ReqStar = () => (
  <span className="text-[#FF6B00] font-bold ml-1 text-sm select-none" aria-hidden="true">
    *
  </span>
);

// No close button: the dialog closes on an outside click or Escape.
const ProductDialogHeader = ({ title }: { title: string }) => (
  <DialogHeader className="space-y-0">
    <DialogTitle className="min-w-0">{title}</DialogTitle>
  </DialogHeader>
);

// Declared at module level so the trigger keeps its identity (and focus) across form re-renders.
const FormSection = ({
  label,
  open,
  onOpenChange,
  children,
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) => {
  const headerRef = useRef<HTMLButtonElement>(null);

  const collapseFromBottom = () => {
    onOpenChange(false);
    // The header may be far above after a long section; bring it back into view.
    requestAnimationFrame(() => {
      headerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button
          ref={headerRef}
          type="button"
          className="group flex w-full items-center justify-between gap-3 py-4 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span
            className={cn(
              "text-base sm:text-lg transition-colors",
              open ? "font-semibold text-foreground" : "font-medium text-foreground/80 group-hover:text-foreground",
            )}
          >
            {label}
          </span>
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "h-5 w-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
              open ? "rotate-90 text-foreground" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-[state=open]:animate-section-open data-[state=closed]:animate-collapsible-up data-[state=closed]:overflow-hidden motion-reduce:animate-none">
        <div className="space-y-4 pt-1 pb-3 w-full min-w-0 max-w-full">
          {children}
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={collapseFromBottom}
              className="h-8 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-white"
            >
              Свернуть
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const ProductForm = ({
  onSubmit,
  isEdit = false,
  formData,
  setFormData,
  isPending,
  t,
  editingProductId,
  pendingImageFile,
  pendingVideoFile,
  setPendingImageFile,
  setPendingVideoFile,
  taxonomyCategories = [],
  onCroppingChange,
}: ProductFormProps) => {
  const { language } = useLanguage();
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [removeImageOpen, setRemoveImageOpen] = useState(false);
  const [removeVideoOpen, setRemoveVideoOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(!isEdit);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [activeFaqIndex, setActiveFaqIndex] = useState(0);
  const [dotOffset, setDotOffset] = useState(0);
  const activeFaqIndexRef = useRef(0);
  const dotRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const faqScrollRef = useRef<HTMLDivElement>(null);

  const scrollToFaqIndex = (index: number, smooth: boolean = true) => {
    const el = faqScrollRef.current;
    if (!el || !el.children[index]) return;
    const child = el.children[index] as HTMLElement;
    el.scrollTo({
      left: child.offsetLeft,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const handleFaqScroll = () => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = faqScrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const total = (formData.faq || []).length;
      if (maxScroll <= 0 || total <= 1) {
        if (dotRef.current) dotRef.current.style.left = "0px";
        if (activeFaqIndexRef.current !== 0) {
          activeFaqIndexRef.current = 0;
          setActiveFaqIndex(0);
        }
        return;
      }
      const progress = Math.max(0, Math.min(1, el.scrollLeft / maxScroll));
      const offset = progress * (total - 1) * 12;
      if (dotRef.current) {
        dotRef.current.style.left = `${offset}px`;
      }
      const currentIdx = Math.round(progress * (total - 1));
      if (activeFaqIndexRef.current !== currentIdx) {
        activeFaqIndexRef.current = currentIdx;
        setActiveFaqIndex(currentIdx);
      }
    });
  };

  const handleAddFaq = () => {
    const nextIdx = (formData.faq || []).length;
    activeFaqIndexRef.current = nextIdx;
    setActiveFaqIndex(nextIdx);
    setDotOffset(nextIdx * 12);
    if (dotRef.current) {
      dotRef.current.style.left = `${nextIdx * 12}px`;
    }
    setFormData((prev) => ({
      ...prev,
      faq: [...(prev.faq || []), { question: "", answer: "" }],
    }));
    requestAnimationFrame(() => {
      const el = faqScrollRef.current;
      if (el && el.children[nextIdx]) {
        const child = el.children[nextIdx] as HTMLElement;
        el.scrollTo({ left: child.offsetLeft, behavior: "auto" });
      }
    });
  };

  const handleDeleteFaq = (idx: number) => {
    if (!formData.faq || formData.faq.length <= 1) {
      setFormData((prev) => ({
        ...prev,
        faq: [{ question: "", answer: "" }],
      }));
      activeFaqIndexRef.current = 0;
      setActiveFaqIndex(0);
      setDotOffset(0);
      if (dotRef.current) {
        dotRef.current.style.left = "0px";
      }
      return;
    }
    const nextIdx = activeFaqIndex >= idx
      ? Math.max(0, activeFaqIndex - 1)
      : activeFaqIndex;

    setFormData((prev) => ({
      ...prev,
      faq: prev.faq.filter((_, i) => i !== idx),
    }));
    activeFaqIndexRef.current = nextIdx;
    setActiveFaqIndex(nextIdx);
    setDotOffset(nextIdx * 12);
    if (dotRef.current) {
      dotRef.current.style.left = `${nextIdx * 12}px`;
    }
    requestAnimationFrame(() => {
      const el = faqScrollRef.current;
      if (el && el.children[nextIdx]) {
        const child = el.children[nextIdx] as HTMLElement;
        el.scrollTo({ left: child.offsetLeft, behavior: "auto" });
      }
    });
  };

  useEffect(() => {
    activeFaqIndexRef.current = 0;
    setActiveFaqIndex(0);
    setDotOffset(0);
    if (dotRef.current) {
      dotRef.current.style.left = "0px";
    }
    if (faqScrollRef.current) {
      faqScrollRef.current.scrollTo({ left: 0, behavior: "auto" });
    }
  }, [editingProductId]);

  useEffect(() => {
    if (formData.faq && formData.faq.length > 0 && activeFaqIndex >= formData.faq.length) {
      setActiveFaqIndex(formData.faq.length - 1);
    }
  }, [formData.faq?.length, activeFaqIndex]);
  const [aiLoading, setAiLoading] = useState(false);
  const isUserSelectedCategory = useRef(false);
  const [searchTopic, setSearchTopic] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [isAddingTopic, setIsAddingTopic] = useState(false);
  const [isAutoGeneratingTopic, setIsAutoGeneratingTopic] = useState(false);
  const [customTopics, setCustomTopics] = useState<string[]>([]);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [isVideoDragging, setIsVideoDragging] = useState(false);

  // Функция автоматического подбора темы (волшебная палочка)
  const handleAutoSuggestTopic = async () => {
    const titleTrimmed = formData.title?.trim() || "";
    const descText = stripHtml(formData.description || "");
    const faqList = (formData.faq || []).filter(
      (f) => stripHtml(f.question || "").trim() || stripHtml(f.answer || "").trim()
    );

    if (!titleTrimmed && !descText && faqList.length === 0) {
      toast.info("Заполните название или описание продукта для подбора темы");
      return;
    }

    try {
      setIsAutoGeneratingTopic(true);
      const currentCat = taxonomyCategories.find((c) => c.id === formData.categoryId);
      const currentSub = currentCat?.subcategories?.find((s) => s.id === formData.subcategoryId);

      const suggested = await suggestCustomTopicWithEmoji({
        title: titleTrimmed,
        description: descText,
        faq: faqList,
        categorySlug: currentCat?.slug,
        subcategorySlug: currentSub?.slug,
      });

      if (suggested) {
        setNewTopicName(suggested);
        toast.success(`Подобрана тема: ${suggested}`);
      } else {
        toast.info("Не удалось автоматически определить тему. Введите её вручную.");
      }
    } catch (err) {
      console.warn("Failed to auto suggest topic:", err);
      toast.error("Ошибка при подборе темы");
    } finally {
      setIsAutoGeneratingTopic(false);
    }
  };

  // Функция вызова ИИ для определения категории, подкатегории и темы
  const triggerAiCategory = async (isManual = false) => {
    const titleTrimmed = formData.title?.trim() || "";
    const descText = stripHtml(formData.description || "");
    const hasFaqContent = formData.faq?.some(
      (f) => stripHtml(f.question || "").trim() || stripHtml(f.answer || "").trim()
    );

    if (isManual && !titleTrimmed && !descText && !hasFaqContent) {
      toast.error("Сначала заполните детали (название или описание)");
      return;
    }

    if (!titleTrimmed && !descText && !hasFaqContent) {
      return;
    }

    setAiLoading(true);
    try {
      const pred = await predictProductCategory({
        title: formData.title,
        description: formData.description,
        faq: formData.faq,
        categories: taxonomyCategories,
      });

      if (pred && pred.categoryId) {
        if (isManual) {
          isUserSelectedCategory.current = false;
        }

        setFormData((prev) => ({
          ...prev,
          categoryId: pred.categoryId,
          subcategoryId: pred.subcategoryId || "",
          topic: pred.topic || "",
        }));

        setCategoryOpen(true);

        if (isManual) {
          toast.success("Категория и тема обновлены через ИИ");
        }
      } else if (isManual) {
        toast.info("ИИ не смог определить категорию. Попробуйте дополнить описание");
      }
    } catch (err) {
      console.error("AI prediction error:", err);
      if (isManual) {
        toast.error("Не удалось определить категорию");
      }
    } finally {
      setAiLoading(false);
    }
  };

  // Автоматический сброс категории при очистке деталей или автоподбор при заполнении
  useEffect(() => {
    const titleTrimmed = formData.title?.trim() || "";
    const descText = stripHtml(formData.description || "");
    const hasFaqContent = formData.faq?.some(
      (f) => stripHtml(f.question || "").trim() || stripHtml(f.answer || "").trim()
    );
    const isDetailsEmpty = !titleTrimmed && !descText && !hasFaqContent;

    // 1. Автоматический сброс: если название, описание и вопросы полностью стёрты
    if (isDetailsEmpty) {
      isUserSelectedCategory.current = false;
      setFormData((prev) => {
        if (!prev.categoryId && !prev.subcategoryId && !prev.topic) return prev;
        return {
          ...prev,
          categoryId: "",
          subcategoryId: "",
          topic: "",
        };
      });
      return;
    }

    // 2. В режиме редактирования не перезаписываем категорию автоматически при обычном вводе
    if (isEdit) return;

    // 3. Если пользователь уже вручную выбрал категорию и она заполнена — не перезаписываем автоматически
    if (isUserSelectedCategory.current && formData.categoryId) return;

    // 4. Если деталей недостаточно для определения — ждём
    if (titleTrimmed.length < 3 && descText.length < 10) return;

    const timer = setTimeout(async () => {
      setAiLoading(true);
      try {
        const pred = await predictProductCategory({
          title: formData.title,
          description: formData.description,
          faq: formData.faq,
          categories: taxonomyCategories,
        });

        if (pred && pred.categoryId && !isUserSelectedCategory.current) {
          setFormData((prev) => {
            const isSameCat = prev.categoryId === pred.categoryId;
            const currentSelected = parseTopicsList(prev.topic);
            const nextTopic = isSameCat && currentSelected.length > 0 ? prev.topic : (pred.topic || "");

            return {
              ...prev,
              categoryId: pred.categoryId,
              subcategoryId: pred.subcategoryId || (isSameCat ? prev.subcategoryId : ""),
              topic: nextTopic,
            };
          });
        }
      } catch (err) {
        console.error("AI prediction error:", err);
      } finally {
        setAiLoading(false);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [formData.title, formData.description, formData.faq, isEdit, taxonomyCategories]);

  // Обработчик раскрытия аккордеона категории (при открытии определяет категорию, если ещё не выбрана)
  const handleCategoryOpenChange = (open: boolean) => {
    setCategoryOpen(open);
    if (open && !formData.categoryId && !isUserSelectedCategory.current && !isEdit) {
      const titleTrimmed = formData.title?.trim() || "";
      const descText = stripHtml(formData.description || "");
      if (titleTrimmed.length >= 3 || descText.length >= 10) {
        triggerAiCategory(false);
      }
    }
  };

  // Загрузка сохранённых тем из базы данных для выбранной категории
  useEffect(() => {
    if (!formData.categoryId) {
      setCustomTopics([]);
      return;
    }
    let isMounted = true;
    const loadTopics = async () => {
      try {
        const { data } = await supabase
          .from("topics" as any)
          .select("name")
          .eq("category_id", formData.categoryId)
          .eq("status", "approved");
        if (isMounted && data) {
          const names = (data as any[]).map((t) => t.name).filter(Boolean);
          setCustomTopics(names);
        }
      } catch (err) {
        console.warn("Failed to load topics:", err);
      }
    };

    loadTopics();

    const ch = supabase
      .channel(`topics-channel-${formData.categoryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "topics",
        },
        () => {
          loadTopics();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(ch);
    };
  }, [formData.categoryId]);

  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const activeMediaIndexRef = useRef(0);
  const mediaDotRef = useRef<HTMLDivElement>(null);
  const mediaRafRef = useRef<number | null>(null);
  const mediaScrollRef = useRef<HTMLDivElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [isMediaDragging, setIsMediaDragging] = useState(false);
  const uploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadToastIdRef = useRef<string | number | null>(null);

  const cancelCurrentUpload = useCallback(() => {
    if (uploadAbortControllerRef.current) {
      uploadAbortControllerRef.current.abort();
      uploadAbortControllerRef.current = null;
    }
    if (uploadToastIdRef.current) {
      toast.dismiss(uploadToastIdRef.current);
      uploadToastIdRef.current = null;
    }
    setUploadingMedia(false);
  }, []);

  useEffect(() => {
    return () => {
      cancelCurrentUpload();
    };
  }, [cancelCurrentUpload]);

  const scrollToMediaIndex = (index: number, smooth: boolean = true) => {
    const el = mediaScrollRef.current;
    if (!el || !el.children[index]) return;
    const child = el.children[index] as HTMLElement;
    el.scrollTo({
      left: child.offsetLeft,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const handleMediaScroll = () => {
    if (mediaRafRef.current) return;
    mediaRafRef.current = requestAnimationFrame(() => {
      mediaRafRef.current = null;
      const el = mediaScrollRef.current;
      if (!el) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const total = (formData.media || []).length;
      if (maxScroll <= 0 || total <= 1) {
        if (mediaDotRef.current) mediaDotRef.current.style.left = "0px";
        if (activeMediaIndexRef.current !== 0) {
          activeMediaIndexRef.current = 0;
          setActiveMediaIndex(0);
        }
        return;
      }
      const progress = Math.max(0, Math.min(1, el.scrollLeft / maxScroll));
      const offset = progress * (total - 1) * 12;
      if (mediaDotRef.current) {
        mediaDotRef.current.style.left = `${offset}px`;
      }
      const currentIdx = Math.round(progress * (total - 1));
      if (activeMediaIndexRef.current !== currentIdx) {
        activeMediaIndexRef.current = currentIdx;
        setActiveMediaIndex(currentIdx);
      }
    });
  };

  const coverCrop = useCoverCrop();
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropSaving, setCropSaving] = useState(false);

  useEffect(() => {
    onCroppingChange?.(Boolean(coverCrop.source));
  }, [coverCrop.source, onCroppingChange]);

  const startCoverCropProcess = async (files: File[]) => {
    const imagesToCrop: File[] = [];
    for (const file of files) {
      const isImg = file.type.startsWith("image/");
      const isVid = file.type.startsWith("video/");
      if (!isImg && !isVid) {
        toast.error(`Файл "${file.name}" не является фото или видео`);
        continue;
      }
      if (isVid) {
        try {
          const duration = await getVideoDuration(file);
          if (duration > MAX_VIDEO_DURATION_SECONDS) {
            toast.error(`Видео "${file.name}" слишком длинное (${Math.round(duration)} сек). Максимум 3 минуты.`);
            continue;
          }
        } catch {
          // ignore
        }

        // Видео прикрепляется мгновенно без зависания браузера
        const previewUrl = URL.createObjectURL(file);
        await addCroppedMediaItem({
          file,
          type: "video",
          objectPosition: "center",
          previewUrl,
        });
      } else {
        imagesToCrop.push(file);
      }
    }

    if (imagesToCrop.length === 0) return;

    const [first, ...rest] = imagesToCrop;
    setCropQueue(rest);
    coverCrop.loadFile(first);
  };

  const handleSaveCrop = async () => {
    if (!coverCrop.source || cropSaving) return;
    setCropSaving(true);
    try {
      const result = await coverCrop.cropResult();
      await addCroppedMediaItem(result);
      coverCrop.resetCrop();
      if (cropQueue.length > 0) {
        const [next, ...rest] = cropQueue;
        setCropQueue(rest);
        coverCrop.loadFile(next);
      }
    } catch (err: any) {
      toast.error(err?.message || "Ошибка обработки файла");
    } finally {
      setCropSaving(false);
    }
  };

  const addCroppedMediaItem = async (result: CoverCropResult) => {
    const kind = result.type;
    if (!isEdit || !editingProductId) {
      let fileToAttach = result.file;
      let previewUrl = result.previewUrl;
      if (kind === "video" && result.file && result.file.size > COMPRESSION_THRESHOLD) {
        const toastId = toast.loading("Оптимизация видео...");
        try {
          fileToAttach = await compressVideoIfNeeded(result.file, (pct) => {
            toast.loading(`Оптимизация видео (${pct}%)...`, { id: toastId });
          });
          previewUrl = URL.createObjectURL(fileToAttach);
          toast.success("Видео добавлено", { id: toastId });
        } catch {
          toast.dismiss(toastId);
          toast.success("Видео добавлено");
        }
      } else {
        toast.success(kind === "video" ? "Видео добавлено" : "Фото добавлено");
      }

      const newItem: ProductMediaItem = {
        id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: kind,
        url: previewUrl,
        previewUrl,
        file: fileToAttach,
        objectPosition: result.objectPosition,
      };
      setFormData((prev) => {
        const current = prev.media || [];
        const updated = [...current, newItem];
        const firstImg = updated.find((m) => m.type === "image");
        const firstVid = updated.find((m) => m.type === "video");
        return {
          ...prev,
          media: updated,
          imageUrl: firstImg?.url || prev.imageUrl,
          videoUrl: firstVid?.url || prev.videoUrl,
        };
      });
      setTimeout(() => {
        const total = (formData.media || []).length + 1;
        activeMediaIndexRef.current = total - 1;
        setActiveMediaIndex(total - 1);
        scrollToMediaIndex(total - 1);
      }, 50);
    } else {
      setUploadingMedia(true);
      const controller = new AbortController();
      uploadAbortControllerRef.current = controller;
      const toastId = toast.loading(kind === "video" ? "Подготовка видео..." : "Загрузка фото...");
      uploadToastIdRef.current = toastId;

      try {
        let fileToUpload = result.file;
        if (kind === "video" && result.file.size > COMPRESSION_THRESHOLD) {
          toast.loading("Оптимизация видео...", { id: toastId });
          fileToUpload = await compressVideoIfNeeded(
            result.file,
            (pct) => {
              if (!controller.signal.aborted) {
                toast.loading(`Оптимизация видео (${pct}%)...`, { id: toastId });
              }
            },
            controller.signal
          );
        }

        if (controller.signal.aborted) return;

        toast.loading(kind === "video" ? "Загрузка видео (0%)..." : "Загрузка фото...", { id: toastId });
        const url = await uploadProductMedia(
          fileToUpload,
          editingProductId,
          kind,
          (pct) => {
            if (kind === "video" && !controller.signal.aborted) {
              toast.loading(`Загрузка видео (${pct}%)...`, { id: toastId });
            }
          },
          1,
          controller.signal
        );

        const localBlob = kind === "video" ? URL.createObjectURL(fileToUpload) : "";
        if (localBlob) {
          videoBlobCache.set(url, localBlob);
        }

        const newItem: ProductMediaItem = {
          id: `uploaded-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: kind,
          url,
          previewUrl: localBlob || undefined,
          file: fileToUpload,
          objectPosition: result.objectPosition,
        };
        setFormData((prev) => {
          const current = prev.media || [];
          const updated = [...current, newItem];
          const firstImg = updated.find((m) => m.type === "image");
          const firstVid = updated.find((m) => m.type === "video");
          return {
            ...prev,
            media: updated,
            imageUrl: firstImg?.url || "",
            videoUrl: firstVid?.url || "",
          };
        });
        toast.success(kind === "video" ? "Видео добавлено" : "Фото добавлено", { id: toastId });
        setTimeout(() => {
          const total = (formData.media || []).length + 1;
          activeMediaIndexRef.current = total - 1;
          setActiveMediaIndex(total - 1);
          scrollToMediaIndex(total - 1);
        }, 50);
      } catch (err: any) {
        if (err?.message === "Загрузка отменена" || controller.signal.aborted) {
          return;
        }
        toast.error(err?.message || "Ошибка загрузки файла", { id: toastId });
      } finally {
        uploadAbortControllerRef.current = null;
        uploadToastIdRef.current = null;
        setUploadingMedia(false);
      }
    }
  };

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length === 0) return;
    await startCoverCropProcess(files);
  };

  const handleDeleteMedia = (idx: number) => {
    setFormData((prev) => {
      const current = prev.media || [];
      const updated = current.filter((_, i) => i !== idx);
      const firstImg = updated.find((m) => m.type === "image");
      const firstVid = updated.find((m) => m.type === "video");
      return {
        ...prev,
        media: updated,
        imageUrl: firstImg?.url || "",
        videoUrl: firstVid?.url || "",
      };
    });
    const nextIdx = Math.max(0, idx - 1);
    activeMediaIndexRef.current = nextIdx;
    setActiveMediaIndex(nextIdx);
    scrollToMediaIndex(nextIdx);
  };

  // Paste support: listen on window for images or videos
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      }
      const files = e.clipboardData?.files;
      if (!files || files.length === 0) return;
      const mediaFiles = Array.from(files).filter(
        (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
      );
      if (mediaFiles.length > 0) {
        e.preventDefault();
        void startCoverCropProcess(mediaFiles);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [formData.media, isEdit, editingProductId]);

  const [expandedOptionId, setExpandedOptionId] = useState<string | null>(
    formData.pricingOptions?.[0]?.id || null
  );

  const updateOption = (id: string, patch: Partial<PricingOptionFormItem>) => {
    setFormData((prev) => {
      const currentOptions = prev.pricingOptions && prev.pricingOptions.length > 0
        ? prev.pricingOptions
        : [createDefaultPricingOption()];
      const updated = currentOptions.map((o) =>
        o.id === id ? { ...o, ...patch } : o
      );
      return {
        ...prev,
        pricingOptions: updated,
        ...(updated[0] ? {
          price: updated[0].price,
          paymentType: updated[0].paymentType,
          recurringInterval: updated[0].recurringInterval,
          recurringCustomDays: updated[0].recurringCustomDays,
          hasFreeTrial: updated[0].hasFreeTrial,
          trialPreset: updated[0].trialPreset,
          trialCustomDays: updated[0].trialCustomDays,
          kaspiMethods: updated[0].kaspiMethods,
          kaspiLink: updated[0].kaspiLink,
          kaspiPhone: updated[0].kaspiPhone,
          kaspiCard: updated[0].kaspiCard,
          bank: updated[0].bank,
          bankName: updated[0].bankName,
        } : {}),
      };
    });
  };

  const addOption = () => {
    const last = formData.pricingOptions?.[formData.pricingOptions.length - 1];
    const newOpt = createDefaultPricingOption(undefined, {
      methods: last?.kaspiMethods?.length ? last.kaspiMethods : formData.kaspiMethods,
      link: last?.kaspiLink || formData.kaspiLink,
      phone: last?.kaspiPhone || formData.kaspiPhone,
      card: last?.kaspiCard || formData.kaspiCard,
      bank: last?.bank || formData.bank,
      bankName: last?.bankName || formData.bankName,
    });
    setFormData((prev) => ({
      ...prev,
      pricingOptions: [...(prev.pricingOptions || []), newOpt],
    }));
    setExpandedOptionId(newOpt.id);
  };

  const removeOption = (id: string) => {
    setFormData((prev) => {
      const remaining = (prev.pricingOptions || []).filter((o) => o.id !== id);
      const fallback = remaining.length > 0 ? remaining : [createDefaultPricingOption()];
      return {
        ...prev,
        pricingOptions: fallback,
        price: fallback[0]?.price || "",
        paymentType: fallback[0]?.paymentType || "one_time",
        recurringInterval: fallback[0]?.recurringInterval || "1m",
        recurringCustomDays: fallback[0]?.recurringCustomDays || 30,
        hasFreeTrial: fallback[0]?.hasFreeTrial || false,
        trialPreset: fallback[0]?.trialPreset || "7",
        trialCustomDays: fallback[0]?.trialCustomDays || 7,
        kaspiMethods: fallback[0]?.kaspiMethods?.length ? fallback[0].kaspiMethods : ["link"],
        kaspiLink: fallback[0]?.kaspiLink || "",
        kaspiPhone: fallback[0]?.kaspiPhone || "",
        kaspiCard: fallback[0]?.kaspiCard || "",
        bank: fallback[0]?.bank || DEFAULT_BANK,
        bankName: fallback[0]?.bankName || "",
      };
    });
    if (expandedOptionId === id) {
      setExpandedOptionId(null);
    }
  };

  // --- Форматирование цены: 60000 → "60 000" ---
  const formatPriceDisplay = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  };

  // --- Форматирование телефона с плюсом: 77764750099 → "+7 776 475 00-99", 996776475009 → "+996 776 475 009" ---
  const formatPhone = (raw: string): string => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) return "";

    // Нормализация для Казахстана / РФ (начинается с 7 или 8)
    if (digits.startsWith("7") || digits.startsWith("8")) {
      const d = (digits.startsWith("8") ? "7" + digits.slice(1) : digits).slice(0, 11);
      if (d.length <= 1) return `+${d}`;
      if (d.length <= 4) return `+${d[0]} ${d.slice(1)}`;
      if (d.length <= 7) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4)}`;
      if (d.length <= 9) return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
      return `+${d[0]} ${d.slice(1, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)}-${d.slice(9, 11)}`;
    }

    // Международный формат (например Кыргызстан +996, Узбекистан +998 и др.)
    const d = digits.slice(0, 15);
    const codeLen = d.startsWith("99") || d.startsWith("37") ? 3 : d.length >= 3 ? 3 : d.length;
    const code = d.slice(0, codeLen);
    const rest = d.slice(codeLen);

    if (!rest) return `+${code}`;
    const parts = [code];
    for (let i = 0; i < rest.length; i += 3) {
      parts.push(rest.slice(i, i + 3));
    }
    return `+${parts.join(" ")}`;
  };


  const scrollToField = (id: string) => {
    setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const target =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLButtonElement
            ? el
            : el.querySelector<HTMLElement>("input, textarea, button, [tabindex='0']") || el;

        try {
          target.focus({ preventScroll: true });
        } catch {
          target.focus?.();
        }

        target.classList.add("ring-2", "ring-[#FF6B00]", "transition-all");
        setTimeout(() => {
          target.classList.remove("ring-2", "ring-[#FF6B00]");
        }, 2000);
      }
    }, 200);
  };

  const notifyMissingField = (id: string, prepareUi?: () => void) => {
    if (prepareUi) {
      prepareUi();
    }
    toast.error(
      <span className="flex items-center gap-1 font-medium">
        Заполните обязательные поля <ReqStar />
      </span>
    );
    scrollToField(id);
  };

  /** Первая незаполненная настройка оплаты: id поля, вариант тарифа и (если нужно) свой текст ошибки. */
  const findPaymentIssue = (): { id: string; optId?: string; message?: string } | null => {
    if (formData.afterAccessEnabled && !normalizeGroupLink(formData.afterAccessUrl)) {
      return { id: "after-access-url", message: "Добавьте корректную ссылку на группу, начинающуюся с https://" };
    }
    if (!formData.isPaid) return null;
    if (!formData.pricingOptions || formData.pricingOptions.length === 0) {
      return { id: "field-pricing-options" };
    }
    for (const opt of formData.pricingOptions) {
      if (!opt.price || Number(opt.price) <= 0) {
        return { id: `price-${opt.id}`, optId: opt.id };
      }
      if (opt.paymentType === "recurring" && !opt.recurringInterval) {
        return { id: `recurring-interval-${opt.id}`, optId: opt.id };
      }
      const methods = new Set(opt.kaspiMethods);
      if (methods.size === 0) {
        return { id: `price-${opt.id}`, optId: opt.id, message: "Выберите хотя бы один способ оплаты" };
      }
      if (methods.has("link") && !opt.kaspiLink?.trim()) {
        return { id: `kaspi-link-${opt.id}`, optId: opt.id };
      }
      if (methods.has("phone")) {
        const digits = opt.kaspiPhone?.replace(/\D/g, "") || "";
        if (!opt.kaspiPhone?.trim() || digits.length < 5) {
          return { id: `kaspi-phone-${opt.id}`, optId: opt.id };
        }
      }
      if (methods.has("card") && !isValidCardNumber(opt.kaspiCard)) {
        return { id: `kaspi-card-${opt.id}`, optId: opt.id, message: "Номер карты должен содержать 16 цифр" };
      }
      if (methods.has("card") && opt.bank === "other" && !opt.bankName.trim()) {
        return { id: `bank-name-${opt.id}`, optId: opt.id };
      }
    }
    return null;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const detailsIssue = !formData.title?.trim() ? "title" : null;
    const categoryIssue = !formData.categoryId
      ? "field-category"
      : !formData.subcategoryId
        ? "field-subcategory"
        : null;
    const paymentIssue = findPaymentIssue();

    if (detailsIssue || categoryIssue || paymentIssue) {
      // Раскрываем сразу все разделы, где что-то не заполнено, и ведём к первому полю.
      if (detailsIssue) setDetailsOpen(true);
      if (categoryIssue) setCategoryOpen(true);
      if (paymentIssue) {
        setPaymentOpen(true);
        if (paymentIssue.optId) setExpandedOptionId(paymentIssue.optId);
      }
      const firstId = detailsIssue ?? categoryIssue ?? paymentIssue!.id;
      if (!detailsIssue && !categoryIssue && paymentIssue?.message) {
        toast.error(paymentIssue.message);
        scrollToField(firstId);
      } else {
        notifyMissingField(firstId);
      }
      return;
    }

    onSubmit(e);
  };

  const durationPresets = [
    { label: "7 дней", value: 7 },
    { label: "2 недели", value: 14 },
    { label: "1 месяц", value: 30 },
  ];

  return (
    <form onSubmit={handleFormSubmit} noValidate className="space-y-4 mt-4 w-full min-w-0 max-w-full overflow-x-clip">
      {Boolean(coverCrop.source) ? (
        <div className="space-y-4 py-1 animate-in fade-in-50 duration-200">
          <CoverCropEditor
            source={coverCrop.source!}
            mediaType={coverCrop.mediaType}
            previewStyle={coverCrop.previewStyle}
            zoom={coverCrop.zoom}
            onZoom={coverCrop.setZoom}
            onPointerDown={coverCrop.onPointerDown}
            onPointerMove={coverCrop.onPointerMove}
            onPointerUp={coverCrop.onPointerUp}
            saving={cropSaving}
            onCancel={() => {
              coverCrop.resetCrop();
              setCropQueue([]);
            }}
            onSave={() => void handleSaveCrop()}
          />
        </div>
      ) : (
        <div className="space-y-4 w-full min-w-0 max-w-full">
          <div className="divide-y divide-border border-y border-border">
          {/* ============ ДЕТАЛИ ============ */}
    <FormSection label="Детали" open={detailsOpen} onOpenChange={setDetailsOpen}>
        {/* Unified Cover (Image & Video) upload */}
        <div className="space-y-2 w-full min-w-0 max-w-full">
          <div className="flex items-center justify-between">
            <Label className="text-sm sm:text-base font-semibold text-foreground">Обложка</Label>
            {formData.media && formData.media.length > 0 && (
              <label className="cursor-pointer inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                {uploadingMedia ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>Добавить</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  disabled={uploadingMedia}
                  onChange={handleMediaChange}
                />
              </label>
            )}
          </div>
          
          <style>{`
            .media-cards-scroll::-webkit-scrollbar {
              display: none !important;
              width: 0 !important;
              height: 0 !important;
            }
          `}</style>

          {(!formData.media || formData.media.length === 0) ? (
            <label
              className={`flex flex-col items-center justify-center gap-3 h-44 sm:h-52 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
                isMediaDragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsMediaDragging(true); }}
              onDragLeave={() => setIsMediaDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsMediaDragging(false);
                const files = Array.from(e.dataTransfer.files).filter(
                  (f) => f.type.startsWith("image/") || f.type.startsWith("video/")
                );
                if (files.length > 0) void startCoverCropProcess(files);
                else toast.error("Перетащите фото или видео");
              }}
            >
              {uploadingMedia ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Загрузка...</span>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                    <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
                  </div>
                  <span className="text-sm sm:text-base font-medium text-foreground">
                    Добавьте фото или видео
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                disabled={uploadingMedia}
                onChange={handleMediaChange}
              />
            </label>
          ) : (
            <div className="space-y-2 w-full min-w-0 max-w-full">
              <div className="media-scroll-wrapper w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-black/5 relative">
                <div
                  ref={mediaScrollRef}
                  onScroll={handleMediaScroll}
                  className="media-cards-scroll w-full max-w-full min-w-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory no-scrollbar"
                  style={{
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {formData.media.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="w-full min-w-full max-w-full shrink-0 snap-center relative aspect-[16/10] sm:h-72 flex items-center justify-center bg-black/10 overflow-hidden"
                    >
                      {item.type === "video" ? (
                        <ProductVideoPlayer
                          key={item.id || item.previewUrl || item.url || idx}
                          src={item.previewUrl || item.url || ""}
                          controls
                          playsInline
                          objectFit="cover"
                          objectPosition={item.objectPosition || "center"}
                          className="w-full h-full max-w-full"
                        />
                      ) : (
                        <img
                          src={item.url || item.previewUrl}
                          alt={`cover-${idx + 1}`}
                          className="w-full h-full object-cover max-w-full"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Строка управления: стрелки слева, точки по центру, корзина справа */}
              <div className="relative flex items-center justify-between pt-0.5 px-0.5 w-full min-w-0">
                {/* Стрелки влево/вправо слева (только когда файлов > 1) */}
                <div className="flex items-center gap-1 z-10 min-w-[60px]">
                  {formData.media.length > 1 && (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={activeMediaIndex === 0}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0 disabled:opacity-20 disabled:pointer-events-none transition-all"
                        onClick={() => scrollToMediaIndex(Math.max(0, activeMediaIndex - 1))}
                        title="Предыдущее"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={activeMediaIndex === formData.media.length - 1}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0 disabled:opacity-20 disabled:pointer-events-none transition-all"
                        onClick={() => scrollToMediaIndex(Math.min(formData.media.length - 1, activeMediaIndex + 1))}
                        title="Следующее"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>

                {/* Точки-индикаторы СТРОГО по центру с плавным перетеканием (только когда файлов > 1) */}
                {formData.media.length > 1 && (
                  <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 py-0.5 pointer-events-auto">
                    {formData.media.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => scrollToMediaIndex(i)}
                        className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/60 transition-colors shrink-0"
                        title={`Медиа ${i + 1}`}
                      />
                    ))}
                    <div
                      ref={mediaDotRef}
                      className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-xs pointer-events-none"
                      style={{
                        left: "0px",
                        transition: "left 60ms ease-out",
                      }}
                    />
                  </div>
                )}

                {/* Корзина в правом углу */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0 z-10 ml-auto"
                  onClick={() => handleDeleteMedia(activeMediaIndex)}
                  title="Удалить"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="title" className="flex items-center text-sm sm:text-base font-semibold text-foreground">
            Название <ReqStar />
          </Label>
          <AutoResizeTextarea
            id="title"
            placeholder="Название"
            rows={1}
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            className="text-base font-normal text-foreground placeholder:text-muted-foreground bg-background rounded-xl"
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description" className="flex items-center text-sm sm:text-base font-semibold text-foreground">
            Описание
          </Label>
          <RichTextEditor
            value={formData.description}
            onChange={(val) => setFormData(prev => ({ ...prev, description: val }))}
            placeholder="Описание"
            minHeight="70px"
            maxHeight="220px"
          />
        </div>

        {/* FAQ editor (внутри Деталей) */}
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-2 text-sm sm:text-base font-semibold text-foreground">
                <HelpCircle className="w-4 h-4 text-primary" />
                Часто задаваемые вопросы
              </Label>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Добавьте ответы на популярные вопросы ваших покупателей.
              </p>
            </div>

            {/* Кнопка + справа от надписи Часто задаваемые вопросы */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-full border border-dashed border-primary/50 bg-primary/5 text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shrink-0 ml-2 shadow-2xs"
              onClick={handleAddFaq}
              title="Добавить вопрос"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-1">
            <style>{`
              .faq-scroll-wrapper {
                overflow: hidden !important;
              }
              .faq-cards-scroll {
                -ms-overflow-style: none !important;
                scrollbar-width: none !important;
                scroll-behavior: smooth;
                touch-action: pan-x;
              }
              .faq-cards-scroll::-webkit-scrollbar,
              .faq-cards-scroll::-webkit-scrollbar-thumb,
              .faq-cards-scroll::-webkit-scrollbar-track,
              .faq-cards-scroll::-webkit-scrollbar-corner {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
                max-height: 0 !important;
                background: transparent !important;
                -webkit-appearance: none !important;
                opacity: 0 !important;
              }
            `}</style>
            {/* Обертка с overflow:hidden, скрывающая скроллбар */}
            <div className="faq-scroll-wrapper w-full overflow-hidden rounded-xl">
              {/* Контейнер прокрутки: padding-bottom выталкивает системный скроллбар за пределы обертки */}
              <div
                ref={faqScrollRef}
                onScroll={handleFaqScroll}
                className="faq-cards-scroll w-full flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory gap-3 py-1 pb-10 -mb-10 no-scrollbar"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {(formData.faq && formData.faq.length > 0
                  ? formData.faq
                  : [{ question: "", answer: "" }]
                ).map((item, idx) => (
                  <div
                    key={idx}
                    className="w-full min-w-full shrink-0 snap-center rounded-xl border border-border/80 bg-card p-3 space-y-2 shadow-xs"
                  >
                    <AutoResizeTextarea
                      placeholder="Вопрос"
                      rows={1}
                      style={{ minHeight: "42px" }}
                      value={item.question}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          faq: (prev.faq || []).map((it, i) =>
                            i === idx ? { ...it, question: v } : it
                          ),
                        }));
                      }}
                      className="text-base font-normal text-foreground placeholder:text-muted-foreground bg-background rounded-lg"
                    />

                    <AutoResizeTextarea
                      placeholder="Ответ на вопрос..."
                      rows={2}
                      style={{ minHeight: "58px" }}
                      value={item.answer}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          faq: (prev.faq || []).map((it, i) =>
                            i === idx ? { ...it, answer: v } : it
                          ),
                        }));
                      }}
                      className="text-base font-normal text-foreground placeholder:text-muted-foreground bg-background rounded-lg"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Нижняя строка управления (только когда карточек больше 1) */}
            {formData.faq && formData.faq.length > 1 && (
              <div className="relative flex items-center justify-between pt-0.5 px-0.5">
                {/* Стрелки влево и вправо рядом друг с другом слева */}
                <div className="flex items-center gap-1 z-10">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={activeFaqIndex === 0}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0 disabled:opacity-20 disabled:pointer-events-none transition-all"
                    onClick={() => scrollToFaqIndex(Math.max(0, activeFaqIndex - 1))}
                    title="Предыдущий вопрос"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={activeFaqIndex === formData.faq.length - 1}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg shrink-0 disabled:opacity-20 disabled:pointer-events-none transition-all"
                    onClick={() => scrollToFaqIndex(Math.min(formData.faq.length - 1, activeFaqIndex + 1))}
                    title="Следующий вопрос"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>

                {/* Точки-индикаторы СТРОГО по центру карточки с плавным перетеканием */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 py-0.5 pointer-events-auto">
                  {formData.faq.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => scrollToFaqIndex(i)}
                      className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/60 transition-colors shrink-0"
                      title={`Вопрос ${i + 1}`}
                    />
                  ))}
                  {/* Плавно переливающийся оранжевый индикатор */}
                  <div
                    ref={dotRef}
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary shadow-xs pointer-events-none"
                    style={{
                      left: `${dotOffset}px`,
                      transition: "left 60ms ease-out",
                    }}
                  />
                </div>

                {/* Мусорка в правом углу */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors shrink-0 z-10"
                  onClick={() => handleDeleteFaq(activeFaqIndex)}
                  title="Удалить этот вопрос"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
    </FormSection>

    {/* ============ КЛАССИФИКАЦИЯ ============ */}
    <FormSection label="Классификация" open={categoryOpen} onOpenChange={handleCategoryOpenChange}>
        {/* Состояние загрузки AI */}
        {aiLoading && (
          <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 px-3 py-2 rounded-xl border border-primary/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
            <span>Подбираем категорию и тему с помощью AI...</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center text-sm sm:text-base font-semibold text-foreground">
                {t("productFormCategory")} <ReqStar />
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => triggerAiCategory(true)}
                disabled={aiLoading}
                className="h-7 px-2.5 text-xs font-medium text-primary hover:text-primary hover:bg-primary/10 rounded-lg gap-1.5 transition-all"
                title="Определить категорию, подкатегорию и тему по названию и описанию"
              >
                {aiLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                )}
                <span>Обновить через ИИ</span>
              </Button>
            </div>
            <Select
              value={formData.categoryId || undefined}
              onValueChange={(value) => {
                isUserSelectedCategory.current = true;
                setFormData((prev) => ({
                  ...prev,
                  categoryId: value,
                  subcategoryId: "",
                  topic: "",
                }));
                setTimeout(() => {
                  const el = document.getElementById("field-category");
                  if (el) {
                    el.classList.remove("ring-2", "ring-[#FF6B00]");
                    el.blur();
                  }
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                }, 50);
              }}
            >
              <SelectTrigger
                id="field-category"
                className="h-12 bg-background cursor-pointer transition-colors border-border hover:border-[#FF6B00] hover:ring-1 hover:ring-[#FF6B00] hover:bg-[#FF6B00]/5 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:outline-none focus:outline-none text-base"
              >
                <SelectValue placeholder={t("selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {taxonomyCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id} className="text-base py-2.5">
                    {categoryLabel(category, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {formData.categoryId && (
            <div className="space-y-2">
              <Label className="flex items-center text-sm sm:text-base font-semibold text-foreground">
                {t("productFormSubcategory")} <ReqStar />
              </Label>
              <Select
                value={formData.subcategoryId || undefined}
                onValueChange={(value) => {
                  isUserSelectedCategory.current = true;
                  const cat = taxonomyCategories.find((c) => c.id === formData.categoryId);
                  const sub = cat?.subcategories?.find((s) => s.id === value);
                  const topics = cat ? getPresetTopics(cat.slug, sub?.slug) : [];
                  setFormData((prev) => {
                    const prevTopics = parseTopicsList(prev.topic);
                    const remaining = prevTopics.filter((item) =>
                      topics.some((t) => isExactTopicMatch(item, t))
                    );
                    return {
                      ...prev,
                      subcategoryId: value,
                      topic: serializeTopicsList(remaining),
                    };
                  });
                  setTimeout(() => {
                    const el = document.getElementById("field-subcategory");
                    if (el) {
                      el.classList.remove("ring-2", "ring-[#FF6B00]");
                      el.blur();
                    }
                    if (document.activeElement instanceof HTMLElement) {
                      document.activeElement.blur();
                    }
                  }, 50);
                }}
              >
                <SelectTrigger
                  id="field-subcategory"
                  className="h-12 bg-background cursor-pointer transition-colors border-border hover:border-[#FF6B00] hover:ring-1 hover:ring-[#FF6B00] hover:bg-[#FF6B00]/5 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:outline-none focus:outline-none text-base"
                >
                  <SelectValue placeholder={t("selectSubcategory")} />
                </SelectTrigger>
                <SelectContent>
                  {(
                    taxonomyCategories.find((category) => category.id === formData.categoryId)
                      ?.subcategories ?? []
                  ).map((subcategory) => (
                    <SelectItem key={subcategory.id} value={subcategory.id} className="text-base py-2.5">
                      {subcategoryLabel(subcategory, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Выбор и добавление Темы */}
          {formData.categoryId && formData.subcategoryId && (() => {
            const selectedTopics = parseTopicsList(formData.topic);

            return (
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label className="text-sm sm:text-base font-semibold text-foreground">Тема продукта</Label>
                </div>

                {/* Выбранные темы в виде плашек с крестиком (над поиском) */}
                {selectedTopics.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {selectedTopics.map((topicItem) => (
                      <span
                        key={topicItem}
                        className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-xl text-sm sm:text-base font-normal bg-primary/10 text-primary border border-primary/20 shadow-2xs transition-all"
                      >
                        <span>{topicItem}</span>
                        <button
                          type="button"
                          onClick={() => {
                            isUserSelectedCategory.current = true;
                            const updated = selectedTopics.filter((t) => !isExactTopicMatch(t, topicItem));
                            setFormData((prev) => ({
                              ...prev,
                              topic: serializeTopicsList(updated),
                            }));
                          }}
                          className="w-4 h-4 rounded-full inline-flex items-center justify-center hover:bg-primary/20 text-primary/80 hover:text-primary transition-colors cursor-pointer"
                          title={`Убрать тему ${topicItem}`}
                          aria-label={`Убрать тему ${topicItem}`}
                        >
                          <XIcon className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Поиск темы */}
                <Input
                  placeholder="Например (Английский, ЕНТ, Бизнес)..."
                  value={searchTopic}
                  onChange={(e) => setSearchTopic(e.target.value)}
                  className="h-11 bg-background text-base rounded-xl"
                />

                {/* Список тем в виде бейджей */}
                <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-1 border rounded-xl bg-background/50">
                  {(() => {
                    const currentCat = taxonomyCategories.find((c) => c.id === formData.categoryId);
                    const currentSub = currentCat?.subcategories?.find((s) => s.id === formData.subcategoryId);
                    const presetList = getPresetTopics(currentCat?.slug || "", currentSub?.slug);
                    const allTopics = Array.from(new Set([...presetList, ...customTopics]));

                    // Убираем уже выбранные темы из списка предложений
                    const unselectedTopics = allTopics.filter(
                      (topicItem) => !selectedTopics.some((sel) => isExactTopicMatch(sel, topicItem))
                    );

                    const filtered = searchTopic.trim()
                      ? unselectedTopics.filter((t) =>
                          t.toLowerCase().includes(searchTopic.trim().toLowerCase())
                        )
                      : unselectedTopics;

                    if (filtered.length === 0) {
                      return (
                        <p className="text-xs sm:text-sm text-muted-foreground p-2">
                          {searchTopic.trim()
                            ? "Подходящая тема не найдена. Вы можете добавить её ниже."
                            : unselectedTopics.length === 0 && allTopics.length > 0
                            ? "Все темы из списка уже выбраны."
                            : "Темы не найдены. Вы можете добавить свою тему ниже."}
                        </p>
                      );
                    }

                    return filtered.map((topicItem) => (
                      <button
                        key={topicItem}
                        type="button"
                        onClick={() => {
                          isUserSelectedCategory.current = true;
                          const updated = [...selectedTopics, topicItem];
                          setFormData((prev) => ({
                            ...prev,
                            topic: serializeTopicsList(updated),
                          }));
                        }}
                        className="text-sm sm:text-base px-3.5 py-1.5 rounded-xl border transition-all text-left bg-background hover:bg-muted text-foreground border-border hover:border-primary/40 cursor-pointer font-normal"
                      >
                        {topicItem}
                      </button>
                    ));
                  })()}
                </div>

                {/* Предложить новую тему */}
                {!isAddingTopic ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-foreground hover:text-foreground flex items-center justify-center gap-2 text-sm sm:text-base font-medium rounded-xl transition-all"
                    onClick={() => setIsAddingTopic(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Предложить новую
                  </Button>
                ) : (
                  <div className="relative p-3.5 border border-dashed border-primary/40 rounded-2xl bg-card space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-sm sm:text-base font-semibold text-foreground">
                          Предложить новую тему
                        </Label>
                        <button
                          type="button"
                          disabled={isAutoGeneratingTopic}
                          onClick={handleAutoSuggestTopic}
                          className="p-1 rounded-md text-primary hover:bg-primary/10 transition-colors flex items-center justify-center disabled:opacity-50"
                          title="Подобрать тему автоматически"
                          aria-label="Подобрать тему автоматически"
                        >
                          {isAutoGeneratingTopic ? (
                            <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          ) : (
                            <Wand2 className="w-4 h-4 text-primary" />
                          )}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingTopic(false);
                          setNewTopicName("");
                        }}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Закрыть"
                        aria-label="Закрыть"
                      >
                        <XIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {(() => {
                      const handleTopicSubmit = async () => {
                        if (!formData.categoryId) {
                          toast.error("Сначала выберите категорию");
                          return;
                        }
                        const currentCat = taxonomyCategories.find((c) => c.id === formData.categoryId);
                        const currentSub = currentCat?.subcategories?.find((s) => s.id === formData.subcategoryId);
                        const presetList = getPresetTopics(currentCat?.slug || "", currentSub?.slug);
                        const allTopics = Array.from(new Set([...presetList, ...customTopics]));
                        const check = validateNewTopic(newTopicName, allTopics);
                        if (!check.isValid) {
                          toast.error(check.error || "Недопустимое название");
                          return;
                        }
                        try {
                          const { error } = await supabase
                            .from("topics" as any)
                            .upsert(
                              {
                                category_id: formData.categoryId,
                                subcategory_id: formData.subcategoryId || null,
                                name: check.formatted,
                                normalized_name: check.normalized,
                                status: "pending",
                                created_by:
                                  (typeof window !== "undefined" && localStorage.getItem("profile_display_name")) ||
                                  creatorCreds().creatorName ||
                                  null,
                              },
                              { onConflict: "category_id,normalized_name" }
                            );
                          if (error) {
                            if (error.message?.includes("duplicate") || error.code === "23505") {
                              toast.info("Эта тема уже была предложена и находится на проверке");
                            } else {
                              console.warn("Failed to suggest topic:", error);
                              toast.error("Не удалось отправить тему");
                            }
                            return;
                          }
                          setNewTopicName("");
                          setIsAddingTopic(false);
                          toast.success("Тема отправлена на модерацию");

                          // Отправка push-уведомления модераторам
                          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-api`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
                            },
                            body: JSON.stringify({
                              action: "notify_new_topic",
                              topic_name: check.formatted,
                              creator_name:
                                (typeof window !== "undefined" && localStorage.getItem("profile_display_name")) ||
                                creatorCreds().creatorName ||
                                null,
                            }),
                          }).catch((e) => console.warn("Failed to notify moderator:", e));
                        } catch (err) {
                          console.warn("Failed to suggest topic:", err);
                          toast.error("Ошибка при отправке темы");
                        }
                      };

                      return (
                        <div className="flex gap-2 items-center">
                          <Input
                            placeholder="Например (🇩🇪 Немецкий язык, 🍳 Кулинария)..."
                            value={newTopicName}
                            onChange={(e) => setNewTopicName(e.target.value)}
                            className="h-11 text-base bg-background flex-1 rounded-xl"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleTopicSubmit();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-11 w-11 shrink-0 rounded-xl bg-background hover:bg-muted text-foreground border-border hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                            onClick={handleTopicSubmit}
                            title="Отправить тему"
                            aria-label="Отправить тему"
                          >
                            <ArrowRight className="w-5 h-5" />
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
    </FormSection>

    {/* ============ ОПЛАТА ============ */}
    <FormSection label="Оплата" open={paymentOpen} onOpenChange={setPaymentOpen}>
        {/* Choice between Free access and Paid access (Whop style) */}
        <div className="space-y-2">
          <Label className="text-sm sm:text-base font-semibold text-foreground flex items-center">
            Как люди получат доступ? <ReqStar />
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-1">
            {/* Карточка 1: Бесплатно */}
            <div
              onClick={() => setFormData(prev => ({ ...prev, isPaid: false }))}
              className={cn(
                "relative flex items-center justify-between p-3 sm:p-4 rounded-2xl border cursor-pointer transition-all",
                !formData.isPaid
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                  : "border-border/80 bg-card hover:border-border hover:bg-muted/30"
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  !formData.isPaid ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}>
                  <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <p className="font-semibold text-sm sm:text-base text-foreground truncate">Бесплатно</p>
              </div>
              <div className={cn(
                "w-4 h-4 sm:w-5 sm:h-5 rounded-full border flex items-center justify-center shrink-0 ml-1.5 sm:ml-2 transition-colors",
                !formData.isPaid ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}>
                {!formData.isPaid && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white" />}
              </div>
            </div>

            {/* Карточка 2: Платно */}
            <div
              onClick={() => {
                setFormData(prev => {
                  const opts = prev.pricingOptions && prev.pricingOptions.length > 0
                    ? prev.pricingOptions
                    : [createDefaultPricingOption()];
                  return {
                    ...prev,
                    isPaid: true,
                    pricingOptions: opts,
                    price: opts[0]?.price || "49000",
                  };
                });
                if (!expandedOptionId && formData.pricingOptions?.[0]) {
                  setExpandedOptionId(formData.pricingOptions[0].id);
                }
              }}
              className={cn(
                "relative flex items-center justify-between p-3 sm:p-4 rounded-2xl border cursor-pointer transition-all",
                formData.isPaid
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm"
                  : "border-border/80 bg-card hover:border-border hover:bg-muted/30"
              )}
            >
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                  formData.isPaid ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                )}>
                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <p className="font-semibold text-sm sm:text-base text-foreground truncate">Платно</p>
              </div>
              <div className={cn(
                "w-4 h-4 sm:w-5 sm:h-5 rounded-full border flex items-center justify-center shrink-0 ml-1.5 sm:ml-2 transition-colors",
                formData.isPaid ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
              )}>
                {formData.isPaid && <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white" />}
              </div>
            </div>
          </div>
        </div>

        {/* Информационный блок если доступ бесплатный */}
        {!formData.isPaid && (
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-4">
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Покупатели получат моментальный доступ к продукту сразу, без необходимости оплачивать или вводить платёжные данные.
            </p>
          </div>
        )}

        {/* Если доступ платный */}
        {formData.isPaid && (
          <div id="field-pricing-options" className="space-y-4 pt-1">
            <div className="space-y-3">
              <div className="space-y-2.5">
                {(formData.pricingOptions || []).map((opt) => {
                  const isExpanded = expandedOptionId === opt.id;
                  const summaryText = getPricingOptionSummary(opt);

                  return (
                    <div
                      key={opt.id}
                      className={cn(
                        "rounded-2xl border transition-all overflow-hidden",
                        isExpanded
                          ? "border-primary/50 bg-card shadow-sm"
                          : "border-border bg-card/80 hover:border-border/80 hover:bg-muted/30"
                      )}
                    >
                      {/* Строка варианта */}
                      <div
                        onClick={() => setExpandedOptionId(isExpanded ? null : opt.id)}
                        className="flex items-center justify-between p-3.5 sm:p-4 cursor-pointer gap-2 sm:gap-3"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="font-semibold text-sm sm:text-base text-foreground">
                              {summaryText}
                            </span>
                            {opt.hasFreeTrial && (
                              <span className="text-xs sm:text-sm font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                Пробный {opt.trialPreset === "custom" ? opt.trialCustomDays : opt.trialPreset} дн.
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <div className="text-muted-foreground p-1">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Настройки внутри варианта */}
                      {isExpanded && (
                        <div className="p-4 pt-2 space-y-4 border-t border-border/60">
                          {/* Разово / Регулярно */}
                          <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                type="button"
                                variant={opt.paymentType === "one_time" ? "default" : "toggle"}
                                className="text-sm sm:text-base h-11"
                                onClick={() => updateOption(opt.id, { paymentType: "one_time" })}
                              >
                                Разово
                              </Button>
                              <Button
                                type="button"
                                variant={opt.paymentType === "recurring" ? "default" : "toggle"}
                                className="text-sm sm:text-base h-11"
                                onClick={() => updateOption(opt.id, { paymentType: "recurring" })}
                              >
                                Регулярно
                              </Button>
                            </div>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {opt.paymentType === "one_time"
                                ? "Доступ выдается без ограничения по времени, но вы всегда можете закрыть его вручную."
                                : "Доступ действует до окончания оплаченного периода. Если оплата не продлилась, доступ автоматически закрывается."}
                            </p>
                          </div>

                          {opt.paymentType === "one_time" ? (
                            <div className="space-y-2">
                              <Label className="flex items-center text-sm sm:text-base font-medium">
                                Цена (тенге) <ReqStar />
                              </Label>
                              <Input
                                id={`price-${opt.id}`}
                                type="text"
                                inputMode="numeric"
                                placeholder="49 000"
                                className="h-12 text-base"
                                value={formatPriceDisplay(opt.price)}
                                onChange={(e) => {
                                  const raw = e.target.value.replace(/\D/g, "");
                                  updateOption(opt.id, { price: raw });
                                }}
                              />
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label className="flex items-center text-sm sm:text-base font-medium">
                                    Цена (тенге) <ReqStar />
                                  </Label>
                                  <Input
                                    id={`price-${opt.id}`}
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="49 000"
                                    className="h-12 text-base"
                                    value={formatPriceDisplay(opt.price)}
                                    onChange={(e) => {
                                      const raw = e.target.value.replace(/\D/g, "");
                                      updateOption(opt.id, { price: raw });
                                    }}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label className="flex items-center text-sm sm:text-base font-medium">
                                    Период оплаты <ReqStar />
                                  </Label>
                                  <Select
                                    value={opt.recurringInterval}
                                    onValueChange={(val) => updateOption(opt.id, { recurringInterval: val })}
                                  >
                                    <SelectTrigger id={`recurring-interval-${opt.id}`} className="h-12 text-base">
                                      <SelectValue placeholder="Выберите период" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="7d" className="text-base py-2">7 дней</SelectItem>
                                      <SelectItem value="14d" className="text-base py-2">14 дней</SelectItem>
                                      <SelectItem value="1m" className="text-base py-2">1 месяц</SelectItem>
                                      <SelectItem value="3m" className="text-base py-2">3 месяца</SelectItem>
                                      <SelectItem value="1y" className="text-base py-2">1 год</SelectItem>
                                      <SelectItem value="custom" className="text-base py-2">Выбрать</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {opt.recurringInterval === "custom" && (
                                <div className="flex items-center gap-2 pt-1">
                                  <Label className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                                    Число дней:
                                  </Label>
                                  <Input
                                    type="number"
                                    min={1}
                                    className="h-10 w-32 text-base"
                                    placeholder="30"
                                    value={opt.recurringCustomDays || ""}
                                    onChange={(e) =>
                                      updateOption(opt.id, {
                                        recurringCustomDays: Number(e.target.value) || 0,
                                      })
                                    }
                                  />
                                  <span className="text-xs sm:text-sm text-muted-foreground">дн.</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Бесплатный пробный период */}
                          <div className="rounded-xl border border-border p-3 sm:p-4 space-y-3 bg-muted/20">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-sm sm:text-base font-medium cursor-pointer">
                                  Бесплатный пробный период
                                </Label>
                                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                  Дать покупателям доступ на несколько дней перед оплатой
                                </p>
                              </div>
                              <Switch
                                checked={opt.hasFreeTrial}
                                onCheckedChange={(checked) =>
                                  updateOption(opt.id, { hasFreeTrial: checked })
                                }
                              />
                            </div>

                            {opt.hasFreeTrial && (
                              <div className="space-y-2 pt-2 border-t border-border/60">
                                <Label className="text-xs sm:text-sm text-muted-foreground">Длительность пробного периода</Label>
                                <div className="grid grid-cols-4 gap-2">
                                  {(["3", "7", "30", "custom"] as const).map((preset) => (
                                    <Button
                                      key={preset}
                                      type="button"
                                      size="sm"
                                      variant={opt.trialPreset === preset ? "default" : "toggle"}
                                      onClick={() => updateOption(opt.id, { trialPreset: preset })}
                                      className="text-xs sm:text-sm h-9"
                                    >
                                      {preset === "custom" ? "Выбрать" : `${preset} ${preset === "3" ? "дня" : "дней"}`}
                                    </Button>
                                  ))}
                                </div>

                                {opt.trialPreset === "custom" && (
                                  <div className="flex items-center gap-2 pt-1">
                                    <Label className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                                      Число дней:
                                    </Label>
                                    <Input
                                      type="number"
                                      min={1}
                                      className="h-10 w-32 text-base"
                                      placeholder="14"
                                      value={opt.trialCustomDays || ""}
                                      onChange={(e) =>
                                        updateOption(opt.id, {
                                          trialCustomDays: Number(e.target.value) || 0,
                                        })
                                      }
                                    />
                                    <span className="text-xs sm:text-sm text-muted-foreground">дн.</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Способы оплаты для этого варианта: можно включить несколько */}
                          <div className="space-y-3 pt-2 border-t border-border/60">
                            <div className="space-y-1">
                              <Label className="text-sm sm:text-base font-medium text-foreground flex items-center">
                                Способ оплаты <ReqStar />
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                Можно выбрать несколько — покупатель увидит все.
                              </p>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              {KASPI_METHOD_ORDER.map((method) => {
                                const active = opt.kaspiMethods.includes(method);
                                return (
                                  <Button
                                    key={method}
                                    type="button"
                                    size="sm"
                                    variant={active ? "default" : "toggle"}
                                    aria-pressed={active}
                                    onClick={() => {
                                      const next = active
                                        ? opt.kaspiMethods.filter((m) => m !== method)
                                        : [...opt.kaspiMethods, method];
                                      updateOption(opt.id, { kaspiMethods: next });
                                    }}
                                    className="text-xs sm:text-sm h-9 px-1"
                                  >
                                    {KASPI_METHOD_LABELS[method]}
                                  </Button>
                                );
                              })}
                            </div>
                            {opt.kaspiMethods.includes("link") && (
                              <div className="space-y-1">
                                <Label htmlFor={`kaspi-link-${opt.id}`} className="text-xs text-muted-foreground">
                                  Ссылка на оплату
                                </Label>
                                <Input
                                  id={`kaspi-link-${opt.id}`}
                                  type="url"
                                  placeholder={t("kaspiLinkPlaceholder")}
                                  className="h-11 text-base"
                                  value={opt.kaspiLink}
                                  onChange={(e) => updateOption(opt.id, { kaspiLink: e.target.value })}
                                />
                              </div>
                            )}
                            {opt.kaspiMethods.includes("phone") && (
                              <div className="space-y-1">
                                <Label htmlFor={`kaspi-phone-${opt.id}`} className="text-xs text-muted-foreground">
                                  Номер телефона
                                </Label>
                                <Input
                                  id={`kaspi-phone-${opt.id}`}
                                  type="tel"
                                  placeholder="+7 776 475 00-99"
                                  className="h-11 text-base"
                                  value={opt.kaspiPhone}
                                  onChange={(e) => {
                                    const formatted = formatPhone(e.target.value);
                                    updateOption(opt.id, { kaspiPhone: formatted });
                                  }}
                                />
                              </div>
                            )}
                            {opt.kaspiMethods.includes("card") && (
                              <div className="space-y-1">
                                <Label htmlFor={`kaspi-card-${opt.id}`} className="text-xs text-muted-foreground">
                                  Номер карты
                                </Label>
                                <Input
                                  id={`kaspi-card-${opt.id}`}
                                  type="text"
                                  inputMode="numeric"
                                  autoComplete="off"
                                  placeholder="0000 0000 0000 0000"
                                  maxLength={19}
                                  className="h-11 text-base tracking-wider"
                                  value={formatCardNumber(opt.kaspiCard)}
                                  onChange={(e) => updateOption(opt.id, { kaspiCard: cardDigits(e.target.value) })}
                                />
                              </div>
                            )}
                            {opt.kaspiMethods.includes("card") && (
                              <div className="space-y-2">
                                <Label className="text-xs text-muted-foreground">Банк для перевода</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {BANK_OPTIONS.map((b) => (
                                    <Button
                                      key={b.value}
                                      type="button"
                                      size="sm"
                                      variant={opt.bank === b.value ? "default" : "toggle"}
                                      aria-pressed={opt.bank === b.value}
                                      onClick={() => updateOption(opt.id, { bank: b.value })}
                                      className="text-xs sm:text-sm h-9 px-1 gap-1.5"
                                    >
                                      {b.logo && (
                                        <img src={b.logo} alt="" className="h-4 w-4 shrink-0 rounded-sm object-contain" />
                                      )}
                                      {b.label}
                                    </Button>
                                  ))}
                                </div>
                                {opt.bank === "other" && (
                                  <Input
                                    id={`bank-name-${opt.id}`}
                                    type="text"
                                    placeholder="Название банка"
                                    className="h-11 text-base"
                                    value={opt.bankName}
                                    onChange={(e) => updateOption(opt.id, { bankName: e.target.value })}
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          {/* Footer внутри карточки варианта */}
                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            {(formData.pricingOptions || []).length > 1 ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs sm:text-sm flex items-center gap-1.5"
                                onClick={() => removeOption(opt.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Удалить этот вариант
                              </Button>
                            ) : <div />}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-white hover:bg-accent transition-all"
                              onClick={() => setExpandedOptionId(null)}
                            >
                              Свернуть
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Кнопка добавления варианта оплаты */}
              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-dashed border-border hover:border-primary/60 hover:bg-primary/5 text-foreground hover:text-foreground flex items-center justify-center gap-2 text-sm sm:text-base font-medium rounded-xl transition-all"
                onClick={addOption}
              >
                <Plus className="w-4 h-4" />
                Добавить вариант оплаты
              </Button>
            </div>
          </div>
        )}
        <AfterAccessFields enabled={formData.afterAccessEnabled} url={formData.afterAccessUrl} onChange={(value) => setFormData({ ...formData, ...value })} />
    </FormSection>
          </div>

    <Button
      type="submit" 
      variant="cta" 
      className="w-full"
      disabled={isPending}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {isEdit ? "Сохранение..." : "Создание..."}
        </span>
      ) : (
        isEdit ? "Сохранить изменения" : "Создать продукт"
      )}
    </Button>
        </div>
      )}
  </form>
  );
};

interface CreatorProductsTabProps {
  creatorName: string;
  onOpenUsers?: () => void;
}

const CreatorProductsTab = ({ creatorName, onOpenUsers }: CreatorProductsTabProps) => {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const { data: products = [], isLoading } = useCreatorProducts(creatorName);
  const { data: subsData } = useQuery({
    queryKey: ["creator-subscriptions", creatorName],
    queryFn: async () => {
      return invokeApi<{
        subscriptions: Array<{
          id: string;
          product_id: string;
          buyer_name: string;
          status: string;
          current_period_end: string;
          product_title: string;
        }>;
        counts: Record<string, number>;
      }>("manage-products", {
        action: "list_subscriptions",
        ...creatorCreds(),
      });
    },
    enabled: !!creatorName,
  });
  const subscriberCounts = subsData?.counts ?? {};
  const subscriptionRows = subsData?.subscriptions ?? [];
  const { data: taxonomyRaw = [] } = useCatalogTaxonomy();
  const taxonomyCategories = useMemo(() => {
    const allowedSlugs = ["online-lessons", "materials", "subscriptions", "events"];
    return taxonomyRaw
      .filter((c) => allowedSlugs.includes(c.slug))
      .map((c) => {
        const def = TAXONOMY_DEFINITIONS.find((d) => d.slug === c.slug);
        const allowedSubcatSlugs = def?.subcategories.map((s) => s.slug) || [];
        return {
          ...c,
          subcategories: (c.subcategories || []).filter((s) =>
            allowedSubcatSlugs.includes(s.slug)
          ),
        };
      });
  }, [taxonomyRaw]);
  const sellerHandle = typeof window !== "undefined" ? localStorage.getItem("profile_handle") : null;
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  
  const [isCreating, setIsCreating] = useState(false);
  const [isCroppingMedia, setIsCroppingMedia] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [materialsProduct, setMaterialsProduct] = useState<{ id: string; title: string } | null>(null);
  const [visibilityProductId, setVisibilityProductId] = useState<string | null>(null);
  const [pausingProduct, setPausingProduct] = useState<Product | null>(null);
  // Read from the live list so the dialog reflects the saved value after refetch.
  const visibilityProduct = visibilityProductId
    ? (products.find((p) => p.id === visibilityProductId) as Product | undefined) ?? null
    : null;
  const [pauseMessage, setPauseMessage] = useState<string>("");
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [pendingVideoFile, setPendingVideoFile] = useState<File | null>(null);
  
  const [formData, setFormData] = useState<FormData>({
    categoryId: "",
    subcategoryId: "",
    topic: "",
    lessonFormat: "",
    eventStartsAt: "",
    capacity: "",
    billingPeriod: "",
    title: "",
    headline: "",
    description: "",
    price: "49000",
    kaspiLink: "",
    telegramLink: "",
    afterAccessEnabled: false,
    afterAccessUrl: "",
    imageUrl: "",
    videoUrl: "",
    media: [],
    faq: [{ question: "", answer: "" }],
    isPaid: true,
    kaspiMethods: ["link"],
    kaspiPhone: "",
    kaspiCard: "",
    bank: DEFAULT_BANK,
    bankName: "",
    paymentType: "recurring",
    recurringInterval: "1m",
    recurringCustomDays: 30,
    hasFreeTrial: false,
    trialPreset: "7",
    trialCustomDays: 7,
    pricingOptions: [createDefaultPricingOption()],
  });

  const resetForm = () => {
    const defaultOpt = createDefaultPricingOption();
    setFormData({
      categoryId: "",
      subcategoryId: "",
      topic: "",
      lessonFormat: "",
      eventStartsAt: "",
      capacity: "",
      billingPeriod: "",
      title: "",
      headline: "",
      description: "",
      price: defaultOpt.price,
      kaspiLink: "",
      telegramLink: "",
    afterAccessEnabled: false,
    afterAccessUrl: "",
      imageUrl: "",
      videoUrl: "",
      media: [],
      faq: [{ question: "", answer: "" }],
      isPaid: true,
      kaspiMethods: ["link"],
      kaspiPhone: "",
      kaspiCard: "",
      bank: DEFAULT_BANK,
      bankName: "",
      paymentType: defaultOpt.paymentType,
      recurringInterval: defaultOpt.recurringInterval,
      recurringCustomDays: defaultOpt.recurringCustomDays,
      hasFreeTrial: defaultOpt.hasFreeTrial,
      trialPreset: defaultOpt.trialPreset,
      trialCustomDays: defaultOpt.trialCustomDays,
      pricingOptions: [defaultOpt],
    });
    setPendingImageFile(null);
    setPendingVideoFile(null);
  };

  // copyLink function removed - now using ShareLinkDialog for all link copying

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const taxonomyError = validateTaxonomyFields(formData, taxonomyCategories);
    if (!formData.title || taxonomyError) {
      toast.error(taxonomyError || "Заполните обязательные поля");
      return;
    }

    const options = formData.pricingOptions && formData.pricingOptions.length > 0
      ? formData.pricingOptions
      : [createDefaultPricingOption()];

    if (formData.isPaid && options.some(o => !o.price || Number(o.price) <= 0)) {
      toast.error("Укажите цену для всех вариантов оплаты");
      return;
    }

    const primaryOpt = options[0];
    let primaryAccessDays: number | null = null;
    let primaryBillingPeriod: string | null = null;
    if (formData.isPaid && primaryOpt.paymentType === "recurring") {
      primaryBillingPeriod =
        primaryOpt.recurringInterval === "1m"
          ? "month"
          : primaryOpt.recurringInterval === "3m"
          ? "quarter"
          : primaryOpt.recurringInterval === "1y"
          ? "year"
          : primaryOpt.recurringInterval;

      if (primaryOpt.recurringInterval === "7d") primaryAccessDays = 7;
      else if (primaryOpt.recurringInterval === "14d") primaryAccessDays = 14;
      else if (primaryOpt.recurringInterval === "1m") primaryAccessDays = 30;
      else if (primaryOpt.recurringInterval === "3m") primaryAccessDays = 90;
      else if (primaryOpt.recurringInterval === "1y") primaryAccessDays = 365;
      else if (primaryOpt.recurringInterval === "custom") primaryAccessDays = primaryOpt.recurringCustomDays || 30;
    }

    let primaryTrialDays: number | null = null;
    if (formData.isPaid && primaryOpt.hasFreeTrial) {
      if (primaryOpt.trialPreset === "3") primaryTrialDays = 3;
      else if (primaryOpt.trialPreset === "7") primaryTrialDays = 7;
      else if (primaryOpt.trialPreset === "30") primaryTrialDays = 30;
      else if (primaryOpt.trialPreset === "custom") primaryTrialDays = primaryOpt.trialCustomDays || 7;
    }

    const serializedOptions = formData.isPaid
      ? options.map(opt => {
          let accessDays: number | null = null;
          let bp: string | null = null;
          if (opt.paymentType === "recurring") {
            bp =
              opt.recurringInterval === "1m"
                ? "month"
                : opt.recurringInterval === "3m"
                ? "quarter"
                : opt.recurringInterval === "1y"
                ? "year"
                : opt.recurringInterval;
            if (opt.recurringInterval === "7d") accessDays = 7;
            else if (opt.recurringInterval === "14d") accessDays = 14;
            else if (opt.recurringInterval === "1m") accessDays = 30;
            else if (opt.recurringInterval === "3m") accessDays = 90;
            else if (opt.recurringInterval === "1y") accessDays = 365;
            else if (opt.recurringInterval === "custom") accessDays = opt.recurringCustomDays || 30;
          }
          let tDays: number | null = null;
          if (opt.hasFreeTrial) {
            if (opt.trialPreset === "3") tDays = 3;
            else if (opt.trialPreset === "7") tDays = 7;
            else if (opt.trialPreset === "30") tDays = 30;
            else if (opt.trialPreset === "custom") tDays = opt.trialCustomDays || 7;
          }
          return {
            id: opt.id,
            payment_type: opt.paymentType,
            price: Number(opt.price) || 0,
            recurring_interval: opt.paymentType === "recurring" ? opt.recurringInterval : null,
            access_duration_days: accessDays,
            billing_period: bp,
            has_free_trial: opt.hasFreeTrial,
            trial_days: tDays,
            ...serializeKaspiFields(opt),
          };
        })
      : [];

    try {
      const created = await createProduct.mutateAsync({
        title: formData.title,
        headline: formData.headline || null,
        description: formData.description || null,
        price: formData.isPaid ? Number(primaryOpt.price) : 0,
        kaspi_link: formData.isPaid ? serializeKaspiFields(primaryOpt).kaspi_link : null,
        kaspi_phone: formData.isPaid ? serializeKaspiFields(primaryOpt).kaspi_phone : null,
        telegram_link: null,
        payment_type: formData.isPaid ? primaryOpt.paymentType : "one_time",
        recurring_interval: formData.isPaid && primaryOpt.paymentType === "recurring" ? primaryOpt.recurringInterval : null,
        access_duration_days: primaryAccessDays,
        has_free_trial: formData.isPaid ? primaryOpt.hasFreeTrial : false,
        trial_days: primaryTrialDays,
        pricing_options: serializedOptions,
        after_access_enabled: formData.afterAccessEnabled,
        after_access_url: formData.afterAccessEnabled ? normalizeGroupLink(formData.afterAccessUrl) : null,
        has_schedule: false,
        is_active: true,
        faq: (formData.faq || [])
          .filter(it => (it?.question || "").trim() || (it?.answer || "").trim())
          .map(it => ({ question: (it?.question || "").trim(), answer: (it?.answer || "").trim() })),
        ...buildTaxonomyPayload(formData, taxonomyCategories),
      });

      // Upload pending media (if any)
      const finalMedia: Array<{ type: "image" | "video"; url: string; objectPosition?: string }> = [];
      for (const item of (formData.media || [])) {
        if (item.file && created?.id) {
          const toastId = toast.loading(`Загрузка ${item.type === "video" ? "видео (0%)..." : "фото..."}`);
          try {
            let fileToUpload = item.file;
            if (item.type === "video" && item.file.size > COMPRESSION_THRESHOLD) {
              toast.loading("Оптимизация видео...", { id: toastId });
              fileToUpload = await compressVideoIfNeeded(item.file, (pct) => {
                toast.loading(`Оптимизация видео (${pct}%)...`, { id: toastId });
              });
            }
            const uploadedUrl = await uploadProductMedia(fileToUpload, created.id, item.type, (pct) => {
              if (item.type === "video") {
                toast.loading(`Загрузка видео (${pct}%)...`, { id: toastId });
              }
            });
            toast.dismiss(toastId);
            finalMedia.push({ type: item.type, url: uploadedUrl, objectPosition: item.objectPosition });
          } catch (err: any) {
            toast.dismiss(toastId);
            toast.error(err?.message || `Ошибка загрузки ${item.type === "video" ? "видео" : "фото"}`);
          }
        } else if (item.url && !item.url.startsWith("blob:")) {
          finalMedia.push({ type: item.type, url: item.url, objectPosition: item.objectPosition });
        }
      }

      if (created?.id && finalMedia.length > 0) {
        const firstImg = finalMedia.find((m) => m.type === "image");
        const firstVid = finalMedia.find((m) => m.type === "video");
        try {
          await updateProduct.mutateAsync({
            id: created.id,
            media: finalMedia,
            image_url: firstImg?.url || null,
            video_url: firstVid?.url || null,
          });
        } catch {
          // already toasted above
        }
      }

      toast.success("Продукт создан!", {
        description: "Добавьте материалы и расписание, а затем поделитесь ссылкой или выставьте продукт.",
      });
      setIsCreating(false);
      resetForm();
    } catch (error: any) {
      console.error("Create product error:", error);
      toast.error(error?.message || "Ошибка при создании продукта");
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    const eventLocal =
      product.event_starts_at && !Number.isNaN(Date.parse(product.event_starts_at))
        ? new Date(product.event_starts_at).toISOString().slice(0, 16)
        : "";

    let loadedOptions: PricingOptionFormItem[] = [];
    if (Array.isArray(product.pricing_options) && product.pricing_options.length > 0) {
      loadedOptions = product.pricing_options.map((po: any) => {
        let tPreset: "3" | "7" | "30" | "custom" = "7";
        if (po.trial_days === 3) tPreset = "3";
        else if (po.trial_days === 7) tPreset = "7";
        else if (po.trial_days === 30) tPreset = "30";
        else if (po.trial_days) tPreset = "custom";

        const kaspi = kaspiSettingsFromStored(po, product);

        return {
          id: po.id || Math.random().toString(36).slice(2, 10),
          paymentType: po.payment_type === "recurring" ? "recurring" : "one_time",
          price: String(po.price ?? ""),
          recurringInterval: po.recurring_interval || "1m",
          recurringCustomDays: po.access_duration_days || 30,
          hasFreeTrial: Boolean(po.has_free_trial),
          trialPreset: tPreset,
          trialCustomDays: po.trial_days || 7,
          kaspiMethods: kaspi.methods,
          kaspiLink: kaspi.link,
          kaspiPhone: kaspi.phone,
          kaspiCard: kaspi.card,
          bank: kaspi.bank,
          bankName: kaspi.bankName,
        };
      });
    } else {
      const isRecurring = product.payment_type === "recurring" || Boolean(product.billing_period) || Boolean(product.access_duration_days);
      let interval = product.recurring_interval || "1m";
      if (!product.recurring_interval && product.access_duration_days) {
        if (product.access_duration_days === 7) interval = "7d";
        else if (product.access_duration_days === 14) interval = "14d";
        else if (product.access_duration_days === 30) interval = "1m";
        else if (product.access_duration_days === 90) interval = "3m";
        else if (product.access_duration_days === 365) interval = "1y";
        else interval = "custom";
      }
      const trialDays = product.trial_days;
      const trialPreset = trialDays === 3 ? "3" : trialDays === 7 ? "7" : trialDays === 30 ? "30" : trialDays ? "custom" : "7";

      loadedOptions = [{
        id: Math.random().toString(36).slice(2, 10),
        paymentType: isRecurring ? "recurring" : "one_time",
        price: String(product.price ?? ""),
        recurringInterval: interval,
        recurringCustomDays: product.access_duration_days || 30,
        hasFreeTrial: Boolean(product.has_free_trial),
        trialPreset: trialPreset as any,
        trialCustomDays: trialDays || 7,
        ...(() => {
          const kaspi = kaspiSettingsFromStored(product);
          return {
            kaspiMethods: kaspi.methods,
            kaspiLink: kaspi.link,
            kaspiPhone: kaspi.phone,
            kaspiCard: kaspi.card,
            bank: kaspi.bank,
            bankName: kaspi.bankName,
          };
        })(),
      }];
    }

    const firstOpt = loadedOptions[0];

    let loadedMedia: ProductMediaItem[] = [];
    if (Array.isArray(product.media) && product.media.length > 0) {
      loadedMedia = product.media.map((m: any, idx: number) => ({
        id: `media-${idx}-${m.url}`,
        type: m.type || (m.url?.match(/\.(mp4|webm|mov|m4v)/i) ? "video" : "image"),
        url: m.url,
        objectPosition: m.objectPosition,
      }));
    } else {
      if (product.image_url) {
        loadedMedia.push({ id: "media-img", type: "image", url: product.image_url });
      }
      if (product.video_url) {
        loadedMedia.push({ id: "media-vid", type: "video", url: product.video_url });
      }
    }

    setFormData({
      categoryId: product.category_id || "",
      subcategoryId: product.subcategory_id || "",
      topic: (product as any).topic || "",
      lessonFormat: (product.lesson_format as LessonFormat) || "",
      eventStartsAt: eventLocal,
      capacity: product.capacity != null ? String(product.capacity) : "",
      billingPeriod: (product.billing_period as BillingPeriod) || "",
      title: product.title,
      headline: product.headline || "",
      description: product.description || "",
      price: String(product.price ?? firstOpt.price),
      kaspiLink: firstOpt.kaspiLink,
      telegramLink: product.telegram_link || "",
      afterAccessEnabled: product.after_access_enabled ?? false,
      afterAccessUrl: product.after_access_url ?? "",
      imageUrl: product.image_url || "",
      videoUrl: product.video_url || "",
      media: loadedMedia,
      faq: Array.isArray(product.faq) && product.faq.length > 0 ? product.faq : [{ question: "", answer: "" }],
      isPaid: Number(product.price) > 0,
      kaspiMethods: firstOpt.kaspiMethods,
      kaspiPhone: firstOpt.kaspiPhone,
      kaspiCard: firstOpt.kaspiCard,
      bank: firstOpt.bank,
      bankName: firstOpt.bankName,
      paymentType: firstOpt.paymentType,
      recurringInterval: firstOpt.recurringInterval,
      recurringCustomDays: firstOpt.recurringCustomDays,
      hasFreeTrial: firstOpt.hasFreeTrial,
      trialPreset: firstOpt.trialPreset,
      trialCustomDays: firstOpt.trialCustomDays,
      pricingOptions: loadedOptions,
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    const taxonomyError = validateTaxonomyFields(formData, taxonomyCategories);
    if (!editingProduct || !formData.title || taxonomyError) {
      toast.error(taxonomyError || "Заполните обязательные поля");
      return;
    }

    const options = formData.pricingOptions && formData.pricingOptions.length > 0
      ? formData.pricingOptions
      : [createDefaultPricingOption()];

    if (formData.isPaid && options.some(o => !o.price || Number(o.price) <= 0)) {
      toast.error("Укажите цену для всех вариантов оплаты");
      return;
    }

    const primaryOpt = options[0];
    let primaryAccessDays: number | null = null;
    let primaryBillingPeriod: string | null = null;
    if (formData.isPaid && primaryOpt.paymentType === "recurring") {
      primaryBillingPeriod =
        primaryOpt.recurringInterval === "1m"
          ? "month"
          : primaryOpt.recurringInterval === "3m"
          ? "quarter"
          : primaryOpt.recurringInterval === "1y"
          ? "year"
          : primaryOpt.recurringInterval;

      if (primaryOpt.recurringInterval === "7d") primaryAccessDays = 7;
      else if (primaryOpt.recurringInterval === "14d") primaryAccessDays = 14;
      else if (primaryOpt.recurringInterval === "1m") primaryAccessDays = 30;
      else if (primaryOpt.recurringInterval === "3m") primaryAccessDays = 90;
      else if (primaryOpt.recurringInterval === "1y") primaryAccessDays = 365;
      else if (primaryOpt.recurringInterval === "custom") primaryAccessDays = primaryOpt.recurringCustomDays || 30;
    }

    let primaryTrialDays: number | null = null;
    if (formData.isPaid && primaryOpt.hasFreeTrial) {
      if (primaryOpt.trialPreset === "3") primaryTrialDays = 3;
      else if (primaryOpt.trialPreset === "7") primaryTrialDays = 7;
      else if (primaryOpt.trialPreset === "30") primaryTrialDays = 30;
      else if (primaryOpt.trialPreset === "custom") primaryTrialDays = primaryOpt.trialCustomDays || 7;
    }

    const serializedOptions = formData.isPaid
      ? options.map(opt => {
          let accessDays: number | null = null;
          let bp: string | null = null;
          if (opt.paymentType === "recurring") {
            bp =
              opt.recurringInterval === "1m"
                ? "month"
                : opt.recurringInterval === "3m"
                ? "quarter"
                : opt.recurringInterval === "1y"
                ? "year"
                : opt.recurringInterval;
            if (opt.recurringInterval === "7d") accessDays = 7;
            else if (opt.recurringInterval === "14d") accessDays = 14;
            else if (opt.recurringInterval === "1m") accessDays = 30;
            else if (opt.recurringInterval === "3m") accessDays = 90;
            else if (opt.recurringInterval === "1y") accessDays = 365;
            else if (opt.recurringInterval === "custom") accessDays = opt.recurringCustomDays || 30;
          }
          let tDays: number | null = null;
          if (opt.hasFreeTrial) {
            if (opt.trialPreset === "3") tDays = 3;
            else if (opt.trialPreset === "7") tDays = 7;
            else if (opt.trialPreset === "30") tDays = 30;
            else if (opt.trialPreset === "custom") tDays = opt.trialCustomDays || 7;
          }
          return {
            id: opt.id,
            payment_type: opt.paymentType,
            price: Number(opt.price) || 0,
            recurring_interval: opt.paymentType === "recurring" ? opt.recurringInterval : null,
            access_duration_days: accessDays,
            billing_period: bp,
            has_free_trial: opt.hasFreeTrial,
            trial_days: tDays,
            ...serializeKaspiFields(opt),
          };
        })
      : [];

    try {
      await updateProduct.mutateAsync({
        id: editingProduct.id,
        title: formData.title,
        headline: formData.headline || null,
        description: formData.description || null,
        price: formData.isPaid ? Number(primaryOpt.price) : 0,
        kaspi_link: formData.isPaid ? serializeKaspiFields(primaryOpt).kaspi_link : null,
        kaspi_phone: formData.isPaid ? serializeKaspiFields(primaryOpt).kaspi_phone : null,
        payment_type: formData.isPaid ? primaryOpt.paymentType : "one_time",
        recurring_interval: formData.isPaid && primaryOpt.paymentType === "recurring" ? primaryOpt.recurringInterval : null,
        access_duration_days: primaryAccessDays,
        has_free_trial: formData.isPaid ? primaryOpt.hasFreeTrial : false,
        trial_days: primaryTrialDays,
        pricing_options: serializedOptions,
        after_access_enabled: formData.afterAccessEnabled,
        after_access_url: formData.afterAccessEnabled ? normalizeGroupLink(formData.afterAccessUrl) : null,
        image_url: (formData.media || []).find((m) => m.type === "image")?.url || null,
        video_url: (formData.media || []).find((m) => m.type === "video")?.url || null,
        media: (formData.media || []).map((m) => ({ type: m.type, url: m.url, objectPosition: m.objectPosition })),
        faq: (formData.faq || [])
          .filter(it => (it?.question || "").trim() || (it?.answer || "").trim())
          .map(it => ({ question: (it?.question || "").trim(), answer: (it?.answer || "").trim() })),
        ...buildTaxonomyPayload(formData, taxonomyCategories),
      });
      
      toast.success("Продукт обновлён!");
      setEditingProduct(null);
      resetForm();
    } catch (error: any) {
      console.error("Failed to update product:", error);
      toast.error(error?.message || "Ошибка при обновлении продукта");
    }
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;

    try {
      await deleteProduct.mutateAsync(deletingProduct.id);
      toast.success("Продукт удалён!");
      setDeletingProduct(null);
    } catch (error: any) {
      console.error("Delete product error:", error);
      toast.error(error?.message || "Ошибка при удалении продукта");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div className="space-y-6">
      <CreatorPendingPayments creatorName={creatorName} mode="link" onOpenUsers={onOpenUsers} />

      {subscriptionRows.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-foreground">{t("activeSubscribers")}</h3>
            <div className="space-y-2">
              {subscriptionRows
                .filter(
                  (row) =>
                    row.status !== "past_due" && new Date(row.current_period_end) > new Date(),
                )
                .map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-border pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{row.buyer_name}</p>
                      <p className="text-muted-foreground truncate">{row.product_title}</p>
                    </div>
                    <p className="text-muted-foreground whitespace-nowrap">
                      {t("nextRenewal")}:{" "}
                      {new Intl.DateTimeFormat(language === "kk" ? "kk-KZ" : "ru-RU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      }).format(new Date(row.current_period_end))}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">{t("products")}</h2>
        <Dialog open={isCreating} onOpenChange={(open) => { setIsCreating(open); if (!open) { resetForm(); setIsCroppingMedia(false); } }}>
          <DialogTrigger asChild>
            <Button variant="default" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              {t("create")}
            </Button>
          </DialogTrigger>
          <DialogContent
          className="dialog-static w-[calc(100vw-2rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
            <DialogHeader>
              <DialogTitle>{isCroppingMedia ? "Настройка обложки" : "Создать продукт"}</DialogTitle>
            </DialogHeader>
            <ProductForm 
              onSubmit={handleCreate} 
              formData={formData}
              setFormData={setFormData}
              isPending={createProduct.isPending}
              t={t}
              taxonomyCategories={taxonomyCategories}
              pendingImageFile={pendingImageFile}
              pendingVideoFile={pendingVideoFile}
              setPendingImageFile={setPendingImageFile}
              setPendingVideoFile={setPendingVideoFile}
              onCroppingChange={setIsCroppingMedia}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => { if (!open) { setEditingProduct(null); resetForm(); setIsCroppingMedia(false); } }}>
        <DialogContent
          className="dialog-static w-[calc(100vw-2rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden min-w-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{isCroppingMedia ? "Настройка обложки" : `${t("edit")} продукт`}</DialogTitle>
          </DialogHeader>
          <ProductForm 
            onSubmit={handleUpdate} 
            isEdit 
            formData={formData}
            setFormData={setFormData}
            isPending={updateProduct.isPending}
            t={t}
            taxonomyCategories={taxonomyCategories}
            editingProductId={editingProduct?.id || null}
            onCroppingChange={setIsCroppingMedia}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingProduct} onOpenChange={(open) => { if (!open) setDeletingProduct(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить продукт?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы уверены, что хотите удалить "{deletingProduct?.title}"? Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProduct.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Products List */}
      <div className="space-y-3">
        {products.map((product) => {
          const firstMedia = Array.isArray(product.media) && product.media.length > 0 ? product.media[0] : null;
          const coverImg = (firstMedia && firstMedia.type === "image" ? firstMedia.url : null) || product.image_url;
          const coverVid = (firstMedia && firstMedia.type === "video" ? firstMedia.url : null) || product.video_url;

          return (
          <Card key={product.id} className="overflow-hidden">
            <CardContent className={isMobile ? "p-3" : "p-4"}>
              <div className="flex items-start gap-3 mb-2">
                {/* Thumbnail */}
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden shrink-0 bg-muted border border-border/60 flex items-center justify-center relative shadow-xs">
                  {coverImg ? (
                    <img src={coverImg} alt="" className="w-full h-full object-cover" />
                  ) : coverVid ? (
                    <div className="w-full h-full relative flex items-center justify-center bg-black/5 isolate">
                      <video src={coverVid} className="w-full h-full object-cover pointer-events-none" preload="auto" muted playsInline webkit-playsinline="true" />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center z-10" style={{ transform: "translate3d(0, 0, 10px)" }}>
                        <div className="w-6 h-6 rounded-full bg-[#FF6B00] flex items-center justify-center shadow-xs">
                          <Play className="w-3 h-3 text-white fill-white ml-0.5" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <ImageIcon className="w-6 h-6 text-muted-foreground/40" />
                  )}
                </div>

                {/* Header: title + price */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-semibold text-foreground ${isMobile ? "text-sm line-clamp-2" : "text-base"}`}>{product.title}</h3>
                      {product.headline && (
                        <p className={`text-muted-foreground mt-0.5 ${isMobile ? "text-xs line-clamp-1" : "text-sm"}`}>{product.headline}</p>
                      )}
                    </div>
                    <span className={`font-bold text-primary whitespace-nowrap ${isMobile ? "text-sm" : "text-base"}`}>
                      {formatPriceTenge(Number(product.price))}
                    </span>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {(product as Product).is_published ? (
                      <span className={`inline-flex items-center gap-1 bg-success/10 text-success px-2 py-0.5 rounded-full ${isMobile ? "text-[10px]" : "text-xs"}`}>
                        <Check className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {language === "ru" ? "Опубликован" : "Жарияланған"}
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 bg-muted text-muted-foreground px-2 py-0.5 rounded-full ${isMobile ? "text-[10px]" : "text-xs"}`}>
                        <Lock className="w-3 h-3 shrink-0" aria-hidden="true" />
                        {language === "ru" ? "Приватный" : "Жабық"}
                      </span>
                    )}
                    {product.billing_period && (
                      <span className={`bg-primary/10 text-primary px-2 py-0.5 rounded-full ${isMobile ? "text-[10px]" : "text-xs"}`}>
                        {t("activeSubscribers")}: {subscriberCounts[product.id] ?? 0}
                      </span>
                    )}
                    {product.has_schedule && (
                      <span className={`bg-primary/10 text-primary px-2 py-0.5 rounded-full ${isMobile ? "text-[10px]" : "text-xs"}`}>
                        {language === "ru" ? "Расписание" : "Кесте"}
                      </span>
                    )}

                  </div>
                </div>
              </div>
              
              {/* Actions */}
              <div className={`flex items-center justify-end ${isMobile ? "flex-wrap gap-1.5" : "gap-2 flex-wrap"}`}>
                <ShareProductButton
                  title={product.title}
                  id={product.id}
                  slug={product.slug}
                  sellerHandle={sellerHandle}
                  className={isMobile ? "h-8 px-2 text-xs" : "h-9"}
                  warning={
                    language === "ru"
                      ? "Перед отправкой добавьте необходимые материалы и/или расписание. Иначе после оплаты покупатель может получить доступ к продукту, в котором пока нет содержимого."
                      : "Жібермес бұрын қажетті материалдарды және/немесе кестені қосыңыз. Әйтпесе төлемнен кейін сатып алушы әлі мазмұны жоқ өнімге қол жеткізуі мүмкін."
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibilityProductId(product.id)}
                  className={isMobile ? "h-8 px-2 text-xs" : "h-9"}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span className="ml-1">{language === "ru" ? "Выставить" : "Жариялау"}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(product)}
                  className={isMobile ? "h-8 px-2 text-xs" : "h-9"}
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span className="ml-1">{t("edit")}</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if ((product as any).is_paused) {
                      updateProduct.mutate(
                        { id: product.id, is_paused: false } as any,
                        {
                          onSuccess: () => toast.success(language === "ru" ? "Продукт возобновлён" : "Өнім қайта іске қосылды"),
                          onError: () => toast.error(language === "ru" ? "Ошибка" : "Қате"),
                        }
                      );
                    } else {
                      setPauseMessage(
                        (product as any).paused_message ||
                          (language === "ru"
                            ? "Автор отключил ссылку. Мы набрали достаточное количество учеников — ждите новый поток."
                            : "Автор сілтемені өшірді. Жаңа ағымды күтіңіз.")
                      );
                      setPausingProduct(product as Product);
                    }
                  }}
                  className={isMobile ? "h-8 px-2 text-xs" : "h-9"}
                >
                  {(product as any).is_paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}
                  <span className="ml-1">
                    {(product as any).is_paused
                      ? (language === "ru" ? "Возобновить" : "Қайта қосу")
                      : (language === "ru" ? "Приостановить" : "Тоқтату")}
                  </span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeletingProduct(product)}
                  className={`text-destructive hover:text-destructive hover:bg-destructive/10 hover:border-destructive/30 ${isMobile ? "h-8 px-2 text-xs" : "h-9"}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
          );
        })}
      </div>

      {products.length === 0 && (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{t("noProducts")}</p>
        </div>
      )}

    {/* Materials Manager */}
    {materialsProduct && (
      <ProductMaterialsManager
        productId={materialsProduct.id}
        productTitle={materialsProduct.title}
        isOpen={!!materialsProduct}
        onClose={() => setMaterialsProduct(null)}
      />
    )}

    {/* Visibility Dialog */}
    <ProductVisibilityDialog
      product={visibilityProduct}
      onOpenChange={(open) => { if (!open) setVisibilityProductId(null); }}
    />

    {/* Pause Dialog */}
    <Dialog open={!!pausingProduct} onOpenChange={(open) => { if (!open) setPausingProduct(null); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {language === "ru" ? "Приостановить продукт" : "Өнімді тоқтату"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            {language === "ru"
              ? "По ссылке на продукт можно будет перейти, но вместо кнопки покупки посетители увидят сообщение ниже."
              : "Сілтеме ашылады, бірақ сатып алу батырмасының орнына төмендегі хабарлама көрсетіледі."}
          </p>
          <div className="space-y-2">
            <Label htmlFor="pause-message">
              {language === "ru" ? "Сообщение для посетителей" : "Хабарлама"}
            </Label>
            <Textarea
              id="pause-message"
              rows={4}
              value={pauseMessage}
              onChange={(e) => setPauseMessage(e.target.value)}
              placeholder={language === "ru" ? "Автор отключил ссылку." : "Автор сілтемені өшірді."}
            />
            <p className="text-xs text-muted-foreground">
              {language === "ru"
                ? "Никто не сможет купить и получить доступ к продукту, пока вы не возобновите его."
                : "Сіз оны қайта іске қосқанға дейін ешкім сатып ала алмайды және өнімге қол жеткізе алмайды."}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setPausingProduct(null)}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => {
              if (!pausingProduct) return;
              updateProduct.mutate(
                {
                  id: pausingProduct.id,
                  is_paused: true,
                  paused_message: pauseMessage.trim() || null,
                } as any,
                {
                  onSuccess: () => {
                    toast.success(language === "ru" ? "Продукт приостановлен" : "Өнім тоқтатылды");
                    setPausingProduct(null);
                  },
                  onError: () => toast.error(language === "ru" ? "Ошибка" : "Қате"),
                }
              );
            }}
            disabled={updateProduct.isPending}
          >
            {updateProduct.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              language === "ru" ? "Приостановить" : "Тоқтату"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

  </div>
  );
};

export default CreatorProductsTab;
