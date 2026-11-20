interface PainPoint {
  title: string;
  description: string;
  accent: 'red' | 'orange';
  icon: 'fingerprint' | 'wallet' | 'shield';
}

const PAIN_POINTS: PainPoint[] = [
  {
    title: 'Broken Biometrics',
    description: "Workers' fingers are worn out, machines fail.",
    accent: 'red',
    icon: 'fingerprint',
  },
  {
    title: 'Payroll Leakage',
    description: 'Buddy punching and manual overrides cost lakhs.',
    accent: 'orange',
    icon: 'wallet',
  },
  {
    title: 'Compliance Fear',
    description: 'PF, ESI, and the new 50% wage rule are impossible to track in Excel.',
    accent: 'red',
    icon: 'shield',
  },
];

function PainIcon({ type }: { type: PainPoint['icon'] }) {
  switch (type) {
    case 'fingerprint':
      return (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
          <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
          <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
          <path d="M2 12a10 10 0 0 1 18-6" />
          <path d="M2 16h.01" />
          <path d="M21.8 16c.2-2 .131-5.354 0-6" />
          <path d="M5 19.5A9.9 9.9 0 0 1 7.25 14" />
          <path d="M7.8 7.5A6 6 0 0 1 18 12c0 1.26-.05 2.43-.15 3.5" />
          <path d="M9.5 18.5c.35-1.45.5-3.25.5-5a2 2 0 0 1 3.73-.96" />
        </svg>
      );
    case 'wallet':
      return (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      );
    case 'shield':
      return (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      );
  }
}

export default function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="py-20 sm:py-24 bg-slate-50 border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-red-600 mb-3">
            Why Traditional Setups Break Down
          </p>
          <h2
            id="problem-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            The reality of managing a workforce in India.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {PAIN_POINTS.map((point) => {
            const isRed = point.accent === 'red';
            return (
              <article
                key={point.title}
                className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm hover:border-red-200 transition-colors"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ring-1 ${
                    isRed
                      ? 'bg-red-50 text-red-600 ring-red-200/80'
                      : 'bg-orange-50 text-orange-600 ring-orange-200/80'
                  }`}
                >
                  <PainIcon type={point.icon} />
                </div>

                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  {point.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {point.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}