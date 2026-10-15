import React, { useRef, useState, useEffect, useCallback } from "react";
import { Loader2, Play } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

// Глобальный кэш скачанных видео, чтобы воспроизведение было мгновенным и без повторных загрузок
export const videoBlobCache = new Map<string, string>();
const videoDownloadPromises = new Map<string, Promise<string>>();

export function preloadVideoBlob(src: string, onProgress?: (percent: number) => void): Promise<string> {
  if (!src) return Promise.resolve("");
  if (src.startsWith("blob:") || src.startsWith("data:")) {
    return Promise.resolve(src);
  }
  if (videoBlobCache.has(src)) {
    onProgress?.(100);
    return Promise.resolve(videoBlobCache.get(src)!);
  }
  if (videoDownloadPromises.has(src)) {
    return videoDownloadPromises.get(src)!;
  }

  const promise = new Promise<string>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", src);
    xhr.responseType = "blob";

    xhr.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        const blobUrl = URL.createObjectURL(xhr.response);
        videoBlobCache.set(src, blobUrl);
        videoDownloadPromises.delete(src);
        onProgress?.(100);
        resolve(blobUrl);
      } else {
        videoDownloadPromises.delete(src);
        resolve(src); // При ошибке сети отдаем оригинальный URL
      }
    };

    xhr.onerror = () => {
      videoDownloadPromises.delete(src);
      resolve(src);
    };

    xhr.send();
  });

  videoDownloadPromises.set(src, promise);
  return promise;
}

interface ProductVideoPlayerProps {
  src: string;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  objectFit?: "cover" | "contain";
  objectPosition?: string;
  style?: React.CSSProperties;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
}

export const ProductVideoPlayer: React.FC<ProductVideoPlayerProps> = ({
  src,
  className,
  controls = true,
  autoPlay = false,
  muted = false,
  playsInline = true,
  objectFit = "contain",
  objectPosition = "center",
  style,
  onPlay,
  onPause,
  onEnded,
}) => {
  const { l } = useLanguage();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Фактический источник для воспроизведения: если скачали в Blob, используем его
  const [effectiveSrc, setEffectiveSrc] = useState<string>(() => {
    if (!src) return "";
    if (src.startsWith("blob:") || src.startsWith("data:")) return src;
    return videoBlobCache.get(src) || src;
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(autoPlay);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const hasStartedPlaybackRef = useRef<boolean>(false);

  // При изменении src сбрасываем плеер и выставляем актуальный источник
  useEffect(() => {
    setIsPlaying(false);
    setIsLoading(false);
    setIsBuffering(false);
    hasStartedPlaybackRef.current = false;
    setDownloadProgress(0);

    if (!src) {
      setEffectiveSrc("");
      return;
    }

    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setEffectiveSrc(src);
      setDownloadProgress(100);
      return;
    }

    if (videoBlobCache.has(src)) {
      setEffectiveSrc(videoBlobCache.get(src)!);
      setDownloadProgress(100);
      return;
    }

    setEffectiveSrc(src);

    let isMounted = true;
    preloadVideoBlob(src, (pct) => {
      if (isMounted) setDownloadProgress(pct);
    }).then((blobUrl) => {
      if (isMounted && blobUrl) {
        setEffectiveSrc(blobUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [src]);

  const startVideoPlayback = useCallback(async (videoEl: HTMLVideoElement) => {
    try {
      await videoEl.play();
    } catch (err) {
      console.warn("Playback with sound was blocked by the browser, retrying muted:", err);
      try {
        videoEl.muted = true;
        await videoEl.play();
      } catch (e2) {
        console.error("Video failed to start:", e2);
        setIsLoading(false);
        setIsPlaying(false);
      }
    }
  }, []);

  const handleStartPlay = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();

    hasStartedPlaybackRef.current = true;
    setIsLoading(true);

    try {
      // Дожидаемся полной загрузки видео в Blob перед запуском,
      // чтобы видео воспроизводилось из памяти моментально и без остановок/буферизаций
      const blobUrl = await preloadVideoBlob(src, (pct) => {
        setDownloadProgress(pct);
      });

      const finalUrl = blobUrl || src;
      setEffectiveSrc(finalUrl);

      // Запускаем воспроизведение, когда источник готов
      requestAnimationFrame(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.src !== finalUrl) {
          video.src = finalUrl;
        }

        const runPlay = () => {
          startVideoPlayback(video);
        };

        const isBlob = finalUrl.startsWith("blob:") || finalUrl.startsWith("data:");
        if (isBlob || video.readyState >= 3) {
          runPlay();
        } else {
          video.addEventListener("canplaythrough", runPlay, { once: true });
          video.addEventListener("canplay", runPlay, { once: true });
          setTimeout(runPlay, 2500);
        }
      });
    } catch (err) {
      console.error("Video failed to prepare:", err);
      if (videoRef.current) {
        startVideoPlayback(videoRef.current);
      }
    }
  };

  const handlePlaying = useCallback(() => {
    setIsLoading(false);
    setIsBuffering(false);
    setIsPlaying(true);
    onPlay?.();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    setIsLoading(false);
    setIsBuffering(false);
    setIsPlaying(false);
    onPause?.();
  }, [onPause]);

  const handleEnded = useCallback(() => {
    setIsLoading(false);
    setIsBuffering(false);
    setIsPlaying(false);
    onEnded?.();
  }, [onEnded]);

  return (
    <div className={cn("group/videoplayer relative w-full h-full flex items-center justify-center bg-black overflow-hidden select-none isolate", className)}>
      <video
        ref={videoRef}
        src={effectiveSrc}
        controls={controls && isPlaying}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        webkit-playsinline="true"
        disablePictureInPicture
        controlsList="nodownload nofullscreen noremoteplayback"
        preload="auto"
        onPlaying={handlePlaying}
        onPause={handlePause}
        onEnded={handleEnded}
        onWaiting={() => {
          if (isPlaying) setIsBuffering(true);
        }}
        onCanPlay={() => {
          setIsBuffering(false);
        }}
        onError={() => {
          setIsLoading(false);
          setIsBuffering(false);
          setIsPlaying(false);
        }}
        className={cn(
          "w-full h-full",
          objectFit === "cover" ? "object-cover" : "object-contain",
          !isPlaying && "pointer-events-none"
        )}
        style={{ objectPosition, ...style }}
      />

      {/* Кнопка запуска: отображается всегда, пока видео не играет и не грузится */}
      {!isPlaying && !isLoading && (
        <button
          type="button"
          onClick={handleStartPlay}
          className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer z-30 pointer-events-auto focus:outline-hidden"
          style={{ transform: "translate3d(0, 0, 10px)" }}
          aria-label="Play video"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-xl shadow-black/40 pointer-events-none transform transition-transform duration-200 ease-out group-hover/videoplayer:scale-110">
            <Play className="ml-1 h-7 w-7 fill-white text-white" />
          </div>
        </button>
      )}

      {/* Индикатор загрузки: при старте (если видео еще не прогрузилось) или при буферизации во время воспроизведения */}
      {(isLoading || (isPlaying && isBuffering)) && (
        <div
          className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/50 backdrop-blur-xs text-white p-4 pointer-events-none animate-in fade-in duration-150"
          style={{ transform: "translate3d(0, 0, 10px)" }}
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white/10 mb-2 border border-white/20">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
          <p className="text-xs font-medium text-white/90">
            {isLoading
              ? (downloadProgress > 0 && downloadProgress < 100
                  ? l({ ru: `Загрузка видео (${downloadProgress}%)...`, kk: `Бейне жүктелуде (${downloadProgress}%)...`, en: `Loading video (${downloadProgress}%)...` })
                  : l({ ru: "Загрузка видео...", kk: "Бейне жүктелуде...", en: "Loading video..." }))
              : l({ ru: "Буферизация...", kk: "Буферлеу...", en: "Buffering..." })}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProductVideoPlayer;
