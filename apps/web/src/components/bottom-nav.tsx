"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/i18n-provider";
import type { MessageKey } from "@/i18n/messages";

type Tab = {
  labelKey: MessageKey;
  href: string;
  icon: (active: boolean) => React.ReactNode;
  match: (pathname: string) => boolean;
};

const tabs: Tab[] = [
  {
    labelKey: "nav.rooms",
    href: "/groups",
    match: (p) => p === "/groups" || p.startsWith("/groups/"),
    icon: (active) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "var(--ink)" : "var(--ink-soft)"}
        strokeWidth="1.8"
      >
        <circle cx="9" cy="10" r="5" />
        <circle cx="16" cy="14" r="5" />
      </svg>
    ),
  },
  {
    labelKey: "nav.latest",
    href: "/latest",
    match: (p) => p === "/latest",
    icon: (active) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "var(--ink)" : "var(--ink-soft)"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12h4l3-7 4 14 3-7h4" />
      </svg>
    ),
  },
  {
    labelKey: "nav.profile",
    href: "/profile",
    match: (p) => p === "/profile",
    icon: (active) => (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "var(--ink)" : "var(--ink-soft)"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      </svg>
    ),
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const t = useT();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-around items-center border-t border-[var(--line)] bg-[var(--bg)] px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5">
      {tabs.map((tab) => {
        const active = tab.match(pathname);
        const label = t(tab.labelKey);
        return (
          <Link
            key={tab.labelKey}
            href={tab.href}
            className="flex flex-col items-center gap-1"
          >
            {tab.icon(active)}
            <span
              className="text-[10px]"
              style={{
                color: active ? "var(--ink)" : "var(--ink-soft)",
                fontWeight: active ? 500 : 400,
              }}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
