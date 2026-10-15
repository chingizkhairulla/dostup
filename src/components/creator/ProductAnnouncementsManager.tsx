import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
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
import { ArrowLeft, Plus, Pencil, Trash2, Loader2, Save } from "lucide-react";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useUpdateAnnouncement,
  useDeleteAnnouncement,
  useSetGroupLink,
} from "@/hooks/useAnnouncements";
import AnnouncementComposer from "./AnnouncementComposer";
import AnnouncementView from "@/components/dashboard/AnnouncementView";
import { toast } from "sonner";

interface Props {
  productId: string;
  productTitle: string;
  initialGroupLinkUrl: string | null;
  initialGroupLinkLabel: string | null;
  onBack?: () => void;
  hideBackButton?: boolean;
}

const ProductAnnouncementsManager = ({ productId, productTitle, initialGroupLinkUrl, initialGroupLinkLabel, onBack, hideBackButton }: Props) => {
  const { l } = useLanguage();
  const { data: announcements = [], isLoading } = useAnnouncements(productId);
  const createMut = useCreateAnnouncement();
  const updateMut = useUpdateAnnouncement();
  const deleteMut = useDeleteAnnouncement();
  const setGroupLink = useSetGroupLink();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [groupUrl, setGroupUrl] = useState(initialGroupLinkUrl || "");
  const [groupLabel, setGroupLabel] = useState(initialGroupLinkLabel || "");
  useEffect(() => { setGroupUrl(initialGroupLinkUrl || ""); setGroupLabel(initialGroupLinkLabel || ""); }, [initialGroupLinkUrl, initialGroupLinkLabel]);

  const handleSaveLink = async () => {
    try {
      await setGroupLink.mutateAsync({
        productId,
        groupLinkUrl: groupUrl.trim() || null,
        groupLinkLabel: groupLabel.trim() || null,
      });
      toast.success(l({ ru: "Ссылка сохранена", kk: "Сілтеме сақталды", en: "Link saved" }));
    } catch (e: any) {
      toast.error(e?.message || l({ ru: "Не удалось сохранить", kk: "Сақтау мүмкін болмады", en: "Could not save" }));
    }
  };

  const handleCreate = async (html: string) => {
    if (!html || html === "<p></p>") { toast.error(l({ ru: "Пост пустой", kk: "Жазба бос", en: "The post is empty" })); return; }
    try {
      await createMut.mutateAsync({ productId, contentHtml: html });
      setIsAdding(false);
      toast.success(l({ ru: "Опубликовано", kk: "Жарияланды", en: "Published" }));
    } catch (e: any) { toast.error(e?.message || l({ ru: "Ошибка", kk: "Қате", en: "Error" })); }
  };

  const handleUpdate = async (id: string, html: string) => {
    try {
      await updateMut.mutateAsync({ id, productId, contentHtml: html });
      setEditingId(null);
      toast.success(l({ ru: "Сохранено", kk: "Сақталды", en: "Saved" }));
    } catch (e: any) { toast.error(e?.message || l({ ru: "Ошибка", kk: "Қате", en: "Error" })); }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      await deleteMut.mutateAsync({ id: deletingId, productId });
      setDeletingId(null);
      toast.success(l({ ru: "Удалено", kk: "Жойылды", en: "Deleted" }));
    } catch (e: any) { toast.error(e?.message || l({ ru: "Ошибка", kk: "Қате", en: "Error" })); }
  };

  return (
    <div className="space-y-4">
      {!hideBackButton && onBack && (
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />{l({ ru: "К продуктам", kk: "Өнімдерге", en: "Back to products" })}</Button>
          <h2 className="text-lg font-semibold truncate">{productTitle}</h2>
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1">
            <Label>{l({ ru: "Ссылка на чат/группу (URL)", kk: "Чатқа/топқа сілтеме (URL)", en: "Link to the chat or group (URL)" })}</Label>
            <Input value={groupUrl} onChange={(e) => setGroupUrl(e.target.value)} placeholder="https://t.me/..." />
          </div>
          <div className="space-y-1">
            <Label>{l({ ru: "Текст кнопки", kk: "Түйме мәтіні", en: "Button text" })}</Label>
            <Input value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} placeholder={l({ ru: "Ссылка на группу/чат", kk: "Топқа/чатқа сілтеме", en: "Link to the group or chat" })} />
          </div>
          <Button size="sm" onClick={handleSaveLink} disabled={setGroupLink.isPending}>
            {setGroupLink.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {l({ ru: "Сохранить ссылку", kk: "Сілтемені сақтау", en: "Save the link" })}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-medium">{l({ ru: "Объявления", kk: "Хабарландырулар", en: "Announcements" })}</h3>
        {!isAdding && (
          <Button size="sm" onClick={() => { setIsAdding(true); setEditingId(null); }}>
            <Plus className="w-4 h-4 mr-1" />{l({ ru: "Создать пост", kk: "Жазба жасау", en: "Create a post" })}
          </Button>
        )}
      </div>

      {isAdding && (
        <AnnouncementComposer
          productId={productId}
          onSave={handleCreate}
          onCancel={() => setIsAdding(false)}
          saving={createMut.isPending}
          submitLabel={l({ ru: "Опубликовать", kk: "Жариялау", en: "Publish" })}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : announcements.length === 0 && !isAdding ? (
        <p className="text-sm text-muted-foreground text-center py-8">{l({ ru: "Пока нет объявлений", kk: "Әзірге хабарландырулар жоқ", en: "No announcements yet" })}</p>
      ) : (
        <div className="space-y-3">
          {[...announcements].reverse().map((a) => (
            <Card key={a.id}>
              <CardContent className="p-4 space-y-2">
                {editingId === a.id ? (
                  <AnnouncementComposer
                    productId={productId}
                    initialHtml={a.content_html}
                    onSave={(html) => handleUpdate(a.id, html)}
                    onCancel={() => setEditingId(null)}
                    saving={updateMut.isPending}
                    submitLabel={l({ ru: "Сохранить", kk: "Сақтау", en: "Save" })}
                  />
                ) : (
                  <>
                    <AnnouncementView html={a.content_html} />
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button size="sm" variant="toggle" onClick={() => { setEditingId(a.id); setIsAdding(false); }}>
                        <Pencil className="w-4 h-4 mr-1" />{l({ ru: "Редактировать", kk: "Өңдеу", en: "Edit" })}
                      </Button>
                      <Button size="sm" variant="toggle" onClick={() => setDeletingId(a.id)}>
                        <Trash2 className="w-4 h-4 mr-1" />{l({ ru: "Удалить", kk: "Жою", en: "Delete" })}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{l({ ru: "Удалить объявление?", kk: "Хабарландыруды жою керек пе?", en: "Delete this announcement?" })}</AlertDialogTitle>
            <AlertDialogDescription>{l({ ru: "Действие нельзя отменить.", kk: "Бұл әрекетті қайтару мүмкін емес.", en: "This cannot be undone." })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{l({ ru: "Отмена", kk: "Болдырмау", en: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{l({ ru: "Удалить", kk: "Жою", en: "Delete" })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProductAnnouncementsManager;