interface AnnouncementBarProps {
  onDismiss: () => void;
}

export default function AnnouncementBar({ onDismiss }: AnnouncementBarProps) {
  return (
    <div
      role="region"
      aria-label="Promotional announcement"
      className="relative w-full bg-brand-blue text-white text-sm text-center py-2 px-10 z-50"
    >
      <p className="leading-snug">
        🎉 Free 14-day trial for SMBs. No credit card required.
      </p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss announcement bar"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60 transition-colors"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 6L6 18" />
          <path d="M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}