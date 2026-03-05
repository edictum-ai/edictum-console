import { cn } from "@/lib/utils"

interface EdictumLogoProps {
  /** Rendered width/height in px */
  size?: number
  className?: string
}

/**
 * Variant D — Layered Shield.
 * Renders theme-aware: white brackets on dark, slate brackets on light.
 */
export function EdictumLogo({ size = 32, className }: EdictumLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {/* Outer shield — amber ghost */}
      <path
        d="M48 4L12 20V44C12 66 28 84 48 92C68 84 84 66 84 44V20L48 4Z"
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeLinejoin="round"
        className="opacity-30 dark:opacity-30"
      />
      {/* Inner shield — solid amber outline */}
      <path
        d="M48 12L20 26V44C20 62 32 76 48 84C64 76 76 62 76 44V26L48 12Z"
        fill="#f59e0b"
        fillOpacity="0.08"
        stroke="#f59e0b"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="dark:fill-opacity-6"
      />
      {/* Left bracket */}
      <path
        d="M36 36L28 48L36 60"
        className="stroke-slate-900 dark:stroke-slate-50"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Right bracket */}
      <path
        d="M60 36L68 48L60 60"
        className="stroke-slate-900 dark:stroke-slate-50"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Slash accent */}
      <line
        x1="52"
        y1="34"
        x2="44"
        y2="62"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
        className="opacity-60 dark:opacity-50"
      />
    </svg>
  )
}
