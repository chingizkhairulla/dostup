import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { FileText, Folder, Link as LinkIcon, Type, Upload, X, Settings, Loader2, Clipboard, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { useCreateMaterial, uploadMaterialFile } from '@/hooks/useMaterials';
import { useLanguage } from '@/contexts/LanguageContext';
import { nextMaterialOrder, type MaterialOrderItem } from '@/lib/materialDraft';
import {
  emptyMaterialAddDraft, planMaterialAdditions, removeSavedMaterialDraft,
  type MaterialAddType, type MaterialFileDraft,
} from '@/lib/materialAddDraft';
import MaterialScheduleControl from './MaterialScheduleControl';

interface Props {
  productId: string;
  parentId: string | null;
  materials: MaterialOrderItem[];
  onComplete: () => void;
  onBusyChange: (busy: boolean) => void;
}

export default function MaterialAddForm({ productId, parentId, materials, onComplete, onBusyChange }: Props) {
  const { language } = useLanguage();
  const createMaterial = useCreateMaterial();
  const [activeType, setActiveType] = useState<MaterialAddType>('file');
  const [draft, setDraft] = useState(emptyMaterialAddDraft);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const nextOrder = useRef(0);
  const [preferenceKey] = useState(() => {
    try { return `materials-file-download:${localStorage.getItem('creator_name') || 'default'}`; }
    catch { return 'materials-file-download:default'; }
  });
  const [allowDownload, setAllowDownload] = useState(() => {
    try { return localStorage.getItem(preferenceKey) !== 'false'; } catch { return true; }
  });
  // Only downloading persists across openings. Scheduling starts off each time.
  const [defaultSchedule, setDefaultSchedule] = useState({ enabled: false, value: '' });

  const addFiles = useCallback((files: FileList | File[]) => {
    const entries: MaterialFileDraft[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(), file, title: file.name, allowDownload,
      scheduled: defaultSchedule.enabled, availableAt: defaultSchedule.value,
    }));
    setDraft(previous => ({ ...previous, files: [...previous.files, ...entries] }));
  }, [allowDownload, defaultSchedule]);

  useEffect(() => {
    if (activeType !== 'file' || saving) return;
    const paste = (event: ClipboardEvent) => {
      let files = Array.from(event.clipboardData?.files ?? []);
      if (!files.length) {
        files = Array.from(event.clipboardData?.items ?? []).flatMap(item => {
          const file = item.kind === 'file' ? item.getAsFile() : null;
          return file ? [file] : [];
        });
      }
      if (!files.length) return;
      event.preventDefault();
      addFiles(files);
    };
    window.addEventListener('paste', paste, true);
    return () => window.removeEventListener('paste', paste, true);
  }, [activeType, saving, addFiles]);

  const updateFile = (id: string, updates: Partial<MaterialFileDraft>) => {
    setDraft(previous => ({ ...previous, files: previous.files.map(file => file.id === id ? { ...file, ...updates } : file) }));
  };

  const pasteFiles = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find(type => type !== 'text/plain' && type !== 'text/html');
        if (!type) continue;
        const blob = await item.getType(type);
        files.push(new File([blob], `pasted-${Date.now()}.${type.split('/')[1] || 'bin'}`, { type }));
      }
      if (files.length) addFiles(files);
      else toast.error('В буфере обмена нет файлов');
    } catch {
      toast.error('Не удалось прочитать буфер. Используйте Ctrl+V');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    let completed = false;
    try {
      const additions = planMaterialAdditions(draft);
      if (!additions.length) {
        toast.error(activeType === 'file' ? 'Вставьте файл' : activeType === 'link' ? 'Введите ссылку' : activeType === 'text' ? 'Введите текст' : 'Введите название папки');
        return;
      }
      submitting.current = true;
      setSaving(true);
      onBusyChange(true);
      setProgress(0);
      setSettingsOpen(false);
      nextOrder.current = Math.max(nextOrder.current, nextMaterialOrder(materials, parentId));
      let saved = 0;
      for (const addition of additions) {
        const file = addition.file;
        let fileUrl = addition.material.file_url;
        if (file) {
          fileUrl = file.uploadedUrl;
          if (!fileUrl) {
            fileUrl = await uploadMaterialFile(file.file, productId, value => setProgress(Math.round((saved + value / 100) / additions.length * 100)));
            updateFile(file.id, { uploadedUrl: fileUrl });
          }
        }
        await createMaterial.mutateAsync({
          ...addition.material, file_url: fileUrl, product_id: productId,
          parent_id: parentId, order_index: nextOrder.current,
        });
        nextOrder.current += 1;
        // Remove only successful items. A retry keeps the remaining tabs and uploaded paths.
        setDraft(previous => removeSavedMaterialDraft(previous, addition.draftId));
        saved += 1;
        setProgress(Math.round(saved / additions.length * 100));
      }
      toast.success(additions.length === 1 ? 'Материал добавлен!' : 'Материалы добавлены!');
      completed = true;
    } catch (error) {
      toast.error(`Ошибка при добавлении: ${error instanceof Error ? error.message : 'Попробуйте ещё раз'}`);
    } finally {
      submitting.current = false;
      setSaving(false);
      onBusyChange(false);
    }
    if (completed) onComplete();
  };

  const types = [
    { value: 'file', label: 'Файл', icon: FileText },
    { value: 'link', label: language === 'kk' ? 'Сілтеме' : 'Ссылка', icon: LinkIcon },
    { value: 'text', label: 'Текст', icon: Type },
    { value: 'folder', label: 'Папка', icon: Folder },
  ] as const;

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-col gap-4">
      <fieldset disabled={saving} className="flex min-h-0 min-w-0 flex-col gap-4">
        <RadioGroup value={activeType} onValueChange={(value: MaterialAddType) => setActiveType(value)}
          className="flex shrink-0 flex-nowrap justify-between gap-1 sm:justify-start sm:gap-6" aria-label="Тип добавления">
          {types.map(({ value, label, icon: Icon }) => (
            <div key={value} className="flex items-center gap-1.5">
              <RadioGroupItem id={`add-type-${value}`} value={value} />
              <Label htmlFor={`add-type-${value}`} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-sm sm:text-base">
                <Icon className="hidden h-4 w-4 sm:block" />{label}
              </Label>
            </div>
          ))}
        </RadioGroup>

        {activeType === 'file' && (
          <div className="flex min-h-0 flex-col gap-3">
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="ghost" className="w-fit shrink-0 gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary">
                  <Settings className="h-4 w-4" />Настроить добавление
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-3" aria-label="Настроить добавление">
                <label className="flex items-center justify-between gap-3 text-sm">
                  Возможность скачать
                  <Switch aria-label="Возможность скачать по умолчанию" checked={allowDownload} onCheckedChange={checked => {
                    setAllowDownload(checked);
                    try { localStorage.setItem(preferenceKey, String(checked)); } catch { /* Keep the setting for this opening. */ }
                  }} />
                </label>
                <MaterialScheduleControl enabled={defaultSchedule.enabled} value={defaultSchedule.value}
                  onChange={(enabled, value) => setDefaultSchedule({ enabled, value })} />
              </PopoverContent>
            </Popover>

            <ContextMenu>
              <ContextMenuTrigger asChild>
                <button type="button" aria-label="Вставьте файл" className={`flex shrink-0 flex-col items-center gap-2 rounded-lg border-2 border-dashed px-3 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 ${dragging ? 'border-primary bg-primary/5' : 'border-border'}`}
                  onClick={() => fileInput.current?.click()}
                  onDragOver={event => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={event => { event.preventDefault(); setDragging(false); if (!saving) addFiles(event.dataTransfer.files); }}>
                  <Upload className="h-6 w-6" />
                  <span className="sm:hidden">Нажмите, чтобы вставить файл</span>
                  <span className="hidden sm:inline">Нажмите, перетащите или вставьте через (Ctrl+V)</span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => fileInput.current?.click()}><FolderOpen className="mr-2 h-4 w-4" />Выбрать файл</ContextMenuItem>
                <ContextMenuItem onSelect={pasteFiles}><Clipboard className="mr-2 h-4 w-4" />Вставить</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={event => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }} />

            {!!draft.files.length && (
              <div className="app-scroll grid min-h-0 grid-cols-1 gap-3 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-2 max-h-[356px] sm:max-h-[172px]" aria-label="Выбранные файлы" tabIndex={0}>
                {draft.files.map((file, index) => (
                  <div key={file.id} className="flex min-h-[172px] min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <Input aria-label={`Название файла ${index + 1}`} className="h-9 min-w-0" value={file.title} placeholder={file.file.name}
                        onChange={event => updateFile(file.id, { title: event.target.value })} />
                      <Tooltip><TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Убрать файл ${file.title}`} className="h-8 w-8 min-h-0 shrink-0 text-muted-foreground hover:bg-primary hover:text-white"
                          onClick={() => setDraft(previous => ({ ...previous, files: previous.files.filter(entry => entry.id !== file.id) }))}>
                          <X className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger><TooltipContent side="left">Убрать файл?</TooltipContent></Tooltip>
                    </div>
                    <p className="text-xs text-muted-foreground">Для покупателя</p>
                    <label className="flex min-h-8 items-center justify-between gap-3 text-sm">
                      Возможность скачать
                      <Switch aria-label={`Возможность скачать файл ${index + 1}`} checked={file.allowDownload} onCheckedChange={allowDownload => updateFile(file.id, { allowDownload })} />
                    </label>
                    <MaterialScheduleControl enabled={file.scheduled} value={file.availableAt}
                      onChange={(scheduled, availableAt) => updateFile(file.id, { scheduled, availableAt })} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeType === 'link' && (
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="add-link-title">Название</Label>
              <Input id="add-link-title" value={draft.link.title} placeholder="Если пусто — показывается сама ссылка"
                onChange={event => setDraft(previous => ({ ...previous, link: { ...previous.link, title: event.target.value } }))} />
            </div>
            <div className="space-y-2"><Label htmlFor="add-link-url">Ссылка <span className="text-primary">*</span></Label>
              <Textarea id="add-link-url" rows={2} className="min-h-16 resize-none" placeholder="https://..." value={draft.link.url}
                onChange={event => setDraft(previous => ({ ...previous, link: { ...previous.link, url: event.target.value } }))} />
            </div>
            <MaterialScheduleControl enabled={draft.link.scheduled} value={draft.link.availableAt}
              onChange={(scheduled, availableAt) => setDraft(previous => ({ ...previous, link: { ...previous.link, scheduled, availableAt } }))} />
          </div>
        )}

        {activeType === 'text' && (
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="add-text-title">Название</Label>
              <Input id="add-text-title" value={draft.text.title} placeholder="Введите название"
                onChange={event => setDraft(previous => ({ ...previous, text: { ...previous.text, title: event.target.value } }))} />
            </div>
            <div className="space-y-2"><Label htmlFor="add-text-content">Текст <span className="text-primary">*</span></Label>
              <Textarea id="add-text-content" rows={4} className="max-h-[30dvh] resize-none" value={draft.text.content} placeholder="Введите текст"
                onChange={event => setDraft(previous => ({ ...previous, text: { ...previous.text, content: event.target.value } }))} />
            </div>
          </div>
        )}

        {activeType === 'folder' && (
          <div className="space-y-2"><Label htmlFor="add-folder-title">Название папки <span className="text-primary">*</span></Label>
            <Input id="add-folder-title" value={draft.folder.title} placeholder="Введите название"
              onChange={event => setDraft(previous => ({ ...previous, folder: { title: event.target.value } }))} />
          </div>
        )}
      </fieldset>
      <Button type="submit" variant="cta" className="w-full shrink-0" disabled={saving}>
        {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Загрузка… {progress}%</> : 'Добавить'}
      </Button>
      {saving && <Progress value={progress} className="h-2 shrink-0" />}
    </form>
  );
}
