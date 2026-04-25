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
  const options: Array<{ value: MessageVisibility; label: string }> = [
    { value: "all", label: t("messageView.all") },
    { value: "human", label: t("messageView.human") },
  ];

  return (
    <div className="inline-flex rounded-full bg-[var(--surface)] p-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium transition"
            style={{
              background: selected ? "var(--ink)" : "transparent",
              color: selected ? "var(--bg)" : "var(--ink-soft)",
            }}
            aria-pressed={selected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
