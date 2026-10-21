"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { MemberCardDialog } from "@/components/modals/member-card-dialog";
import { useLocale } from "@/components/providers/locale-provider";

export function MemberProfileLink({
  memberId,
  name,
  current = false,
}: Readonly<{ memberId?: string; name: string; current?: boolean }>) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <strong className={current ? "current-member" : undefined}>
        {memberId ? (
          <button
            className="member-profile-link"
            data-tooltip={t("profile.view_profile")}
            onClick={() => setOpen(true)}
            type="button"
          >
            {name}
          </button>
        ) : (
          name
        )}
      </strong>
      {open &&
        memberId &&
        createPortal(<MemberCardDialog memberId={memberId} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
