import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Progress } from "@/components/ui/progress";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { useProductMaterials, useCreateMaterial, useUpdateMaterial, useDeleteMaterial, uploadMaterialFile } from "@/hooks/useMaterials";
import { useLanguage } from "@/contexts/LanguageContext";
import { countEn, localeTag } from "@/lib/language";
import { Plus, FileText, Folder, Trash2, Edit, Loader2, Upload, GripVertical, ChevronLeft, FolderOpen, Download, X, Clock, Link as LinkIcon, Type, Clipboard } from "lucide-react";
import { ExternalLink, ChevronRight, ChevronDown, Home } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { requestMaterialToken, buildProxyUrl } from "@/lib/materialToken";
import { isS3Path, isOfficeDocument, buildS3RedirectUrl, buildStorageRedirectUrl, parseStoragePath } from "@/lib/fileRedirect";
import { Checkbox } from "@/components/ui/checkbox";
  import MaterialsSearchBar from "@/components/materials/MaterialsSearchBar";
  import {
    ContextMenu,
    ContextMenuTrigger,
    ContextMenuContent,
    ContextMenuItem,
  } from "@/components/ui/context-menu";

 
 interface ProductMaterialsManagerProps {
   productId: string;
   productTitle: string;
   isOpen: boolean;
   onClose: () => void;
   mode?: "add" | "edit";
   initialFolderId?: string | null;
 }
 
 type ItemType = "file" | "folder" | "link" | "text";
 
  interface Material {
    id: string;
    product_id: string;
    title: string;
    type: string;
    content: string | null;
    file_url: string | null;
    order_index: number;
    created_at: string;
     parent_id?: string | null;
    allow_view?: boolean;
    allow_download?: boolean;
    available_at?: string | null;
    teacher_allow_download?: boolean;
  }
 
interface FilePermission {
  allow_download: boolean;
  teacher_allow_download: boolean;
}

interface FileEntry {
  file: File;
  customName: string;
  permissions: FilePermission;
}

interface FormData {
   title: string;
   itemType: ItemType;
   files: File[];
   filePermissions: FilePermission[];
   fileEntries: FileEntry[];
   allow_download: boolean;
   teacher_allow_download: boolean;
   scheduleAccess: boolean;
   availableAt: string;
   linkUrl: string;
   content: string;
 }
 
 const ProductMaterialsManager = ({ productId, productTitle, isOpen, onClose, mode = "edit", initialFolderId = null }: ProductMaterialsManagerProps) => {
   const { t, language, l } = useLanguage();
   const { data: allMaterials = [], isLoading } = useProductMaterials(productId, { creatorOnly: true });
   const createMaterial = useCreateMaterial();
   const updateMaterial = useUpdateMaterial();
   const deleteMaterial = useDeleteMaterial();
   
   const [isAdding, setIsAdding] = useState(false);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [deletingMaterial, setDeletingMaterial] = useState<{ id: string; title: string; file_url?: string | null } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
   const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
   const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addTargetFolderId, setAddTargetFolderId] = useState<string | null>(null);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [expandedPickerFolders, setExpandedPickerFolders] = useState<Set<string>>(new Set());

    const [formData, setFormData] = useState<FormData>({
      title: "",
      itemType: "file",
      files: [],
      filePermissions: [],
      fileEntries: [],
      allow_download: true,
      teacher_allow_download: false,
      scheduleAccess: false,
      availableAt: "",
      linkUrl: "",
      content: "",
    });

  const addFilesToForm = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const newEntries: FileEntry[] = arr.map(file => ({
      file,
      customName: "",
      permissions: { allow_download: true, teacher_allow_download: false }
    }));
    setFormData(prev => ({
      ...prev,
      fileEntries: [...prev.fileEntries, ...newEntries]
    }));
    toast.success(arr.length > 1 ? l({ ru: `Добавлено файлов: ${arr.length}`, kk: `Қосылған файлдар: ${arr.length}`, en: `Files added: ${arr.length}` }) : l({ ru: "Файл добавлен", kk: "Файл қосылды", en: "File added" }));
  }, []);

  const getFilesFromClipboard = useCallback((clipboardData: DataTransfer | null): File[] => {
    if (!clipboardData) return [];
    const directFiles = Array.from(clipboardData.files || []).filter(file => file.size > 0 || file.type);
    if (directFiles.length > 0) return directFiles;

    return Array.from(clipboardData.items || []).reduce<File[]>((acc, item) => {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) acc.push(file);
      }
      return acc;
    }, []);
  }, []);

  // Global paste listener: when the add form is open and a file/folder is being created,
  // pasting a file anywhere in the dialog adds it to the form.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: ClipboardEvent) => {
      if (!isAdding) return;
      if (formData.itemType !== "file" && formData.itemType !== "folder") return;
      const files = getFilesFromClipboard(e.clipboardData);
      if (files.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        addFilesToForm(files);
      }
    };
    window.addEventListener("paste", handler, true);
    return () => window.removeEventListener("paste", handler, true);
  }, [isOpen, isAdding, addFilesToForm, getFilesFromClipboard, formData.itemType]);

  // Auto-open add form when in "add" mode
  useEffect(() => {
    if (!isOpen) return;
    if (mode === "add") {
      setIsAdding(true);
      setEditingId(null);
    } else {
      setIsAdding(false);
    }
  }, [isOpen, mode]);

  // Apply initial folder when dialog opens
  useEffect(() => {
    if (isOpen) {
      setCurrentFolderId(initialFolderId ?? null);
    }
  }, [isOpen, initialFolderId]);

  // Sync the add-form target folder with the current folder whenever the form opens
  useEffect(() => {
    if (isAdding) {
      setAddTargetFolderId(currentFolderId);
    }
  }, [isAdding, currentFolderId]);
 
   // Filter materials for current folder level
   const materials = useMemo(() => {
     const q = searchQuery.trim().toLowerCase();
     if (q) {
       return (allMaterials as Material[]).filter(m => m.title.toLowerCase().includes(q));
     }
     return (allMaterials as Material[]).filter(m => 
       currentFolderId ? m.parent_id === currentFolderId : !m.parent_id
     );
   }, [allMaterials, currentFolderId, searchQuery]);
 
   // Get current folder info
   const currentFolder = useMemo(() => {
     if (!currentFolderId) return null;
     return (allMaterials as Material[]).find(m => m.id === currentFolderId);
   }, [allMaterials, currentFolderId]);
 
   // Get breadcrumb path
   const getBreadcrumbPath = (): Material[] => {
     const path: Material[] = [];
     let folderId = currentFolderId;
     while (folderId) {
       const folder = (allMaterials as Material[]).find(m => m.id === folderId);
       if (folder) {
         path.unshift(folder);
         folderId = folder.parent_id || null;
       } else {
         break;
       }
     }
     return path;
   };
 
    const resetForm = () => {
      setFormData({ title: "", itemType: "file", files: [], filePermissions: [], fileEntries: [], allow_download: true, teacher_allow_download: false, scheduleAccess: false, availableAt: "", linkUrl: "", content: "" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
 
    const handleAdd = async (e: React.FormEvent) => {
      e.preventDefault();
      
      if (formData.itemType === "folder" && !formData.title) {
        toast.error(l({ ru: "Введите название папки", kk: "Қалта атын енгізіңіз", en: "Enter the folder name" }));
        return;
      }
      
      if (formData.itemType === "file" && formData.fileEntries.length === 0) {
        toast.error(l({ ru: "Выберите файл(ы)", kk: "Файл(дар)ды таңдаңыз", en: "Choose the file or files" }));
        return;
      }

      if (formData.itemType === "link" && !formData.linkUrl.trim()) {
        toast.error(l({ ru: "Введите ссылку или текст", kk: "Сілтеме немесе мәтін енгізіңіз", en: "Enter a link or text" }));
        return;
      }

      if (formData.itemType === "text" && !formData.content) {
        toast.error(l({ ru: "Введите текст", kk: "Мәтін енгізіңіз", en: "Enter text" }));
        return;
      }

      try {
        setIsUploading(true);
        setUploadProgress(0);
        // Новые материалы вставляются в самый верх текущей папки/корня.
        // Берём минимальный order_index среди соседей и опускаемся ниже него.
        const siblingsHere = (allMaterials as Material[]).filter(
          (m) => (m.parent_id ?? null) === (addTargetFolderId ?? null)
        );
        const minSiblingIdx = siblingsHere.length
          ? Math.min(...siblingsHere.map((s) => s.order_index ?? 0))
          : 0;
        const topIndex = siblingsHere.length ? minSiblingIdx - 1 : 0;
        if (formData.itemType === "link") {
          const raw = formData.linkUrl.trim();
          // Поле принимает и URL, и обычный текст. Если это URL — создаём ссылку,
          // иначе сохраняем как текстовый материал.
          const isUrl = /^(https?:\/\/|\/\/)/i.test(raw) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw);
          if (isUrl) {
            const normalized = /^(https?:\/\/|\/\/)/i.test(raw) ? raw : `https://${raw}`;
            await createMaterial.mutateAsync({
              product_id: productId,
              title: formData.title.trim() || normalized,
              type: "link",
              content: null,
              file_url: normalized,
              order_index: topIndex,
              parent_id: addTargetFolderId,
              available_at: formData.scheduleAccess && formData.availableAt
                ? new Date(formData.availableAt).toISOString()
                : null,
            });
            toast.success(l({ ru: "Ссылка добавлена!", kk: "Сілтеме қосылды!", en: "Link added!" }));
          } else {
            await createMaterial.mutateAsync({
              product_id: productId,
              title: formData.title.trim() || raw.slice(0, 80),
              type: "text",
              content: raw,
              file_url: null,
              order_index: topIndex,
              parent_id: addTargetFolderId,
              available_at: formData.scheduleAccess && formData.availableAt
                ? new Date(formData.availableAt).toISOString()
                : null,
            });
            toast.success(l({ ru: "Текст добавлен!", kk: "Мәтін қосылды!", en: "Text added!" }));
          }
        } else if (formData.itemType === "text") {
          await createMaterial.mutateAsync({
            product_id: productId,
            title: formData.title.trim() || formData.content.slice(0, 80),
            type: "text",
            content: formData.content,
            file_url: null,
            order_index: topIndex,
            parent_id: addTargetFolderId,
            available_at: formData.scheduleAccess && formData.availableAt 
              ? new Date(formData.availableAt).toISOString() 
              : null,
          });
          toast.success(l({ ru: "Текст добавлен!", kk: "Мәтін қосылды!", en: "Text added!" }));
        } else if (formData.itemType === "folder") {
          // Create folder
          const folder = await createMaterial.mutateAsync({
            product_id: productId,
            title: formData.title,
            type: "folder",
            content: null,
            file_url: null,
            order_index: topIndex,
            parent_id: addTargetFolderId,
          });

          // If files selected, add them to the folder
          if (formData.fileEntries.length > 0) {
            for (let i = 0; i < formData.fileEntries.length; i++) {
              const entry = formData.fileEntries[i];
               const fileUrl = await uploadMaterialFile(entry.file, productId, (p) => setUploadProgress(p));
              await createMaterial.mutateAsync({
                product_id: productId,
                title: entry.customName || entry.file.name,
                 type: "file",
                 content: null,
                 file_url: fileUrl,
                 order_index: i,
                 parent_id: folder.id,
                 allow_view: true,
                 allow_download: entry.permissions.allow_download,
                 teacher_allow_download: entry.permissions.teacher_allow_download,
                file_size: entry.file.size,
               });
            }
          }

          toast.success(l({ ru: `Папка "${formData.title}" создана!`, kk: `"${formData.title}" қалтасы жасалды!`, en: `Folder "${formData.title}" created!` }));
        } else {
          // Upload files
           for (let i = 0; i < formData.fileEntries.length; i++) {
             const entry = formData.fileEntries[i];
             const fileUrl = await uploadMaterialFile(entry.file, productId, (p) => setUploadProgress(p));
             await createMaterial.mutateAsync({
               product_id: productId,
               title: entry.customName || entry.file.name,
               type: "file",
               content: null,
               file_url: fileUrl,
                // Сохраняем порядок выбора: первый файл оказывается сверху,
                // остальные — ниже него, но всё ещё выше существующих материалов.
                order_index: topIndex - (formData.fileEntries.length - 1 - i),
                parent_id: addTargetFolderId,
                allow_view: true,
                allow_download: entry.permissions.allow_download,
                teacher_allow_download: entry.permissions.teacher_allow_download,
                available_at: formData.scheduleAccess && formData.availableAt 
                  ? new Date(formData.availableAt).toISOString() 
                  : null,
                file_size: entry.file.size,
              });
           }
          toast.success(formData.fileEntries.length > 1 ? l({ ru: "Файлы добавлены!", kk: "Файлдар қосылды!", en: "Files added!" }) : l({ ru: "Файл добавлен!", kk: "Файл қосылды!", en: "File added!" }));
        }

        setIsAdding(false);
        resetForm();
        if (mode === "add") {
          onClose();
        }
      } catch (err) {
        console.error(err);
        toast.error(l({ ru: "Ошибка при добавлении", kk: "Қосу кезінде қате", en: "Could not add" }));
      } finally {
        setIsUploading(false);
      }
    };
 
     const handleEdit = (material: Material) => {
       setEditingId(material.id);
        setFormData({
          title: material.title,
          itemType: (material.type === "folder" || material.type === "link" || material.type === "text") ? material.type as ItemType : "file",
          files: [],
          filePermissions: [],
          fileEntries: [],
          allow_download: material.allow_download !== false,
          teacher_allow_download: material.teacher_allow_download !== false,
          scheduleAccess: !!material.available_at,
          availableAt: material.available_at ? new Date(material.available_at).toISOString().slice(0, 16) : "",
          linkUrl: material.type === "link" ? (material.file_url || "") : "",
          content: material.type === "text" ? (material.content || "") : "",
        });
     };
 
    const handleUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId || !formData.title) return;
  
       try {
          const updateData: any = {
            id: editingId,
            productId: productId,
            title: formData.title,
            allow_view: true,
            allow_download: formData.allow_download,
            teacher_allow_download: false,
            available_at: formData.scheduleAccess && formData.availableAt 
              ? new Date(formData.availableAt).toISOString() 
              : null,
          };

          if (formData.itemType === "link") {
            updateData.file_url = formData.linkUrl;
          }
          if (formData.itemType === "text") {
            updateData.content = formData.content;
          }

          await updateMaterial.mutateAsync(updateData);
  
       toast.success(l({ ru: "Изменения сохранены!", kk: "Өзгерістер сақталды!", en: "Changes saved!" }));
        setEditingId(null);
        resetForm();
      } catch (err) {
        console.error(err);
        toast.error(l({ ru: "Ошибка при обновлении", kk: "Жаңарту кезінде қате", en: "Could not update" }));
      }
    };
 
   const handleDelete = async () => {
     if (!deletingMaterial) return;
 
     try {
       await deleteMaterial.mutateAsync({
         id: deletingMaterial.id,
         productId: productId,
         file_url: deletingMaterial.file_url,
       });
       toast.success(l({ ru: "Удалено!", kk: "Жойылды!", en: "Deleted!" }));
       setDeletingMaterial(null);
     } catch (err) {
       console.error(err);
       toast.error(l({ ru: "Ошибка при удалении", kk: "Жою кезінде қате", en: "Could not delete" }));
     }
   };
 
    const getItemIcon = (type: string) => {
      if (type === "folder") return <Folder className="w-4 h-4 text-primary" />;
      if (type === "link") return <LinkIcon className="w-4 h-4 text-primary" />;
      if (type === "text") return <Type className="w-4 h-4 text-primary" />;
      return <FileText className="w-4 h-4 text-primary" />;
    };
 
   const handleOpenFolder = (folderId: string) => {
     setCurrentFolderId(folderId);
     setIsAdding(false);
     setEditingId(null);
   };
 
  const getFileUrl = useCallback((material: Material, action: 'view' | 'download'): string | null => {
    if (!material.file_url) return null;
    if (isS3Path(material.file_url)) {
      if (action === 'view' && isOfficeDocument(material.title)) return null;
      return buildS3RedirectUrl(material.file_url, 'creator', undefined, action === 'download' ? material.title : undefined);
    } else {
      const path = parseStoragePath(material.file_url);
      if (!path) return null;
      return buildStorageRedirectUrl(path, action === 'download' ? material.title : undefined);
    }
  }, []);

  const handleOfficeView = useCallback(async (material: Material) => {
    if (!material.file_url) return;
    const loadingToast = toast.loading(l({ ru: "Подготовка файла...", kk: "Файл дайындалуда...", en: "Preparing the file..." }));
    try {
      const token = await requestMaterialToken(material.file_url, 'creator');
      const proxyUrl = buildProxyUrl(token);
      const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(proxyUrl)}`;
      window.open(viewerUrl, '_blank');
    } catch (err) {
      console.error('Error opening office doc:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(l({ ru: `Ошибка: ${errMsg}`, kk: `Қате: ${errMsg}`, en: `Error: ${errMsg}` }));
    } finally {
      toast.dismiss(loadingToast);
    }
  }, []);

   const renderAddForm = () => (
     <form onSubmit={handleAdd} className="space-y-4">
      {(() => {
        const targetFolder = addTargetFolderId
          ? (allMaterials as Material[]).find((m) => m.id === addTargetFolderId)
          : null;
        const lockTarget = mode === "add" && !!initialFolderId;

        const togglePickerFolder = (id: string) => {
          setExpandedPickerFolders((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
          });
        };

        const renderFolderTree = (parentId: string | null, depth: number): JSX.Element[] => {
          const folders = (allMaterials as Material[]).filter(
            (m) => m.type === "folder" && (m.parent_id ?? null) === parentId
          );
          return folders.flatMap((f) => {
            const hasChildren = (allMaterials as Material[]).some(
              (m) => m.type === "folder" && m.parent_id === f.id
            );
            const expanded = expandedPickerFolders.has(f.id);
            const isCurrent = addTargetFolderId === f.id;
            const nodes: JSX.Element[] = [];
            if (!isCurrent) {
              nodes.push(
                <div
                  key={f.id}
                  className="w-full flex items-center rounded hover:bg-accent hover:text-accent-foreground text-sm group"
                  style={{ paddingLeft: 4 + depth * 16 }}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); togglePickerFolder(f.id); }}
                      className="p-1 flex-shrink-0 hover:opacity-80"
                      aria-label={expanded ? l({ ru: "Свернуть", kk: "Жию", en: "Collapse" }) : l({ ru: "Развернуть", kk: "Жаю", en: "Expand" })}
                    >
                      {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                  ) : (
                    <span className="w-[22px] flex-shrink-0" />
                  )}
                  <button
                    type="button"
                    onClick={() => { setAddTargetFolderId(f.id); setFolderPickerOpen(false); }}
                    className="flex-1 text-left px-1 py-1.5 flex items-center gap-2 min-w-0"
                  >
                    <Folder className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{f.title}</span>
                  </button>
                </div>
              );
            }
            // Render children: at same depth if parent hidden, or +1 if expanded
            if (isCurrent) {
              nodes.push(...renderFolderTree(f.id, depth));
            } else if (expanded) {
              nodes.push(...renderFolderTree(f.id, depth + 1));
            }
            return nodes;
          });
        };

        return (
          <div className="flex items-center gap-2 flex-wrap p-2 bg-muted/30 rounded-md">
            <span className="text-xs text-muted-foreground">
              {l({ ru: "Куда добавить:", kk: "Қайда қосу:", en: "Where to add it:" })}
            </span>
            <div className="flex items-center gap-1 text-sm font-medium">
              {targetFolder ? (
                <>
                  <Folder className="w-4 h-4 text-primary" />
                  <span className="truncate max-w-[180px]">{targetFolder.title}</span>
                </>
              ) : (
                <>
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <span>{l({ ru: "Дом", kk: "Үй", en: "Home" })}</span>
                </>
              )}
            </div>
            {!lockTarget && (
              <Popover open={folderPickerOpen} onOpenChange={setFolderPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-auto h-7 text-xs"
                  >
                    <FolderOpen className="w-3.5 h-3.5 mr-1" />
                    {targetFolder
                      ? (l({ ru: "Изменить", kk: "Өзгерту", en: "Change" }))
                      : (l({ ru: "Выбрать папку", kk: "Папканы таңдау", en: "Choose a folder" }))}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1 max-h-72 overflow-y-auto" align="end">
                  {targetFolder && (
                    <button
                      type="button"
                      onClick={() => { setAddTargetFolderId(null); setFolderPickerOpen(false); }}
                      className="w-full text-left px-2 py-1.5 hover:bg-accent hover:text-accent-foreground rounded text-sm flex items-center gap-2"
                    >
                      <Home className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{l({ ru: "Дом", kk: "Үй", en: "Home" })}</span>
                    </button>
                  )}
                  {renderFolderTree(null, 0)}
                </PopoverContent>
              </Popover>
            )}
          </div>
        );
      })()}

       <div className="space-y-3">
         <Label>{l({ ru: "Что добавить?", kk: "Нені қосу керек?", en: "What would you like to add?" })}</Label>
          <RadioGroup
            value={formData.itemType}
            onValueChange={(value: ItemType) => setFormData(prev => ({ ...prev, itemType: value, files: [], fileEntries: [] }))}
            className="flex flex-wrap gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="file" id="type-file" />
              <Label htmlFor="type-file" className="cursor-pointer flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {l({ ru: "Файл", kk: "Файл", en: "File" })}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="folder" id="type-folder" />
              <Label htmlFor="type-folder" className="cursor-pointer flex items-center gap-2">
                <Folder className="w-4 h-4" />
                {l({ ru: "Папка", kk: "Қалта", en: "Folder" })}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="link" id="type-link" />
              <Label htmlFor="type-link" className="cursor-pointer flex items-center gap-2">
                <LinkIcon className="w-4 h-4" />
                {l({ ru: "Ссылка", kk: "Сілтеме", en: "Link" })}
              </Label>
            </div>
          </RadioGroup>
        </div>
  
        {formData.itemType === "folder" && (
          <div className="space-y-2">
            <Label>{l({ ru: "Название папки *", kk: "Қалта атауы *", en: "Folder name *" })}</Label>
            <Input
              placeholder={l({ ru: "Введите название папки", kk: "Қалта атын енгізіңіз", en: "Enter the folder name" })}
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
        )}

        {formData.itemType === "link" && (
          <>
          <div className="space-y-2">
              <Label>{l({ ru: "Название (необязательно)", kk: "Атауы (міндетті емес)", en: "Title (optional)" })}</Label>
              <Input
                placeholder={l({ ru: "Если пусто — показывается сама ссылка", kk: "Бос болса — сілтеменің өзі көрсетіледі", en: "Leave it empty and the link itself is shown" })}
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{l({ ru: "Ссылка *", kk: "Сілтеме *", en: "Link *" })}</Label>
              <Textarea
                placeholder="https://..."
                value={formData.linkUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, linkUrl: e.target.value }))}
                rows={4}
                required
              />
            </div>
          </>
        )}
 
        {(formData.itemType === "file" || formData.itemType === "folder") && <div className="space-y-2">
          <Label>
            {formData.itemType === "folder" 
              ? l({ ru: "Файлы в папку (опционально)", kk: "Қалтаға файлдар (міндетті емес)", en: "Files for the folder (optional)" }) 
              : l({ ru: "Выберите файл(ы) *", kk: "Файл(дар)ды таңдаңыз *", en: "Choose the file or files *" })}
          </Label>
         {/* Selected files list */}
         {formData.fileEntries.length > 0 && (
             <div className="space-y-2 mb-3">
               {formData.fileEntries.map((entry, index) => (
                <div key={index} className="bg-muted/50 rounded-md px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                    <Input
                      placeholder={entry.file.name}
                      value={entry.customName}
                      onChange={(e) => {
                        setFormData(prev => {
                          const newEntries = [...prev.fileEntries];
                          newEntries[index] = { ...newEntries[index], customName: e.target.value };
                          return { ...prev, fileEntries: newEntries };
                        });
                      }}
                      className="flex-1 h-8 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          fileEntries: prev.fileEntries.filter((_, i) => i !== index)
                        }));
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                   </div>
                   <div className="pl-6 space-y-2">
                     <p className="text-xs font-medium text-muted-foreground">{l({ ru: "Для ученика:", kk: "Оқушы үшін:", en: "For the student:" })}</p>
                     <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <Checkbox
                        checked={entry.permissions.allow_download}
                        onCheckedChange={(checked) => {
                          setFormData(prev => {
                            const newEntries = [...prev.fileEntries];
                            newEntries[index] = { 
                              ...newEntries[index], 
                              permissions: { ...newEntries[index].permissions, allow_download: !!checked }
                            };
                            return { ...prev, fileEntries: newEntries };
                          });
                        }}
                      />
                      <Download className="w-3 h-3" />
                      {l({ ru: "Скачивание", kk: "Жүктеу", en: "Downloading" })}
                    </label>
                  </div>
                 </div>
               ))}
             </div>
         )}

           {/* Drop zone with custom right-click menu (Выбрать / Вставить). */}
           <ContextMenu>
             <ContextMenuTrigger asChild>
               <div
                 className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
                 onClick={() => fileInputRef.current?.click()}
                 onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                 onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
                 onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
                 onDrop={(e) => {
                   e.preventDefault();
                   e.stopPropagation();
                   setIsDragging(false);
                   if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                     addFilesToForm(e.dataTransfer.files);
                   }
                 }}
               >
                 <input
                   ref={fileInputRef}
                   type="file"
                   multiple
                   onChange={(e) => {
                     if (e.target.files && e.target.files.length > 0) {
                       addFilesToForm(e.target.files);
                     }
                     if (fileInputRef.current) fileInputRef.current.value = "";
                   }}
                   className="hidden"
                   id="file-upload"
                 />
                 <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                 <p className="text-sm text-muted-foreground">
                   {formData.fileEntries.length > 0 ? l({ ru: "Добавить ещё файл(ы) — нажмите, перетащите или вставьте (Ctrl+V)", kk: "Тағы файл(дар) қосу — басыңыз, сүйреңіз немесе қойыңыз (Ctrl+V)", en: "Add more file(s) — click, drag and drop, or paste (Ctrl+V)" }) : l({ ru: "Нажмите, перетащите или вставьте (Ctrl+V) файл(ы)", kk: "Файлды басып таңдаңыз, сүйреңіз немесе қойыңыз (Ctrl+V)", en: "Click, drag or paste (Ctrl+V) your files" })}
                 </p>
               </div>
             </ContextMenuTrigger>
             <ContextMenuContent>
               <ContextMenuItem onSelect={() => fileInputRef.current?.click()}>
                 <FolderOpen className="w-4 h-4 mr-2" />
                 {l({ ru: "Выбрать (из компьютера)", kk: "Таңдау (компьютерден)", en: "Choose (from computer)" })}
               </ContextMenuItem>
               <ContextMenuItem
                 onSelect={async () => {
                   try {
                     const anyNav = navigator as unknown as { clipboard?: { read?: () => Promise<Array<{ types: string[]; getType: (t: string) => Promise<Blob> }>> } };
                     const items = await anyNav.clipboard?.read?.();
                     if (!items) { toast.error(l({ ru: "Буфер обмена недоступен", kk: "Алмасу буфері қолжетімсіз", en: "The clipboard is unavailable" })); return; }
                     const files: File[] = [];
                     for (const item of items) {
                       const type = item.types.find((t) => t !== "text/plain" && t !== "text/html") || item.types[0];
                       if (!type) continue;
                       const blob = await item.getType(type);
                       const ext = type.split("/")[1] || "bin";
                       files.push(new File([blob], `pasted-${Date.now()}.${ext}`, { type }));
                     }
                     if (files.length > 0) addFilesToForm(files);
                     else toast.error(l({ ru: "В буфере обмена нет файлов", kk: "Алмасу буферінде файлдар жоқ", en: "There are no files in the clipboard" }));
                   } catch {
                     toast.error(l({ ru: "Не удалось прочитать буфер. Используйте Cmd+V", kk: "Буферді оқу мүмкін болмады. Cmd+V пайдаланыңыз", en: "Couldn't read the clipboard. Use Cmd+V" }));
                   }
                 }}
               >
                 <Clipboard className="w-4 h-4 mr-2" />
                 {l({ ru: "Вставить", kk: "Қою", en: "Paste" })}
               </ContextMenuItem>
             </ContextMenuContent>
           </ContextMenu>
        </div>}

        {/* Schedule access */}
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={formData.scheduleAccess}
              onCheckedChange={(checked) => {
                const now = new Date();
                const pad = (n: number) => String(n).padStart(2, '0');
                const defaultTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
                setFormData(prev => ({ ...prev, scheduleAccess: !!checked, availableAt: checked ? (prev.availableAt || defaultTime) : prev.availableAt }));
              }}
            />
            <Clock className="w-4 h-4" />
            {l({ ru: "Запланировать открытие доступа", kk: "Қолжетімділіктің ашылуын жоспарлау", en: "Schedule when access opens" })}
          </label>
          {formData.scheduleAccess && (
            <Input
              type="datetime-local"
              value={formData.availableAt}
              onChange={(e) => setFormData(prev => ({ ...prev, availableAt: e.target.value }))}
              min={(() => { const n = new Date(); const p = (v: number) => String(v).padStart(2,'0'); return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`; })()}
              required={formData.scheduleAccess}
            />
          )}
        </div>
  
        <div className="flex gap-2 pt-2">
         <Button
           type="button"
           variant="outline"
           className="flex-1"
           onClick={() => {
             resetForm();
             if (mode === "add") onClose();
             else setIsAdding(false);
           }}
         >
           {t("cancel")}
         </Button>
         <Button
           type="submit"
           variant="cta"
           className="flex-1"
           disabled={isUploading || createMaterial.isPending}
         >
            {(isUploading || createMaterial.isPending) ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isUploading && uploadProgress > 0 ? `${uploadProgress}%` : l({ ru: "Загрузка...", kk: "Жүктелуде...", en: "Loading..." })}
              </span>
            ) : (
             t("add")
           )}
         </Button>
        </div>
        {isUploading && uploadProgress > 0 && (
          <Progress value={uploadProgress} className="h-2" />
        )}
     </form>
   );
 
   const renderEditForm = () => (
     <form onSubmit={handleUpdate} className="space-y-4">
       <div className="space-y-2">
         <Label>{l({ ru: "Название *", kk: "Атауы *", en: "Title *" })}</Label>
         <Input
           placeholder={l({ ru: "Введите название", kk: "Атауын енгізіңіз", en: "Enter a title" })}
           value={formData.title}
           onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
           required
         />
       </div>
 
      {formData.itemType === "file" && (
        <div className="space-y-3">
          <Label>{l({ ru: "Доступ", kk: "Қолжетімділік", en: "Access" })}</Label>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">{l({ ru: "Для ученика:", kk: "Оқушы үшін:", en: "For the student:" })}</p>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={formData.allow_download}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allow_download: !!checked }))}
              />
              <Download className="w-4 h-4" />
              {l({ ru: "Скачивание файла", kk: "Файлды жүктеу", en: "File download" })}
            </label>
           </div>
         </div>
       )}

      {formData.itemType === "link" && editingId && (
        <div className="space-y-2">
          <Label>{l({ ru: "URL ссылки *", kk: "URL сілтемесі *", en: "Link URL *" })}</Label>
          <Input
            placeholder="https://..."
            value={formData.linkUrl}
            onChange={(e) => setFormData(prev => ({ ...prev, linkUrl: e.target.value }))}
            required
          />
        </div>
      )}

      {formData.itemType === "text" && editingId && (
        <div className="space-y-2">
          <Label>{l({ ru: "Текст *", kk: "Мәтін *", en: "Text *" })}</Label>
          <Textarea
            placeholder={l({ ru: "Введите текст...", kk: "Мәтін енгізіңіз...", en: "Enter the text..." })}
            value={formData.content}
            onChange={(e) => setFormData(prev => ({ ...prev, content: e.target.value }))}
            rows={4}
            required
          />
        </div>
      )}

       {/* Schedule access in edit form */}
       {formData.itemType === "file" && (
         <div className="space-y-3">
           <label className="flex items-center gap-2 text-sm cursor-pointer">
             <Checkbox
               checked={formData.scheduleAccess}
                onCheckedChange={(checked) => {
                   const now = new Date();
                   const pad = (n: number) => String(n).padStart(2, '0');
                   const defaultTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
                  setFormData(prev => ({ ...prev, scheduleAccess: !!checked, availableAt: checked ? (prev.availableAt || defaultTime) : prev.availableAt }));
                }}
             />
             <Clock className="w-4 h-4" />
             {l({ ru: "Запланировать открытие доступа", kk: "Қолжетімділіктің ашылуын жоспарлау", en: "Schedule when access opens" })}
           </label>
           {formData.scheduleAccess && (
             <Input
               type="datetime-local"
               value={formData.availableAt}
               onChange={(e) => setFormData(prev => ({ ...prev, availableAt: e.target.value }))}
               min={(() => { const n = new Date(); const p = (v: number) => String(v).padStart(2,'0'); return `${n.getFullYear()}-${p(n.getMonth()+1)}-${p(n.getDate())}T${p(n.getHours())}:${p(n.getMinutes())}`; })()}
               required={formData.scheduleAccess}
             />
           )}
         </div>
       )}

        <div className="flex gap-2 pt-2">
         <Button
           type="button"
           variant="outline"
           className="flex-1"
           onClick={() => { setEditingId(null); resetForm(); }}
         >
           {t("cancel")}
         </Button>
         <Button
           type="submit"
           variant="cta"
           className="flex-1"
           disabled={updateMaterial.isPending}
         >
           {updateMaterial.isPending ? (
             <span className="flex items-center gap-2">
               <Loader2 className="w-4 h-4 animate-spin" />
               {l({ ru: "Сохранение...", kk: "Сақталуда...", en: "Saving..." })}
             </span>
           ) : (
             t("save")
           )}
         </Button>
       </div>
     </form>
   );
 
   return (
     <>
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) { onClose(); setCurrentFolderId(null); setRenamingFolder(false); } }}>
         <DialogContent mobileFullScreen className="max-w-3xl sm:w-[95vw]">
           <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {mode === "add"
                  ? (l({ ru: "Добавить материалы", kk: "Материал қосу", en: "Add materials" }))
                  : (l({ ru: "Редактировать материалы", kk: "Материалдарды өңдеу", en: "Edit the materials" }))}
              </DialogTitle>
           </DialogHeader>
 
           <div className="space-y-4 mt-4">
              {/* Breadcrumb navigation — hidden when adding to avoid duplicate "Home" label */}
              {!isAdding && (
                <>
                  {currentFolderId ? (
                    <div className="flex items-center gap-2 text-sm">
                      {!(mode === "add" && initialFolderId) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setRenamingFolder(false); setCurrentFolderId(currentFolder?.parent_id || null); }}
                            className="h-auto p-1"
                          >
                            <ChevronLeft className="w-4 h-4 mr-1" />
                            {l({ ru: "Назад", kk: "Артқа", en: "Back" })}
                          </Button>
                          <span className="text-muted-foreground">/</span>
                        </>
                      )}
                      {getBreadcrumbPath().map((folder, idx) => {
                        const isCurrent = idx === getBreadcrumbPath().length - 1;
                        return (
                          <div key={folder.id} className="flex items-center gap-2">
                            {isCurrent && renamingFolder && mode === "edit" ? (
                              <form
                                onSubmit={async (e) => {
                                  e.preventDefault();
                                  const newTitle = folderRenameValue.trim();
                                  if (!newTitle) return;
                                  try {
                                    await updateMaterial.mutateAsync({ id: folder.id, productId, title: newTitle });
                                    toast.success(l({ ru: "Сохранено", kk: "Сақталды", en: "Saved" }));
                                    setRenamingFolder(false);
                                  } catch {
                                    toast.error(l({ ru: "Ошибка", kk: "Қате", en: "Error" }));
                                  }
                                }}
                                className="flex items-center gap-1"
                              >
                                <FolderOpen className="w-4 h-4" />
                                <Input
                                  value={folderRenameValue}
                                  onChange={(e) => setFolderRenameValue(e.target.value)}
                                  autoFocus
                                  className="h-7 w-40 text-sm"
                                />
                                <Button type="submit" size="icon" variant="ghost" className="h-7 w-7" disabled={updateMaterial.isPending}>
                                  {updateMaterial.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <span className="text-xs">OK</span>}
                                </Button>
                                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRenamingFolder(false)}>
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </form>
                            ) : (
                              <>
                                <button
                                  onClick={() => setCurrentFolderId(folder.id)}
                                  className="hover:text-primary transition-colors flex items-center gap-1"
                                >
                                  <FolderOpen className="w-4 h-4" />
                                  {folder.title}
                                </button>
                                {isCurrent && mode === "edit" && (
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-6 w-6"
                                    title={l({ ru: "Переименовать папку", kk: "Қалтаның атын өзгерту", en: "Rename the folder" })}
                                    onClick={() => { setFolderRenameValue(folder.title); setRenamingFolder(true); }}
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                            {idx < getBreadcrumbPath().length - 1 && (
                              <span className="text-muted-foreground">/</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <FolderOpen className="w-4 h-4 text-primary" />
                      <span className="font-medium">{l({ ru: "Дом", kk: "Үй", en: "Home" })}</span>
                    </div>
                  )}
                </>
              )}

              {/* Add button */}
              {mode === "edit" && !isAdding && !editingId && (
                <Button onClick={() => setIsAdding(true)} variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {currentFolder
                    ? (l({ ru: `Добавить в «${currentFolder.title}»`, kk: `«${currentFolder.title}» қалтасына қосу`, en: `Add to "${currentFolder.title}"` }))
                    : (l({ ru: "Добавить в дом", kk: "Үйге қосу", en: "Add to Home" }))}
                </Button>
              )}
 
             {/* Add form */}
             {isAdding && (
               <Card>
                 <CardContent className="pt-4">
                   {renderAddForm()}
                 </CardContent>
               </Card>
             )}
 
             {/* Materials list */}
              {mode === "add" ? null : (
                <MaterialsSearchBar value={searchQuery} onChange={setSearchQuery} resultCount={materials.length} />
              )}
              {mode === "add" ? null : isLoading ? (
               <div className="flex justify-center py-8">
                 <Loader2 className="w-6 h-6 animate-spin text-primary" />
               </div>
             ) : materials.length === 0 && !isAdding ? (
               <div className="text-center py-8 text-muted-foreground">
                  {searchQuery.trim() ? (
                    <p>{l({ ru: "Ничего не найдено", kk: "Ештеңе табылмады", en: "Nothing found" })}</p>
                  ) : currentFolderId ? (
                   <>
                     <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                     <p>{l({ ru: "Папка пуста", kk: "Қалта бос", en: "The folder is empty" })}</p>
                   </>
                 ) : (
                   <>
                     <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                     <p>{l({ ru: "Материалов пока нет", kk: "Әзірге материалдар жоқ", en: "No materials yet" })}</p>
                   </>
                 )}
               </div>
             ) : (
               <div className="space-y-2">
                 {materials.map((material) => (
                    <Card 
                      key={material.id} 
                      className={`overflow-hidden ${material.type === "folder" ? "cursor-pointer hover:bg-accent/50 transition-colors" : ""}`}
                    >
                       <CardContent className="p-2 sm:p-3">
                         {editingId === material.id ? (
                           renderEditForm()
                         ) : (
                            <div 
                                className="flex flex-col gap-1.5 min-w-0 w-full"
                                onClick={() => material.type === "folder" && handleOpenFolder(material.id)}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="text-muted-foreground cursor-grab flex-shrink-0 hidden sm:block">
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    {getItemIcon(material.type)}
                                  </div>
                                  <div className="flex-1 min-w-0 overflow-hidden">
                                    <p className="font-medium text-sm truncate" title={material.title}>{material.title}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {material.type === "folder" 
                                        ? l({ ru: `Папка • ${(allMaterials as Material[]).filter(m => m.parent_id === material.id).length} элем.`, kk: `Қалта • ${(allMaterials as Material[]).filter(m => m.parent_id === material.id).length} элемент`, en: `Folder • ${countEn((allMaterials as Material[]).filter(m => m.parent_id === material.id).length, "item")}` })
                                        : material.type === "link"
                                        ? l({ ru: "Ссылка", kk: "Сілтеме", en: "Link" })
                                        : material.type === "text"
                                        ? l({ ru: "Текст", kk: "Мәтін", en: "Text" })
                                        : `${l({ ru: "Файл • уч:", kk: "Файл • оқушы:", en: "File • student:" })} ${material.allow_download !== false ? l({ ru: "скач.", kk: "жүктеу", en: "download" }) : '—'} • ${l({ ru: "учит:", kk: "мұғалім:", en: "teacher:" })} ${material.teacher_allow_download !== false ? l({ ru: "скач.", kk: "жүктеу", en: "download" }) : '—'}${material.available_at ? ` • 🕐 ${new Date(material.available_at).toLocaleDateString(localeTag(language), { day: '2-digit', month: '2-digit' })} ${new Date(material.available_at).toLocaleTimeString(localeTag(language), { hour: '2-digit', minute: '2-digit' })}` : ''}`
                                      }
                                   </p>
                                 </div>
                                </div>
                               <div className="flex gap-0.5 justify-end w-full" onClick={(e) => e.stopPropagation()}>
                                {material.type === "link" && material.file_url && (
                                  <a
                                    href={material.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 sm:h-8 sm:w-8"
                                    title={l({ ru: "Открыть ссылку", kk: "Сілтемені ашу", en: "Open the link" })}
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  </a>
                                )}
                                {material.type === "file" && material.file_url && (() => {
                                  const dlUrl = getFileUrl(material, 'download');
                                  const vUrl = getFileUrl(material, 'view');
                                  const needsOffice = isOfficeDocument(material.title) && isS3Path(material.file_url!);
                                  return (
                                    <>
                                      {dlUrl && (
                                        <a
                                          href={dlUrl}
                                          className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 sm:h-8 sm:w-8"
                                          title={l({ ru: "Скачать", kk: "Жүктеу", en: "Download" })}
                                        >
                                          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </a>
                                      )}
                                      {vUrl ? (
                                        <a
                                          href={vUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 sm:h-8 sm:w-8"
                                          title={l({ ru: "Открыть в браузере", kk: "Браузерде ашу", en: "Open in the browser" })}
                                        >
                                          <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </a>
                                      ) : needsOffice ? (
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-7 w-7 sm:h-8 sm:w-8"
                                          onClick={() => handleOfficeView(material)}
                                          title={l({ ru: "Открыть в браузере", kk: "Браузерде ашу", en: "Open in the browser" })}
                                        >
                                          <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </Button>
                                      ) : null}
                                    </>
                                  );
                                })()}
                                 <Button
                                   variant="ghost"
                                   size="icon"
                                   className="h-7 w-7 sm:h-8 sm:w-8"
                                   onClick={() => material.type === "folder" ? handleOpenFolder(material.id) : handleEdit(material)}
                                 >
                                   <Edit className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                 </Button>
                                 <Button
                                   variant="ghost"
                                   size="icon"
                                   className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
                                   onClick={() => setDeletingMaterial({ id: material.id, title: material.title, file_url: material.file_url })}
                                 >
                                   <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                 </Button>
                               </div>
                             </div>
                        )}
                     </CardContent>
                   </Card>
                 ))}
               </div>
             )}
           </div>
         </DialogContent>
       </Dialog>
 
       {/* Delete confirmation */}
       <AlertDialog open={!!deletingMaterial} onOpenChange={(open) => { if (!open) setDeletingMaterial(null); }}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>{l({ ru: "Удалить?", kk: "Жою керек пе?", en: "Delete?" })}</AlertDialogTitle>
             <AlertDialogDescription>
               {l({ ru: `Вы уверены, что хотите удалить "${deletingMaterial?.title ?? ""}"?`, kk: `"${deletingMaterial?.title ?? ""}" шынымен жойғыңыз келе ме?`, en: `Are you sure you want to delete "${deletingMaterial?.title ?? ""}"?` })}
               {(allMaterials as Material[]).find(m => m.id === deletingMaterial?.id)?.type === "folder" && 
                 l({ ru: " Все файлы внутри папки также будут удалены.", kk: " Қалтадағы барлық файл да жойылады.", en: " All files inside the folder will be deleted too." })
               }
             </AlertDialogDescription>
           </AlertDialogHeader>
           <AlertDialogFooter>
             <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
             <AlertDialogAction
               onClick={handleDelete}
               className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
             >
               {deleteMaterial.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t("delete")}
             </AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>

     </>
   );
 };
 
 export default ProductMaterialsManager;