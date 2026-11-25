interface StepItem {
  stepNumber: string;
  title: string;
  subtitle: string;
  description: string;
  icon: 'userPlus' | 'messageCircle' | 'checkCircle';
}

const STEPS: StepItem[] = [
  {
    stepNumber: '01',
    title: 'Sets up the account',
    subtitle: 'Takes 2 minutes',
    description:
      'Create your workspace, set shift rules, and configure statutory defaults without spending hours on setup.',
    icon: 'userPlus',
  },
  {
    stepNumber: '02',
    title: 'Workers tap a WhatsApp link',
    subtitle: 'No app download',
    description:
      'Share a simple WhatsApp link so workers start checking in right away—zero training sessions or new apps to install.',
    icon: 'messageCircle',
  },
  {
    stepNumber: '03',
    title: 'You run compliant payroll',
    subtitle: 'System does the math',
    description:
      'Review verified attendance, let the system handle PF, ESI, and wage calculations, and close payroll with confidence.',
    icon: 'checkCircle',
  },
];

function StepIcon({ type }: { type: StepItem['icon'] }) {
  switch (type) {
    case 'userPlus':
      return (
        <svg
          className="w-5 h-5"
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
          <line x1="19" x2="19" y1="8" y2="14" />
          <line x1="22" x2="16" y1="11" y2="11" />
        </svg>
      );
    case 'messageCircle':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'checkCircle':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="m9 11 3 3L22 4" />
        </svg>
      );
  }
}

export default function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="py-20 sm:py-24 bg-slate-50 border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-green mb-3">
            Simple Onboarding for CAs &amp; Teams
          </p>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            Go from client signup to compliant payroll in three steps.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Built so Chartered Accountants can onboard clients fast without getting bogged down in manual setup.
          </p>
        </div>

        {/* Stepper: Vertical on mobile, horizontal 3-step stepper on md+ */}
        <ol className="relative grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6 lg:gap-8">
          {STEPS.map((step, index) => {
            const isLast = index === STEPS.length - 1;
            const isFinalStep = step.stepNumber === '03';

            return (
              <li key={step.stepNumber} className="relative flex md:flex-col items-start gap-4 md:gap-0">
                {/* Connector line: Vertical on mobile, horizontal on desktop */}
                {!isLast && (
                  <>
                    <span
                      aria-hidden="true"
                      className="md:hidden absolute left-5 top-12 bottom-[-2rem] w-0.5 bg-slate-200"
                    />
                    <span
                      aria-hidden="true"
                      className="hidden md:block absolute top-5 left-[calc(2.5rem+0.75rem)] right-[-1.5rem] lg:right-[-2rem] h-0.5 bg-slate-200"
                    />
                  </>
                )}

                {/* Step Marker */}
                <div className="relative z-10 flex items-center gap-3 md:mb-6">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ring-4 ring-slate-50 ${
                      isFinalStep
                        ? 'bg-brand-green text-white'
                        : 'bg-brand-blue text-white'
                    }`}
                  >
                    {step.stepNumber}
                  </div>
                  <span
                    className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      isFinalStep
                        ? 'bg-emerald-50 text-brand-green ring-1 ring-emerald-200'
                        : 'bg-blue-50 text-brand-blue ring-1 ring-blue-200'
                    }`}
                  >
                    <StepIcon type={step.icon} />
                    Step {index + 1}
                  </span>
                </div>

                {/* Step Card Content */}
                <div className="flex-1 w-full bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-brand-blue">
                      {step.subtitle}
                    </span>
                    <span className="md:hidden inline-flex items-center text-slate-400">
                      <StepIcon type={step.icon} />
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    {step.title}
                  </h3>
                  <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        {/* CTA Button at the end */}
        <div className="mt-12 text-center">
          <a
            href="https://workforcepro-saas.web.app/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-brand-blue hover:bg-blue-800 text-white transition-colors shadow-sm"
          >
            <span>See how it works in action.</span>
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}