import { createLucideIcon, type LucideProps } from "lucide-react";

// Icons drawn for this app. Single-colour ones follow the lucide stroke style and take `currentColor`.

type SizeProps = Readonly<{ size?: number; className?: string }>;

// Spiral galaxy made of two arms, redrawn in a 24x24 box with the same stroke style as the lucide icons.
export const MapIcon = createLucideIcon("Galaxy", [
  ["path", { d: "M2.72 15.05C0.32 6.79 18.32 0.04 17.67 10.12C17.05 15.25 8.65 17.08 9.5 13.53", key: "arm-a" }],
  ["path", { d: "M20.93 6.33C25.03 17.28 5.64 24.1 6.28 14.02C6.9 8.88 15.3 7.06 14.46 10.6", key: "arm-b" }],
]);

// No Man's Sky logo, marking systems with an Atlas Interface.
export function AtlasIcon({ size = 24, className }: SizeProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={3}
      viewBox="0 0 48 48"
      width={size}
    >
      <path d="M11.466 18.784L24 13.689M24 44.5l12.535-25.716L24 3.5L11.466 18.784zm12.535-25.716L24 13.689M24 3.5v41" />
      <path d="M24 24.45a5.666 5.666 0 0 0 4.698-8.834" />
    </svg>
  );
}

// Ringed planet, marking systems with a gas giant.
export function GasGiantIcon({ size = 24, className }: SizeProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle cx="12" cy="12" r="5.5" />
      <ellipse cx="12" cy="12" rx="10.5" ry="3.2" transform="rotate(-20 12 12)" />
    </svg>
  );
}

const waterDropPath =
  "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z";

// Water drop filled to `level` thirds (0 dry, 1 shallow, 2 ocean, 3 deep). `clipId` must be unique on the page
// (pass a `useId` value); the fill and outline colours come from the `planet-water-*` classes.
export function WaterLevelIcon({
  level,
  clipId,
  size = 14,
}: Readonly<{ level: number; clipId: string; size?: number }>) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 24 24" width={size}>
      {level > 0 && (
        <>
          <clipPath id={clipId}>
            <rect height="24" width="24" x="0" y={22 - (20 * level) / 3} />
          </clipPath>
          <path className="planet-water-fill" clipPath={`url(#${clipId})`} d={waterDropPath} />
        </>
      )}
      <path className="planet-water-outline" d={waterDropPath} />
    </svg>
  );
}

export const DiscordIcon = createLucideIcon("Discord", [
  [
    "path",
    {
      d: "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
      fill: "currentColor",
      stroke: "none",
      key: "logo",
    },
  ],
]);

// Google "G" in its own brand colours.
export function GoogleIcon({ size = 18 }: Readonly<Pick<LucideProps, "size">>) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 48 48" width={size}>
      <path
        fill="#4285F4"
        d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"
      />
      <path
        fill="#34A853"
        d="M24 44c5.6 0 10.3-1.9 13.7-5.1L31 33.8c-1.9 1.3-4.2 2.1-7 2.1-5.4 0-10-3.7-11.6-8.6H5.5v5.3A20.7 20.7 0 0 0 24 44Z"
      />
      <path fill="#FBBC05" d="M12.4 27.3a12.4 12.4 0 0 1 0-7.9v-5.3H5.5a20.5 20.5 0 0 0 0 18.5l6.9-5.3Z" />
      <path
        fill="#EA4335"
        d="M24 10.8c3 0 5.7 1 7.8 3l5.9-5.8A19.8 19.8 0 0 0 24 2a20.7 20.7 0 0 0-18.5 12.1l6.9 5.3c1.6-4.9 6.2-8.6 11.6-8.6Z"
      />
    </svg>
  );
}
