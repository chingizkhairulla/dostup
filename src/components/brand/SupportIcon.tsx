import type { SVGProps } from "react";

/**
 * Support: a headset whose band breaks off at the top right for a light bulb; the microphone
 * boom runs from under the bulb down to the mouthpiece. Drawn on the same 24×24 grid with
 * round strokes as the lucide icons beside it in the header.
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
    {/* Left ear cup and the headband up to the bulb */}
    <path d="M3.2 11.1C2.5 11.4 2 12 2 12.8v1.9c0 .8.6 1.4 1.4 1.4h1v-2.5a7.6 7.6 0 0 1 5.25-7.23" />
    {/* Right ear cup */}
    <path d="M20.8 11.1c.7.3 1.2.9 1.2 1.7v1.9c0 .8-.6 1.4-1.4 1.4h-1" />
    {/* Microphone boom and mouthpiece */}
    <path d="M19.3 11.2A7.6 7.6 0 0 1 15.85 20.4H14.4" />
    <rect x="9.2" y="19.4" width="5.2" height="2.4" rx="1.2" />
    {/* Bulb in the top-right corner */}
    <path d="M14.8 10.1v-.5c0-.6-.3-1.1-.8-1.65a3.5 3.5 0 1 1 5 0c-.5.55-.8 1.05-.8 1.65v.5z" />
  </svg>
);

export default SupportIcon;
