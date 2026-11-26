interface PricingTier {
  id: string;
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  href: string;
  popular?: boolean;
}

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    price: '₹0',
    description: 'Start tracking daily attendance with zero upfront spend.',
    features: [
      'Up to 10 workers',
      'Attendance & Time Tracking',
      'Basic Reports & Exports',
      'Biometric Face Kiosk (limited)',
    ],
    ctaLabel: 'Start Free Trial',
    href: 'https://workforcepro-saas.web.app/login?plan=growth',
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '₹1,999',
    period: '/month',
    description: 'Ideal for growing workshops and teams running regular payroll.',
    features: [
      'Up to 50 workers',
      'Basic Payroll & Slips',
      'Salary Advances',
      'Shift Roster & Scheduling',
    ],
    ctaLabel: 'Get Started with Growth',
    href: 'https://workforcepro-saas.web.app/login?plan=growth',
    popular: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '₹3,999',
    period: '/month',
    description: 'Full statutory automation and wage guardrails for scaling SMBs.',
    features: [
      'Up to 100 workers',
      'Full Statutory Compliance',
      'AI Anomaly & Fraud Detection',
      '50% Wage Rule Auto-Fix',
      'Multi-Branch & Locations',
    ],
    ctaLabel: 'Choose Pro Plan',
    href: 'https://workforcepro-saas.web.app/login?plan=growth',
  },
];

export default function PricingSection() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="scroll-mt-20 py-20 sm:py-24 bg-white border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-blue mb-3">
            Transparent Pricing
          </p>
          <h2
            id="pricing-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            Simple plans you can budget for immediately.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            No hidden setup fees, no hardware lock-in, and no &ldquo;Contact Sales&rdquo; runaround.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          {PRICING_TIERS.map((tier) => {
            const isPopular = Boolean(tier.popular);

            return (
              <article
                key={tier.id}
                className={`relative rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-all ${
                  isPopular
                    ? 'bg-white border-2 border-brand-blue shadow-lg ring-4 ring-blue-50'
                    : 'bg-slate-50/60 border border-slate-200/90 shadow-sm hover:bg-white hover:border-slate-300'
                }`}
              >
                <div>
                  {isPopular && (
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-blue text-white">
                        Most Popular
                      </span>
                      <span className="text-xs font-semibold text-brand-green">
                        14-day free trial
                      </span>
                    </div>
                  )}

                  <h3 className="text-xl font-bold text-slate-900">{tier.name}</h3>
                  <p className="mt-1.5 text-sm text-slate-600">{tier.description}</p>

                  <div className="mt-6 pb-6 border-b border-slate-200 flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900">
                      {tier.price}
                    </span>
                    {tier.period && (
                      <span className="text-base font-medium text-slate-500">
                        {tier.period}
                      </span>
                    )}
                  </div>

                  <ul className="mt-6 space-y-3.5">
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-slate-700 text-sm sm:text-base">
                        <span
                          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                            isPopular
                              ? 'bg-emerald-50 text-brand-green ring-1 ring-emerald-200'
                              : 'bg-blue-50 text-brand-blue ring-1 ring-blue-200'
                          }`}
                          aria-hidden="true"
                        >
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                        <span className="font-medium">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-4">
                  <a
                    href={tier.href}
                    className={`w-full inline-flex items-center justify-center rounded-xl px-5 py-3 text-sm sm:text-base font-semibold transition-colors shadow-sm ${
                      isPopular
                        ? 'bg-brand-blue hover:bg-blue-800 text-white'
                        : 'bg-white hover:bg-slate-100 text-brand-blue border border-brand-blue/30'
                    }`}
                  >
                    {tier.ctaLabel}
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}