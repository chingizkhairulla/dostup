import { MAX_MATERIAL_PROXY_BYTES } from "../../supabase/functions/_shared/materialUploadPolicy";
export { MAX_MATERIAL_PROXY_BYTES };
export class MaterialNetworkError extends Error {}

interface UploadOptions {
  endpoint: string;
  publicKey: string;
  credentials: Record<string, unknown>;
  onProgress?: (progress: number) => void;
  fetcher?: typeof fetch;
  putFile?: typeof putMaterialFile;
}

export function putMaterialFile(url: string, file: File, onProgress?: (progress: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', event => {
      if (event.lengthComputable) onProgress?.(Math.round(event.loaded / event.total * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Хранилище отклонило загрузку (код ${xhr.status}). Попробуйте ещё раз.`));
    });
    xhr.addEventListener('error', () => reject(new MaterialNetworkError('Не удалось загрузить файл напрямую в хранилище')));
    xhr.addEventListener('timeout', () => reject(new MaterialNetworkError('Хранилище не ответило вовремя')));
    xhr.addEventListener('abort', () => reject(new Error('Загрузка файла прервана')));
    xhr.open('PUT', url);
    // This is the MIME type supplied when requesting the upload address.
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

async function readUploadResponse(response: Response): Promise<{ uploadUrl?: string; storagePath: string }> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const detail = typeof data.error === 'string' ? data.error : '';
    if (detail === 'Server misconfiguration') throw new Error('Хранилище не настроено на сервере. Сообщите администратору.');
    throw new Error(detail || `Ошибка сервера при загрузке (код ${response.status})`);
  }
  if (typeof data.storagePath !== 'string' || !data.storagePath.startsWith('s3://')) throw new Error('Сервер не вернул путь загруженного файла');
  return data;
}

/** Direct S3 upload; a bounded server relay handles browser/CORS network failures. */
export async function uploadMaterialObject(file: File, options: UploadOptions): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const headers = { Authorization: `Bearer ${options.publicKey}`, apikey: options.publicKey };
  const body = { ...options.credentials, fileName: file.name, fileType: file.type || 'application/octet-stream' };
  const signed = await readUploadResponse(await fetcher(options.endpoint, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  if (typeof signed.uploadUrl !== 'string' || !signed.uploadUrl.startsWith('https://')) throw new Error('Сервер не вернул адрес загрузки');
  try {
    await (options.putFile ?? putMaterialFile)(signed.uploadUrl, file, options.onProgress);
    options.onProgress?.(100);
    return signed.storagePath;
  } catch (error) {
    if (!(error instanceof MaterialNetworkError)) throw error;
    if (file.size > MAX_MATERIAL_PROXY_BYTES) {
      throw new Error('Браузер не смог подключиться к хранилищу. Для этого файла проверьте соединение и настройки CORS хранилища.');
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) if (value !== undefined && value !== null) form.append(key, String(value));
    form.append('storagePath', signed.storagePath);
    form.append('file', file);
    const saved = await readUploadResponse(await fetcher(options.endpoint, { method: 'POST', headers, body: form }));
    options.onProgress?.(100);
    return saved.storagePath;
  }
}
