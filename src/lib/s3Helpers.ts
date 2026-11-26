import { supabase } from "@/integrations/supabase/client";
import { uploadMaterialObject } from "./materialUpload";

/**
 * Check if a file_url points to S3 storage
 */
export function isS3Path(fileUrl: string): boolean {
  return fileUrl.startsWith('s3://');
}

/**
 * Get a presigned URL for an S3 file
 */
export async function getS3DownloadUrl(
  path: string,
  role: 'student' | 'teacher' | 'creator',
  userId?: string,
  download?: string | false
): Promise<string> {
  const { data, error } = await supabase.functions.invoke('tokenized-download', {
    body: {
      path,
      role,
      userId,
      download: download || false,
      sessionToken: localStorage.getItem("simple_session_token") || "",
      creatorToken: localStorage.getItem("creator_token") || "",
      creatorName: localStorage.getItem("creator_name") || "",
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.url;
}

/**
 * Get an S3 file as a Blob via server-side proxy (avoids CORS issues)
 */
export async function getS3FileBlob(
  path: string,
  role: 'student' | 'teacher' | 'creator',
  userId?: string
): Promise<{ blob: Blob; fileName: string }> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/s3-download-proxy`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, role, userId }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to download file');
  }

  const blob = await response.blob();
  const fileName = decodeURIComponent(path.split('/').pop() || 'download');
  return { blob, fileName };
}

export interface UploadProgressCallback {
  (progress: number): void;
}

/**
 * Upload a file to S3 via presigned URL (supports large files up to 5GB)
 * Step 1: Get presigned PUT URL from edge function
 * Step 2: Upload file directly to S3 from the browser
 */
export async function uploadFileToS3(
  file: File,
  productId: string,
  role: 'creator' | 'teacher',
  options: {
    creatorToken?: string;
    creatorName?: string;
    teacherId?: string;
    sessionToken?: string;
    onProgress?: UploadProgressCallback;
  }
): Promise<string> {
  return uploadMaterialObject(file, {
    endpoint: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-presign-upload`,
    publicKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    credentials: {
      productId, role, creatorToken: options.creatorToken, creatorName: options.creatorName,
      teacherId: options.teacherId,
      sessionToken: options.sessionToken || localStorage.getItem("simple_session_token") || "",
    },
    onProgress: options.onProgress,
  });
}
