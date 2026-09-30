import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { creatorCreds, sessionCreds, invokeApi } from "@/lib/sessionApi";

export interface Announcement {
  id: string;
  product_id: string;
  creator_id: string;
  content_html: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export const useAnnouncements = (productId: string | undefined) => {
  return useQuery({
    queryKey: ["announcements", productId],
    queryFn: async () => {
      if (!productId) return [] as Announcement[];
      const data = await invokeApi<{ announcements: Announcement[] }>("manage-materials", {
        action: "list_announcements",
        ...sessionCreds(),
        productId,
      });
      return data.announcements ?? [];
    },
    enabled: !!productId,
  });
};

export const useAnnouncementsForProducts = (productIds: string[]) => {
  return useQuery({
    queryKey: ["announcements-multi", [...productIds].sort().join(",")],
    queryFn: async () => {
      if (productIds.length === 0) return [] as Announcement[];
      const data = await invokeApi<{ announcements: Announcement[] }>("manage-materials", {
        action: "list_announcements",
        ...sessionCreds(),
        productIds,
      });
      return data.announcements ?? [];
    },
    enabled: productIds.length > 0,
  });
};

const invokeManage = async (body: Record<string, unknown>) =>
  invokeApi("manage-announcements", { ...creatorCreds(), ...body });

export const useCreateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; contentHtml: string }) =>
      invokeManage({ action: "create", productId: input.productId, contentHtml: input.contentHtml }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["announcements", v.productId] });
      qc.invalidateQueries({ queryKey: ["announcements-multi"] });
    },
  });
};

export const useUpdateAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; productId: string; contentHtml: string }) =>
      invokeManage({ action: "update", id: input.id, contentHtml: input.contentHtml }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["announcements", v.productId] });
      qc.invalidateQueries({ queryKey: ["announcements-multi"] });
    },
  });
};

export const useDeleteAnnouncement = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; productId: string }) =>
      invokeManage({ action: "delete", id: input.id }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["announcements", v.productId] });
      qc.invalidateQueries({ queryKey: ["announcements-multi"] });
    },
  });
};

export const useReorderAnnouncements = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { productId: string; ids: string[] }) =>
      invokeManage({ action: "reorder", productId: input.productId, ids: input.ids }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["announcements", v.productId] });
    },
  });
};

export const uploadAnnouncementMedia = async (
  file: File,
  productId: string,
  kind: "image" | "video" | "file",
  signal?: AbortSignal,
): Promise<string> => {
  if (kind === "video") {
    // Heavy clips are shrunk in the browser first, then go straight to AWS S3.
    const [{ compressVideoIfNeeded }, { uploadProductMedia }] = await Promise.all([
      import("@/lib/videoCompressor"),
      import("@/lib/productMediaUpload"),
    ]);
    const ready = await compressVideoIfNeeded(file, undefined, signal);
    return uploadProductMedia(ready, productId, "video", undefined, 1, signal);
  }
  const { supabase } = await import("@/integrations/supabase/client");
  const creatorName = localStorage.getItem("creator_name") || "";
  const creatorToken = localStorage.getItem("creator_token") || "";
  const form = new FormData();
  form.append("file", file);
  form.append("productId", productId);
  form.append("creatorName", creatorName);
  form.append("creatorToken", creatorToken);
  form.append("kind", kind);
  const { data, error } = await supabase.functions.invoke("upload-product-media", { body: form, signal });
  if (error) throw error;
  if (!data?.url) throw new Error(data?.error || "Upload failed");
  return data.url as string;
};