"use client";

import { useT } from "@/i18n/i18n-provider";

function Spinner() {
  return <span className="spinner" aria-hidden />;
}

export function ProtectedRouteLoading() {
  const t = useT();

  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-2 text-sm text-[var(--ink-soft)]">
        <Spinner />
        {t("session.loadingWithKharisma")}
      </div>
    </main>
  );
}
