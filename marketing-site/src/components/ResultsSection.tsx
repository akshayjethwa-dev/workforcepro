interface KpiMetric {
  value: string;
  label: string;
  detail: string;
}

const KPI_METRICS: KpiMetric[] = [
  {
    value: '100%',
    label: 'Eliminate Buddy Punching.',
    detail: 'Verified check-ins tied to genuine presence instead of shared IDs or proxy punches.',
  },
  {
    value: '15+ Hours',
    label: 'Saved on payroll every month.',
    detail: 'Automated attendance rollups and statutory deductions replace manual spreadsheet cleanup.',
  },
  {
    value: '0',
    label: 'Hardware costs (No biometric machines).',
    detail: 'Skip costly terminals, fingerprint repairs, and maintenance contracts across every site.',
  },
];

export default function ResultsSection() {
  return (
    <section
      id="results"
      aria-labelledby="results-heading"
      className="py-20 sm:py-24 bg-brand-blue text-white border-t border-blue-900/60"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-emerald-300 mb-3">
            Measurable Business Impact
          </p>
          <h2
            id="results-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-white"
          >
            Numbers that make the business case easy.
          </h2>
          <p className="mt-4 text-lg text-blue-100/90">
            Built to protect margins, reclaim team hours, and keep rollout costs flat as your headcount grows.
          </p>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {KPI_METRICS.map((kpi) => (
            <div
              key={kpi.value}
              className="rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 p-7 sm:p-8 text-center flex flex-col justify-between"
            >
              <div>
                <dt className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-emerald-300 mb-3">
                  {kpi.value}
                </dt>
                <dd className="text-xl font-bold text-white mb-2">
                  {kpi.label}
                </dd>
              </div>
              <p className="text-sm sm:text-base text-blue-100/85 leading-relaxed">
                {kpi.detail}
              </p>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}