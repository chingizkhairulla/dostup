import { supabase } from "@/integrations/supabase/client";

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
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  // Step 1: Get presigned upload URL
  const presignResponse = await fetch(`${supabaseUrl}/functions/v1/s3-presign-upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      productId,
      role,
      fileName: file.name,
      fileType: file.type || 'application/octet-stream',
      creatorToken: options.creatorToken,
      creatorName: options.creatorName,
      teacherId: options.teacherId,
      sessionToken: options.sessionToken || localStorage.getItem("simple_session_token") || "",
    }),
  });

  if (!presignResponse.ok) {
    const errorData = await presignResponse.json().catch(() => ({}));
    throw new Error(errorData.error || 'Не удалось получить адрес для загрузки файла');
  }

  const { uploadUrl, storagePath } = await presignResponse.json().catch(() => ({}));
  // Without this check a missing URL turns into PUT "undefined" and a confusing 404.
  if (typeof uploadUrl !== 'string' || !uploadUrl || typeof storagePath !== 'string' || !storagePath) {
    throw new Error('Не удалось получить адрес для загрузки файла. Попробуйте ещё раз.');
  }

  // Step 2: Upload file directly to S3 using XMLHttpRequest for progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && options.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        options.onProgress(percent);
      }
    });
    
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        console.error(`S3 upload failed with status ${xhr.status}:`, xhr.responseText);
        reject(new Error(`Не удалось сохранить файл в хранилище (код ${xhr.status}). Попробуйте ещё раз.`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Сетевой сбой при загрузке файла. Проверьте интернет и попробуйте ещё раз.'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Загрузка файла прервана'));
    });
    
    xhr.open('PUT', uploadUrl);
    // Content-Type is already included in the presigned URL signature
    xhr.send(file);
  });

  return storagePath;
}
