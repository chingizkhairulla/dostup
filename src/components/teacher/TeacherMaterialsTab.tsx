import { useQuery } from "@tanstack/react-query";
import { sessionCreds, studentCreds, invokeApi } from "@/lib/sessionApi";
import { useLanguage } from "@/contexts/LanguageContext";
import { FileText, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import TeacherMaterialsManager from "./TeacherMaterialsManager";

interface TeacherMaterialsTabProps {
  productIds: string[];
  teacherName?: string;
}

const TeacherMaterialsTab = ({ productIds, teacherName }: TeacherMaterialsTabProps) => {
  const { language } = useLanguage();

  const { data: teacherUser } = useQuery({
    queryKey: ["teacher-user-id", teacherName],
    queryFn: async () => {
      const data = await invokeApi<{ userId: string | null }>("manage-schedules", {
        action: "me",
        ...studentCreds(),
      });
      return data.userId ? { id: data.userId } : null;
    },
    enabled: !!teacherName,
  });

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["teacher-products-info", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ products: { id: string; title: string }[] }>("manage-products", {
        action: "list",
        ...sessionCreds(),
      });
      return (data.products ?? []).filter((p) => productIds.includes(p.id));
    },
    enabled: productIds.length > 0,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">
          {language === "ru" ? "Мои материалы" : "Менің материалдарым"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1 mb-4">
          {language === "ru"
            ? "Материалы, которые вы добавляете, будут доступны только вашим ученикам"
            : "Сіз қосқан материалдар тек сіздің оқушыларыңызға қол жетімді болады"}
        </p>

        {teacherUser?.id && products.length > 0 ? (
          <div className="space-y-6">
            {products.map(product => (
              <Card key={product.id}>
                <CardContent className="p-4">
                  <TeacherMaterialsManager
                    teacherId={teacherUser.id}
                    productId={product.id}
                    productTitle={product.title}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              {language === "ru" ? "Нет доступных продуктов" : "Қолжетімді өнімдер жоқ"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TeacherMaterialsTab;