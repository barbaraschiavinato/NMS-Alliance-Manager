"use client";

import { useEffect } from "react";
import Image from "next/image";
import { CloseIcon } from "@/components/shared/icons";
import { useLocale } from "@/components/providers/locale-provider";

// Large view of a pet image; closes with the X button, Escape or a click on the backdrop.
export function PetImageDialog({
  name,
  imageUrl,
  onClose,
}: Readonly<{ name: string; imageUrl: string; onClose: () => void }>) {
  const { t } = useLocale();

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop pet-image-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <dialog aria-labelledby="pet-image-title" aria-modal="true" className="mission-dialog pet-image-dialog" open>
        <div className="dialog-heading">
          <div>
            <h2 id="pet-image-title">{name}</h2>
          </div>
          <button aria-label={t("common.close")} autoFocus className="icon-button" onClick={onClose} type="button">
            <CloseIcon size={18} />
          </button>
        </div>
        <Image
          alt={t("pets.image_of", { name })}
          className="pet-image-dialog-image"
          height={720}
          src={imageUrl}
          unoptimized
          width={960}
        />
      </dialog>
    </div>
  );
}
