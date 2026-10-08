import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const COVER_FRAME_WIDTH = 384;
export const COVER_FRAME_HEIGHT = 240;

export const COVER_OUTPUT_WIDTH = 1200;
export const COVER_OUTPUT_HEIGHT = 750;

export interface CoverCropResult {
  file: File;
  type: "image" | "video";
  objectPosition?: string;
  previewUrl: string;
}

export function useCoverCrop() {
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video">("image");
  const [mediaDimensions, setMediaDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoomState] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  const previewStyle = useMemo(() => {
    if (!mediaDimensions) return undefined;
    const baseScale = Math.max(
      COVER_FRAME_WIDTH / mediaDimensions.width,
      COVER_FRAME_HEIGHT / mediaDimensions.height
    );
    const scale = baseScale * zoom;
    const rw = mediaDimensions.width * scale;
    const rh = mediaDimensions.height * scale;

    return {
      width: `${rw}px`,
      height: `${rh}px`,
      transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
    };
  }, [mediaDimensions, zoom, offset]);

  const setZoom = (newZoom: number) => {
    const clamped = Math.min(3, Math.max(1, newZoom));
    setZoomState(clamped);
    if (!mediaDimensions) return;

    const baseScale = Math.max(
      COVER_FRAME_WIDTH / mediaDimensions.width,
      COVER_FRAME_HEIGHT / mediaDimensions.height
    );
    const scale = baseScale * clamped;
    const rw = mediaDimensions.width * scale;
    const rh = mediaDimensions.height * scale;
    const maxX = Math.max(0, (rw - COVER_FRAME_WIDTH) / 2);
    const maxY = Math.max(0, (rh - COVER_FRAME_HEIGHT) / 2);

    setOffset((prev) => ({
      x: Math.min(maxX, Math.max(-maxX, prev.x)),
      y: Math.min(maxY, Math.max(-maxY, prev.y)),
    }));
  };

  const resetCrop = () => {
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setMediaDimensions(null);
    setZoomState(1);
    setOffset({ x: 0, y: 0 });
    setOriginalFile(null);
    imageElementRef.current = null;
    videoElementRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (source) URL.revokeObjectURL(source);
    };
  }, [source]);

  const loadFile = (file: File) => {
    const isVid = file.type.startsWith("video/");
    const isImg = file.type.startsWith("image/");
    if (!isVid && !isImg) return "invalid_type";

    const url = URL.createObjectURL(file);
    setOriginalFile(file);
    setSource(url);
    setZoomState(1);
    setOffset({ x: 0, y: 0 });

    if (isVid) {
      setMediaType("video");
      const video = document.createElement("video");
      video.preload = "metadata";
      video.src = url;
      video.onloadedmetadata = () => {
        setMediaDimensions({
          width: video.videoWidth || 1280,
          height: video.videoHeight || 720,
        });
      };
      videoElementRef.current = video;
    } else {
      setMediaType("image");
      const img = new Image();
      img.onload = () => {
        setMediaDimensions({
          width: img.naturalWidth || 1200,
          height: img.naturalHeight || 750,
        });
        imageElementRef.current = img;
      };
      img.src = url;
    }
    return null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current || !mediaDimensions) return;
    const baseScale = Math.max(
      COVER_FRAME_WIDTH / mediaDimensions.width,
      COVER_FRAME_HEIGHT / mediaDimensions.height
    );
    const scale = baseScale * zoom;
    const rw = mediaDimensions.width * scale;
    const rh = mediaDimensions.height * scale;
    const maxX = Math.max(0, (rw - COVER_FRAME_WIDTH) / 2);
    const maxY = Math.max(0, (rh - COVER_FRAME_HEIGHT) / 2);

    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;

    setOffset({
      x: Math.min(maxX, Math.max(-maxX, dragRef.current.ox + dx)),
      y: Math.min(maxY, Math.max(-maxY, dragRef.current.oy + dy)),
    });
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const cropResult = async (): Promise<CoverCropResult> => {
    if (!originalFile || !mediaDimensions) {
      throw new Error("Нет файла для обработки");
    }

    const baseScale = Math.max(
      COVER_FRAME_WIDTH / mediaDimensions.width,
      COVER_FRAME_HEIGHT / mediaDimensions.height
    );
    const scale = baseScale * zoom;
    const rw = mediaDimensions.width * scale;
    const rh = mediaDimensions.height * scale;
    const maxX = Math.max(0, (rw - COVER_FRAME_WIDTH) / 2);
    const maxY = Math.max(0, (rh - COVER_FRAME_HEIGHT) / 2);

    const percentX = maxX > 0 ? 50 - (offset.x / maxX) * 50 : 50;
    const percentY = maxY > 0 ? 50 - (offset.y / maxY) * 50 : 50;
    const objectPosition = `${Math.round(percentX)}% ${Math.round(percentY)}%`;

    if (mediaType === "video") {
      const previewUrl = URL.createObjectURL(originalFile);
      return {
        file: originalFile,
        type: "video",
        objectPosition,
        previewUrl,
      };
    }

    // Image: Crop to exact 16:10 rectangle canvas
    const img = imageElementRef.current;
    if (!img) throw new Error("Изображение не загружено");

    const canvas = document.createElement("canvas");
    canvas.width = COVER_OUTPUT_WIDTH;
    canvas.height = COVER_OUTPUT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Не удалось создать холст");

    const cropW = COVER_FRAME_WIDTH / scale;
    const cropH = COVER_FRAME_HEIGHT / scale;
    const centerX = mediaDimensions.width / 2 - offset.x / scale;
    const centerY = mediaDimensions.height / 2 - offset.y / scale;
    const sx = Math.max(0, centerX - cropW / 2);
    const sy = Math.max(0, centerY - cropH / 2);

    ctx.drawImage(
      img,
      sx,
      sy,
      cropW,
      cropH,
      0,
      0,
      COVER_OUTPUT_WIDTH,
      COVER_OUTPUT_HEIGHT
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Не удалось сохранить изображение"))),
        "image/jpeg",
        0.92
      );
    });

    const croppedFile = new File([blob], originalFile.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
    });

    const previewUrl = URL.createObjectURL(croppedFile);
    return {
      file: croppedFile,
      type: "image",
      objectPosition: "50% 50%",
      previewUrl,
    };
  };

  return {
    source,
    mediaType,
    mediaDimensions,
    zoom,
    setZoom,
    offset,
    previewStyle,
    loadFile,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    resetCrop,
    cropResult,
    getCroppedImage: cropResult,
  };
}
