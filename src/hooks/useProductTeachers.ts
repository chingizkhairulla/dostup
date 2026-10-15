import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { creatorCreds, sessionCreds, invokeApi } from "@/lib/sessionApi";
import { inDeviceLanguage as l } from "@/lib/language";

interface ProductTeacher {
  id: string;
  product_id: string;
  teacher_name: string;
  created_at: string;
}

export const useProductTeachers = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["product-teachers", productId],
    queryFn: async () => {
      if (!productId) return [];
      const creds = creatorCreds();
      if (creds.creatorToken) {
        const data = await invokeApi<{ teachers: ProductTeacher[] }>("manage-products", {
          action: "list_teachers",
          ...creds,
          productId,
        });
        return data.teachers ?? [];
      }
      const data = await invokeApi<{ teachers: ProductTeacher[] }>("catalog", {
        action: "list_teachers",
        productId,
      });
      return data.teachers ?? [];
    },
    enabled: !!productId,
  });
};

export const useCreatorTeachers = (productIds: string[]) => {
  return useQuery({
    queryKey: ["creator-teachers", productIds],
    queryFn: async () => {
      if (!productIds.length) return [];
      const data = await invokeApi<{ teachers: (ProductTeacher & { product: { title: string } | null })[] }>(
        "manage-products",
        { action: "list_creator_teachers", ...creatorCreds() },
      );
      return data.teachers ?? [];
    },
    enabled: productIds.length > 0,
  });
};

export const useAddProductTeacher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ productId, teacherName }: { productId: string; teacherName: string }) => {
      try {
        const data = await invokeApi<{ teacher: ProductTeacher }>("manage-products", {
          action: "add_teacher",
          ...creatorCreds(),
          productId,
          teacherName,
        });
        return data.teacher;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("уже добавлен")) throw new Error(l({ ru: "Этот учитель уже добавлен к продукту", kk: "Бұл мұғалім өнімге қосылып қойған", en: "This teacher has already been added to the product" }));
        throw e;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["product-teachers", variables.productId] });
      queryClient.invalidateQueries({ queryKey: ["creator-teachers"] });
    },
  });
};

export const useRemoveProductTeacher = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (teacherId: string) => {
      await invokeApi("manage-products", {
        action: "remove_teacher",
        ...creatorCreds(),
        teacherId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-teachers"] });
      queryClient.invalidateQueries({ queryKey: ["creator-teachers"] });
    },
  });
};

export const useTeacherProducts = (teacherName: string | undefined) => {
  return useQuery({
    queryKey: ["teacher-products", teacherName],
    queryFn: async () => {
      if (!teacherName) return [];
      const data = await invokeApi<{ products: unknown[] }>("manage-products", {
        action: "list",
        ...sessionCreds(),
      });
      return (data.products ?? []).map((product) => ({ product }));
    },
    enabled: !!teacherName,
  });
};
