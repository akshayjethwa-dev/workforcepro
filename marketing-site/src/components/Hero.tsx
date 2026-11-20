export default function Hero() {
  return (
    <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 bg-gradient-to-b from-slate-50 to-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-3xl mx-auto">
          <span className="inline-block py-1 px-3 rounded-full bg-blue-100 text-brand-blue text-sm font-semibold mb-6 border border-blue-200">
            🚀 Built for Indian SMBs & Factories
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight mb-6 leading-tight">
            Attendance & Payroll, <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-blue to-brand-green">
              Without the Biometric Machine.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
            Workers punch in via a WhatsApp link. You get 100% accurate, geofenced attendance and automated PF/ESI-compliant payroll in one dashboard.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#demo" className="bg-brand-blue hover:bg-blue-800 text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5">
              Start Free Trial
            </a>
            <a href="#video" className="bg-white border-2 border-slate-200 hover:border-brand-blue text-slate-700 px-8 py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2">
              <svg className="w-6 h-6 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch 2-Min Demo
            </a>
          </div>
        </div>

        {/* Hero Image / App Screenshot Placeholder */}
        <div className="mt-16 relative mx-auto max-w-5xl">
          <div className="rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden aspect-video flex items-center justify-center bg-slate-100 relative">
             {/* Replace this div with your actual app screenshot: <img src="/dashboard-mockup.png" alt="Dashboard" /> */}
             <span className="text-slate-400 font-medium text-lg">[ Insert Dashboard Screenshot Here ]</span>
             
             {/* Decorative floating elements */}
             <div className="absolute top-10 -left-6 bg-white p-4 rounded-xl shadow-lg border border-slate-100 flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-sm font-semibold">Worker Punched In</span>
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}