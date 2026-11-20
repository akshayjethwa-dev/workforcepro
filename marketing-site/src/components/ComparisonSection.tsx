interface ComparisonRow {
  feature: string;
  workforcePro: string;
  legacySoftware: string;
  highlightPrice?: boolean;
}

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: 'Hardware Required',
    workforcePro: 'No',
    legacySoftware: 'Yes',
  },
  {
    feature: 'Worker App Download',
    workforcePro: 'No',
    legacySoftware: 'Yes',
  },
  {
    feature: 'Setup Time',
    workforcePro: 'Minutes',
    legacySoftware: 'Weeks',
  },
  {
    feature: 'Statutory Compliance',
    workforcePro: 'Automated',
    legacySoftware: 'Add-on',
  },
  {
    feature: 'Price',
    workforcePro: '₹1,999',
    legacySoftware: '₹6,999+',
    highlightPrice: true,
  },
];

export default function ComparisonSection() {
  return (
    <section
      id="comparison"
      aria-labelledby="comparison-heading"
      className="py-20 sm:py-24 bg-white border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-blue mb-3">
            Side-by-Side Comparison
          </p>
          <h2
            id="comparison-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            Why Indian SMBs pick WorkforcePro over legacy tools.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Skip hardware lock-in, slow rollouts, and stacked add-on fees—get practical workforce and payroll control built for real teams.
          </p>
        </div>

        {/* Desktop & Tablet Table (horizontally scrollable on narrow screens) */}
        <div className="hidden sm:block overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
          <table className="w-full text-left border-collapse bg-white">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th
                  scope="col"
                  className="py-4 px-6 text-sm font-bold uppercase tracking-wider text-slate-700 w-1/3"
                >
                  Feature
                </th>
                <th
                  scope="col"
                  className="py-4 px-6 text-sm font-bold uppercase tracking-wider text-brand-blue bg-blue-50/70 w-1/3"
                >
                  WorkforcePro
                </th>
                <th
                  scope="col"
                  className="py-4 px-6 text-sm font-bold uppercase tracking-wider text-slate-600 w-1/3"
                >
                  Legacy Software (Keka/Biometrics)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/80">
              {COMPARISON_ROWS.map((row) => (
                <tr
                  key={row.feature}
                  className={row.highlightPrice ? 'bg-emerald-50/30 font-semibold' : 'hover:bg-slate-50/60'}
                >
                  <td className="py-4 px-6 text-slate-900 font-semibold">
                    {row.feature}
                  </td>
                  <td className="py-4 px-6 bg-blue-50/40 text-brand-blue font-bold">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand-green flex-shrink-0" />
                      <span>{row.workforcePro}</span>
                    </span>
                  </td>
                  <td className="py-4 px-6 text-slate-600">
                    {row.legacySoftware}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Card Layout */}
        <div className="sm:hidden space-y-4">
          {COMPARISON_ROWS.map((row) => (
            <div
              key={row.feature}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-base font-bold text-slate-900 pb-3 mb-3 border-b border-slate-100">
                {row.feature}
              </h3>
              <dl className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-blue-50/70 px-3.5 py-2.5">
                  <dt className="font-semibold text-brand-blue">WorkforcePro</dt>
                  <dd className="font-bold text-brand-blue inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-green" />
                    <span>{row.workforcePro}</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                  <dt className="font-medium text-slate-600">Legacy Software (Keka/Biometrics)</dt>
                  <dd className="font-medium text-slate-700 text-right">{row.legacySoftware}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}