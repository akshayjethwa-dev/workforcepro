export default function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-300 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-10 border-b border-slate-800">
          {/* Column 1: Logo & Short Tagline */}
          <div className="md:col-span-5">
            <a href="#" className="inline-flex items-center gap-2.5">
              <div className="w-9 h-9 bg-brand-blue rounded-lg flex items-center justify-center text-white font-bold text-xl ring-1 ring-white/15">
                W
              </div>
              <span className="font-bold text-xl text-white tracking-tight">
                WorkforcePro
              </span>
            </a>
            <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-sm leading-relaxed">
              Hardware-free WhatsApp attendance and statutory-compliant payroll built for Indian SMBs and Chartered Accountants.
            </p>
          </div>

          {/* Column 2: Legal & Compliance Links */}
          <div className="md:col-span-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4">
              Legal &amp; Compliance
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="https://workforcepro-saas.web.app/privacy"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://workforcepro-saas.web.app/terms"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="#security-compliance"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  DPDP Compliance
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact Details */}
          <div className="md:col-span-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white mb-4">
              Contact &amp; Support
            </h3>
            <ul className="space-y-3 text-sm">
              <li>
                <a
                  href="mailto:hello@ashreysystems.com"
                  className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-brand-green flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <span>hello@ashreysystems.com</span>
                </a>
              </li>
              <li>
                <a
                  href="tel:+912692240100"
                  className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <svg
                    className="w-4 h-4 text-brand-green flex-shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <span>+91 8460852903</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Copyright Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
          <p>© 2026 WorkforcePro, Anand, Gujarat.</p>
          <p className="text-xs text-slate-500">
            DPDP Act 2023 &amp; Indian Labour Code Ready
          </p>
        </div>
      </div>
    </footer>
  );
}