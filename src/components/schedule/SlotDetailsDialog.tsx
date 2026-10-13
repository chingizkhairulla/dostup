import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import CoverCropEditor from "@/components/creator/CoverCropEditor";
import { useCoverCrop } from "@/hooks/useCoverCrop";
import { uploadProductMedia } from "@/lib/productMediaUpload";
import { Plus, Pencil, Trash2, MapPin, Loader2, Check } from "lucide-react";

export interface SlotDetailsData {
  id: string;
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  date: string;
}

interface SlotDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slot: SlotDetailsData | null;
  productId?: string | null;
  onSave: (updates: {
    title?: string | null;
    description?: string | null;
    image_url?: string | null;
    location?: string | null;
  }) => Promise<void>;
  language?: "ru" | "kk";
}

export const SlotDetailsDialog = ({
  open,
  onOpenChange,
  slot,
  productId,
  onSave,
  language = "ru",
}: SlotDetailsDialogProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [location, setLocation] = useState("");
  const [cropSaving, setCropSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  const lastSavedRef = useRef({ title: "", description: "", imageUrl: "", location: "" });
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveFnRef = useRef(onSave);
  saveFnRef.current = onSave;

  const coverCrop = useCoverCrop();

  useEffect(() => {
    if (open && slot) {
      const initialTitle = slot.title || "";
      const initialDesc = slot.description || "";
      const initialImg = slot.image_url || "";
      const initialLoc = slot.location || "";
      setTitle(initialTitle);
      setDescription(initialDesc);
      setImageUrl(initialImg);
      setLocation(initialLoc);
      lastSavedRef.current = {
        title: initialTitle,
        description: initialDesc,
        imageUrl: initialImg,
        location: initialLoc,
      };
      setSaveStatus("idle");
      coverCrop.resetCrop();
    }
  }, [open, slot?.id]);

  const doSave = async (vals: {
    title: string;
    description: string;
    imageUrl: string;
    location: string;
  }) => {
    if (
      vals.title === lastSavedRef.current.title &&
      vals.description === lastSavedRef.current.description &&
      vals.imageUrl === lastSavedRef.current.imageUrl &&
      vals.location === lastSavedRef.current.location
    ) {
      return;
    }

    setSaveStatus("saving");
    try {
      await saveFnRef.current({
        title: vals.title.trim() ? vals.title.trim() : null,
        description: vals.description.trim() ? vals.description.trim() : null,
        image_url: vals.imageUrl.trim() ? vals.imageUrl.trim() : null,
        location: vals.location.trim() ? vals.location.trim() : null,
      });
      lastSavedRef.current = { ...vals };
      setSaveStatus("saved");
      setTimeout(() => {
        setSaveStatus((prev) => (prev === "saved" ? "idle" : prev));
      }, 2000);
    } catch {
      setSaveStatus("idle");
    }
  };

  const triggerDebouncedSave = (newVals: {
    title: string;
    description: string;
    imageUrl: string;
    location: string;
  }) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void doSave(newVals);
    }, 600);
  };

  const handleSaveCrop = async () => {
    if (!coverCrop.source || cropSaving) return;
    setCropSaving(true);
    try {
      const result = await coverCrop.getCroppedImage();
      if (!result) return;

      let uploadedUrl: string | null = null;
      if (productId) {
        try {
          uploadedUrl = await uploadProductMedia(result.file, productId, "image");
        } catch (uploadErr) {
          console.warn("Product media upload failed, falling back to data URL:", uploadErr);
        }
      }

      if (uploadedUrl) {
        setImageUrl(uploadedUrl);
        coverCrop.resetCrop();
        void doSave({ title, description, imageUrl: uploadedUrl, location });
      } else {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            const newUrl = reader.result;
            setImageUrl(newUrl);
            coverCrop.resetCrop();
            void doSave({ title, description, imageUrl: newUrl, location });
          }
        };
        reader.readAsDataURL(result.file);
      }
    } catch (err) {
      console.error("Failed to crop/save image:", err);
    } finally {
      setCropSaving(false);
    }
  };

  const handleDeleteImage = () => {
    setImageUrl("");
    void doSave({ title, description, imageUrl: "", location });
  };

  const handleCloseMain = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      void doSave({ title, description, imageUrl, location });
    }
    onOpenChange(nextOpen);
  };

  const t = {
    ru: {
      details: "Детали урока",
      cover: "Обложка",
      coverSettings: "Настройка обложки",
      titleLabel: "Название",
      titlePlaceholder: "Например: Английский для начинающих",
      description: "Описание",
      descriptionPlaceholder: "Кратко опишите тему занятия, план урока или требования к участникам...",
      location: "Местоположение",
      locationPlaceholder: "Напишите адрес, если мероприятие пройдет оффлайн",
      replace: "Заменить",
      changeCover: "Поменять обложку",
      delete: "Удалить",
      saving: "Сохранение...",
      saved: "Сохранено",
    },
    kk: {
      details: "Сабақ мәліметтері",
      cover: "Мұқаба",
      coverSettings: "Мұқабаны баптау",
      titleLabel: "Атауы",
      titlePlaceholder: "Мысалы: Бастаушыларға ағылшын тілі",
      description: "Сипаттамасы",
      descriptionPlaceholder: "Сабақтың тақырыбы мен жоспарын жазыңыз...",
      location: "Орналасу жері",
      locationPlaceholder: "Іс-шара оффлайн өтсе, мекенжайын жазыңыз",
      replace: "Ауыстыру",
      changeCover: "Мұқабаны ауыстыру",
      delete: "Жою",
      saving: "Сақталуда...",
      saved: "Сақталды",
    },
  }[language];

  return (
    <>
      {/* Main Lesson Details Dialog - hidden while cropping to prevent overlapping */}
      <Dialog open={open && !coverCrop.source} onOpenChange={handleCloseMain}>
        <DialogContent
          hideCloseButton
          className="max-w-lg sm:max-w-xl w-full p-5 sm:p-6 rounded-2xl bg-card border border-border space-y-4 z-[70] max-h-[90vh] overflow-y-auto"
        >
          {/* Header: Title (left) | Auto-save status indicator (right) - No cross */}
          <div className="flex items-center justify-between pb-2 border-b border-border/50 min-h-[40px]">
            <DialogTitle className="text-base sm:text-lg font-semibold text-foreground">
              {t.details}
            </DialogTitle>

            {/* Auto-save status feedback */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {saveStatus === "saving" && (
                <span className="flex items-center gap-1 text-primary animate-pulse text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t.saving}
                </span>
              )}
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium animate-in fade-in">
                  <Check className="w-3.5 h-3.5" />
                  {t.saved}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-3.5">
            {/* 1. Cover Area */}
            <div className="space-y-1.5">
              <Label className="text-sm sm:text-base font-semibold text-foreground">
                {t.cover}
              </Label>

              {imageUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-border h-40 sm:h-44 w-full bg-muted/30 group">
                  <img
                    src={imageUrl}
                    alt="Cover"
                    className="w-full h-full object-cover"
                  />
                  {/* Hover overlay with Pencil and text in the center like on profile photo */}
                  <label
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 text-white cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 bg-black/40 hover:bg-black/60 px-3.5 py-2 rounded-xl backdrop-blur-xs transition-colors shadow-sm">
                      <Pencil className="w-4 h-4 text-white shrink-0" />
                      <span className="text-xs sm:text-sm font-medium">
                        {t.changeCover}
                      </span>
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          coverCrop.loadFile(file);
                        }
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {/* Trash button in bottom-right corner */}
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute bottom-2 right-2 h-8 w-8 rounded-lg shadow-md z-10"
                    onClick={handleDeleteImage}
                    title={t.delete}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center h-40 sm:h-44 border-2 border-dashed border-border hover:border-primary/50 rounded-2xl cursor-pointer hover:bg-muted/30 transition-all">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center shadow-xs">
                    <Plus className="w-7 h-7 sm:w-8 sm:h-8" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        coverCrop.loadFile(file);
                      }
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>

            {/* 2. Title field */}
            <div className="space-y-1.5">
              <Label className="text-sm sm:text-base font-semibold text-foreground">
                {t.titleLabel}
              </Label>
              <Input
                value={title}
                placeholder={t.titlePlaceholder}
                onChange={(e) => {
                  const newTitle = e.target.value;
                  setTitle(newTitle);
                  triggerDebouncedSave({ title: newTitle, description, imageUrl, location });
                }}
                onBlur={() => {
                  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                  void doSave({ title, description, imageUrl, location });
                }}
                className="h-9 sm:h-10 text-sm rounded-xl"
              />
            </div>

            {/* 3. Description field */}
            <div className="space-y-1.5">
              <Label className="text-sm sm:text-base font-semibold text-foreground">
                {t.description}
              </Label>
              <Textarea
                rows={3}
                value={description}
                placeholder={t.descriptionPlaceholder}
                onChange={(e) => {
                  const newDesc = e.target.value;
                  setDescription(newDesc);
                  triggerDebouncedSave({ title, description: newDesc, imageUrl, location });
                }}
                onBlur={() => {
                  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                  void doSave({ title, description, imageUrl, location });
                }}
                className="min-h-[80px] text-sm rounded-xl resize-y"
              />
            </div>

            {/* 4. Location field */}
            <div className="space-y-1.5">
              <Label className="text-sm sm:text-base font-semibold text-foreground">
                {t.location}
              </Label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={location}
                  placeholder={t.locationPlaceholder}
                  onChange={(e) => {
                    const newLoc = e.target.value;
                    setLocation(newLoc);
                    triggerDebouncedSave({ title, description, imageUrl, location: newLoc });
                  }}
                  onBlur={() => {
                    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                    void doSave({ title, description, imageUrl, location });
                  }}
                  className="h-9 sm:h-10 text-sm rounded-xl pl-9"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Separate Window for Cover Cropping & Settings (Portal with frosted blur backdrop like avatar crop) */}
      {Boolean(coverCrop.source) &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 motion-safe:animate-fade-in">
            <div
              className="login-modal-backdrop absolute inset-0"
              onClick={() => !cropSaving && coverCrop.resetCrop()}
              aria-hidden="true"
            />
            <Card className="relative z-10 w-full max-w-lg sm:max-w-xl rounded-2xl border border-border bg-card shadow-2xl overflow-hidden p-5 sm:p-6 space-y-4">
              <div className="pb-1 border-b border-border/50">
                <h3 className="text-base sm:text-lg font-semibold text-foreground">
                  {t.coverSettings}
                </h3>
              </div>

              {/* Border around showing settings are inside cover */}
              <div className="p-3 sm:p-4 rounded-2xl border-2 border-primary/30 bg-muted/10 space-y-3">
                {coverCrop.source && (
                  <CoverCropEditor
                    source={coverCrop.source}
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
                    }}
                    onSave={() => void handleSaveCrop()}
                  />
                )}
              </div>
            </Card>
          </div>,
          document.body
        )}
    </>
  );
};

export default SlotDetailsDialog;
