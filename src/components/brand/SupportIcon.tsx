import type { SVGProps } from "react";

/**
 * Support: a plain headset — one band over the top, the microphone boom running from the right
 * ear cup down to the mouthpiece. Drawn on the same 24×24 grid with round strokes as the lucide
 * icons beside it in the header.
 */
const SupportIcon = ({ strokeWidth = 1.75, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...props}
  >
    {/* Left ear cup, the headband over the top, the right ear cup */}
    <path d="M3.2 11.1C2.5 11.4 2 12 2 12.8v1.9c0 .8.6 1.4 1.4 1.4h1v-2.5a7.6 7.6 0 0 1 15.2 0v2.5h1c.8 0 1.4-.6 1.4-1.4v-1.9c0-.8-.5-1.4-1.2-1.7" />
    {/* Microphone boom and mouthpiece */}
    <path d="M19.6 16.1v.3a4.2 4.2 0 0 1-4.2 4.2h-1" />
    <rect x="9.2" y="19.4" width="5.2" height="2.4" rx="1.2" />
  </svg>
);

export default SupportIcon;
