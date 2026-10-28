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
import { Plus, FileText, Folder, Trash2, Edit, Loader2, Upload, GripVertical, ChevronLeft, FolderOpen, Download, X, Clock, Link as LinkIcon, Type, Clipboard } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { requestMaterialToken, buildProxyUrl } from "@/lib/materialToken";
import { isS3Path, isOfficeDocument, buildS3RedirectUrl, buildStorageRedirectUrl, parseStoragePath } from "@/lib/fileRedirect";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { nextMaterialOrder, localMaterialDateTime, scheduledMaterialDate } from "@/lib/materialDraft";
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
    type: "file" | "video" | "text" | "folder" | "link";
    content: string | null;
    file_url: string | null;
    cover_url?: string | null;
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
  id: string;
  scheduleAccess: boolean;
  availableAt: string;
  uploadedUrl?: string;
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
   const { t, language } = useLanguage();
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
  const [confirmClose, setConfirmClose] = useState(false);
  const submissionRef = useRef(false);
  const createdFolderRef = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addTargetFolderId, setAddTargetFolderId] = useState<string | null>(null);

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
      id: crypto.randomUUID(),
      scheduleAccess: false,
      availableAt: "",
      file,
      customName: file.name,
      permissions: { allow_download: true, teacher_allow_download: false }
    }));
    setFormData(prev => ({
      ...prev,
      fileEntries: [...prev.fileEntries, ...newEntries]
    }));
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
      createdFolderRef.current = null;
    };
 
    const handleAdd = async (e: React.FormEvent) => {
      e.preventDefault();
      if (submissionRef.current) return;
      if (formData.itemType === "folder" && !formData.title.trim()) { toast.error("Введите название папки"); return; }
      if (formData.itemType === "file" && !formData.fileEntries.length) { toast.error("Выберите файл(ы)"); return; }
      if (formData.itemType === "link" && !formData.linkUrl.trim()) { toast.error("Введите ссылку или текст"); return; }
      if (formData.itemType === "text" && !formData.content.trim()) { toast.error("Введите текст"); return; }
      try {
        // Validate every file before any upload or insertion.
        const entries = formData.fileEntries.map(entry => ({
          ...entry, available_at: scheduledMaterialDate(entry.scheduleAccess, entry.availableAt),
        }));
        submissionRef.current = true;
        setIsUploading(true);
        setUploadProgress(0);
        for (const entry of entries) {
          if (!entry.uploadedUrl) {
            entry.uploadedUrl = await uploadMaterialFile(entry.file, productId, setUploadProgress);
            setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.map(item => item.id === entry.id ? { ...item, uploadedUrl: entry.uploadedUrl } : item) }));
          }
        }
        const order = nextMaterialOrder(allMaterials, addTargetFolderId);
        if (formData.itemType === "link" || formData.itemType === "text") {
          const raw = (formData.itemType === "link" ? formData.linkUrl : formData.content).trim();
          const isUrl = formData.itemType === "link" && (/^(https?:\/\/|\/\/)/i.test(raw) || /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw));
          const normalized = isUrl && !/^(https?:\/\/|\/\/)/i.test(raw) ? `https://${raw}` : raw;
          await createMaterial.mutateAsync({
            product_id: productId, title: formData.title.trim() || (isUrl ? normalized : normalized.slice(0, 80)),
            type: isUrl ? "link" : "text", content: isUrl ? null : raw,
            file_url: isUrl ? normalized : null, parent_id: addTargetFolderId, order_index: order,
          });
          toast.success(isUrl ? "Ссылка добавлена!" : "Текст добавлен!");
        } else {
          let parentId = addTargetFolderId;
          if (formData.itemType === "folder") {
            if (!createdFolderRef.current) {
              const folder = await createMaterial.mutateAsync({
                product_id: productId, title: formData.title.trim(), type: "folder",
                parent_id: parentId, order_index: order,
              });
              createdFolderRef.current = folder.id;
            }
            parentId = createdFolderRef.current;
          }
          const startIndex = nextMaterialOrder(allMaterials, parentId);
          for (const [index, entry] of entries.entries()) {
            await createMaterial.mutateAsync({
              product_id: productId, title: entry.customName.trim() || entry.file.name, type: "file",
              file_url: entry.uploadedUrl, order_index: startIndex + index, parent_id: parentId,
              allow_view: true, allow_download: entry.permissions.allow_download,
              teacher_allow_download: entry.permissions.teacher_allow_download,
              available_at: entry.available_at, file_size: entry.file.size,
            });
            // A partially successful batch can be retried without duplicating saved files.
            setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.filter(item => item.id !== entry.id) }));
          }
          toast.success(formData.itemType === "folder" ? `Папка "${formData.title.trim()}" создана!` : entries.length > 1 ? "Файлы добавлены!" : "Файл добавлен!");
        }
        setIsAdding(false);
        resetForm();
        if (mode === "add") onClose();
      } catch (err) {
        toast.error(`Ошибка при добавлении: ${err instanceof Error ? err.message : "Попробуйте ещё раз"}`);
      } finally {
        submissionRef.current = false;
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
          availableAt: material.available_at ? localMaterialDateTime(new Date(material.available_at)) : "",
          linkUrl: material.type === "link" ? (material.file_url || "") : "",
          content: material.type === "text" ? (material.content || "") : "",
        });
     };
 
    const handleUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingId || !formData.title) return;
       try {
          const updateData: Partial<Material> & { id: string; productId: string } = {
            id: editingId,
            productId: productId,
            title: formData.title,
            allow_view: true,
            allow_download: formData.allow_download,
            teacher_allow_download: false,
            ...(formData.itemType === "file" ? { available_at: scheduledMaterialDate(formData.scheduleAccess, formData.availableAt) } : {}),
          };

          if (formData.itemType === "link") {
            updateData.file_url = formData.linkUrl;
          }
          if (formData.itemType === "text") {
            updateData.content = formData.content;
          }

          await updateMaterial.mutateAsync(updateData);
  
       toast.success("Изменения сохранены!");
        setEditingId(null);
        resetForm();
      } catch (err) {
        console.error(err);
        toast.error("Ошибка при обновлении");
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
       toast.success("Удалено!");
       setDeletingMaterial(null);
     } catch (err) {
       console.error(err);
       toast.error("Ошибка при удалении");
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
    const loadingToast = toast.loading("Подготовка файла...");
    try {
      const token = await requestMaterialToken(material.file_url, 'creator');
      const proxyUrl = buildProxyUrl(token);
      const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(proxyUrl)}`;
      window.open(viewerUrl, '_blank');
    } catch (err) {
      console.error('Error opening office doc:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Ошибка: ${errMsg}`);
    } finally {
      toast.dismiss(loadingToast);
    }
  }, []);

   const renderAddForm = () => (
     <form onSubmit={handleAdd} className="space-y-4">
      <fieldset disabled={isUploading} className="min-w-0 space-y-4">
       <div className="space-y-3">
          <RadioGroup
            value={formData.itemType}
            onValueChange={(value: ItemType) => setFormData(prev => ({ ...prev, itemType: value, files: [], fileEntries: [] }))}
            className="flex flex-nowrap justify-between gap-2 sm:justify-start sm:gap-4"
            aria-label={language === "kk" ? "Қосу түрі" : "Тип добавления"}
          >
            <div className="flex items-center gap-1 sm:gap-2">
              <RadioGroupItem value="file" id="type-file" />
              <Label htmlFor="type-file" className="cursor-pointer flex items-center gap-1.5 whitespace-nowrap text-sm sm:text-base">
                <FileText className="hidden h-4 w-4 min-[360px]:block" />
                Файл
              </Label>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <RadioGroupItem value="folder" id="type-folder" />
              <Label htmlFor="type-folder" className="cursor-pointer flex items-center gap-1.5 whitespace-nowrap text-sm sm:text-base">
                <Folder className="hidden h-4 w-4 min-[360px]:block" />
                Папка
              </Label>
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <RadioGroupItem value="link" id="type-link" />
              <Label htmlFor="type-link" className="cursor-pointer flex items-center gap-1.5 whitespace-nowrap text-sm sm:text-base">
                <LinkIcon className="hidden h-4 w-4 min-[360px]:block" />
                {language === "kk" ? "Сілтеме" : "Ссылка"}
              </Label>
            </div>
          </RadioGroup>
        </div>
  
        {formData.itemType === "folder" && (
          <div className="space-y-2">
            <Label htmlFor="material-folder-title">Название папки <span className="text-primary">*</span></Label>
            <Input
              id="material-folder-title"
              placeholder="Введите название"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              required
            />
          </div>
        )}

        {formData.itemType === "link" && (
          <>
          <div className="space-y-2">
              <Label htmlFor="material-link-title">Название</Label>
              <Input
                id="material-link-title"
                placeholder={language === "kk" ? "Бос болса — сілтеменің өзі көрсетіледі" : "Если пусто — показывается сама ссылка"}
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="material-link-url">{language === "kk" ? "Сілтеме" : "Ссылка"} <span className="text-primary">*</span></Label>
              <Textarea id="material-link-url"
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
              ? "Файлы в папку"
              : "Выберите файл(ы)"}
            {formData.itemType === "file" && <span className="text-primary"> *</span>}
          </Label>
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
                   {formData.fileEntries.length > 0 ? "Добавить ещё файл(ы) — нажмите, перетащите или вставьте (Ctrl+V)" : "Нажмите, перетащите или вставьте (Ctrl+V) файл(ы)"}
                 </p>
               </div>
             </ContextMenuTrigger>
             <ContextMenuContent>
               <ContextMenuItem onSelect={() => fileInputRef.current?.click()}>
                 <FolderOpen className="w-4 h-4 mr-2" />
                 Выбрать (из компьютера)
               </ContextMenuItem>
               <ContextMenuItem
                 onSelect={async () => {
                   try {
                     const anyNav = navigator as unknown as { clipboard?: { read?: () => Promise<Array<{ types: string[]; getType: (t: string) => Promise<Blob> }>> } };
                     const items = await anyNav.clipboard?.read?.();
                     if (!items) { toast.error("Буфер обмена недоступен"); return; }
                     const files: File[] = [];
                     for (const item of items) {
                       const type = item.types.find((t) => t !== "text/plain" && t !== "text/html") || item.types[0];
                       if (!type) continue;
                       const blob = await item.getType(type);
                       const ext = type.split("/")[1] || "bin";
                       files.push(new File([blob], `pasted-${Date.now()}.${ext}`, { type }));
                     }
                     if (files.length > 0) addFilesToForm(files);
                     else toast.error("В буфере обмена нет файлов");
                   } catch {
                     toast.error("Не удалось прочитать буфер. Используйте Cmd+V");
                   }
                 }}
               >
                 <Clipboard className="w-4 h-4 mr-2" />
                 Вставить
               </ContextMenuItem>
             </ContextMenuContent>
           </ContextMenu>
        <div className="space-y-3">
          {formData.fileEntries.map((entry, index) => (
            <div key={entry.id} className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-stretch gap-2">
                <FileText className="mt-2 h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1 space-y-3">
                  <Input aria-label={`Название файла ${index + 1}`} placeholder={entry.file.name} value={entry.customName}
                    onChange={e => setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.map(item => item.id === entry.id ? { ...item, customName: e.target.value } : item) }))} />
                  <p className="text-xs text-muted-foreground">Для ученика:</p>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2"><Download className="h-4 w-4" />Возможность скачать</span>
                    <Switch checked={entry.permissions.allow_download} onCheckedChange={checked => setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.map(item => item.id === entry.id ? { ...item, permissions: { ...item.permissions, allow_download: checked } } : item) }))} />
                  </label>
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2"><Clock className="h-4 w-4" />Запланировать добавление</span>
                    <Switch checked={entry.scheduleAccess} onCheckedChange={checked => setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.map(item => item.id === entry.id ? { ...item, scheduleAccess: checked, availableAt: item.availableAt || localMaterialDateTime() } : item) }))} />
                  </label>
                  {entry.scheduleAccess && <Input aria-label={`Дата и время добавления файла ${index + 1}`} type="datetime-local" className="min-w-0 max-w-full" value={entry.availableAt}
                    onChange={e => setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.map(item => item.id === entry.id ? { ...item, availableAt: e.target.value } : item) }))} required />}
                </div>
                <Tooltip><TooltipTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Убрать файл?" className="h-8 w-8 min-h-0 shrink-0 self-center text-muted-foreground hover:bg-primary hover:text-white"
                    onClick={() => setFormData(prev => ({ ...prev, fileEntries: prev.fileEntries.filter(item => item.id !== entry.id) }))}><X className="h-4 w-4" /></Button>
                </TooltipTrigger><TooltipContent side="left">Убрать файл?</TooltipContent></Tooltip>
              </div>
            </div>
          ))}
        </div>
        </div>}

      </fieldset>
        <div className="flex justify-center pt-2">
         <Button
           type="submit"
           variant="cta"
           className="w-full"
           disabled={isUploading || createMaterial.isPending}
         >
            {(isUploading || createMaterial.isPending) ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isUploading && uploadProgress > 0 ? `${uploadProgress}%` : 'Загрузка...'}
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
         <Label>Название <span className="text-primary">*</span></Label>
         <Input
           placeholder={formData.title || "Введите название"}
           value={formData.title}
           onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
           required
         />
       </div>
 
      {formData.itemType === "file" && (
        <div className="space-y-3">
          <Label>Доступ</Label>
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Для ученика:</p>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span>Возможность скачать</span>
              <Switch checked={formData.allow_download} onCheckedChange={checked => setFormData(prev => ({ ...prev, allow_download: checked }))} />
            </label>
           </div>
         </div>
       )}

      {formData.itemType === "link" && editingId && (
        <div className="space-y-2">
          <Label>URL ссылки <span className="text-primary">*</span></Label>
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
          <Label>Текст *</Label>
          <Textarea
            placeholder="Введите текст..."
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
           <label className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm cursor-pointer">
             <span className="flex items-center gap-2">
               <Clock className="w-4 h-4" />
               {language === "kk" ? "Қолжетімділікті ашуды жоспарлау" : "Запланировать добавление"}
             </span>
             <Switch
               checked={formData.scheduleAccess}
                onCheckedChange={(checked) => {
                   const now = new Date();
                   const pad = (n: number) => String(n).padStart(2, '0');
                   const defaultTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
                  setFormData(prev => ({ ...prev, scheduleAccess: checked, availableAt: checked ? (prev.availableAt || defaultTime) : prev.availableAt }));
                }}
             />
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
               Сохранение...
             </span>
           ) : (
             t("save")
           )}
         </Button>
       </div>
     </form>
   );
 
   return (
    <TooltipProvider delayDuration={250}>
     <>
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !isUploading) setConfirmClose(true); }}>
        <DialogContent
          mobileFullScreen={mode !== "add"}
          hideCloseButton
          onPointerDownOutside={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => event.preventDefault()}
          className={mode === "add"
            ? "max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl min-w-0 overflow-x-hidden overflow-y-auto rounded-lg p-4 sm:w-[95vw] sm:p-6"
            : "max-w-3xl sm:w-[95vw]"}
        >
           <Tooltip><TooltipTrigger asChild>
             <Button type="button" variant="ghost" size="icon" aria-label="Закрыть окно" disabled={isUploading} onClick={() => setConfirmClose(true)} className="absolute right-3 top-3 h-8 w-8 min-h-0"><X className="h-4 w-4" /></Button>
           </TooltipTrigger><TooltipContent side="bottom">Закрыть окно</TooltipContent></Tooltip>
           <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                {mode === "add"
                  ? (language === "kk" ? "Материал қосу" : "Добавить материалы")
                  : (language === "kk" ? "Материалдарды өңдеу" : "Редактировать материалы")}
              </DialogTitle>
           </DialogHeader>
 
           <div className="min-w-0 space-y-4 mt-4">
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
                            Назад
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
                                    toast.success(language === "kk" ? "Сақталды" : "Сохранено");
                                    setRenamingFolder(false);
                                  } catch {
                                    toast.error("Ошибка");
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
                                    title={language === "kk" ? "Қалтаның атын өзгерту" : "Переименовать папку"}
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
                      <span className="font-medium">{language === "kk" ? "Үй" : "Дом"}</span>
                    </div>
                  )}
                </>
              )}

              {/* Add button */}
              {mode === "edit" && !isAdding && !editingId && (
                <Button onClick={() => setIsAdding(true)} variant="outline" className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {currentFolder
                    ? (language === "kk" ? `«${currentFolder.title}» қалтасына қосу` : `Добавить в «${currentFolder.title}»`)
                    : (language === "kk" ? "Үйге қосу" : "Добавить в дом")}
                </Button>
              )}
 
             {/* Add form */}
             {isAdding && (
               <Card>
                 <CardContent className="p-3 sm:p-6">
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
                    <p>{language === "kk" ? "Ештеңе табылмады" : "Ничего не найдено"}</p>
                  ) : currentFolderId ? (
                   <>
                     <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
                     <p>Папка пуста</p>
                   </>
                 ) : (
                   <>
                     <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                     <p>Материалов пока нет</p>
                   </>
                 )}
               </div>
             ) : (
               <div className="space-y-2">
                 {materials.map((material) => (
                    <Card 
                      key={material.id} 
                      className={`overflow-hidden transition-colors hover:bg-muted/70 ${material.type === "folder" ? "cursor-pointer" : ""}`}
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
                                        ? `Папка • ${(allMaterials as Material[]).filter(m => m.parent_id === material.id).length} элем.`
                                        : material.type === "link"
                                        ? "Ссылка"
                                        : material.type === "text"
                                        ? "Текст"
                                        : `Файл • уч: ${material.allow_download !== false ? 'скач.' : '—'} • учит: ${material.teacher_allow_download !== false ? 'скач.' : '—'}${material.available_at ? ` • 🕐 ${new Date(material.available_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} ${new Date(material.available_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}`
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
                                    title="Открыть ссылку"
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
                                          title="Скачать"
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
                                          title="Открыть в браузере"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        </a>
                                      ) : needsOffice ? (
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="h-7 w-7 sm:h-8 sm:w-8"
                                          onClick={() => handleOfficeView(material)}
                                          title="Открыть в браузере"
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
                                   className="h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
 
       <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}>
         <AlertDialogContent>
           <AlertDialogHeader><AlertDialogTitle>Вы точно хотите закрыть?</AlertDialogTitle>
             <AlertDialogDescription>Изменения не сохранятся</AlertDialogDescription></AlertDialogHeader>
           <AlertDialogFooter><AlertDialogCancel>Остаться</AlertDialogCancel>
             <AlertDialogAction onClick={() => { resetForm(); setIsAdding(false); setEditingId(null); setCurrentFolderId(null); onClose(); }}>Закрыть</AlertDialogAction>
           </AlertDialogFooter>
         </AlertDialogContent>
       </AlertDialog>
       {/* Delete confirmation */}
       <AlertDialog open={!!deletingMaterial} onOpenChange={(open) => { if (!open) setDeletingMaterial(null); }}>
         <AlertDialogContent>
           <AlertDialogHeader>
             <AlertDialogTitle>Удалить?</AlertDialogTitle>
             <AlertDialogDescription>
               Вы уверены, что хотите удалить "{deletingMaterial?.title}"? 
               {(allMaterials as Material[]).find(m => m.id === deletingMaterial?.id)?.type === "folder" && 
                 " Все файлы внутри папки также будут удалены."
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
    </TooltipProvider>
   );
 };
 
 export default ProductMaterialsManager;
