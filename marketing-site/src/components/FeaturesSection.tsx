interface BenefitFeature {
  title: string;
  description: string;
  icon: 'mapPin' | 'calculator' | 'messageSquare' | 'userCheck' | 'inbox' | 'fileCheck';
  accent: 'blue' | 'green';
}

const BENEFIT_FEATURES: BenefitFeature[] = [
  {
    title: 'Know Exactly Who is On-Site',
    description:
      'See real-time attendance across every site boundary so you know your active crew without chasing supervisors.',
    icon: 'mapPin',
    accent: 'blue',
  },
  {
    title: '1-Click Statutory Payroll',
    description:
      'Generate salary runs with PF, ESI, and deductions already calculated—cutting hours of monthly sheet reconciliation.',
    icon: 'calculator',
    accent: 'green',
  },
  {
    title: 'Zero-Training for Workers',
    description:
      'Workers mark attendance from a familiar WhatsApp flow in seconds—no app downloads, passwords, or classroom training.',
    icon: 'messageSquare',
    accent: 'blue',
  },
  {
    title: 'Prevent Buddy Punching',
    description:
      'Block proxy check-ins and location spoofing so attendance reflects actual presence rather than shared credentials.',
    icon: 'userCheck',
    accent: 'green',
  },
  {
    title: 'Action Inbox for Managers',
    description:
      'Review and approve overtime, leave, and exception requests from one clear queue before payroll locks.',
    icon: 'inbox',
    accent: 'blue',
  },
  {
    title: 'Audit-Ready Compliance',
    description:
      'Flag structures that miss the 50% basic wage rule early so your records stay clean during inspections.',
    icon: 'fileCheck',
    accent: 'green',
  },
];

function FeatureIcon({ type }: { type: BenefitFeature['icon'] }) {
  switch (type) {
    case 'mapPin':
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
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case 'calculator':
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
          <rect width="16" height="20" x="4" y="2" rx="2" />
          <line x1="8" x2="16" y1="6" y2="6" />
          <line x1="16" x2="16" y1="14" y2="18" />
          <path d="M16 10h.01" />
          <path d="M12 10h.01" />
          <path d="M8 10h.01" />
          <path d="M12 14h.01" />
          <path d="M8 14h.01" />
          <path d="M12 18h.01" />
          <path d="M8 18h.01" />
        </svg>
      );
    case 'messageSquare':
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
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <path d="m9 10 2 2 4-4" />
        </svg>
      );
    case 'userCheck':
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <polyline points="16 11 18 13 22 9" />
        </svg>
      );
    case 'inbox':
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
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      );
    case 'fileCheck':
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
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="m9 15 2 2 4-4" />
        </svg>
      );
  }
}

export default function FeaturesSection() {
  return (
    <section
      id="features"
      aria-labelledby="features-heading"
      className="scroll-mt-20 py-20 sm:py-24 bg-white border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-blue mb-3">
            Built for Everyday Operations
          </p>
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            Practical control that pays for itself every month.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Designed around how managers actually run shifts, verify presence, and close payroll—at just ₹1,999/month.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {BENEFIT_FEATURES.map((feature) => {
            const isGreen = feature.accent === 'green';
            return (
              <article
                key={feature.title}
                className="rounded-2xl p-6 sm:p-8 bg-slate-50/70 border border-slate-200/90 hover:bg-white hover:border-brand-blue/30 hover:shadow-md transition-all"
              >
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ring-1 ${
                    isGreen
                      ? 'bg-emerald-50 text-brand-green ring-emerald-200/80'
                      : 'bg-blue-50 text-brand-blue ring-blue-200/80'
                  }`}
                >
                  <FeatureIcon type={feature.icon} />
                </div>

                <h3 className="text-xl font-bold text-slate-900 mb-2.5">
                  {feature.title}
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}