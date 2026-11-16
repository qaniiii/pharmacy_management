"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Shared modal shell for the welfare editors and the order drawer. Keeps focus
 * on the panel, closes on Escape or a backdrop click, and scrolls when the form
 * is taller than the viewport.
 */
export function Modal({
  open,
  onClose,
  titleId,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: string;
  description?: string;
  size?: "md" | "lg" | "xl";
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const width =
    size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-3xl" : "max-w-2xl";

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 p-4 sm:p-6"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`mx-auto mt-6 w-full ${width} rounded-2xl border border-slate-200 bg-white shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2
              id={titleId}
              className="text-sm font-semibold text-slate-900"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Close
          </button>
        </div>

        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
