import { useCallback, useEffect, useRef, useState } from "react";
import { useCreatorProducts } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2, Library, Plus, Folder, FileText, Link as LinkIcon, Type,
  ChevronRight, Pencil, Trash2, Download, Check, X,
  GripVertical, Home, ArrowUpDown, Star, RotateCcw, HardDrive, RefreshCw, Copy,
  ExternalLink
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "@/components/ui/context-menu";
import ProductMaterialsManager from "./ProductMaterialsManager";
import ProductSwitcher from "./ProductSwitcher";
import { useSelectedCreatorProduct } from "@/hooks/useSelectedCreatorProduct";
import NoProductsEmptyState from "./NoProductsEmptyState";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  useProductMaterials,
  useUpdateMaterial,
  useDeleteMaterial,
  useDeletedMaterials,
  useRestoreMaterial,
  usePermanentlyDeleteMaterial,
  useEmptyTrash,
  useAllCreatorMaterials,
} from "@/hooks/useMaterials";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import MaterialsSearchBar from "@/components/materials/MaterialsSearchBar";
import MaterialsSectionsNav, { type MaterialsSection } from "@/components/materials/MaterialsSectionsNav";
import BookmarkStars from "@/components/materials/BookmarkStars";
import { Switch } from "@/components/ui/switch";
import {
  indexBookmarks,
  useBulkSetBookmarksPublic,
  useMaterialBookmarks,
  useToggleBookmark,
  useToggleBookmarkPublic,
  type BookmarkState,
  type BookmarkViewer,
} from "@/hooks/useMaterialBookmarks";
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isS3Path, isOfficeDocument, buildS3RedirectUrl, buildStorageRedirectUrl, parseStoragePath } from "@/lib/fileRedirect";
import { requestMaterialToken, buildProxyUrl } from "@/lib/materialToken";
import { calculateMaterialFolderSizes, formatMaterialBytes } from "@/lib/materialStorage";

interface Props { creatorName: string; onGoToProducts?: () => void; }

const CreatorMaterialsTab = ({ creatorName, onGoToProducts }: Props) => {
  const { data: products = [], isLoading } = useCreatorProducts();
  const { language } = useLanguage();
  const [selectedId, setSelectedId] = useSelectedCreatorProduct(products);
  const [mode, setMode] = useState<"add" | "edit" | null>(null);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [section, setSection] = useState<MaterialsSection>("library");
  // Tracks which folder the user is currently browsing inside the read-only list,
  // so the top "Add" button can default the target to that folder.
  const [currentBrowseFolderId, setCurrentBrowseFolderId] = useState<string | null>(null);

  // Reset section when switching products so user always lands in library.
  useEffect(() => {
    setSection("library");
  }, [selectedId]);


  const product = products.find((p) => p.id === selectedId);
  const viewer: BookmarkViewer = { userType: "creator", userRef: creatorName };
  const { data: trashItems = [] } = useDeletedMaterials(product?.id);

  // Trash badge behaves like notifications: disappears after viewing trash.
  const trashSeenKey = product?.id ? `trash-seen-${product.id}` : null;
  const [lastSeenTrash, setLastSeenTrash] = useState<string | null>(() => {
    if (typeof window === "undefined" || !trashSeenKey) return null;
    return window.localStorage.getItem(trashSeenKey);
  });

  useEffect(() => {
    if (section === "trash" && product?.id) {
      const now = new Date().toISOString();
      const key = `trash-seen-${product.id}`;
      window.localStorage.setItem(key, now);
      setLastSeenTrash(now);
    }
  }, [section, product?.id]);

  const trashBadgeCount = useMemo(() => {
    if (!lastSeenTrash) return trashItems.length;
    const seen = new Date(lastSeenTrash).getTime();
    return trashItems.filter((item) => {
      const deleted = item.deleted_at ? new Date(item.deleted_at).getTime() : 0;
      return deleted > seen;
    }).length;
  }, [trashItems, lastSeenTrash]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Library className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">{language === "kk" ? "Материалдар" : "Материалы"}</h2>
        </div>
        <NoProductsEmptyState section="materials" onGoToProducts={onGoToProducts} />
      </div>
    );
  }

  const addButton = (
    <Button size="sm" className="gap-2" onClick={() => { setAddParentId(currentBrowseFolderId); setMode("add"); }}>
      <Plus className="w-4 h-4" />
      {language === "kk" ? "Қосу" : "Добавить"}
    </Button>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">
        {language === "kk" ? "Материалдар" : "Материалы"}
      </h2>
      <div className="flex items-center justify-between gap-2">
        <ProductSwitcher
          products={products.map((p) => ({ id: p.id, title: p.title }))}
          selectedId={selectedId}
          onChange={(id) => setSelectedId(id)}
          className="min-w-0 flex-1 justify-start px-2 sm:flex-initial sm:px-3"
        />
        <MaterialsSectionsNav
          value={section}
          onChange={setSection}
          addButton={addButton}
          showTrash
          trashCount={trashBadgeCount}
          showStorage
        />
      </div>

      {product && section !== "storage" && (
        <CreatorMaterialsReadOnlyList
          productId={product.id}
          section={section}
          viewer={viewer}
          onAddInFolder={(folderId) => {
            setAddParentId(folderId);
            setMode("add");
          }}
          onCurrentFolderChange={setCurrentBrowseFolderId}
        />
      )}

      {section === "storage" && (
        <CreatorStorageList creatorName={creatorName} />
      )}

      {product && mode && (
        <ProductMaterialsManager
          productId={product.id}
          productTitle={product.title}
          isOpen={!!mode}
          mode={mode}
          initialFolderId={addParentId}
          onClose={() => { setMode(null); setAddParentId(null); }}
        />
      )}
    </div>
  );
};

type ListProps = {
  items: Mat[];
  childrenOf: (id: string) => Mat[];
  getIcon: (type: string) => JSX.Element;
  flat: boolean;
  onOpenFolder: (id: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  startRename: (m: Mat) => void;
  cancelRename: () => void;
  submitRename: () => void;
  isSavingRename: boolean;
  onDelete: (m: Mat) => void;
  onOpen: (m: Mat) => void;
  getFileUrl: (m: Mat, action: 'view' | 'download') => string | null;
  language: string;
  onAddInFolder: (folderId: string) => void;
  draggingId: string | null;
  dragOverId: string | null;
  dropPosition: "before" | "after" | "inside" | null;
  setDraggingId: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
  setDropPosition: (p: "before" | "after" | "inside" | null) => void;
  onReorder: (draggedId: string, targetId: string, position: "before" | "after" | "inside") => void;
  isNoop: (draggedId: string, targetId: string, position: "before" | "after" | "inside") => boolean;
  draggedParentId: string | null;
  reorderWithinParent: boolean;
  bookmarkFor: (id: string) => BookmarkState | undefined;
  onToggleBookmark: (m: Mat) => void;
  onTogglePublic: (m: Mat) => void;
  viewerType: "creator";
  allFolders: Mat[];
  onMoveToFolder: (materialId: string, target: string | null) => void;
  onDownloadFolder: (folderId: string) => void;
};

const MaterialList = (props: ListProps) => {
  const {
    items,
    draggingId,
    dragOverId,
    dropPosition,
    isNoop,
    setDragOverId,
    setDropPosition,
    setDraggingId,
    onReorder,
    reorderWithinParent,
  } = props;

  const isGapLit = (gapIndex: number): boolean => {
    if (!draggingId || !dragOverId || !dropPosition || dropPosition === "inside") return false;
    const overIdx = items.findIndex((it) => it.id === dragOverId);
    if (overIdx === -1) return false;
    const targetGap = dropPosition === "before" ? overIdx : overIdx + 1;
    if (targetGap !== gapIndex) return false;
    return !isNoop(draggingId, dragOverId, dropPosition);
  };

  // Привязываем гэп к карточке: гэп 0 = before items[0], остальные = after items[i-1].
  const resolveGapTarget = (gapIndex: number): { targetId: string; position: "before" | "after" } | null => {
    if (items.length === 0) return null;
    if (gapIndex === 0) return { targetId: items[0].id, position: "before" };
    const prev = items[gapIndex - 1];
    if (!prev) return null;
    return { targetId: prev.id, position: "after" };
  };

  const Gap = ({ index }: { index: number }) => {
    const lit = isGapLit(index);
    const handleOver = (e: React.DragEvent) => {
      if (!draggingId || !reorderWithinParent) return;
      const t = resolveGapTarget(index);
      if (!t || t.targetId === draggingId) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dragOverId !== t.targetId) setDragOverId(t.targetId);
      if (dropPosition !== t.position) setDropPosition(t.position);
    };
    const handleDrop = (e: React.DragEvent) => {
      if (!reorderWithinParent) return;
      e.preventDefault();
      e.stopPropagation();
      const id = draggingId;
      const t = resolveGapTarget(index);
      setDragOverId(null);
      setDropPosition(null);
      setDraggingId(null);
      if (id && t && t.targetId !== id && !isNoop(id, t.targetId, t.position)) {
        onReorder(id, t.targetId, t.position);
      }
    };
    return (
      <div
        className="relative h-4"
        onDragEnter={handleOver}
        onDragOver={handleOver}
        onDrop={handleDrop}
      >
        <div
          className={`absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 rounded transition-colors ${lit ? "bg-primary" : "bg-transparent"}`}
        />
      </div>
    );
  };

  // Большие крайние посадочные зоны: верх списка и пустая область под списком.
  const EdgeZone = ({ edge }: { edge: "top" | "bottom" }) => {
    if (items.length === 0) return null;
    const target = edge === "top" ? items[0] : items[items.length - 1];
    const position: "before" | "after" = edge === "top" ? "before" : "after";
    const active =
      !!draggingId &&
      dragOverId === target.id &&
      dropPosition === position &&
      !isNoop(draggingId, target.id, position);
    const handleOver = (e: React.DragEvent) => {
      if (!draggingId || draggingId === target.id || !reorderWithinParent) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dragOverId !== target.id) setDragOverId(target.id);
      if (dropPosition !== position) setDropPosition(position);
    };
    const handleDrop = (e: React.DragEvent) => {
      if (!reorderWithinParent) return;
      e.preventDefault();
      e.stopPropagation();
      const id = draggingId;
      setDragOverId(null);
      setDropPosition(null);
      setDraggingId(null);
      if (id && id !== target.id && !isNoop(id, target.id, position)) {
        onReorder(id, target.id, position);
      }
    };
    return (
      <div
        className={`relative ${edge === "bottom" ? "flex-1" : ""}`}
        style={{
          minHeight:
            edge === "top"
              ? 36
              : draggingId
                ? Math.max(320, Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.6))
                : 24,
        }}
        onDragEnter={handleOver}
        onDragOver={handleOver}
        onDrop={handleDrop}
      >
        <div className={`absolute left-0 right-0 ${edge === "top" ? "bottom-2" : "top-2"} h-px rounded transition-colors ${active ? "bg-primary" : "bg-transparent"}`} />
      </div>
    );
  };

  const getContainerEdgeTarget = (e: React.DragEvent): { targetId: string; position: "before" | "after" } | null => {
    if (items.length === 0) return null;
    const cards = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-material-card='true']"));
    const firstCard = cards[0];
    const lastCard = cards[cards.length - 1];
    if (!firstCard || !lastCard) return null;
    const firstRect = firstCard.getBoundingClientRect();
    const lastRect = lastCard.getBoundingClientRect();
    if (e.clientY <= firstRect.top + firstRect.height / 2) {
      return { targetId: items[0].id, position: "before" };
    }
    if (e.clientY >= lastRect.top + lastRect.height / 2) {
      return { targetId: items[items.length - 1].id, position: "after" };
    }
    return null;
  };

  // Fallback на уровне контейнера: если дроп прошёл мимо карточек/гэпов,
  // всё равно кладём материал в самый верх или самый низ по положению курсора.
  const handleContainerOver = (e: React.DragEvent) => {
    if (!draggingId || items.length === 0 || !reorderWithinParent) return;
    const target = getContainerEdgeTarget(e);
    if (!target || target.targetId === draggingId || isNoop(draggingId, target.targetId, target.position)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== target.targetId) setDragOverId(target.targetId);
    if (dropPosition !== target.position) setDropPosition(target.position);
  };
  const handleContainerDrop = (e: React.DragEvent) => {
    if (!draggingId || items.length === 0 || !reorderWithinParent) return;
    const target = getContainerEdgeTarget(e);
    if (!target || target.targetId === draggingId || isNoop(draggingId, target.targetId, target.position)) return;
    e.preventDefault();
    const id = draggingId;
    setDragOverId(null);
    setDropPosition(null);
    setDraggingId(null);
    onReorder(id, target.targetId, target.position);
  };

  return (
    <div
      className={`flex flex-col ${draggingId ? "min-h-[45vh]" : ""}`}
      onDragOver={handleContainerOver}
      onDrop={handleContainerDrop}
    >
      <EdgeZone edge="top" />
      {items.map((m, i) => (
        <div key={m.id} className="flex flex-col">
          <MaterialNode
            material={m}
            getIcon={props.getIcon}
            flat={props.flat}
            onOpenFolder={props.onOpenFolder}
            renamingId={props.renamingId}
            renameValue={props.renameValue}
            setRenameValue={props.setRenameValue}
            startRename={props.startRename}
            cancelRename={props.cancelRename}
            submitRename={props.submitRename}
            isSavingRename={props.isSavingRename}
            onDelete={props.onDelete}
            onOpen={props.onOpen}
            getFileUrl={props.getFileUrl}
            language={props.language}
            onAddInFolder={props.onAddInFolder}
            draggingId={props.draggingId}
            dragOverId={props.dragOverId}
            dropPosition={props.dropPosition}
            setDraggingId={props.setDraggingId}
            setDragOverId={props.setDragOverId}
            setDropPosition={props.setDropPosition}
            onReorder={props.onReorder}
            isNoop={props.isNoop}
            draggedParentId={props.draggedParentId}
            reorderWithinParent={reorderWithinParent}
            bookmarkState={props.bookmarkFor(m.id)}
            onToggleBookmark={() => props.onToggleBookmark(m)}
            onTogglePublic={() => props.onTogglePublic(m)}
            viewerType={props.viewerType}
            allFolders={props.allFolders}
            onMoveToFolder={props.onMoveToFolder}
            onDownloadFolder={props.onDownloadFolder}
          />
          {i < items.length - 1 && <Gap index={i + 1} />}
        </div>
      ))}
      <EdgeZone edge="bottom" />
    </div>
  );
};

export default CreatorMaterialsTab;

interface Mat {
  id: string;
  title: string;
  type: string;
  parent_id?: string | null;
  file_url?: string | null;
  cover_url?: string | null;
  content?: string | null;
  allow_download?: boolean;
  created_at?: string;
}

const CreatorMaterialsReadOnlyList = ({
  productId,
  onAddInFolder,
  section,
  viewer,
  onCurrentFolderChange,
}: {
  productId: string;
  onAddInFolder: (folderId: string) => void;
  section: MaterialsSection;
  viewer: BookmarkViewer;
  onCurrentFolderChange?: (id: string | null) => void;
}) => {
  const { language } = useLanguage();
  const { data: allMaterials = [], isLoading } = useProductMaterials(productId, { creatorOnly: true });
  const updateMaterial = useUpdateMaterial();
  const deleteMaterial = useDeleteMaterial();
  const { data: bookmarkRows = [] } = useMaterialBookmarks(viewer);
  const toggleBookmark = useToggleBookmark(viewer);
  const togglePublic = useToggleBookmarkPublic(viewer);
  const bulkSetPublic = useBulkSetBookmarksPublic(viewer);
  const [query, setQuery] = useState("");
  const [folderPath, setFolderPath] = useState<Mat[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingMat, setDeletingMat] = useState<Mat | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | "inside" | null>(null);
  // Подсветка крошки (breadcrumb), на которую тащат материал.
  // "home" → корень; иначе id папки из folderPath.
  const [dragOverCrumb, setDragOverCrumb] = useState<string | null>(null);

  type SortMode = "newest" | "oldest" | "manual";
  const SORT_STORAGE_KEY = "creator-materials-sort-mode";
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    if (typeof window === "undefined") return "manual";
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (saved === "newest" || saved === "oldest" || saved === "manual") return saved;
    return "manual";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortMode);
    }
  }, [sortMode]);

  const q = query.trim().toLowerCase();
  const list = allMaterials as Mat[];
  const bookmarkIndex = useMemo(() => indexBookmarks(bookmarkRows, viewer), [bookmarkRows, viewer]);
  const isBookmarksSection = section === "bookmarks";
  const isTrashSection = section === "trash";
  // List of material ids in current product that the viewer personally bookmarked.
  const myBookmarkedIds = useMemo(() => {
    const ids = new Set<string>();
    const productMatIds = new Set(list.map((m) => m.id));
    for (const row of bookmarkRows) {
      if (
        row.user_type === viewer.userType &&
        row.user_ref === viewer.userRef &&
        productMatIds.has(row.material_id)
      ) {
        ids.add(row.material_id);
      }
    }
    return ids;
  }, [bookmarkRows, viewer, list]);
  const myBookmarksInProduct = useMemo(
    () => bookmarkRows.filter(
      (r) =>
        r.user_type === viewer.userType &&
        r.user_ref === viewer.userRef &&
        myBookmarkedIds.has(r.material_id),
    ),
    [bookmarkRows, viewer, myBookmarkedIds],
  );
  const allMyArePublic = myBookmarksInProduct.length > 0 &&
    myBookmarksInProduct.every((r) => r.is_public);
  const draggedItem = draggingId ? list.find((m) => m.id === draggingId) ?? null : null;
  const draggedParentId = draggedItem?.parent_id ?? null;
  const currentFolderId = folderPath.length > 0 ? folderPath[folderPath.length - 1].id : null;

  useEffect(() => {
    onCurrentFolderChange?.(currentFolderId);
  }, [currentFolderId, onCurrentFolderChange]);

  // Если текущая папка была удалена/переименована-перемещена, чистим путь до валидной части.
  useEffect(() => {
    if (folderPath.length === 0) return;
    const validPath: Mat[] = [];
    let expectedParent: string | null = null;
    for (const f of folderPath) {
      const fresh = list.find((m) => m.id === f.id);
      if (!fresh || fresh.type !== "folder" || (fresh.parent_id ?? null) !== expectedParent) break;
      validPath.push(fresh);
      expectedParent = fresh.id;
    }
    if (validPath.length !== folderPath.length) setFolderPath(validPath);
  }, [list]);

  const filtered = useMemo(() => {
    let base: Mat[];
    if (isBookmarksSection) {
      base = list.filter((m) => myBookmarkedIds.has(m.id));
      if (q) base = base.filter((m) => m.title.toLowerCase().includes(q));
    } else if (q) {
      base = list.filter((m) => m.title.toLowerCase().includes(q));
    } else {
      base = list.filter((m) => (m.parent_id ?? null) === currentFolderId);
    }
    if (sortMode === "manual") return base;
    const sorted = base.slice().sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortMode === "newest" ? tb - ta : ta - tb;
    });
    return sorted;
  }, [list, q, currentFolderId, sortMode, isBookmarksSection, myBookmarkedIds]);

  const getIcon = (type: string) => {
    if (type === "folder") return <Folder className="w-4 h-4 text-primary" />;
    if (type === "link") return <LinkIcon className="w-4 h-4 text-primary" />;
    if (type === "text") return <Type className="w-4 h-4 text-primary" />;
    return <FileText className="w-4 h-4 text-primary" />;
  };

  const openFolder = (id: string) => {
    const folder = list.find((m) => m.id === id);
    if (!folder || folder.type !== "folder") return;
    setFolderPath((p) => [...p, folder]);
  };

  const goToPathIndex = (index: number) => {
    // index = -1 → дом (корень)
    if (index < 0) setFolderPath([]);
    else setFolderPath((p) => p.slice(0, index + 1));
  };

  const childrenOf = (id: string) => list.filter((m) => m.parent_id === id);

  const siblingsOf = (parentId: string | null) =>
    list
      .filter((m) => (m.parent_id ?? null) === parentId)
      .slice()
      .sort((a, b) => list.indexOf(a) - list.indexOf(b));

  // Returns true if dropping `draggedId` at `position` relative to `targetId`
  // would not change anything (already in that spot).
  const isNoop = (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ): boolean => {
    if (draggedId === targetId) return true;
    const dragged = list.find((m) => m.id === draggedId);
    const target = list.find((m) => m.id === targetId);
    if (!dragged || !target) return false;
    if (position === "inside") {
      return dragged.parent_id === target.id;
    }
    const targetParent = target.parent_id ?? null;
    if ((dragged.parent_id ?? null) !== targetParent) return false;
    const sibs = siblingsOf(targetParent);
    const di = sibs.findIndex((s) => s.id === draggedId);
    const ti = sibs.findIndex((s) => s.id === targetId);
    if (di === -1 || ti === -1) return false;
    if (position === "before") return di === ti - 1 || di === ti;
    return di === ti + 1 || di === ti;
  };

  const isDescendant = (parentId: string, maybeChildId: string): boolean => {
    let cur = list.find((m) => m.id === maybeChildId);
    while (cur?.parent_id) {
      if (cur.parent_id === parentId) return true;
      cur = list.find((m) => m.id === cur!.parent_id);
    }
    return false;
  };

  const reorder = async (
    draggedId: string,
    targetId: string,
    position: "before" | "after" | "inside",
  ) => {
    if (draggedId === targetId) return;
    const dragged = list.find((m) => m.id === draggedId);
    const target = list.find((m) => m.id === targetId);
    if (!dragged || !target) return;
    if (dragged.type === "folder" && isDescendant(draggedId, targetId)) return;

    let newParent: string | null;
    if (position === "inside") {
      if (target.type !== "folder") return;
      newParent = target.id;
    } else {
      newParent = target.parent_id ?? null;
    }

    const siblings = list
      .filter((m) => (m.parent_id ?? null) === newParent && m.id !== draggedId)
      .slice()
      .sort((a, b) => list.indexOf(a) - list.indexOf(b));

    let insertIdx: number;
    if (position === "inside") {
      insertIdx = siblings.length;
    } else {
      const ti = siblings.findIndex((s) => s.id === targetId);
      insertIdx = position === "before" ? ti : ti + 1;
      if (insertIdx < 0) insertIdx = siblings.length;
    }
    siblings.splice(insertIdx, 0, dragged);

    try {
      await Promise.all(
        siblings.map((s, i) =>
          updateMaterial.mutateAsync({
            id: s.id,
            productId,
            order_index: i,
            ...(s.id === draggedId ? { parent_id: newParent } : {}),
          }),
        ),
      );
    } catch {
      toast.error(language === "kk" ? "Қате" : "Ошибка");
    }
  };

  // Перенос материала в самый верх указанной папки (или корня, если targetFolderId = null).
  const moveToFolderTop = async (draggedId: string, targetFolderId: string | null) => {
    const dragged = list.find((m) => m.id === draggedId);
    if (!dragged) return;
    if (dragged.type === "folder" && targetFolderId && isDescendant(draggedId, targetFolderId)) return;
    const currentSibs = siblingsOf(targetFolderId);
    if ((dragged.parent_id ?? null) === targetFolderId && currentSibs[0]?.id === draggedId) return;

    const siblings = list
      .filter((m) => (m.parent_id ?? null) === targetFolderId && m.id !== draggedId)
      .slice()
      .sort((a, b) => list.indexOf(a) - list.indexOf(b));
    siblings.unshift(dragged);
    try {
      await Promise.all(
        siblings.map((s, i) =>
          updateMaterial.mutateAsync({
            id: s.id,
            productId,
            order_index: i,
            ...(s.id === draggedId ? { parent_id: targetFolderId } : {}),
          }),
        ),
      );
    } catch {
      toast.error(language === "kk" ? "Қате" : "Ошибка");
    }
  };

  // Обработчики drag-over/drop для крошек (Home + папки в пути).
  const makeCrumbDnD = (crumbId: string | "home", targetFolderId: string | null) => {
    const canDrop = (): boolean => {
      if (!draggingId) return false;
      const dragged = list.find((m) => m.id === draggingId);
      if (!dragged) return false;
      if (dragged.type === "folder" && targetFolderId && isDescendant(draggingId, targetFolderId)) return false;
      // Запрещаем перенос в ту же папку.
      if ((dragged.parent_id ?? null) === targetFolderId) return false;
      return true;
    };
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!canDrop()) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setDragOverId(null);
        setDropPosition(null);
        if (dragOverCrumb !== crumbId) setDragOverCrumb(crumbId);
      },
      onDragEnter: (e: React.DragEvent) => {
        if (!canDrop()) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOverId(null);
        setDropPosition(null);
        if (dragOverCrumb !== crumbId) setDragOverCrumb(crumbId);
      },
      onDragLeave: (e: React.DragEvent) => {
        e.stopPropagation();
        setDragOverCrumb((cur) => (cur === crumbId ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const id = draggingId;
        setDragOverCrumb(null);
        setDragOverId(null);
        setDropPosition(null);
        setDraggingId(null);
        if (id && canDrop()) {
          moveToFolderTop(id, targetFolderId);
        }
      },
    };
  };

  const getFileUrl = (m: Mat, action: 'view' | 'download'): string | null => {
    if (!m.file_url) return null;
    if (isS3Path(m.file_url)) {
      if (action === 'view' && isOfficeDocument(m.title)) return null;
      return buildS3RedirectUrl(m.file_url, 'creator', undefined, action === 'download' ? m.title : undefined);
    }
    const path = parseStoragePath(m.file_url);
    if (!path) return null;
    return buildStorageRedirectUrl(path, action === 'download' ? m.title : undefined);
  };

  const openMaterial = async (m: Mat) => {
    if (m.type === "link" && m.file_url) {
      window.open(m.file_url, "_blank");
      return;
    }
    if (m.type === "file" && m.file_url) {
      const vUrl = getFileUrl(m, 'view');
      if (vUrl) { window.open(vUrl, "_blank"); return; }
      if (isOfficeDocument(m.title) && isS3Path(m.file_url)) {
        const t = toast.loading(language === "kk" ? "Файл дайындалуда..." : "Подготовка файла...");
        try {
          const token = await requestMaterialToken(m.file_url, 'creator');
          const proxyUrl = buildProxyUrl(token);
          window.open(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(proxyUrl)}`, '_blank');
        } catch (e) {
          toast.error(String(e instanceof Error ? e.message : e));
        } finally {
          toast.dismiss(t);
        }
      }
    }
  };

  const downloadFolder = async (folderId: string) => {
    // Recursively gather every downloadable file under the folder.
    const collectFiles = (parentId: string, acc: Mat[]): Mat[] => {
      for (const m of list) {
        if ((m.parent_id ?? null) !== parentId) continue;
        if (m.type === "folder") collectFiles(m.id, acc);
        else if (m.type === "file" && m.file_url && m.allow_download !== false) acc.push(m);
      }
      return acc;
    };
    const files = collectFiles(folderId, []);
    if (files.length === 0) {
      toast.info(language === "kk" ? "Қалтада жүктелетін файлдар жоқ" : "В папке нет файлов для скачивания");
      return;
    }
    toast.success(
      language === "kk"
        ? `${files.length} файл жүктелуде...`
        : `Скачивание ${files.length} файлов...`
    );
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const url = getFileUrl(f, 'download');
      if (!url) continue;
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      a.download = f.title || "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Stagger so the browser doesn't drop concurrent downloads.
      await new Promise((r) => setTimeout(r, 350));
    }
  };

  const startRename = (m: Mat) => { setRenamingId(m.id); setRenameValue(m.title); };
  const cancelRename = () => { setRenamingId(null); setRenameValue(""); };
  const submitRename = async () => {
    if (!renamingId) return;
    const newTitle = renameValue.trim();
    if (!newTitle) return;
    try {
      await updateMaterial.mutateAsync({ id: renamingId, productId, title: newTitle });
      toast.success(language === "kk" ? "Сақталды" : "Сохранено");
      cancelRename();
    } catch {
      toast.error(language === "kk" ? "Қате" : "Ошибка");
    }
  };

  const confirmDelete = async () => {
    if (!deletingMat) return;
    try {
      await deleteMaterial.mutateAsync({ id: deletingMat.id, productId, file_url: deletingMat.file_url });
      toast.success(language === "kk" ? "Жойылды" : "Удалено");
      setDeletingMat(null);
    } catch {
      toast.error(language === "kk" ? "Қате" : "Ошибка");
    }
  };

  const handleToggleBookmark = (mat: Mat) => {
    const existing = bookmarkIndex.get(mat.id)?.mine?.id ?? null;
    toggleBookmark.mutate({ materialId: mat.id, existingId: existing });
  };

  const handleTogglePublic = (mat: Mat) => {
    const mine = bookmarkIndex.get(mat.id)?.mine;
    if (!mine) return;
    togglePublic.mutate({ id: mine.id, isPublic: !mine.is_public });
  };

  const handleBulkPublic = (next: boolean) => {
    bulkSetPublic.mutate({ ids: myBookmarksInProduct.map((r) => r.id), isPublic: next });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isTrashSection) {
    return <CreatorTrashList productId={productId} language={language} getIcon={getIcon} />;
  }

  return (
    <div className="space-y-3">
      {/* Гасим нативный drag-over у поисковой строки, чтобы при перетаскивании
          материала не появлялся плюсик-курсор копирования. */}
      <div
        className="flex items-center gap-2"
        onDragOver={(e) => {
          if (draggingId) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "none";
          }
        }}
        onDrop={(e) => {
          if (draggingId) e.preventDefault();
        }}
      >
        <div className="flex-1 min-w-0">
          <MaterialsSearchBar value={query} onChange={setQuery} resultCount={filtered.length} />
        </div>
        {!isBookmarksSection && (
        <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
          {/* On phones the trigger shrinks to icon + arrow; the list it opens is unchanged. */}
          <SelectTrigger
            className="h-9 w-auto flex-shrink-0 gap-1.5 px-2 sm:min-w-[160px] sm:gap-2 sm:px-3"
            aria-label={language === "kk" ? "Сұрыптау" : "Сортировка"}
          >
            <ArrowUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
            <div className="hidden min-w-0 truncate sm:block">
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">{language === "kk" ? "Алдымен жаңалары" : "Сначала новые"}</SelectItem>
            <SelectItem value="oldest">{language === "kk" ? "Алдымен ескілері" : "Сначала старые"}</SelectItem>
            <SelectItem value="manual">{language === "kk" ? "Қолмен" : "Вручную"}</SelectItem>
          </SelectContent>
        </Select>
        )}
      </div>

      {!isBookmarksSection && !q && (
        <nav className="flex items-center gap-1 text-sm flex-wrap" aria-label="breadcrumb">
          <button
            type="button"
            onClick={() => goToPathIndex(-1)}
            {...makeCrumbDnD("home", null)}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent text-muted-foreground hover:text-white transition-colors ${dragOverCrumb === "home" ? "bg-accent text-white ring-2 ring-primary" : ""}`}
          >
            <Home className="w-3.5 h-3.5" />
            {language === "kk" ? "Үй" : "Дом"}
          </button>
          {folderPath.length > 0 && folderPath.map((f, i) => (
            <div key={f.id} className="flex items-center gap-1">
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              {i === folderPath.length - 1 ? (
                <span
                  {...makeCrumbDnD(f.id, f.id)}
                  className={`px-2 py-1 font-medium truncate max-w-[180px] rounded-md transition-colors ${dragOverCrumb === f.id ? "bg-accent text-white ring-2 ring-primary" : ""}`}
                  title={f.title}
                >
                  {f.title}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => goToPathIndex(i)}
                  {...makeCrumbDnD(f.id, f.id)}
                  className={`px-2 py-1 rounded-md hover:bg-accent text-muted-foreground hover:text-white transition-colors truncate max-w-[180px] ${dragOverCrumb === f.id ? "bg-accent text-white ring-2 ring-primary" : ""}`}
                  title={f.title}
                >
                  {f.title}
                </button>
              )}
            </div>
          ))}
        </nav>
      )}

      {isBookmarksSection && myBookmarksInProduct.length > 0 && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/40">
          <span className="text-sm text-foreground">
            {language === "kk"
              ? "Оқушыларға көрсету"
              : "Показывать ученикам"}
          </span>
          <Switch
            checked={allMyArePublic}
            onCheckedChange={(next) => handleBulkPublic(next)}
            disabled={bulkSetPublic.isPending}
            aria-label={language === "kk" ? "Оқушыларға көрсету" : "Показывать ученикам"}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-sm text-muted-foreground">
          {q
            ? language === "kk" ? "Ештеңе табылмады" : "Ничего не найдено"
            : isBookmarksSection
              ? language === "kk" ? "Белгіленген материалдар жоқ" : "Нет помеченных материалов"
              : language === "kk" ? "Әзірге материалдар жоқ" : "Пока нет материалов"}
        </div>
      ) : (
        <MaterialList
          items={filtered}
          childrenOf={childrenOf}
          getIcon={getIcon}
          flat={!!q || isBookmarksSection}
          onOpenFolder={openFolder}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          startRename={startRename}
          cancelRename={cancelRename}
          submitRename={submitRename}
          isSavingRename={updateMaterial.isPending}
          onDelete={(mat) => setDeletingMat(mat)}
          onOpen={openMaterial}
          getFileUrl={getFileUrl}
          language={language}
          onAddInFolder={onAddInFolder}
          draggingId={draggingId}
          dragOverId={dragOverId}
          dropPosition={dropPosition}
          setDraggingId={setDraggingId}
          setDragOverId={setDragOverId}
          setDropPosition={setDropPosition}
          onReorder={reorder}
          isNoop={isNoop}
          draggedParentId={draggedParentId}
          reorderWithinParent={sortMode === "manual" && !isBookmarksSection}
          bookmarkFor={(id) => bookmarkIndex.get(id)}
          onToggleBookmark={handleToggleBookmark}
          onTogglePublic={handleTogglePublic}
          viewerType="creator"
          allFolders={list.filter((m) => m.type === "folder")}
          onMoveToFolder={moveToFolderTop}
          onDownloadFolder={downloadFolder}
        />
      )}

      <AlertDialog open={!!deletingMat} onOpenChange={(o) => !o && setDeletingMat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{language === "kk" ? "Жою керек пе?" : "Удалить?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {language === "kk"
                ? `"${deletingMat?.title}" жойылсын ба? Бұл әрекетті болдырмау мүмкін емес.`
                : `Удалить "${deletingMat?.title}"? Это действие нельзя отменить.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "kk" ? "Болдырмау" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive hover:bg-destructive/90">
              {language === "kk" ? "Жою" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const MaterialNode = ({
  material,
  getIcon,
  flat,
  onOpenFolder,
  renamingId,
  renameValue,
  setRenameValue,
  startRename,
  cancelRename,
  submitRename,
  isSavingRename,
  onDelete,
  onOpen,
  getFileUrl,
  language,
  onAddInFolder,
  draggingId,
  dragOverId,
  dropPosition,
  setDraggingId,
  setDragOverId,
  setDropPosition,
  onReorder,
  isNoop,
  draggedParentId,
  reorderWithinParent,
  bookmarkState,
  onToggleBookmark,
  onTogglePublic,
  viewerType,
  allFolders,
  onMoveToFolder,
  onDownloadFolder,
}: {
  material: Mat;
  getIcon: (type: string) => JSX.Element;
  flat: boolean;
  onOpenFolder: (id: string) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  startRename: (m: Mat) => void;
  cancelRename: () => void;
  submitRename: () => void;
  isSavingRename: boolean;
  onDelete: (m: Mat) => void;
  onOpen: (m: Mat) => void;
  getFileUrl: (m: Mat, action: 'view' | 'download') => string | null;
  language: string;
  onAddInFolder: (folderId: string) => void;
  draggingId: string | null;
  dragOverId: string | null;
  dropPosition: "before" | "after" | "inside" | null;
  setDraggingId: (id: string | null) => void;
  setDragOverId: (id: string | null) => void;
  setDropPosition: (p: "before" | "after" | "inside" | null) => void;
  onReorder: (draggedId: string, targetId: string, position: "before" | "after" | "inside") => void;
  isNoop: (draggedId: string, targetId: string, position: "before" | "after" | "inside") => boolean;
  draggedParentId: string | null;
  reorderWithinParent: boolean;
  bookmarkState: BookmarkState | undefined;
  onToggleBookmark: () => void;
  onTogglePublic: () => void;
  viewerType: "creator";
  allFolders: Mat[];
  onMoveToFolder: (materialId: string, target: string | null) => void;
  onDownloadFolder: (folderId: string) => void;
}) => {
  const isFolder = material.type === "folder";
  const isRenaming = renamingId === material.id;
  const [viewerOpen, setViewerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const downloadUrl = material.type === "file" && material.file_url && material.allow_download !== false
    ? getFileUrl(material, 'download') : null;
  const isActiveTarget = !!(dragOverId === material.id && draggingId && draggingId !== material.id);
  const positionIsNoop = isActiveTarget && dropPosition
    ? isNoop(draggingId!, material.id, dropPosition)
    : false;
  const showInsideRing = isActiveTarget && dropPosition === "inside" && isFolder && !positionIsNoop;
  const coverUrl = material.cover_url
    ? isS3Path(material.cover_url)
      ? buildS3RedirectUrl(material.cover_url, "creator")
      : (() => {
          const path = parseStoragePath(material.cover_url || "");
          return path ? buildStorageRedirectUrl(path) : null;
        })()
    : null;

  const handleCardClick = () => {
    if (isRenaming) return;
    if (isFolder && !flat) { onOpenFolder(material.id); return; }
    if (material.type === "link" && material.file_url) { window.open(material.file_url, "_blank", "noopener,noreferrer"); return; }
    if (material.type === "text") { setDialogOpen(true); return; }
    if (!isFolder) onOpen(material);
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(language === "kk" ? "Көшірілді" : "Скопировано");
    } catch {
      toast.error(language === "kk" ? "Қате" : "Ошибка");
    }
  };

  const triggerDownload = () => {
    if (!downloadUrl) return;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.rel = "noopener";
    a.download = material.title || "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={isRenaming}>
        <Card
        data-material-card="true"
        className={`${!isRenaming ? "cursor-pointer hover:bg-muted/70 transition-colors" : ""} ${showInsideRing ? "ring-2 ring-primary" : ""} ${draggingId === material.id ? "opacity-50" : ""}`}
        onClick={handleCardClick}
        draggable={!isRenaming && !flat}
        onDragStart={(e) => {
          e.stopPropagation();
          setDraggingId(material.id);
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", material.id);
        }}
        onDragOver={(e) => {
          if (!draggingId || draggingId === material.id) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const h = rect.height;
          let pos: "before" | "after" | "inside";
          const suppressInside = isFolder && draggedParentId === material.id;
          if (isFolder && !suppressInside) {
            if (y < h * 0.25) pos = "before";
            else if (y > h * 0.75) pos = "after";
            else pos = "inside";
          } else {
            pos = y < h / 2 ? "before" : "after";
          }
          // В режимах сортировки newest/oldest менять порядок внутри одного
          // родителя нельзя — разрешён только drop «внутрь» папки.
          if (!reorderWithinParent && pos !== "inside") return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          if (dragOverId !== material.id) setDragOverId(material.id);
          if (dropPosition !== pos) setDropPosition(pos);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          // Не сбрасываем состояние: иначе линия моргает при переходе
          // между соседними карточками (через зазор между ними).
          // Состояние перезапишется в onDragOver следующей карточки
          // или очистится в onDrop / onDragEnd.
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = draggingId;
          const pos = dropPosition ?? "after";
          setDragOverId(null);
          setDropPosition(null);
          setDraggingId(null);
          if (id && id !== material.id && !isNoop(id, material.id, pos)) {
            onReorder(id, material.id, pos);
          }
        }}
        onDragEnd={() => {
          setDraggingId(null);
          setDragOverId(null);
          setDropPosition(null);
        }}
      >
        <CardContent className="p-3 flex items-center gap-2">
          {!flat && (
            <GripVertical className="w-4 h-4 text-muted-foreground flex-shrink-0 cursor-grab" />
          )}
          <div className="w-8 h-8 overflow-hidden rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
            {coverUrl ? (
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getIcon(material.type)
            )}
          </div>
          {isRenaming ? (
            <form
              className="flex items-center gap-1 w-1/2"
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => { e.preventDefault(); submitRename(); }}
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                autoFocus
                className="h-8 text-sm flex-1 min-w-0"
              />
              <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 min-h-0 flex-shrink-0" disabled={isSavingRename}>
                {isSavingRename ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              </Button>
              <Button type="button" size="icon" variant="ghost" className="h-8 w-8 min-h-0 flex-shrink-0" onClick={cancelRename}>
                <X className="w-4 h-4" />
              </Button>
            </form>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate" title={material.title}>{material.title}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 min-h-0 flex-shrink-0 text-muted-foreground"
                title={language === "kk" ? "Атын өзгерту" : "Переименовать"}
                onClick={(e) => { e.stopPropagation(); startRename(material); }}
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <div className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <BookmarkStars
                  viewerType={viewerType}
                  state={bookmarkState}
                  onToggleMine={onToggleBookmark}
                  onTogglePublic={onTogglePublic}
                />
                {isFolder && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 min-h-0"
                    title={language === "kk" ? "Барлық файлдарды жүктеу" : "Скачать все файлы"}
                    onClick={(e) => { e.stopPropagation(); onDownloadFolder(material.id); }}
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                )}
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-8 w-8"
                    title={language === "kk" ? "Жүктеу" : "Скачать"}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}
                {material.type === "link" && material.file_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 min-h-0"
                    title={language === "kk" ? "Сілтемені көшіру" : "Скопировать ссылку"}
                    onClick={(e) => { e.stopPropagation(); copyToClipboard(material.file_url || ""); }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                )}
                {material.type === "text" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 min-h-0"
                    title={language === "kk" ? "Жаю" : "Развернуть"}
                    onClick={(e) => { e.stopPropagation(); setViewerOpen((v) => !v); }}
                  >
                    <ChevronRight className={`w-4 h-4 transition-transform ${viewerOpen ? "rotate-90" : ""}`} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 min-h-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  title={language === "kk" ? "Жою" : "Удалить"}
                  onClick={() => onDelete(material)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
        </Card>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onSelect={() => startRename(material)}>
            <Pencil className="w-4 h-4 mr-2" />
            {language === "kk" ? "Атын өзгерту" : "Переименовать"}
          </ContextMenuItem>
          <ContextMenuItem onSelect={onToggleBookmark}>
            <Star className={`w-4 h-4 mr-2 ${bookmarkState?.mine ? "text-yellow-500 fill-yellow-500" : ""}`} />
            {bookmarkState?.mine
              ? (language === "kk" ? "Белгіні алу" : "Снять пометку")
              : (language === "kk" ? "Белгілеу" : "Пометить")}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Folder className="w-4 h-4 mr-2" />
              {language === "kk" ? "Папкаға жылжыту" : "Переместить в папку"}
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-56 max-h-72 overflow-y-auto">
              {(material.parent_id ?? null) !== null && (
                <ContextMenuItem onSelect={() => onMoveToFolder(material.id, null)}>
                  <Home className="w-4 h-4 mr-2" />
                  {language === "kk" ? "Басты бет" : "Дом"}
                </ContextMenuItem>
              )}
              {allFolders
                .filter((f) => f.id !== material.id && f.id !== (material.parent_id ?? null))
                .map((f) => (
                  <ContextMenuItem key={f.id} onSelect={() => onMoveToFolder(material.id, f.id)}>
                    <Folder className="w-4 h-4 mr-2" />
                    {f.title}
                  </ContextMenuItem>
                ))}
              {allFolders.filter((f) => f.id !== material.id && f.id !== (material.parent_id ?? null)).length === 0 &&
                (material.parent_id ?? null) === null && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    {language === "kk" ? "Папкалар жоқ" : "Нет других папок"}
                  </div>
                )}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {isFolder && (
            <ContextMenuItem onSelect={() => onDownloadFolder(material.id)}>
              <Download className="w-4 h-4 mr-2" />
              {language === "kk" ? "Барлық файлдарды жүктеу" : "Скачать все файлы"}
            </ContextMenuItem>
          )}
          {downloadUrl && (
            <ContextMenuItem onSelect={triggerDownload}>
              <Download className="w-4 h-4 mr-2" />
              {language === "kk" ? "Жүктеу" : "Скачать"}
            </ContextMenuItem>
          )}
          {material.type === "link" && material.file_url && (
            <>
              <ContextMenuItem onSelect={() => window.open(material.file_url || "", "_blank", "noopener,noreferrer")}>
                <ExternalLink className="w-4 h-4 mr-2" />
                {language === "kk" ? "Ашу" : "Открыть"}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => copyToClipboard(material.file_url || "")}>
                <Copy className="w-4 h-4 mr-2" />
                {language === "kk" ? "Сілтемені көшіру" : "Скопировать ссылку"}
              </ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => onDelete(material)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            {language === "kk" ? "Жою" : "Удалить"}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {viewerOpen && material.type === "text" && (
        <div className="mt-1 rounded-md border bg-muted/30 p-3 space-y-2">
          <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {material.content}
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 px-2 text-xs"
              onClick={(e) => { e.stopPropagation(); copyToClipboard(material.content || ""); }}
            >
              <Copy className="w-3 h-3" />
              {language === "kk" ? "Көшіру" : "Скопировать"}
            </Button>
          </div>
        </div>
      )}
      {material.type === "text" && (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="break-words">{material.title}</DialogTitle>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap break-words text-sm">
              {material.content}
            </div>
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 h-7 px-2 text-xs"
                onClick={() => copyToClipboard(material.content || "")}
              >
                <Copy className="w-3 h-3" />
                {language === "kk" ? "Көшіру" : "Скопировать"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const TRASH_TTL_DAYS = 30;

const CreatorTrashList = ({
  productId,
  language,
  getIcon,
}: {
  productId: string;
  language: string;
  getIcon: (type: string) => JSX.Element;
}) => {
  const { data: items = [], isLoading } = useDeletedMaterials(productId);
  const { data: liveMaterials = [] } = useProductMaterials(productId, { creatorOnly: true });
  const restore = useRestoreMaterial();
  const permanentDelete = usePermanentlyDeleteMaterial();
  const emptyTrash = useEmptyTrash();
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string; file_url: string | null } | null>(null);
  const [restorePick, setRestorePick] = useState<{ id: string; title: string; missingFolderTitle: string | null } | null>(null);
  const [pickedFolder, setPickedFolder] = useState<string>("__home__");

  const folderMap = useMemo(() => {
    const m = new Map<string, string>();
    liveMaterials.forEach((x) => {
      if (x.type === "folder") m.set(x.id, x.title);
    });
    return m;
  }, [liveMaterials]);

  const liveFolders = useMemo(
    () => liveMaterials.filter((x) => x.type === "folder"),
    [liveMaterials],
  );

  const formatSize = (bytes?: number | null) => {
    if (!bytes || bytes <= 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let v = bytes;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
  };

  const homeLabel = language === "kk" ? "Үй" : "Дом";

  const handleRestoreClick = (m: typeof items[number]) => {
    const origId = m.original_parent_id ?? null;
    const origExists = origId ? folderMap.has(origId) : true; // null = home, always exists
    if (origExists) {
      const target = origId ? folderMap.get(origId)! : homeLabel;
      restore.mutate(
        { id: m.id, productId },
        {
          onSuccess: () =>
            toast.success(
              language === "kk"
                ? `"${target}" қалтасына қалпына келтірілді`
                : `Восстановлено в "${target}"`,
            ),
          onError: () => toast.error(language === "kk" ? "Қате" : "Ошибка"),
        },
      );
    } else {
      setPickedFolder("__home__");
      setRestorePick({
        id: m.id,
        title: m.title,
        missingFolderTitle: null, // folder title is gone, only id was stored
      });
    }
  };

  const daysLeft = (deletedAt: string | null) => {
    if (!deletedAt) return TRASH_TTL_DAYS;
    const ms = new Date(deletedAt).getTime() + TRASH_TTL_DAYS * 86400_000 - Date.now();
    return Math.max(0, Math.ceil(ms / 86400_000));
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Trash2 className="w-4 h-4" />
          <span>
            {language === "kk"
              ? `Себет — 30 күннен кейін мәңгілікке жойылады`
              : `Корзина — удаляется навсегда через 30 дней`}
          </span>
        </div>
        {items.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmEmpty(true)}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            {language === "kk" ? "Тазалау" : "Очистить"}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">
          {language === "kk" ? "Себет бос" : "Корзина пуста"}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((m) => {
            const left = daysLeft(m.deleted_at as string | null);
            const isCritical = left <= 5;
            return (
              <Card key={m.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {getIcon(m.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{m.title}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                      <span>
                        {language === "kk" ? "Жойылған" : "Удалено"}:{" "}
                        {m.deleted_at
                          ? new Date(m.deleted_at).toLocaleDateString(
                              language === "kk" ? "kk-KZ" : "ru-RU",
                            )
                          : "—"}
                      </span>
                      <span>
                        {language === "kk" ? "Қалта" : "Папка"}:{" "}
                        {m.original_parent_id
                          ? folderMap.get(m.original_parent_id) ??
                            (language === "kk" ? "(жойылған)" : "(удалена)")
                          : homeLabel}
                      </span>
                      {m.type === "file" && (
                        <span>
                          {language === "kk" ? "Өлшемі" : "Размер"}: {formatSize(m.file_size)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-center px-2 flex-shrink-0">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none">
                      {language === "kk" ? "қалды" : "осталось"}
                    </span>
                    <span className={`text-lg font-bold leading-tight ${isCritical ? "text-destructive" : "text-orange-500"}`}>
                      {left}
                    </span>
                    <span className="text-[10px] text-muted-foreground leading-none">
                      {language === "kk" ? "күн" : "дн."}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      title={language === "kk" ? "Қалпына келтіру" : "Восстановить"}
                      onClick={() => handleRestoreClick(m)}
                      disabled={restore.isPending}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      title={language === "kk" ? "Мәңгілікке жою" : "Удалить навсегда"}
                      onClick={() => setConfirmDelete({ id: m.id, title: m.title, file_url: m.file_url ?? null })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmEmpty} onOpenChange={(o) => !o && setConfirmEmpty(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "kk" ? "Себетті тазалау?" : "Очистить корзину?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "kk"
                ? "Барлық материалдар мәңгілікке жойылады. Бұл әрекетті болдырмау мүмкін емес."
                : "Все материалы будут удалены навсегда. Это действие нельзя отменить."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "kk" ? "Болдырмау" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                emptyTrash.mutate(
                  { productId },
                  {
                    onSuccess: () => {
                      toast.success(language === "kk" ? "Себет тазаланды" : "Корзина очищена");
                      setConfirmEmpty(false);
                    },
                    onError: () => toast.error(language === "kk" ? "Қате" : "Ошибка"),
                  },
                );
              }}
            >
              {language === "kk" ? "Тазалау" : "Очистить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "kk" ? "Мәңгілікке жою керек пе?" : "Удалить навсегда?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "kk"
                ? `"${confirmDelete?.title}" мәңгілікке жойылады.`
                : `"${confirmDelete?.title}" будет удалён навсегда.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "kk" ? "Болдырмау" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDelete) return;
                permanentDelete.mutate(
                  { id: confirmDelete.id, productId, file_url: confirmDelete.file_url },
                  {
                    onSuccess: () => {
                      toast.success(language === "kk" ? "Жойылды" : "Удалено");
                      setConfirmDelete(null);
                    },
                    onError: () => toast.error(language === "kk" ? "Қате" : "Ошибка"),
                  },
                );
              }}
            >
              {language === "kk" ? "Жою" : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!restorePick} onOpenChange={(o) => !o && setRestorePick(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === "kk" ? "Қалпына келтіру" : "Восстановить материал"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === "kk"
                ? "Қалта жойылған. Файл үйге қалпына келтіріледі, немесе басқа қалтаны таңдаңыз."
                : "Папка была удалена. Файл будет восстановлен в Дом, либо можете выбрать в какую папку хотите."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={pickedFolder} onValueChange={setPickedFolder}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__home__">
                  <span className="inline-flex items-center gap-2">
                    <Home className="w-4 h-4" />
                    {homeLabel}
                  </span>
                </SelectItem>
                {liveFolders.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    <span className="inline-flex items-center gap-2">
                      <Folder className="w-4 h-4" />
                      {f.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{language === "kk" ? "Болдырмау" : "Отмена"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!restorePick) return;
                const target = pickedFolder === "__home__" ? null : pickedFolder;
                restore.mutate(
                  { id: restorePick.id, productId, targetParentId: target },
                  {
                    onSuccess: () => {
                      const name =
                        target ? folderMap.get(target) ?? "—" : homeLabel;
                      toast.success(
                        language === "kk"
                          ? `"${name}" қалтасына қалпына келтірілді`
                          : `Восстановлено в "${name}"`,
                      );
                      setRestorePick(null);
                    },
                    onError: () => toast.error(language === "kk" ? "Қате" : "Ошибка"),
                  },
                );
              }}
            >
              {language === "kk" ? "Қалпына келтіру" : "Восстановить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
// ============================================================
// Storage view — creator-only. Shows total bytes used across all
// of the creator's products with a quota progress bar and a list
// of all files sorted by size. Read-only: names + sizes only,
// no open/download. Includes a "refresh sizes" backfill action.
// ============================================================

const STORAGE_QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

const CreatorStorageList = ({ creatorName }: { creatorName: string }) => {
  const { language } = useLanguage();
  const { data: files = [], isLoading, refetch } = useAllCreatorMaterials(creatorName);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"files" | "folders">("files");
  const autoRefreshStarted = useRef(false);

  // Split by type
  const fileItems = useMemo(
    () => files.filter((f) => f.type === "file" || f.type === "link"),
    [files],
  );
  const folderItems = useMemo(
    () => files.filter((f) => f.type === "folder"),
    [files],
  );

  // Compute recursive folder size: sum of all descendant file sizes.
  const folderSizes = useMemo(() => calculateMaterialFolderSizes(files), [files]);

  const sortedFiles = useMemo(() => {
    const arr = [...fileItems];
    arr.sort((a, b) => {
      const av = a.file_size ?? -1;
      const bv = b.file_size ?? -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [fileItems, sortDir]);

  const sortedFolders = useMemo(() => {
    const arr = [...folderItems];
    arr.sort((a, b) => {
      const av = folderSizes.get(a.id) ?? 0;
      const bv = folderSizes.get(b.id) ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return arr;
  }, [folderItems, folderSizes, sortDir]);

  const totalBytes = useMemo(
    () => fileItems.reduce((s, f) => s + (f.file_size ?? 0), 0),
    [fileItems],
  );
  const missingCount = useMemo(
    () => fileItems.filter((f) => f.type === "file" && f.file_size == null).length,
    [fileItems],
  );
  const pct = Math.min(100, Math.round((totalBytes / STORAGE_QUOTA_BYTES) * 100));

  const handleRefreshSizes = useCallback(async (showToast = true) => {
    const token = localStorage.getItem("creator_token") || "";
    const name = localStorage.getItem("creator_name") || creatorName;
    if (!token || !name) {
      if (showToast) toast.error(language === "kk" ? "Авторизация қажет" : "Требуется вход");
      return;
    }
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "material-file-sizes",
        { body: { token, creatorName: name } },
      );
      if (error) throw error;
      const updated = (data as { updated?: number } | null)?.updated ?? 0;
      if (showToast) {
        toast.success(
          language === "kk"
            ? `Жаңартылды: ${updated}`
            : `Обновлено: ${updated}`,
        );
      }
      await refetch();
    } catch (e) {
      console.error(e);
      if (showToast) toast.error(language === "kk" ? "Қате" : "Ошибка");
    } finally {
      setRefreshing(false);
    }
  }, [creatorName, language, refetch]);

  useEffect(() => {
    if (missingCount === 0 || autoRefreshStarted.current) return;
    autoRefreshStarted.current = true;
    void handleRefreshSizes(false);
  }, [handleRefreshSizes, missingCount]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-accent" />
              <div className="font-medium">
                {language === "kk" ? "Қойма" : "Хранилище"}
              </div>
            </div>
            <div className="text-sm tabular-nums">
              <span className="font-semibold">{formatMaterialBytes(totalBytes)}</span>
              <span className="text-muted-foreground">
                {" "}/ {formatMaterialBytes(STORAGE_QUOTA_BYTES)} ({pct}%)
              </span>
            </div>
          </div>
          <Progress value={pct} className="h-2" />
          {missingCount > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
              <span>
                {language === "kk"
                  ? `${missingCount} файлдың өлшемі белгісіз`
                  : `У ${missingCount} файлов размер не определён`}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handleRefreshSizes(true)}
                disabled={refreshing}
                className="gap-2"
              >
                {refreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {language === "kk" ? "Өлшемдерді есептеу" : "Пересчитать размеры"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <div className="text-sm text-muted-foreground">
          {view === "files"
            ? language === "kk"
              ? `Барлығы файл: ${fileItems.length}`
              : `Всего файлов: ${fileItems.length}`
            : language === "kk"
              ? `Барлығы қалта: ${folderItems.length}`
              : `Всего папок: ${folderItems.length}`}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
        >
          <ArrowUpDown className="w-4 h-4" />
          {sortDir === "desc"
            ? language === "kk" ? "Үлкеннен кішіге" : "От большего к меньшему"
            : language === "kk" ? "Кішіден үлкенге" : "От меньшего к большему"}
        </Button>
      </div>

      <div className="inline-flex rounded-lg border p-0.5 bg-muted/40 w-fit">
        <button
          type="button"
          onClick={() => setView("files")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            view === "files"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {language === "kk" ? "Файлдар" : "Файлы"}
        </button>
        <button
          type="button"
          onClick={() => setView("folders")}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            view === "folders"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {language === "kk" ? "Қалталар" : "Папки"}
        </button>
      </div>

      {view === "folders" && (
        sortedFolders.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            {language === "kk" ? "Қалталар жоқ" : "Нет папок"}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedFolders.map((f) => {
            const size = folderSizes.get(f.id) ?? 0;
            return (
              <Card key={f.id} className="opacity-90">
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    <Folder className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{f.title}</div>
                  </div>
                  <div className="text-sm tabular-nums font-medium text-muted-foreground flex-shrink-0">
                    {formatMaterialBytes(size)}
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        )
      )}

      {view === "files" && (
        sortedFiles.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            {language === "kk" ? "Файлдар жоқ" : "Нет файлов"}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedFiles.map((f) => (
            <Card key={f.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                  {f.type === "link" ? (
                    <LinkIcon className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.title}</div>
                </div>
                <div className="text-sm tabular-nums font-medium text-muted-foreground flex-shrink-0">
                  {f.type === "link" ? formatMaterialBytes(0) : formatMaterialBytes(f.file_size)}
                </div>
              </CardContent>
            </Card>
            ))}
          </div>
        )
      )}
    </div>
  );
};
