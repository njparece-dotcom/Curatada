"use client";

import type { ReactNode } from "react";

// Modal frame shared by every Add/Edit modal: backdrop with blur, centred
// scrollable card, sticky header with title/subtitle and a close button. The
// caller renders its own <form> as children — this component is purely visual.

interface ModalShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function ModalShell({ title, subtitle, onClose, children }: ModalShellProps) {
  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="modal-content bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-border sticky top-0 bg-surface z-10">
          <div>
            <h2 className="text-xl font-bold text-text">{title}</h2>
            {subtitle && <p className="text-sm text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-surface-3 text-text-muted hover:text-text transition-colors flex items-center justify-center"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
