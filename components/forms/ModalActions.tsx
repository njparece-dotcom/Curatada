"use client";

// Bottom action row for Add/Edit modals: Cancel + Submit. The submit button
// shows a spinner and swaps its label between "Uploading..." and the
// configurable saving label while submitting.

interface ModalActionsProps {
  onCancel: () => void;
  submitting: boolean;
  uploading?: boolean;
  submitLabel: string;
  /** Saving label shown while submitting but after upload finishes. Defaults to "Saving...". */
  savingLabel?: string;
  /** Icon shown next to the submit label when idle. Defaults to a plus glyph. */
  submitIcon?: React.ReactNode;
}

const DefaultPlusIcon = (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const Spinner = (
  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export default function ModalActions({
  onCancel,
  submitting,
  uploading = false,
  submitLabel,
  savingLabel = "Saving...",
  submitIcon = DefaultPlusIcon,
}: ModalActionsProps) {
  return (
    <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
      <button
        type="button"
        onClick={onCancel}
        className="px-5 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-text hover:bg-surface-3 transition-colors"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 bg-accent hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium px-6 py-2.5 rounded-xl transition-colors text-sm"
      >
        {submitting ? (
          <>
            {Spinner}
            {uploading ? "Uploading..." : savingLabel}
          </>
        ) : (
          <>
            {submitIcon}
            {submitLabel}
          </>
        )}
      </button>
    </div>
  );
}
