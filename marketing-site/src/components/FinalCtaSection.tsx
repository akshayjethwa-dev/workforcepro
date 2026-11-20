export default function FinalCtaSection() {
  return (
    <section
      id="final-cta"
      aria-labelledby="final-cta-heading"
      className="py-16 sm:py-20 bg-white border-t border-slate-200/80"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-brand-green px-6 py-14 sm:px-12 sm:py-16 lg:px-16 text-center text-white shadow-lg">
          <div className="max-w-3xl mx-auto">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-100 mb-3">
              14-Day Free Trial • No Credit Card Required
            </p>
            <h2
              id="final-cta-heading"
              className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white"
            >
              Ready to modernize your workforce?
            </h2>
            <p className="mt-4 text-base sm:text-lg text-emerald-50 max-w-2xl mx-auto leading-relaxed">
              Eliminate buddy punching, automate PF/ESI and 50% wage rule checks, and go live in minutes without buying biometric hardware.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://workforcepro-saas.web.app"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-7 py-3.5 text-base font-bold text-brand-blue hover:bg-blue-50 transition-colors shadow-sm"
              >
                <span>Start Your Free Trial Today</span>
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.25}
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
        </div>
      </div>
    </section>
  );
}