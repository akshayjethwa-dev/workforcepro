import { useState } from 'react';

type UseCase = {
  id: string;
  icon: string;
  title: string;
  pain: string;
  features: string[];
  outcome: string;
};

const USE_CASES: UseCase[] = [
  {
    id: 'construction',
    icon: '🏗️',
    title: 'Construction',
    pain: "Stop paying for workers who didn't show up at the site.",
    features: [
      'GPS geo-fenced WhatsApp punch-in — only counts attendance from the site',
      'Daily-wage auto-calculation with per-contractor reports',
      'Photo verification on punch-in to eliminate proxy attendance',
      'Instant WhatsApp alerts when a worker doesn\'t report by shift start',
    ],
    outcome:
      'Most construction firms recover 3–6% of monthly labour cost in the first 30 days from ghost-worker elimination alone.',
  },
  {
    id: 'logistics',
    icon: '🚚',
    title: 'Logistics',
    pain: "Know exactly who's on which route, in real time.",
    features: [
      'Shift-based rosters — assign drivers and loaders to vehicles in one tap',
      'WhatsApp check-in at depot or route start (no app install required)',
      'Automatic overtime and trip-allowance calculation',
      'Live dashboard showing crew-per-vehicle and unassigned shifts',
    ],
    outcome:
      'Dispatch teams stop chasing WhatsApp groups for "who is on which truck" — one dashboard, updated in real time.',
  },
  {
    id: 'factories',
    icon: '🏭',
    title: 'Factories',
    pain: 'End proxy attendance and shift confusion on the shop floor.',
    features: [
      'Biometric or WhatsApp hybrid punch-in per shift (A / B / C)',
      'Auto-assigned shift rosters with weekly off rotation',
      'Overtime computed per the Factories Act — zero manual errors',
      'PF, ESI, and Labour Code compliance baked into payroll',
    ],
    outcome:
      'Compliance audits go from a 3-day scramble to a 1-click report your auditor will love.',
  },
  {
    id: 'retail',
    icon: '🏬',
    title: 'Multi-Outlet Retail',
    pain: 'See staff attendance across every store from one dashboard.',
    features: [
      'Geo-fenced punch-in per outlet — no cross-store check-ins',
      'Central dashboard rolling up attendance from all locations',
      'Per-store labour-cost reports for P&L and store-manager reviews',
      'Same-day payroll adjustments when staff swap shifts or leave early',
    ],
    outcome:
      'Regional managers get one number per store instead of 30 spreadsheets every month-end.',
  },
];

export default function UseCasesSection() {
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section id="use-cases" className="py-20 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <span className="inline-block bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full mb-4">
            Who is this for?
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Built for the industries that leak the most payroll
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            If you run one of these businesses, WorkforcePro was designed for
            exactly your problem. Click a card to see how.
          </p>
        </div>

        {/* Cards grid */}
        <div className="grid md:grid-cols-2 gap-6 items-start">
          {USE_CASES.map((useCase) => {
            const isOpen = openId === useCase.id;
            return (
              <div
                key={useCase.id}
                className={`bg-white rounded-2xl border transition-all duration-300 ${
                  isOpen
                    ? 'border-blue-500 shadow-lg ring-1 ring-blue-100'
                    : 'border-gray-200 shadow-sm hover:shadow-md hover:border-blue-200'
                }`}
              >
                <button
                  onClick={() => toggle(useCase.id)}
                  className="w-full text-left p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-2xl"
                  aria-expanded={isOpen}
                  aria-controls={`usecase-${useCase.id}-details`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-3xl shrink-0">{useCase.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {useCase.title}
                      </h3>
                      <p className="text-gray-700 text-sm leading-relaxed">
                        {useCase.pain}
                      </p>
                      <div className="mt-4 flex items-center gap-2 text-blue-600 font-medium text-sm">
                        <span>
                          {isOpen ? 'Hide details' : 'See how it works'}
                        </span>
                        <span
                          className={`inline-block transition-transform duration-300 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        >
                          ▾
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                {/* Expandable details */}
                <div
                  id={`usecase-${useCase.id}-details`}
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${
                    isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-6 pb-6 pt-2 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-4">
                      How WorkforcePro solves it
                    </p>
                    <ul className="space-y-2 mb-5">
                      {useCase.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-gray-700 text-sm"
                        >
                          <span className="text-green-600 shrink-0 mt-0.5">
                            ✓
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-900">
                      <span className="font-semibold">Outcome: </span>
                      {useCase.outcome}
                    </div>
                    <a
                      href="https://workforcepro-saas.web.app"
                      className="inline-block mt-4 text-blue-600 font-semibold text-sm hover:text-blue-800 transition"
                    >
                      Start your free trial for {useCase.title.toLowerCase()} →
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}