import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useProductTeachers, useAddProductTeacher, useRemoveProductTeacher } from "@/hooks/useProductTeachers";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Trash2, Loader2, Users, UserPlus } from "lucide-react";
import { toast } from "sonner";
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

interface ProductTeachersManagerProps {
  productId: string;
  productTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

const ProductTeachersManager = ({ productId, productTitle, isOpen, onClose }: ProductTeachersManagerProps) => {
  const { t, language, l } = useLanguage();
  const { data: teachers = [], isLoading } = useProductTeachers(productId);
  const addTeacher = useAddProductTeacher();
  const removeTeacher = useRemoveProductTeacher();
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [removingTeacherId, setRemovingTeacherId] = useState<string | null>(null);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(l({ ru: "Заполните имя и фамилию", kk: "Аты мен тегін толтырыңыз", en: "Fill in the first and last name" }));
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    try {
      await addTeacher.mutateAsync({
        productId,
        teacherName: fullName,
      });
      toast.success(l({ ru: "Учитель добавлен!", kk: "Мұғалім қосылды!", en: "Teacher added!" }));
      setFirstName("");
      setLastName("");
    } catch (error: any) {
      toast.error(error.message || (l({ ru: "Ошибка при добавлении", kk: "Қосу кезінде қате", en: "Could not add" })));
    }
  };

  const handleRemoveTeacher = async () => {
    if (!removingTeacherId) return;
    
    try {
      await removeTeacher.mutateAsync(removingTeacherId);
      toast.success(l({ ru: "Учитель удалён", kk: "Мұғалім жойылды", en: "Teacher removed" }));
    } catch (error) {
      toast.error(l({ ru: "Ошибка при удалении", kk: "Жою кезінде қате", en: "Could not delete" }));
    } finally {
      setRemovingTeacherId(null);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {l({ ru: "Учителя", kk: "Мұғалімдер", en: "Teachers" })}: {productTitle}
            </DialogTitle>
          </DialogHeader>

          {/* Add Teacher Form */}
          <form onSubmit={handleAddTeacher} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{l({ ru: "Имя", kk: "Аты", en: "First name" })}</Label>
                <Input
                  placeholder={l({ ru: "Введите имя", kk: "Атын енгізіңіз", en: "Enter the first name" })}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{l({ ru: "Фамилия", kk: "Тегі", en: "Last name" })}</Label>
                <Input
                  placeholder={l({ ru: "Введите фамилию", kk: "Тегін енгізіңіз", en: "Enter the last name" })}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full" 
              disabled={addTeacher.isPending || !firstName.trim() || !lastName.trim()}
            >
              {addTeacher.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  {l({ ru: "Добавить учителя", kk: "Мұғалімді қосу", en: "Add a teacher" })}
                </>
              )}
            </Button>
          </form>

          {/* Teachers List */}
          <div className="mt-6 space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              {l({ ru: "Добавленные учителя", kk: "Қосылған мұғалімдер", en: "Teachers you have added" })}
            </h3>
            
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : teachers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {l({ ru: "Учителя ещё не добавлены", kk: "Мұғалімдер әлі қосылмаған", en: "No teachers have been added yet" })}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {teachers.map((teacher) => (
                  <div
                    key={teacher.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                  >
                    <span className="font-medium">{teacher.teacher_name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setRemovingTeacherId(teacher.id)}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Remove Teacher Confirmation */}
      <AlertDialog open={!!removingTeacherId} onOpenChange={(open) => !open && setRemovingTeacherId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {l({ ru: "Удалить учителя?", kk: "Мұғалімді жою керек пе?", en: "Remove this teacher?" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {l({ ru: "Учитель потеряет доступ к этому продукту и его расписания будут удалены.", kk: "Мұғалім бұл өнімге қол жеткізуден айырылады және оның кестелері жойылады.", en: "The teacher will lose access to this product and their schedules will be deleted." })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveTeacher}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeTeacher.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProductTeachersManager;
