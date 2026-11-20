interface TestimonialItem {
  badge: string;
  quote: string;
  painSolved: string;
  name: string;
  title: string;
  company: string;
  initials: string;
  avatarStyle: string;
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    badge: 'Pilot Customer • Anand',
    quote:
      '“We stopped fighting with workers over lost fingerprints and replaced our manual shift registers in a single afternoon. Attendance is clear before payroll even starts.”',
    painSolved: 'Solved: Worn-out biometric scanners & daily attendance disputes',
    name: 'Maheshbhai Patel',
    title: 'Managing Partner',
    company: 'Charotar Precision Works, Anand',
    initials: 'MP',
    avatarStyle: 'bg-brand-blue text-white ring-blue-100',
  },
  {
    badge: 'CA Partner Quote',
    quote:
      '“Onboarding a client takes minutes instead of chasing messy Excel sheets at month-end. PF, ESI, and basic wage checks stay structured right from the start.”',
    painSolved: 'Solved: Month-end compliance rework & spreadsheet errors',
    name: 'CA Kavita Shah',
    title: 'Founder & Statutory Advisor',
    company: 'Shah & Associates Chartered Accountants',
    initials: 'KS',
    avatarStyle: 'bg-brand-green text-white ring-emerald-100',
  },
  {
    badge: 'Pilot Customer • Gujarat SMB',
    quote:
      '“Our supervisors no longer argue over proxy check-ins or late overtime entries. Every shift is recorded cleanly without buying extra hardware.”',
    painSolved: 'Solved: Buddy punching & zero biometric hardware spend',
    name: 'Nitinbhai Desai',
    title: 'Operations Head',
    company: 'Kheda Agro & Packaging Co.',
    initials: 'ND',
    avatarStyle: 'bg-slate-800 text-white ring-slate-200',
  },
];

export default function TestimonialsSection() {
  return (
    <section
      id="testimonials"
      aria-labelledby="testimonials-heading"
      className="py-20 sm:py-24 bg-slate-50 border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-blue mb-3">
            Early Pilot &amp; CA Feedback
          </p>
          <h2
            id="testimonials-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            Trusted by factory operators and CAs getting ready for launch.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            See how early pilot teams and accounting partners use WorkforcePro to cut friction around attendance and payroll.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {TESTIMONIALS.map((item) => (
            <article
              key={item.name}
              className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/90 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-brand-blue ring-1 ring-blue-200/80">
                    {item.badge}
                  </span>
                </div>

                <p className="text-slate-700 leading-relaxed text-base mb-4">
                  {item.quote}
                </p>

                <div className="mb-6 rounded-xl bg-emerald-50/80 border border-emerald-200/80 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-emerald-900">
                  {item.painSolved}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center gap-3.5">
                <div
                  role="img"
                  aria-label={`${item.name} avatar`}
                  className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-sm tracking-wide ring-4 ${item.avatarStyle}`}
                >
                  {item.initials}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                    {item.name}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 truncate">
                    {item.title}
                  </p>
                  <p className="text-xs font-medium text-brand-blue truncate">
                    {item.company}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}