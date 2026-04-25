"use client";

import { useT } from "@/i18n/i18n-provider";
import type { MessageVisibility } from "@/messages/visibility";

export function MessageVisibilityToggle({
  value,
  onChange,
}: {
  value: MessageVisibility;
  onChange: (value: MessageVisibility) => void;
}) {
  const t = useT();
  const isHuman = value === "human";
  const label = isHuman
    ? t("messageView.humanDescription")
    : t("messageView.allDescription");
  const palette = isHuman
    ? {
        bg: "rgba(90,143,60,0.12)",
        ink: "var(--green)",
        track: "var(--green)",
      }
    : {
        bg: "var(--accent-bg)",
        ink: "var(--accent-text)",
        track: "var(--accent-text)",
      };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isHuman}
      aria-label={label}
      onClick={() => onChange(isHuman ? "all" : "human")}
      className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-medium transition active:scale-[0.97]"
      style={{ background: palette.bg, color: palette.ink }}
    >
      <span>{label}</span>
      <span
        aria-hidden
        className="relative inline-block h-3.5 w-6 rounded-full transition-colors"
        style={{ background: palette.track }}
      >
        <span
          className="absolute top-[2px] h-2.5 w-2.5 rounded-full bg-[var(--bg)] transition-all"
          style={{ left: isHuman ? "12px" : "2px" }}
        />
      </span>
    </button>
  );
}
