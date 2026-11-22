import { useEffect, useState } from "react";
import { Video } from "lucide-react";
import { videoPoster } from "@/lib/videoPoster";

/**
 * First frame of a video picked on this device, for the attachment tile. When the browser
 * cannot draw it, a small video mark in the corner still says it is a video.
 */
const LocalVideoThumb = ({ src }: { src: string }) => {
  const [poster, setPoster] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setPoster(undefined);
    void videoPoster(src).then((p) => alive && setPoster(p));
    return () => {
      alive = false;
    };
  }, [src]);

  if (poster) return <img src={poster} alt="" className="h-full w-full object-cover" />;
  if (poster === null) {
    return (
      <span className="relative block h-full w-full bg-neutral-800 text-white">
        <Video className="absolute bottom-1.5 left-1.5 h-4 w-4" />
      </span>
    );
  }
  return null;
};

export default LocalVideoThumb;
