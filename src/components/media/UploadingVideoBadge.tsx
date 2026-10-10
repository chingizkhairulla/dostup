import { Loader2, Play } from "lucide-react";

/** Play mark of a video tile with a spinner around it while the file uploads, so it reads as a video from the start. */
const UploadingVideoBadge = () => (
  <span className="relative flex h-9 w-9 items-center justify-center text-white">
    <Loader2 className="absolute inset-0 h-9 w-9 animate-spin" strokeWidth={1.75} />
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/55">
      <Play className="ml-px h-3 w-3 fill-current" />
    </span>
  </span>
);

export default UploadingVideoBadge;
