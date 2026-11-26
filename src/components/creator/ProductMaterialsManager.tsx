import { useState, useMemo, useCallback, useEffect } from "react";
import MaterialAddForm from "@/components/materials/MaterialAddForm";
import MaterialScheduleControl from "@/components/materials/MaterialScheduleControl";

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
import { useProductMaterials, useUpdateMaterial, useDeleteMaterial } from "@/hooks/useMaterials";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, FileText, Folder, Trash2, Edit, Loader2, GripVertical, ChevronLeft, FolderOpen, Download, X, Link as LinkIcon, Type } from "lucide-react";
import { ExternalLink } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { requestMaterialToken, buildProxyUrl } from "@/lib/materialToken";
import { isS3Path, isOfficeDocument, buildS3RedirectUrl, buildStorageRedirectUrl, parseStoragePath } from "@/lib/fileRedirect";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { localMaterialDateTime, scheduledMaterialDate } from "@/lib/materialDraft";
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
 
interface FormData {
   title: string;
   itemType: ItemType;
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
   const updateMaterial = useUpdateMaterial();
   const deleteMaterial = useDeleteMaterial();
   
   const [isAdding, setIsAdding] = useState(false);
   const [editingId, setEditingId] = useState<string | null>(null);
   const [deletingMaterial, setDeletingMaterial] = useState<{ id: string; title: string; file_url?: string | null } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [folderRenameValue, setFolderRenameValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [addTargetFolderId, setAddTargetFolderId] = useState<string | null>(null);

    const [formData, setFormData] = useState<FormData>({
      title: "",
      itemType: "file",
      allow_download: true,
      teacher_allow_download: false,
      scheduleAccess: false,
      availableAt: "",
      linkUrl: "",
      content: "",
    });

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
      setFormData({ title: "", itemType: "file", allow_download: true, teacher_allow_download: false, scheduleAccess: false, availableAt: "", linkUrl: "", content: "" });
    };
 
     const handleEdit = (material: Material) => {
       setEditingId(material.id);
        setFormData({
          title: material.title,
          itemType: (material.type === "folder" || material.type === "link" || material.type === "text") ? material.type as ItemType : "file",
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
            ...((formData.itemType === "file" || formData.itemType === "link") ? { available_at: scheduledMaterialDate(formData.scheduleAccess, formData.availableAt) } : {}),
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
            <p className="text-xs font-medium text-muted-foreground">Для покупателя</p>
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


       {(formData.itemType === "file" || formData.itemType === "link") && (
         <MaterialScheduleControl enabled={formData.scheduleAccess} value={formData.availableAt}
           onChange={(scheduleAccess, availableAt) => setFormData(previous => ({ ...previous, scheduleAccess, availableAt }))} />
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
 
   const closeWindow = () => {
     if (isUploading) return;
     resetForm();
     setIsAdding(false);
     setEditingId(null);
     setCurrentFolderId(null);
     onClose();
   };

   const addingMode = mode === "add" || isAdding;

   return (
    <TooltipProvider delayDuration={250}>
     <>
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeWindow(); }}>
        <DialogContent
          mobileFullScreen={!addingMode}
          hideCloseButton
          onPointerDownOutside={event => event.preventDefault()}
          onInteractOutside={event => event.preventDefault()}
          onEscapeKeyDown={event => event.preventDefault()}
          className={addingMode
            ? "flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl min-w-0 flex-col overflow-hidden rounded-lg p-4 sm:w-[95vw] sm:p-6"
            : "max-w-3xl sm:w-[95vw]"}
        >
           <Tooltip><TooltipTrigger asChild>
             <Button type="button" variant="ghost" size="icon" aria-label="Закрыть окно" disabled={isUploading} onClick={closeWindow} className="absolute right-3 top-3 h-8 w-8 min-h-0"><X className="h-4 w-4" /></Button>
           </TooltipTrigger><TooltipContent side="left" align="start" sideOffset={8}>Изменения не сохранятся</TooltipContent></Tooltip>
           <DialogHeader>
              <DialogTitle className="flex items-center gap-2 pr-8">
                {addingMode
                  ? (language === "kk" ? "Материал қосу" : "Добавить материалы")
                  : (language === "kk" ? "Материалдарды өңдеу" : "Редактировать материалы")}
              </DialogTitle>
           </DialogHeader>
 
           <div className={isAdding ? "flex min-h-0 min-w-0 flex-col" : "min-w-0 space-y-4 mt-4"}>
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
                      <span className="font-medium">{language === "kk" ? "Үй" : "Главная"}</span>
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
                    : (language === "kk" ? "Үйге қосу" : "Добавить на главную")}
                </Button>
              )}
 
             {/* Add form */}
             {isAdding && (
               <MaterialAddForm productId={productId} parentId={addTargetFolderId} materials={allMaterials}
                 onBusyChange={setIsUploading} onComplete={() => { setIsAdding(false); if (mode === "add") onClose(); }} />
             )}
 
             {/* Materials list */}
              {addingMode ? null : (
                <MaterialsSearchBar value={searchQuery} onChange={setSearchQuery} resultCount={materials.length} />
              )}
              {addingMode ? null : isLoading ? (
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
