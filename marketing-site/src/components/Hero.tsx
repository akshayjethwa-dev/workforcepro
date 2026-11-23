export default function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-blue-50 to-white py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="inline-block bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full mb-4">
            Built for Indian SMBs & Factories
          </span>

          {/* 👇 Updated headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Automated Attendance & Payroll for Indian SMBs.
          </h1>

          {/* 👇 Updated sub‑headline */}
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Workers punch in via WhatsApp. You get PF/ESI‑compliant payroll in 1 click.
          </p>

          {/* Primary CTA */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a
              href="https://workforcepro-saas.web.app"
              className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition text-lg"
            >
              Start Your Free Trial
            </a>
            <button className="bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg border border-blue-600 hover:bg-blue-50 transition text-lg">
              Watch 2‑Min Demo
            </button>
          </div>
        </div>

        {/* Hero Image / App Screenshot Placeholder */}
        <div className="mt-16 relative">
          {/* Replace this div with your actual app screenshot */}
          <div className="bg-white rounded-2xl shadow-2xl p-8 text-center text-gray-400 border border-gray-200">
            [ Insert Dashboard Screenshot Here ]
          </div>

          {/* Decorative floating elements */}
          <div className="absolute -top-4 -left-4 bg-green-100 text-green-700 text-sm font-medium px-4 py-2 rounded-full shadow">
            Worker Punched In
          </div>
        </div>
      </div>
    </section>
  );
}