interface CompliancePoint {
  text: string;
  highlight: string;
}

const COMPLIANCE_POINTS: CompliancePoint[] = [
  {
    highlight: 'DPDP Act 2023',
    text: 'Fully compliant with the DPDP Act 2023 (consent management for biometrics).',
  },
  {
    highlight: '50% Wage Rule',
    text: 'Auto-checks the new 50% Wage Rule (Code on Wages).',
  },
  {
    highlight: 'PF, ESI, and PT',
    text: 'Automated PF, ESI, and PT calculations.',
  },
  {
    highlight: 'encrypted at rest and in transit',
    text: 'Data encrypted at rest and in transit.',
  },
];

function ShieldLockIcon() {
  return (
    <svg
      className="w-7 h-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <rect width="8" height="6" x="8" y="10" rx="1" />
      <path d="M10 10V8a2 2 0 1 1 4 0v2" />
    </svg>
  );
}

export default function SecurityComplianceSection() {
  return (
    <section
      id="security-compliance"
      aria-labelledby="security-compliance-heading"
      className="py-20 sm:py-24 bg-white border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Column: Shield/Lock Icon, Heading & Whitepaper CTA */}
          <div className="lg:col-span-6">
            <div className="inline-flex items-center gap-3 mb-5">
              <div className="w-14 h-14 rounded-2xl bg-brand-blue text-white flex items-center justify-center shadow-sm ring-4 ring-blue-50">
                <ShieldLockIcon />
              </div>
              <span className="text-sm font-semibold uppercase tracking-wider text-brand-blue">
                Security &amp; Statutory Compliance
              </span>
            </div>

            <h2
              id="security-compliance-heading"
              className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
            >
              Built for Indian labour laws and audit-grade data protection.
            </h2>

            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Recommend WorkforcePro to your clients with confidence. Every attendance log, wage structure, and statutory calculation is engineered for accuracy and accountability.
            </p>

                      </div>

          {/* Right Column: Explicit Compliance Checklist */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl bg-slate-50 border border-slate-200/90 p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
                <h3 className="text-base font-bold text-slate-900">
                  Compliance &amp; Security Guarantees
                </h3>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-brand-green ring-1 ring-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green" />
                  CA &amp; Audit Ready
                </span>
              </div>

              <ul className="space-y-4">
                {COMPLIANCE_POINTS.map((item) => (
                  <li key={item.text} className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-brand-green ring-1 ring-emerald-200 flex items-center justify-center">
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-slate-700 font-medium leading-relaxed">
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}