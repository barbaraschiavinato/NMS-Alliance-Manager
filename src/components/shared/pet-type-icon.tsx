import { petTypeIcons } from "@/lib/pets/pet-type-icons";
import type { PetType } from "@/lib/pets/pets";

export function PetTypeIcon({
  type,
  size = 14,
  className,
}: Readonly<{ type: PetType; size?: number; className?: string }>) {
  const icon = petTypeIcons[type];
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height={size}
      style={{ color: icon.color }}
      viewBox={icon.viewBox}
      width={size}
    >
      {icon.paths.map((path) => (
        <path key={path.d} {...path} />
      ))}
    </svg>
  );
}
