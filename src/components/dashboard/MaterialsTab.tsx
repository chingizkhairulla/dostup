import { useState, useCallback } from "react";
import { requestMaterialToken, buildProxyUrl } from "@/lib/materialToken";
import { isS3Path, isOfficeDocument, buildS3RedirectUrl, buildStorageRedirectUrl, parseStoragePath } from "@/lib/fileRedirect";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { useSimpleMaterials, useSimplePurchases } from "@/hooks/useSimplePurchases";
import { useLanguage } from "@/contexts/LanguageContext";
import { FileText, Video, Type, Download, ExternalLink, Link as LinkIcon, Loader2, Play, X, Folder, User, Lock, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import MaterialsSearchBar from "@/components/materials/MaterialsSearchBar";
import MaterialsProtectionNotice from "@/components/materials/MaterialsProtectionNotice";
import MaterialsSectionsNav, { type MaterialsSection } from "@/components/materials/MaterialsSectionsNav";
import BookmarkStars from "@/components/materials/BookmarkStars";
import { useMemo } from "react";
import {
  indexBookmarks,
  useMaterialBookmarks,
  useToggleBookmark,
  type BookmarkViewer,
} from "@/hooks/useMaterialBookmarks";
import { rememberLastOpenedMaterial, touchRecentProduct } from "@/lib/buyerActivity";

const getIcon = (type: string) => {
  switch (type) {
    case "video":
      return <Video className="w-5 h-5" />;
    case "file":
      return <FileText className="w-5 h-5" />;
    case "text":
      return <Type className="w-5 h-5" />;
    case "link":
      return <LinkIcon className="w-5 h-5" />;
    case "folder":
      return <Folder className="w-5 h-5" />;
    default:
      return <FileText className="w-5 h-5" />;
  }
};

// Проверяем, является ли ссылка YouTube
const getYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Проверяем, является ли ссылка Vimeo
const getVimeoVideoId = (url: string): string | null => {
  const match = url.match(/vimeo\.com\/(\d+)/);
  return match ? match[1] : null;
};

// Проверяем, является ли файл видео
const isDirectVideoUrl = (url: string): boolean => {
  return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
};


const canPlayInline = (url: string) => {
  return getYouTubeVideoId(url) || getVimeoVideoId(url) || isDirectVideoUrl(url);
};

interface VideoPlayerProps {
  url: string;
  onClose: () => void;
}

const VideoPlayer = ({ url, onClose }: VideoPlayerProps) => {
  const youtubeId = getYouTubeVideoId(url);
  const vimeoId = getVimeoVideoId(url);
  const isDirectVideo = isDirectVideoUrl(url);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="absolute top-4 right-4 text-white hover:bg-white/20"
      >
        <X className="w-6 h-6" />
      </Button>
      
      <div className="w-full max-w-4xl aspect-video">
        {youtubeId && (
          <iframe
            src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
            className="w-full h-full rounded-lg"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        )}
        {vimeoId && (
          <iframe
            src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1`}
            className="w-full h-full rounded-lg"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        )}
        {isDirectVideo && (
          <video
            src={url}
            controls
            autoPlay
            className="w-full h-full rounded-lg"
          />
        )}
        {!youtubeId && !vimeoId && !isDirectVideo && (
          <div className="w-full h-full flex items-center justify-center text-white">
            <p>Видео недоступно для встроенного просмотра</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface InlineVideoPlayerProps {
  url: string;
}

const InlineVideoPlayer = ({ url }: InlineVideoPlayerProps) => {
  const youtubeId = getYouTubeVideoId(url);
  const vimeoId = getVimeoVideoId(url);
  const isDirectVideo = isDirectVideoUrl(url);

  if (youtubeId) {
    return (
      <div className="mt-3 aspect-video rounded-lg overflow-hidden">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (vimeoId) {
    return (
      <div className="mt-3 aspect-video rounded-lg overflow-hidden">
        <iframe
          src={`https://player.vimeo.com/video/${vimeoId}`}
          className="w-full h-full"
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  if (isDirectVideo) {
    return (
      <div className="mt-3 aspect-video rounded-lg overflow-hidden">
        <video
          src={url}
          controls
          className="w-full h-full bg-black"
        />
      </div>
    );
  }

  return null;
};

const MaterialsTab = () => {
  const { data: materials, isLoading } = useSimpleMaterials();
  const { data: purchases } = useSimplePurchases({ status: "completed" });
  const { t, language } = useLanguage();
  const { user } = useSimpleAuth();
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());
  const [expandedTexts, setExpandedTexts] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fullscreenVideo, setFullscreenVideo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [section, setSection] = useState<MaterialsSection>("library");

  const viewer: BookmarkViewer | null = user?.id
    ? { userType: "student", userRef: user.id }
    : null;
  const { data: bookmarkRows = [] } = useMaterialBookmarks(viewer);
  const bookmarkIndex = useMemo(() => indexBookmarks(bookmarkRows, viewer), [bookmarkRows, viewer]);
  const toggleBookmark = useToggleBookmark(viewer);

  const trackMaterialOpen = useCallback(
    (material: { id: string; title: string; product_id: string; product?: { title?: string | null } | null }) => {
      if (!user?.id) return;
      const inProduct = (materials ?? [])
        .filter((m) => m.product_id === material.product_id && m.type !== "folder")
        .sort((a, b) => a.order_index - b.order_index);
      const index = inProduct.findIndex((m) => m.id === material.id);
      const progressPercent =
        inProduct.length && index >= 0
          ? Math.round(((index + 1) / inProduct.length) * 100)
          : 0;
      rememberLastOpenedMaterial(user.id, {
        materialId: material.id,
        materialTitle: material.title,
        productId: material.product_id,
        productTitle: material.product?.title || "",
        openedAt: new Date().toISOString(),
        progressPercent,
      });
      touchRecentProduct(user.id, material.product_id);
    },
    [user?.id, materials],
  );

  const myBookmarkedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of bookmarkRows) {
      if (viewer && r.user_type === viewer.userType && r.user_ref === viewer.userRef) {
        ids.add(r.material_id);
      }
    }
    return ids;
  }, [bookmarkRows, viewer]);

  const toggleVideoExpand = (materialId: string) => {
    const material = materials?.find((m) => m.id === materialId);
    if (material) trackMaterialOpen(material);
    setExpandedVideos(prev => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  };

  /**
   * Get a synchronous URL for file download/view.
   * Returns a URL string for direct <a href> usage, or null if async flow needed (Office docs).
   */
  const getFileUrl = useCallback((material: { file_url: string; title: string }, action: 'view' | 'download'): string | null => {
    if (!material.file_url) return null;

    if (isS3Path(material.file_url)) {
      // Office docs in view mode need async token flow
      if (action === 'view' && isOfficeDocument(material.title)) {
        return null;
      }
      return buildS3RedirectUrl(
        material.file_url,
        'student',
        user?.id,
        action === 'download' ? material.title : undefined
      );
    } else {
      // Legacy Supabase Storage
      const path = parseStoragePath(material.file_url);
      if (!path) return null;
      return buildStorageRedirectUrl(
        path,
        action === 'download' ? material.title : undefined
      );
    }
  }, [user?.id]);

  /**
   * Async handler only for Office documents that need token flow
   */
  const handleOfficeView = useCallback(async (material: { file_url: string; title: string }) => {
    const loadingToast = toast.loading(language === "ru" ? "Подготовка файла..." : "Файл дайындалуда...");
    try {
      const token = await requestMaterialToken(material.file_url, 'student');
      const proxyUrl = buildProxyUrl(token);
      const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(proxyUrl)}`;
      window.open(viewerUrl, '_blank');
    } catch (err) {
      console.error('Error opening office doc:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(language === "ru" ? `Ошибка: ${errMsg}` : `Қате: ${errMsg}`);
    } finally {
      toast.dismiss(loadingToast);
    }
  }, [language, user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  // Helper: get children of a folder
  const getChildren = (parentId: string) => materials?.filter(m => m.parent_id === parentId) || [];

  // Separate creator materials and teacher materials (only root-level)
  const creatorMaterials = materials?.filter(m => !m.is_teacher_material && !m.parent_id) || [];
  const teacherMaterials = materials?.filter(m => m.is_teacher_material && !m.parent_id) || [];

  const groupCreatorMaterials = creatorMaterials.reduce((acc, material) => {
    const productTitle = material.product?.title || "Продукт";
    if (!acc[productTitle]) {
      acc[productTitle] = [];
    }
    acc[productTitle].push(material);
    return acc;
  }, {} as Record<string, typeof creatorMaterials>);

  const groupTeacherMaterials = teacherMaterials.reduce((acc, material) => {
    const key = `${material.product?.title || "Продукт"} - ${material.teacher_name || (language === "ru" ? "Учитель" : "Мұғалім")}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(material);
    return acc;
  }, {} as Record<string, typeof teacherMaterials>);

  // All purchased products with telegram_link
  const allTelegramProducts = (purchases || []).filter(p => p.product?.telegram_link);

  const hasNoMaterials = !materials || materials.length === 0;

  const renderMaterialCard = (material: typeof materials[0], index: number, isChild = false) => {
    const isVideo = material.type === "video" && material.file_url;
    const isExpanded = expandedVideos.has(material.id);
    const canPlay = isVideo && canPlayInline(material.file_url!);
    const isLocked = material.available_at && new Date(material.available_at) > new Date();
    const isFolder = material.type === "folder";
    const isFolderExpanded = expandedFolders.has(material.id);
    const children = isFolder ? getChildren(material.id) : [];

    // Format available_at date for display
    const formatAvailableDate = (dateStr: string) => {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}.${month} в ${hours}:${minutes}`;
    };

    const downloadUrl = material.type === "file" && material.file_url && !isLocked
      ? getFileUrl({ file_url: material.file_url, title: material.title }, 'download')
      : null;
    const viewUrl = material.type === "file" && material.file_url && !isLocked
      ? getFileUrl({ file_url: material.file_url, title: material.title }, 'view')
      : null;
    const needsOfficeAsync = material.type === "file" && material.file_url && !isLocked
      && isOfficeDocument(material.title) && isS3Path(material.file_url);

    // Folder rendering (including empty folders)
    if (isFolder) {
      return (
        <div key={material.id} className="animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
          <Card
            className={`cursor-pointer transition-colors hover:bg-accent/50 ${isChild ? 'ml-6' : ''}`}
            onClick={() => toggleFolder(material.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Folder className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground truncate" title={material.title}>{material.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {children.length} {language === "ru" 
                      ? (children.length === 1 ? "файл" : children.length < 5 ? "файла" : "файлов")
                      : (children.length === 1 ? "файл" : "файл")}
                  </p>
                </div>
                {isFolderExpanded ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
              </div>
            </CardContent>
          </Card>
          {isFolderExpanded && (
            <div className="ml-4 mt-2 space-y-2 border-l-2 border-border pl-2">
              {children.map((child, i) => renderMaterialCard(child, i, true))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Card 
        key={material.id} 
        className={`animate-fade-in ${isChild ? 'ml-2' : ''}`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              {getIcon(material.type)}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <h3 className="font-medium text-foreground truncate" title={material.title}>{material.title}</h3>
              <p className="text-sm text-muted-foreground capitalize mt-0.5">
                {material.type === "video" ? "Видео" : material.type}
              </p>

              {isVideo && isExpanded && canPlay && (
                <InlineVideoPlayer url={material.file_url!} />
              )}
            </div>
            
            {material.type === "file" && material.file_url && !isLocked && (
             <div className="flex gap-1 flex-shrink-0">
               {material.allow_download !== false && downloadUrl && (
                 <a
                   href={downloadUrl}
                   className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-10 w-10"
                   title={language === "ru" ? "Скачать" : "Жүктеу"}
                 >
                   <Download className="w-5 h-5" />
                 </a>
               )}
               {viewUrl ? (
                 <a
                   href={viewUrl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-accent hover:text-accent-foreground h-10 w-10"
                   title={language === "ru" ? "Открыть в браузере" : "Браузерде ашу"}
                 >
                   <ExternalLink className="w-5 h-5" />
                 </a>
               ) : needsOfficeAsync ? (
                 <Button 
                   variant="ghost" 
                   size="icon"
                   onClick={() => handleOfficeView({ file_url: material.file_url!, title: material.title })}
                   title={language === "ru" ? "Открыть в браузере" : "Браузерде ашу"}
                 >
                   <ExternalLink className="w-5 h-5" />
                 </Button>
               ) : null}
              </div>
            )}

            {!isFolder && viewer && (
              <BookmarkStars
                viewerType="student"
                state={bookmarkIndex.get(material.id)}
                onToggleMine={() => {
                  const existing = bookmarkIndex.get(material.id)?.mine?.id ?? null;
                  toggleBookmark.mutate({ materialId: material.id, existingId: existing });
                }}
                size="md"
              />
            )}
            
            {isVideo && canPlay && !isLocked && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="flex-shrink-0"
                onClick={() => toggleVideoExpand(material.id)}
              >
                <Play className={`w-5 h-5 ${isExpanded ? "text-primary" : ""}`} />
              </Button>
            )}

            {isVideo && !canPlay && !isLocked && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="flex-shrink-0"
                onClick={() => window.open(material.file_url!, "_blank")}
              >
                <ExternalLink className="w-5 h-5" />
              </Button>
            )}
            
            {material.type === "link" && material.file_url && !isLocked && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="flex-shrink-0"
                onClick={() => window.open(material.file_url!, "_blank")}
              >
                <ExternalLink className="w-5 h-5" />
              </Button>
            )}

            {material.type === "text" && material.content && !isLocked && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="flex-shrink-0"
                onClick={() => {
                  setExpandedTexts(prev => {
                    const next = new Set(prev);
                    if (next.has(material.id)) next.delete(material.id);
                    else next.add(material.id);
                    return next;
                  });
                }}
              >
                {expandedTexts.has(material.id) ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
              </Button>
            )}

            {isLocked && (
              <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
                <Lock className="w-4 h-4" />
                <span className="text-xs whitespace-nowrap">
                  {formatAvailableDate(material.available_at!)}
                </span>
              </div>
            )}
          </div>

          {material.type === "text" && material.content && expandedTexts.has(material.id) && (
            <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">
              {material.content}
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold text-foreground">{t("myMaterials")}</h2>
        <MaterialsSectionsNav
          value={section}
          onChange={setSection}
          showAdd={false}
        />
      </div>
      <MaterialsProtectionNotice />

      {hasNoMaterials ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">{t("noMaterials")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("purchaseToAccess")}
          </p>
        </div>
      ) : (() => {
        const q = searchQuery.trim().toLowerCase();
        const isBookmarks = section === "bookmarks";
        const bookmarkedList = (materials || []).filter((m) => myBookmarkedIds.has(m.id));
        const searchResults = q
          ? (materials || []).filter((m) => m.title?.toLowerCase().includes(q))
          : [];
        const bookmarkedFiltered = q
          ? bookmarkedList.filter((m) => m.title?.toLowerCase().includes(q))
          : bookmarkedList;
        return (
        <>
          <MaterialsSearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            resultCount={
              isBookmarks
                ? bookmarkedFiltered.length
                : q
                  ? searchResults.length
                  : undefined
            }
          />

          {isBookmarks ? (
            bookmarkedFiltered.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {language === "ru" ? "Нет помеченных материалов" : "Белгіленген материалдар жоқ"}
              </div>
            ) : (
              <div className="space-y-2">
                {bookmarkedFiltered.map((m, i) => renderMaterialCard(m, i))}
              </div>
            )
          ) : q ? (
            searchResults.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {language === "ru" ? "Ничего не найдено" : "Ештеңе табылмады"}
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map((m, i) => renderMaterialCard(m, i))}
              </div>
            )
          ) : (
          <>
          {/* Creator Materials */}
          {Object.keys(groupCreatorMaterials).length > 0 && (
            <div className="space-y-4">
              {Object.entries(groupCreatorMaterials).map(([productTitle, productMaterials]) => (
                <div key={productTitle} className="space-y-3">
                  <h3 className="font-medium text-muted-foreground">{productTitle}</h3>
                  {productMaterials?.map((material, index) => renderMaterialCard(material, index))}
                </div>
              ))}
            </div>
          )}

          {/* Teacher Materials */}
          {Object.keys(groupTeacherMaterials).length > 0 && (
            <div className="space-y-6 mt-8">
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="w-4 h-4" />
                <h3 className="font-medium">
                  {language === "ru" ? "Материалы от учителей" : "Мұғалімдерден материалдар"}
                </h3>
              </div>
              {Object.entries(groupTeacherMaterials).map(([groupTitle, productMaterials]) => (
                <div key={groupTitle} className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                  <h4 className="text-sm font-medium text-foreground truncate" title={groupTitle}>{groupTitle}</h4>
                  <div className="space-y-2">
                    {productMaterials?.map((material, index) => renderMaterialCard(material, index))}
                  </div>
                </div>
              ))}
            </div>
          )}
          </>
          )}
        </>
        );
      })()}

      {/* Fullscreen Video Modal */}
      {fullscreenVideo && (
        <VideoPlayer url={fullscreenVideo} onClose={() => setFullscreenVideo(null)} />
      )}
    </div>
  );
};

export default MaterialsTab;
