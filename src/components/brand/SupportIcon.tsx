import type { SVGProps } from "react";

/**
 * Support: a plain headset — one band over the top, the microphone boom running from the right
 * ear cup down to the mouthpiece. Fills the 24×24 grid edge to edge (2.5–22), like the bell and
 * the gear beside it in the header, so it reads the same size.
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
    {/* Headband over the top, from ear to ear */}
    <path d="M3 13v-1.5a9 9 0 0 1 18 0V13" />
    {/* Ear cups */}
    <path d="M3 13a1.5 1.5 0 0 1 1.5-1.5h1A1.5 1.5 0 0 1 7 13v3.5A1.5 1.5 0 0 1 5.5 18h-1A1.5 1.5 0 0 1 3 16.5Z" />
    <path d="M21 13a1.5 1.5 0 0 0-1.5-1.5h-1A1.5 1.5 0 0 0 17 13v3.5a1.5 1.5 0 0 0 1.5 1.5h1a1.5 1.5 0 0 0 1.5-1.5Z" />
    {/* Microphone boom and mouthpiece */}
    <path d="M21 16.5v.5a4 4 0 0 1-4 4h-2.6" />
    <rect x="9.4" y="19.9" width="5" height="2.2" rx="1.1" />
  </svg>
);

export default SupportIcon;
