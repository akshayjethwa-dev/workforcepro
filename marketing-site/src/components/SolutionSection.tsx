interface OutcomeItem {
  headline: string;
  subtext: string;
  accent: 'green' | 'blue';
  icon: 'shieldCheck' | 'scaleCheck' | 'smartphoneCheck';
}

const OUTCOMES: OutcomeItem[] = [
  {
    headline: 'Stop paying for absent workers.',
    subtext:
      'Every rupee goes only to verified shifts on site—eliminating ghost attendance, buddy punching, and inflated overtime.',
    accent: 'green',
    icon: 'shieldCheck',
  },
  {
    headline: 'Automate Labour Code compliance.',
    subtext:
      'Stay audit-ready every month without spreadsheet guesswork across PF, ESI, and the 50% basic wage mandate.',
    accent: 'blue',
    icon: 'scaleCheck',
  },
  {
    headline: 'Zero hardware required.',
    subtext:
      'Go live across every factory floor, warehouse, and site today using the phones your supervisors and team already carry.',
    accent: 'green',
    icon: 'smartphoneCheck',
  },
];

function OutcomeIcon({ type }: { type: OutcomeItem['icon'] }) {
  switch (type) {
    case 'shieldCheck':
      return (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'scaleCheck':
      return (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case 'smartphoneCheck':
      return (
        <svg
          className="w-6 h-6"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
          <path d="m9 11 2 2 4-4" />
          <path d="M12 18h.01" />
        </svg>
      );
  }
}

export default function SolutionSection() {
  return (
    <section
      id="solution"
      aria-labelledby="solution-heading"
      className="relative py-20 sm:py-24 bg-gradient-to-b from-slate-50 via-blue-50/40 to-emerald-50/40 border-t border-blue-100"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Visual bridge badge transitioning from Problem -> Solution */}
        <div className="max-w-3xl mx-auto text-center mb-14">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold bg-emerald-50 text-brand-green ring-1 ring-emerald-200 mb-4">
            <span className="w-2 h-2 rounded-full bg-brand-green" />
            The Better Way Forward
          </span>
          <h2
            id="solution-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-brand-blue"
          >
            WorkforcePro fixes this.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Turn daily attendance chaos into clean, predictable payroll from day one.
          </p>
        </div>

        {/* Outcome Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {OUTCOMES.map((item) => {
            const isGreen = item.accent === 'green';
            return (
              <article
                key={item.headline}
                className="bg-white rounded-2xl p-6 sm:p-8 border border-blue-100/90 shadow-sm hover:shadow-md hover:border-brand-green/40 transition-all"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ring-1 ${
                    isGreen
                      ? 'bg-emerald-50 text-brand-green ring-emerald-200/80'
                      : 'bg-blue-50 text-brand-blue ring-blue-200/80'
                  }`}
                >
                  <OutcomeIcon type={item.icon} />
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-3">
                  {item.headline}
                </h3>
                <p className="text-slate-600 leading-relaxed">{item.subtext}</p>
              </article>
            );
          })}
        </div>

        {/* Clean blue/green transformation callout bar */}
        <div className="mt-12 rounded-2xl bg-brand-blue text-white p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-sm">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300">
              Built for Indian SMBs
            </p>
            <p className="mt-1 text-lg sm:text-xl font-semibold">
              From manual register headaches to 100% verified attendance in under 15 minutes.
            </p>
          </div>
          <a
            href="https://workforcepro-saas.web.app/"
            className="flex-shrink-0 inline-flex items-center justify-center px-5 py-3 rounded-xl font-semibold bg-brand-green hover:bg-emerald-500 text-white transition-colors shadow-sm"
          >
            See It in Action
          </a>
        </div>
      </div>
    </section>
  );
}