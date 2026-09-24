import { useState, useRef, useMemo, useCallback } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
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
  useTeacherOwnMaterials,
  useCreateTeacherMaterial,
  useUpdateTeacherMaterial,
  useDeleteTeacherMaterial,
  uploadTeacherMaterialFile,
} from "@/hooks/useTeacherMaterials";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, FileText, Folder, Trash2, Edit, Loader2, Upload, ChevronLeft, FolderOpen, Download, X, ExternalLink, Link as LinkIcon, Type } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { requestMaterialToken, buildProxyUrl } from "@/lib/materialToken";
import { isS3Path, isOfficeDocument, buildS3RedirectUrl, buildStorageRedirectUrl, parseStoragePath } from "@/lib/fileRedirect";
import { Checkbox } from "@/components/ui/checkbox";
import MaterialsSearchBar from "@/components/materials/MaterialsSearchBar";

interface TeacherMaterialsManagerProps {
  teacherId: string;
  productId: string;
  productTitle: string;
}

type ItemType = "file" | "folder" | "link" | "text";

interface Material {
  id: string;
  product_id: string;
  teacher_id: string;
  title: string;
  type: string;
  content: string | null;
  file_url: string | null;
  order_index: number;
  created_at: string;
  parent_id?: string | null;
  allow_view?: boolean;
  allow_download?: boolean;
}

interface FilePermission {
  allow_download: boolean;
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
  linkUrl: string;
  content: string;
}

// isOfficeDocument is now imported from fileRedirect

const TeacherMaterialsManager = ({ teacherId, productId, productTitle }: TeacherMaterialsManagerProps) => {
  const { language, l } = useLanguage();
  const { data: allMaterials = [], isLoading } = useTeacherOwnMaterials(teacherId, [productId]);
  const createMaterial = useCreateTeacherMaterial();
  const updateMaterial = useUpdateTeacherMaterial();
  const deleteMaterial = useDeleteTeacherMaterial();
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState<{ id: string; title: string; file_url?: string | null } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  
  
  const [formData, setFormData] = useState<FormData>({
    title: "",
    itemType: "file",
    files: [],
    filePermissions: [],
    fileEntries: [],
    allow_download: true,
    linkUrl: "",
    content: "",
  });

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

  const resetForm = () => {
    setFormData({ title: "", itemType: "file", files: [], filePermissions: [], fileEntries: [], allow_download: true, linkUrl: "", content: "" });
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

    if (formData.itemType === "link" && (!formData.title || !formData.linkUrl)) {
      toast.error(l({ ru: "Введите название и URL ссылки", kk: "Атау мен URL енгізіңіз", en: "Enter the title and the link URL" }));
      return;
    }

    if (formData.itemType === "text" && (!formData.title || !formData.content)) {
      toast.error(l({ ru: "Введите название и текст", kk: "Атау мен мәтін енгізіңіз", en: "Enter the title and the text" }));
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);

      if (formData.itemType === "link") {
        await createMaterial.mutateAsync({
          product_id: productId,
          teacher_id: teacherId,
          title: formData.title,
          type: "link",
          content: null,
          file_url: formData.linkUrl,
          order_index: materials.length,
          parent_id: currentFolderId,
        });
        toast.success(l({ ru: "Ссылка добавлена!", kk: "Сілтеме қосылды!", en: "Link added!" }));
      } else if (formData.itemType === "text") {
        await createMaterial.mutateAsync({
          product_id: productId,
          teacher_id: teacherId,
          title: formData.title,
          type: "text",
          content: formData.content,
          file_url: null,
          order_index: materials.length,
          parent_id: currentFolderId,
        });
        toast.success(l({ ru: "Текст добавлен!", kk: "Мәтін қосылды!", en: "Text added!" }));
      } else if (formData.itemType === "folder") {
        const folder = await createMaterial.mutateAsync({
          product_id: productId,
          teacher_id: teacherId,
          title: formData.title,
          type: "folder",
          content: null,
          file_url: null,
          order_index: materials.length,
          parent_id: currentFolderId,
        });

        if (formData.fileEntries.length > 0) {
          for (let i = 0; i < formData.fileEntries.length; i++) {
            const entry = formData.fileEntries[i];
            const fileUrl = await uploadTeacherMaterialFile(entry.file, productId, teacherId, (p) => setUploadProgress(p));
            await createMaterial.mutateAsync({
              product_id: productId,
              teacher_id: teacherId,
              title: entry.customName || entry.file.name,
              type: "file",
              content: null,
              file_url: fileUrl,
              order_index: i,
              parent_id: folder.id,
              allow_view: true,
              allow_download: entry.permissions.allow_download,
            });
          }
        }

        toast.success(l({ ru: `Папка "${formData.title}" создана!`, kk: `"${formData.title}" қалтасы жасалды!`, en: `The "${formData.title}" folder was created!` }));
      } else {
        for (let i = 0; i < formData.fileEntries.length; i++) {
          const entry = formData.fileEntries[i];
          const fileUrl = await uploadTeacherMaterialFile(entry.file, productId, teacherId, (p) => setUploadProgress(p));
          await createMaterial.mutateAsync({
            product_id: productId,
            teacher_id: teacherId,
            title: entry.customName || entry.file.name,
            type: "file",
            content: null,
            file_url: fileUrl,
            order_index: materials.length + i,
            parent_id: currentFolderId,
            allow_view: true,
            allow_download: entry.permissions.allow_download,
          });
        }
        const several = formData.fileEntries.length > 1;
        toast.success(
          l({
            ru: several ? "Файлы добавлены!" : "Файл добавлен!",
            kk: several ? "Файлдар қосылды!" : "Файл қосылды!",
            en: several ? "Files added!" : "File added!",
          }),
        );
      }

      setIsAdding(false);
      resetForm();
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
        teacherId: teacherId,
        title: formData.title,
        allow_view: true,
        allow_download: formData.allow_download,
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
        teacherId: teacherId,
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
      return buildS3RedirectUrl(material.file_url, 'teacher', teacherId, action === 'download' ? material.title : undefined);
    } else {
      const path = parseStoragePath(material.file_url);
      if (!path) return null;
      return buildStorageRedirectUrl(path, action === 'download' ? material.title : undefined);
    }
  }, [teacherId]);

  const handleOfficeView = useCallback(async (material: Material) => {
    if (!material.file_url) return;
    const loadingToast = toast.loading(l({ ru: "Подготовка файла...", kk: "Файл дайындалуда...", en: "Preparing the file..." }));
    try {
      const token = await requestMaterialToken(material.file_url, 'teacher');
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
  }, [language]);

  const getAccessLabel = (material: Material) => {
    const canDownload = material.allow_download !== false;
    return canDownload 
      ? (l({ ru: "скачивание разрешено", kk: "жүктеуге рұқсат", en: "downloading allowed" })) 
      : (l({ ru: "только просмотр", kk: "тек көру", en: "view only" }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with product title and navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentFolderId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentFolderId(currentFolder?.parent_id || null)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
          )}
          <h4 className="font-medium text-sm">
            {currentFolder ? currentFolder.title : productTitle}
          </h4>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            resetForm();
          }}
          disabled={isAdding || !!editingId}
        >
          <Plus className="w-4 h-4 mr-1" />
          {l({ ru: "Добавить", kk: "Қосу", en: "Add" })}
        </Button>
      </div>

      {/* Add Form */}
      {isAdding && (
        <Card>
          <CardContent className="p-4">
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-3">
                <Label>{l({ ru: "Что добавить?", kk: "Нені қосу керек?", en: "What would you like to add?" })}</Label>
                <RadioGroup
                  value={formData.itemType}
                  onValueChange={(value: ItemType) => setFormData(prev => ({ ...prev, itemType: value, files: [], fileEntries: [] }))}
                  className="flex flex-wrap gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="file" id="teacher-type-file" />
                    <Label htmlFor="teacher-type-file" className="cursor-pointer flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {l({ ru: "Файл", kk: "Файл", en: "File" })}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="folder" id="teacher-type-folder" />
                    <Label htmlFor="teacher-type-folder" className="cursor-pointer flex items-center gap-2">
                      <Folder className="w-4 h-4" />
                      {l({ ru: "Папка", kk: "Қалта", en: "Folder" })}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="link" id="teacher-type-link" />
                    <Label htmlFor="teacher-type-link" className="cursor-pointer flex items-center gap-2">
                      <LinkIcon className="w-4 h-4" />
                      {l({ ru: "Ссылка", kk: "Сілтеме", en: "Link" })}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="text" id="teacher-type-text" />
                    <Label htmlFor="teacher-type-text" className="cursor-pointer flex items-center gap-2">
                      <Type className="w-4 h-4" />
                      {l({ ru: "Текст", kk: "Мәтін", en: "Text" })}
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {formData.itemType === "folder" && (
                <div className="space-y-2">
                  <Label>{l({ ru: "Название папки *", kk: "Қалта атауы *", en: "Folder name *" })}</Label>
                  <Input
                    placeholder={l({ ru: "Введите название", kk: "Атауын енгізіңіз", en: "Enter a title" })}
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
              )}

              {formData.itemType === "link" && (
                <>
                  <div className="space-y-2">
                    <Label>{l({ ru: "Название *", kk: "Атауы *", en: "Title *" })}</Label>
                    <Input
                      placeholder={l({ ru: "Введите название ссылки", kk: "Сілтеме атауын енгізіңіз", en: "Enter the link title" })}
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{l({ ru: "URL ссылки *", kk: "URL сілтемесі *", en: "Link URL *" })}</Label>
                    <Input
                      placeholder="https://..."
                      value={formData.linkUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, linkUrl: e.target.value }))}
                      required
                    />
                  </div>
                </>
              )}

              {formData.itemType === "text" && (
                <>
                  <div className="space-y-2">
                    <Label>{l({ ru: "Название *", kk: "Атауы *", en: "Title *" })}</Label>
                    <Input
                      placeholder={l({ ru: "Введите название", kk: "Атауын енгізіңіз", en: "Enter a title" })}
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
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
                </>
              )}

              {(formData.itemType === "file" || formData.itemType === "folder") && <div className="space-y-2">
                <Label>
                  {formData.itemType === "folder" 
                    ? (l({ ru: "Файлы в папку (опционально)", kk: "Қалтаға файлдар (міндетті емес)", en: "Files for the folder (optional)" }))
                    : (l({ ru: "Выберите файл(ы) *", kk: "Файл(дар)ды таңдаңыз *", en: "Choose the file or files *" }))}
                </Label>
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
                        <div className="flex items-center gap-4 pl-6">
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

                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = e.dataTransfer.files;
                    if (files && files.length > 0) {
                      const newEntries: FileEntry[] = Array.from(files).map(file => ({
                        file,
                        customName: "",
                        permissions: { allow_download: true }
                      }));
                      setFormData(prev => ({ ...prev, fileEntries: [...prev.fileEntries, ...newEntries] }));
                    }
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    const files: File[] = [];
                    for (let i = 0; i < items.length; i++) {
                      const it = items[i];
                      if (it.kind === "file") {
                        const f = it.getAsFile();
                        if (f) files.push(f);
                      }
                    }
                    if (files.length > 0) {
                      e.preventDefault();
                      const newEntries: FileEntry[] = files.map(file => ({
                        file,
                        customName: "",
                        permissions: { allow_download: true }
                      }));
                      setFormData(prev => ({ ...prev, fileEntries: [...prev.fileEntries, ...newEntries] }));
                    }
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const newEntries: FileEntry[] = Array.from(e.target.files).map(file => ({
                          file,
                          customName: "",
                          permissions: { allow_download: true }
                        }));
                        setFormData(prev => ({ 
                          ...prev, 
                          fileEntries: [...prev.fileEntries, ...newEntries]
                        }));
                      }
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="hidden"
                    id="teacher-file-upload"
                  />
                  <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2 pointer-events-none" />
                  <p className="text-sm text-muted-foreground pointer-events-none">
                    {formData.fileEntries.length > 0
                      ? (l({ ru: "Добавить ещё — нажмите, перетащите или вставьте (Ctrl+V)", kk: "Тағы қосу — басыңыз, сүйреп әкеліңіз немесе қойыңыз (Ctrl+V)", en: "Add more — click, drag or paste (Ctrl+V)" }))
                      : (l({ ru: "Нажмите, перетащите или вставьте (Ctrl+V) файл(ы)", kk: "Файлды басып таңдаңыз, сүйреңіз немесе қойыңыз (Ctrl+V)", en: "Click, drag or paste (Ctrl+V) your files" }))}
                  </p>
                </div>
              </div>}

              <div className="flex gap-2">
                <Button type="submit" disabled={isUploading} className="flex-1">
                  {isUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {uploadProgress > 0 ? `${uploadProgress}%` : (l({ ru: "Загрузка...", kk: "Жүктелуде...", en: "Loading..." }))}
                    </>
                  ) : (
                    l({ ru: "Сохранить", kk: "Сақтау", en: "Save" })
                  )}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setIsAdding(false); resetForm(); }}>
                  {l({ ru: "Отмена", kk: "Болдырмау", en: "Cancel" })}
                </Button>
              </div>
              {isUploading && uploadProgress > 0 && (
                <Progress value={uploadProgress} className="h-2" />
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {/* Materials List */}
      <MaterialsSearchBar value={searchQuery} onChange={setSearchQuery} resultCount={materials.length} />

      {materials.length === 0 && !isAdding ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery.trim() ? (
            <p className="text-sm">{l({ ru: "Ничего не найдено", kk: "Ештеңе табылмады", en: "Nothing found" })}</p>
          ) : (
            <>
              <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {l({ ru: "Нет материалов", kk: "Материалдар жоқ", en: "No materials" })}
              </p>
              <p className="text-xs mt-1">
                {l({ ru: "Добавьте файлы или папки для ваших учеников", kk: "Оқушыларыңыз үшін файлдар немесе қалталар қосыңыз", en: "Add files or folders for your students" })}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {materials.map((material) => (
            <Card key={material.id}>
              <CardContent className="p-3">
                {editingId === material.id ? (
                  <form onSubmit={handleUpdate} className="space-y-3">
                    <Input
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      required
                    />
                    {material.type === "file" && (
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={formData.allow_download}
                            onCheckedChange={(checked) => setFormData(prev => ({ ...prev, allow_download: !!checked }))}
                          />
                          <Download className="w-3 h-3" />
                          {l({ ru: "Скачивание", kk: "Жүктеу", en: "Downloading" })}
                        </label>
                      </div>
                    )}
                    {formData.itemType === "link" && (
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
                    {formData.itemType === "text" && (
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
                    <div className="flex gap-2">
                      <Button type="submit" size="sm">{l({ ru: "Сохранить", kk: "Сақтау", en: "Save" })}</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setEditingId(null); resetForm(); }}>
                        {l({ ru: "Отмена", kk: "Болдырмау", en: "Cancel" })}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-center justify-between">
                    <div 
                      className={`flex items-center gap-3 min-w-0 flex-1 ${material.type === "folder" ? "cursor-pointer" : ""}`}
                      onClick={() => material.type === "folder" && handleOpenFolder(material.id)}
                    >
                      <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                        {getItemIcon(material.type)}
                      </div>
                      <div className="min-w-0">
                       <p className="font-medium text-sm truncate">{material.title}</p>
                        {material.type === "file" && (
                          <p className="text-xs text-muted-foreground">{getAccessLabel(material)}</p>
                        )}
                        {material.type === "link" && (
                          <p className="text-xs text-muted-foreground">{l({ ru: "Ссылка", kk: "Сілтеме", en: "Link" })}</p>
                        )}
                        {material.type === "text" && (
                          <p className="text-xs text-muted-foreground">{l({ ru: "Текст", kk: "Мәтін", en: "Text" })}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {material.type === "folder" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={l({ ru: "Добавить в папку", kk: "Қалтаға қосу", en: "Add to a folder" })}
                          onClick={() => {
                            setCurrentFolderId(material.id);
                            setIsAdding(true);
                            setEditingId(null);
                            resetForm();
                          }}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                      {material.type === "link" && material.file_url && (
                        <a
                          href={material.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-8 w-8"
                          title={l({ ru: "Открыть ссылку", kk: "Сілтемені ашу", en: "Open the link" })}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {material.type === "file" && material.file_url && (() => {
                        const dlUrl = material.allow_download !== false
                          ? getFileUrl(material, 'download')
                          : null;
                        const vUrl = getFileUrl(material, 'view');
                        const needsOffice = isOfficeDocument(material.title) && isS3Path(material.file_url!);
                        return (
                          <>
                            {dlUrl && (
                              <a
                                href={dlUrl}
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-8 w-8"
                                title={l({ ru: "Скачать", kk: "Жүктеу", en: "Download" })}
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            {vUrl ? (
                              <a
                                href={vUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-8 w-8"
                                title={l({ ru: "Открыть", kk: "Ашу", en: "Open" })}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            ) : needsOffice ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleOfficeView(material)}
                                title={l({ ru: "Открыть", kk: "Ашу", en: "Open" })}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </>
                        );
                      })()}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(material)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingMaterial({ id: material.id, title: material.title, file_url: material.file_url })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingMaterial} onOpenChange={() => setDeletingMaterial(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{l({ ru: "Удалить материал?", kk: "Материалды жою керек пе?", en: "Delete this material?" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {l({ ru: `Вы уверены, что хотите удалить "${deletingMaterial?.title}"? Это действие нельзя отменить.`, kk: `"${deletingMaterial?.title}" жойғыңыз келе ме? Бұл әрекетті болдырмау мүмкін емес.`, en: `Are you sure you want to delete "${deletingMaterial?.title}"? This cannot be undone.` })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{l({ ru: "Отмена", kk: "Болдырмау", en: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {l({ ru: "Удалить", kk: "Жою", en: "Delete" })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeacherMaterialsManager;
