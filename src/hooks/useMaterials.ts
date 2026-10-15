import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSimpleAuth } from "@/contexts/SimpleAuthContext";
import { creatorCreds, sessionCreds, studentCreds, invokeApi } from "@/lib/sessionApi";

type MaterialType = "file" | "video" | "text" | "folder" | "link";

interface Material {
  id: string;
  product_id: string;
  title: string;
  type: MaterialType;
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
  deleted_at?: string | null;
  file_size?: number | null;
  original_parent_id?: string | null;
}

export const useMaterials = (productId: string | undefined, options?: { creatorOnly?: boolean }) => {
  return useQuery({
    queryKey: ["materials", productId, options?.creatorOnly ? "creator" : "all"],
    queryFn: async () => {
      if (!productId) return [];
      const data = await invokeApi<{ materials: Material[] }>("manage-materials", {
        action: "list",
        ...sessionCreds(),
        productId,
        creatorOnly: options?.creatorOnly,
      });
      return data.materials ?? [];
    },
    enabled: !!productId,
  });
};

export const useProductMaterials = (productId: string | undefined, options?: { creatorOnly?: boolean }) =>
  useMaterials(productId, options);

export const useUserMaterials = () => {
  const { user } = useSimpleAuth();

  return useQuery({
    queryKey: ["user-materials", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const data = await invokeApi<{ materials: Material[] }>("manage-materials", {
        action: "list_student",
        ...studentCreds(),
      });
      return data.materials ?? [];
    },
    enabled: !!user,
  });
};

interface CreateMaterialInput {
  product_id: string;
  title: string;
  type: MaterialType;
  content?: string | null;
  file_url?: string | null;
  cover_url?: string | null;
  order_index?: number;
  parent_id?: string | null;
  allow_view?: boolean;
  allow_download?: boolean;
  available_at?: string | null;
  teacher_allow_download?: boolean;
  file_size?: number | null;
}

export const useCreateMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (material: CreateMaterialInput) => {
      const data = await invokeApi<{ material: Material }>("manage-materials", {
        action: "create",
        ...sessionCreds(),
        material,
      });
      return data.material;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["materials", variables.product_id] });
      queryClient.invalidateQueries({ queryKey: ["user-materials"] });
    },
  });
};

export const useUpdateMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId, ...updates }: Partial<Material> & { id: string; productId: string }) => {
      const data = await invokeApi<{ material: Material }>("manage-materials", {
        action: "update",
        ...sessionCreds(),
        id,
        updates,
      });
      return { ...data.material, productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["materials", data.productId] });
      queryClient.invalidateQueries({ queryKey: ["user-materials"] });
    },
  });
};

export const useDeleteMaterial = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string; file_url?: string | null }) => {
      await invokeApi("manage-materials", {
        action: "soft_delete",
        ...sessionCreds(),
        id,
      });
      return { id, productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["materials", data.productId] });
      queryClient.invalidateQueries({ queryKey: ["user-materials"] });
      queryClient.invalidateQueries({ queryKey: ["deleted-materials", data.productId] });
    },
  });
};

export const useDeletedMaterials = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["deleted-materials", productId],
    queryFn: async () => {
      if (!productId) return [];
      const data = await invokeApi<{ materials: Material[] }>("manage-materials", {
        action: "list",
        ...sessionCreds(),
        productId,
        includeDeleted: true,
        creatorOnly: true,
      });
      return data.materials ?? [];
    },
    enabled: !!productId,
  });
};

export const useRestoreMaterial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      productId,
      targetParentId,
    }: {
      id: string;
      productId: string;
      targetParentId?: string | null;
    }) => {
      const data = await invokeApi<{ restoredTo: "original" | "root" | "custom"; parentId: string | null }>(
        "manage-materials",
        {
          action: "restore",
          ...sessionCreds(),
          id,
          targetParentId,
        },
      );
      return { id, productId, restoredTo: data.restoredTo, parentId: data.parentId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["materials", data.productId] });
      queryClient.invalidateQueries({ queryKey: ["deleted-materials", data.productId] });
    },
  });
};

export const usePermanentlyDeleteMaterial = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, productId }: { id: string; productId: string; file_url?: string | null }) => {
      await invokeApi("manage-materials", {
        action: "hard_delete",
        ...sessionCreds(),
        id,
      });
      return { id, productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deleted-materials", data.productId] });
      queryClient.invalidateQueries({ queryKey: ["materials", data.productId] });
    },
  });
};

export const useEmptyTrash = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ productId }: { productId: string }) => {
      await invokeApi("manage-materials", {
        action: "empty_trash",
        ...sessionCreds(),
        productId,
      });
      return { productId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["deleted-materials", data.productId] });
    },
  });
};

export const useAllCreatorMaterials = (creatorName: string | undefined) => {
  return useQuery({
    queryKey: ["all-creator-materials", creatorName],
    queryFn: async () => {
      if (!creatorName) return [];
      const data = await invokeApi<{
        materials: Array<Material & { product_title: string }>;
      }>("manage-materials", {
        action: "list_all_creator",
        ...creatorCreds(),
      });
      return data.materials ?? [];
    },
    enabled: !!creatorName,
  });
};

export const uploadMaterialFile = async (
  file: File,
  productId: string,
  onProgress?: (progress: number) => void,
): Promise<string> => {
  const { uploadFileToS3 } = await import("@/lib/s3Helpers");
  const creatorToken = localStorage.getItem("creator_token") || "";
  const creatorName = localStorage.getItem("creator_name") || "";
  return uploadFileToS3(file, productId, "creator", {
    creatorToken,
    creatorName,
    onProgress,
  });
};
