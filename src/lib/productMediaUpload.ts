import { supabase } from "@/integrations/supabase/client";

export type ProductMediaKind = "image" | "video";

export const MAX_VIDEO_DURATION_SECONDS = 180; // 3 minutes

export async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => {
      const d = video.duration;
      URL.revokeObjectURL(url);
      if (!isFinite(d)) reject(new Error("Cannot read video duration"));
      else resolve(d);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Cannot read video metadata"));
    };
  });
}

export type UploadProgressCallback = (percent: number) => void;

export async function uploadProductMedia(
  file: File,
  productId: string,
  kind: ProductMediaKind,
  onProgress?: UploadProgressCallback,
  retries = 1,
  signal?: AbortSignal
): Promise<string> {
  const creatorToken = localStorage.getItem("creator_token") || "";
  const creatorName = localStorage.getItem("creator_name") || "";

  let lastError: any = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new Error("Загрузка отменена");
    }
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (signal?.aborted) {
      throw new Error("Загрузка отменена");
    }
    try {
      // Step 1: Request signed upload URL from upload-product-media edge function
      const { data, error } = await supabase.functions.invoke("upload-product-media", {
        body: {
          action: "get_upload_url",
          productId,
          creatorName,
          creatorToken,
          kind,
          fileName: file.name,
          fileType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
        },
      });

      if (error) {
        let msg = error.message || "Upload failed";
        try {
          if ("context" in error && typeof (error as any).context?.json === "function") {
            const errJson = await (error as any).context.json();
            if (errJson?.error) msg = String(errJson.error);
          }
        } catch {
          // ignore
        }
        if (msg.includes("Failed to send a request") && attempt < retries) {
          lastError = new Error(msg);
          continue;
        }
        if (msg.includes("Failed to send a request")) {
          throw new Error("Не удалось загрузить медиафайл. Попробуйте ещё раз.");
        }
        throw new Error(msg);
      }

      // Step 2A: If proxy stream or S3 upload URL returned (for videos)
      if ((data?.uploadType === "proxy_stream" || data?.uploadType === "s3" || data?.uploadUrl?.includes("upload-product-media") || data?.uploadUrl?.includes("amazonaws.com")) && data?.uploadUrl) {
        const publicUrl = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable && onProgress) {
              const pct = Math.min(99, Math.round((e.loaded / e.total) * 100));
              onProgress(pct);
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              onProgress?.(100);
              try {
                const res = JSON.parse(xhr.responseText);
                resolve((res?.publicUrl || res?.url || data?.publicUrl || data?.url) as string);
              } catch {
                resolve((data?.publicUrl || data?.url) as string);
              }
            } else {
              let errorDetail = `код ${xhr.status}`;
              try {
                const res = JSON.parse(xhr.responseText);
                if (res?.error) errorDetail = res.error;
              } catch {
                // ignore
              }
              reject(new Error(`Ошибка сохранения видео (${errorDetail})`));
            }
          });
          xhr.addEventListener("error", () =>
            reject(new Error("Сетевой сбой при сохранении видео в хранилище"))
          );
          xhr.addEventListener("abort", () => reject(new Error("Загрузка видео была прервана")));

          if (signal) {
            if (signal.aborted) {
              xhr.abort();
              reject(new Error("Загрузка отменена"));
              return;
            }
            signal.addEventListener("abort", () => {
              xhr.abort();
              reject(new Error("Загрузка отменена"));
            }, { once: true });
          }

          const isDirectS3 = data.uploadUrl.includes("amazonaws.com");
          xhr.open(isDirectS3 ? "PUT" : "POST", data.uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.send(file);
        });

        return publicUrl;
      }

      // Step 2B: If Supabase Storage signed URL returned (for images)
      if (data?.token && data?.path) {
        onProgress?.(10);
        const { error: uploadError } = await supabase.storage
          .from("product-media")
          .uploadToSignedUrl(data.path, data.token, file, {
            contentType: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
            upsert: true,
          });

        if (uploadError) {
          const errMsg = uploadError.message || "";
          if (errMsg.includes("exceeded the maximum allowed size") || (uploadError as any)?.statusCode === "413") {
            throw new Error("Файл превышает лимит хранилища (максимум 50 МБ).");
          }
          throw new Error(errMsg || "Ошибка загрузки файла в хранилище");
        }

        onProgress?.(100);
        return (data.publicUrl || data.url) as string;
      }

      if (data?.uploadUrl && data?.publicUrl) {
        // Step 2 fallback: Direct multipart upload to signed URL
        const formPayload = new FormData();
        formPayload.append("cacheControl", "3600");
        formPayload.append("", file);

        const putRes = await fetch(data.uploadUrl, {
          method: "PUT",
          body: formPayload,
        });

        if (!putRes.ok) {
          const statusText = putRes.statusText || `Код ${putRes.status}`;
          throw new Error(`Ошибка сохранения файла в хранилище (${statusText})`);
        }

        return (data.publicUrl || data.url) as string;
      }

      // Fallback: If edge function returned direct URL (legacy)
      if (data?.url || data?.publicUrl) {
        return (data.url || data.publicUrl) as string;
      }

      throw new Error("Не удалось получить адрес для загрузки файла");
    } catch (err: any) {
      lastError = err;
      if (err?.message?.includes("Failed to send a request") && attempt < retries) {
        continue;
      }
      if (err?.message?.includes("Failed to send a request")) {
        throw new Error("Не удалось загрузить медиафайл. Попробуйте ещё раз.");
      }
      throw err;
    }
  }

  throw lastError || new Error("Не удалось загрузить файл");
}
