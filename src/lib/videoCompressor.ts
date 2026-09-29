import {
  Input,
  Output,
  Conversion,
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Mp4OutputFormat,
} from "mediabunny";

export type CompressProgressCallback = (percent: number) => void;

export const COMPRESSION_THRESHOLD = 30 * 1024 * 1024; // 30 МБ

/**
 * Безопасное сжатие видео перед загрузкой в облако:
 * 1. Оптимизирует только огромные видео (больше 30 МБ).
 * 2. Сжимает до HD/720p H.264 с битрейтом ~2.2 Мбит/с.
 * 3. Поддерживает отмену через AbortSignal.
 */
export async function compressVideoIfNeeded(
  file: File,
  onProgress?: CompressProgressCallback,
  signal?: AbortSignal
): Promise<File> {
  // Обрабатываем только видеофайлы
  if (!file.type.startsWith("video/")) {
    return file;
  }

  // Оптимизируем только огромные видео (более 30 МБ), обычные видео загружаются мгновенно без задержек
  if (file.size <= COMPRESSION_THRESHOLD) {
    return file;
  }

  // Проверяем поддержку аппаратного кодирования в браузере
  if (typeof window === "undefined" || typeof (window as any).VideoEncoder === "undefined") {
    return file;
  }

  if (signal?.aborted) {
    throw new Error("Загрузка отменена");
  }

  try {
    const input = new Input({
      source: new BlobSource(file),
      formats: ALL_FORMATS,
    });

    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      return file;
    }

    const origWidth = await videoTrack.getDisplayWidth();
    const origHeight = await videoTrack.getDisplayHeight();

    if (!origWidth || !origHeight) {
      return file;
    }

    // Ограничиваем длинную сторону максимум 1280px (720p для вертикального или горизонтального)
    const MAX_DIM = 1280;
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > MAX_DIM || origHeight > MAX_DIM) {
      if (origWidth > origHeight) {
        targetWidth = MAX_DIM;
        targetHeight = Math.round((origHeight * MAX_DIM) / origWidth);
      } else {
        targetHeight = MAX_DIM;
        targetWidth = Math.round((origWidth * MAX_DIM) / origHeight);
      }
    }

    // Размеры обязаны быть чётными числами для H.264
    targetWidth = Math.round(targetWidth / 2) * 2;
    targetHeight = Math.round(targetHeight / 2) * 2;

    const output = new Output({
      // moov в начале файла: плеер начинает показ, не дожидаясь загрузки конца видео.
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new BufferTarget(),
    });

    const audioTrack = await input.getPrimaryAudioTrack();
    const hasAudio = Boolean(audioTrack);

    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: {
        width: targetWidth,
        height: targetHeight,
        fit: "contain",
        codec: "avc",
        bitrate: 2_200_000, // 2.2 Мбит/с — отличное качество для мобильных экранов
      },
      audio: hasAudio
        ? {
            codec: "aac",
            bitrate: 128_000,
          }
        : {
            discard: true,
          },
      showWarnings: false,
    });

    if (!conversion.isValid) {
      console.warn("Mediabunny conversion is not valid, using original file");
      return file;
    }

    if (onProgress) {
      conversion.onProgress = (p) => {
        if (signal?.aborted) return;
        onProgress(Math.min(99, Math.max(1, Math.round(p * 100))));
      };
    }

    // Проверяем сигнал отмены перед запуском
    if (signal?.aborted) {
      throw new Error("Загрузка отменена");
    }

    await conversion.execute();

    if (signal?.aborted) {
      throw new Error("Загрузка отменена");
    }

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength === 0) {
      return file;
    }

    // Если сжатый файл не уменьшил вес, отдаем исходный файл
    if (buffer.byteLength >= file.size) {
      onProgress?.(100);
      return file;
    }

    const compressedBlob = new Blob([buffer], { type: "video/mp4" });
    const outputFileName = file.name.replace(/\.[^.]+$/, ".mp4");
    const compressedFile = new File([compressedBlob], outputFileName, {
      type: "video/mp4",
    });

    onProgress?.(100);
    return compressedFile;
  } catch (err: any) {
    if (signal?.aborted || err?.message === "Загрузка отменена") {
      throw err;
    }
    console.warn("Сжатие видео не удалось, отправляем оригинал:", err);
    return file;
  }
}
