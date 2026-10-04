import type { SVGProps } from "react";

/**
 * Support: a light bulb wearing a headset with a microphone. Drawn on the same 24×24 grid
 * with round strokes as the lucide icons beside it in the header.
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
    {/* Bulb and its base */}
    <path d="M10 17v-.8c0-.7-.4-1.3-1-1.9a4.2 4.2 0 1 1 6 0c-.6.6-1 1.2-1 1.9v.8" />
    <path d="M10 17h4" />
    <path d="M10.75 19.5h2.5" />
    {/* Headband and ear cups */}
    <path d="M4.4 12.5v-1.1a7.6 7.6 0 0 1 15.2 0v1.1" />
    <rect x="2.75" y="11.5" width="3.3" height="5" rx="1.4" />
    <rect x="17.95" y="11.5" width="3.3" height="5" rx="1.4" />
    {/* Microphone boom */}
    <path d="M19.6 16.5v.6a3 3 0 0 1-3 3h-1" />
  </svg>
);

export default SupportIcon;
