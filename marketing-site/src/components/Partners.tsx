import { useState } from 'react';
import { Link } from 'react-router-dom';
import PartnerModal from '../components/PartnerModal';

// ─────────────────────────────────────────────────────────────
// Commission math — single source of truth.
// Change PLAN_PRICE / COMMISSION_RATE here and both the
// calculator and the disclaimer update automatically.
// ─────────────────────────────────────────────────────────────
const PLAN_PRICE = 1999;           // ₹ / month, standard plan
const COMMISSION_RATE = 0.20;      // 20% lifetime commission
const COMMISSION_PER_CLIENT = 400; // ≈ 1999 * 0.20 = 399.80, rounded for display

export default function PartnersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [clientCount, setClientCount] = useState(25);

  const monthlyEarnings = clientCount * COMMISSION_PER_CLIENT;
  const yearlyEarnings = monthlyEarnings * 12;

  const openModal = () => setIsModalOpen(true);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ──────────────────────────────
          Edge case: Confused SMB owner
          ────────────────────────────── */}
      <div className="bg-blue-600 text-white text-sm py-2 px-4">
        <div className="max-w-7xl mx-auto text-center">
          Are you a business owner looking to manage your own payroll?{' '}
          <Link
            to="/"
            className="underline font-semibold hover:text-blue-100 whitespace-nowrap"
          >
            Click here for the main platform →
          </Link>
        </div>
      </div>

      {/* ──────────────────────────────
          Hero
          ────────────────────────────── */}
      <section className="bg-gradient-to-br from-blue-50 to-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <span className="inline-block bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1 rounded-full mb-4">
            WorkforcePro Partner Program
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Earn Recurring Income by Digitizing Your Clients' Payroll.
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Partner with WorkforcePro and earn 20% lifetime commission on every
            client you refer. We handle the tech, support, and compliance — you
            just earn.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="bg-blue-600 text-white font-semibold px-8 py-3 rounded-lg hover:bg-blue-700 transition text-lg shadow-lg"
          >
            Become a Partner
          </button>
        </div>
      </section>

      {/* ──────────────────────────────
          Value Props
          ────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            Why Partner with WorkforcePro
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="text-4xl mb-4">🚀</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Zero Operational Work
              </h3>
              <p className="text-gray-600">
                We onboard, train, and support your clients. You refer them
                once — we handle everything else, from setup to day-to-day
                queries.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="text-4xl mb-4">💰</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                20% Lifetime Commission
              </h3>
              <p className="text-gray-600">
                Earn 20% of every subscription — that's ~₹
                {COMMISSION_PER_CLIENT.toLocaleString('en-IN')}/month per active
                client on our ₹{PLAN_PRICE.toLocaleString('en-IN')} plan.
                Predictable, recurring income that grows with your book.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Automated Labour Code Compliance
              </h3>
              <p className="text-gray-600">
                PF, ESI, and the new Labour Codes are fully handled. Your
                clients stay compliant — and you look like a hero for
                recommending us.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────
          Commission Calculator
          ────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Estimate Your Recurring Income
          </h2>
          <p className="text-center text-gray-600 mb-10">
            Move the slider to see how much you could earn as a WorkforcePro
            partner.
          </p>

          <div className="bg-gray-50 rounded-2xl p-8 shadow-sm border border-gray-100">
            <label
              htmlFor="client-slider"
              className="block text-lg font-medium text-gray-800 mb-4"
            >
              How many clients do you have?
            </label>

            <div className="flex items-center gap-4 mb-6">
              <input
                id="client-slider"
                type="range"
                min={1}
                max={200}
                value={clientCount}
                onChange={(e) => setClientCount(Number(e.target.value))}
                className="flex-1 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-2xl font-bold text-blue-600 w-20 text-right tabular-nums">
                {clientCount}
              </span>
            </div>

            <div className="border-t border-gray-200 pt-6 grid sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  Estimated Monthly Earnings
                </p>
                <p className="text-3xl font-extrabold text-gray-900 tabular-nums">
                  ₹{monthlyEarnings.toLocaleString('en-IN')}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">
                  Estimated Yearly Earnings
                </p>
                <p className="text-3xl font-extrabold text-gray-900 tabular-nums">
                  ₹{yearlyEarnings.toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              Based on ~₹
              {COMMISSION_PER_CLIENT.toLocaleString('en-IN')}/month per active
              client (20% of our standard ₹
              {PLAN_PRICE.toLocaleString('en-IN')}/month plan, rounded). Actual
              earnings depend on the plan your clients choose — every ₹
              {PLAN_PRICE.toLocaleString('en-IN')}/month client earns you ₹
              {(PLAN_PRICE * COMMISSION_RATE).toFixed(2)}/month.
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────
          White-label options
          ────────────────────────────── */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            White‑Label Options for Larger Partners
          </h2>
          <p className="text-center text-gray-600 mb-10 max-w-3xl mx-auto">
            Managing a larger book of clients? Get WorkforcePro branded as your
            own — custom logo, domain, and invoices.
          </p>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Co‑Branded
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>✓ Your logo on the client dashboard</li>
                <li>✓ Co‑branded invoices and emails</li>
                <li>✓ Standard 20% lifetime commission</li>
                <li>✓ Partner dashboard for tracking</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-500 p-8 relative">
              <span className="absolute -top-3 right-6 bg-blue-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                Enterprise
              </span>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                Full White‑Label
              </h3>
              <ul className="space-y-2 text-gray-600">
                <li>✓ Your own domain &amp; branding</li>
                <li>✓ Custom pricing to your clients</li>
                <li>✓ Dedicated partner success manager</li>
                <li>✓ API access for deep integrations</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────
          How it works for partners
          ────────────────────────────── */}
      <section className="py-16 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                title: 'Apply',
                desc: 'Fill the partner form — takes under a minute.',
              },
              {
                step: '2',
                title: 'Refer',
                desc: 'Share your unique referral link with your SMB clients.',
              },
              {
                step: '3',
                title: 'Earn',
                desc: 'Get 20% recurring commission, paid out monthly.',
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  {step}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {title}
                </h3>
                <p className="text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────
          Final CTA
          ────────────────────────────── */}
      <section className="py-20 px-4 bg-blue-600 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to start earning?
          </h2>
          <p className="text-lg text-blue-100 mb-8">
            Join our partner program and start earning recurring commissions
            from your existing client base.
          </p>
          <button
            type="button"
            onClick={openModal}
            className="bg-white text-blue-600 font-semibold px-8 py-3 rounded-lg hover:bg-blue-50 transition text-lg shadow-lg"
          >
            Become a Partner
          </button>
          <p className="text-sm text-blue-200 mt-4">
            Or email us at{' '}
            <a
              href="mailto:partners@workforcepro.in"
              className="underline hover:text-white"
            >
              partners@workforcepro.in
            </a>
          </p>
        </div>
      </section>

      <PartnerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}