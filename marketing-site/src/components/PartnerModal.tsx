import { useState } from 'react';

interface PartnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const initialForm = {
  name: '',
  firm: '',
  email: '',
  phone: '',
  clients: '',
};

type FormState = typeof initialForm;
type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function PartnerModal({ isOpen, onClose }: PartnerModalProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<Status>('idle');

  if (!isOpen) return null;

  const handleChange =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');

    // -------------------------------------------------------------
    // 🔌 TODO: Wire to your real backend (same one used by DemoModal,
    // or a HubSpot / Tally form). Two common examples below.
    // -------------------------------------------------------------
    //
    // Option A — HubSpot Forms API:
    // await fetch(
    //   'https://api.hsforms.com/submissions/v3/integration/submit/<PORTAL_ID>/<FORM_ID>',
    //   {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       fields: [
    //         { name: 'firstname',   value: form.name },
    //         { name: 'company',     value: form.firm },
    //         { name: 'email',       value: form.email },
    //         { name: 'phone',       value: form.phone },
    //         { name: 'num_clients', value: form.clients },
    //       ],
    //     }),
    //   },
    // );
    //
    // Option B — Tally form (redirect):
    // window.location.href = 'https://tally.so/r/<FORM_ID>?name=...';
    //
    // Option C — Your own API (same endpoint as DemoModal):
    // await fetch('/api/partner-leads', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(form),
    // });

    try {
      // Placeholder simulation — remove when wired to real backend.
      await new Promise((resolve) => setTimeout(resolve, 800));
      setStatus('success');
      setForm(initialForm);
    } catch {
      setStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none"
          aria-label="Close"
        >
          ×
        </button>

        {status === 'success' ? (
          <div className="text-center py-8">
            <div className="text-5xl mb-4">🎉</div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Application received!
            </h3>
            <p className="text-gray-600 mb-6">
              Thanks for your interest in the WorkforcePro Partner Program. Our
              partner team will reach out within 24 hours.
            </p>
            <button
              onClick={onClose}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">
              Become a Partner
            </h3>
            <p className="text-gray-600 mb-6 text-sm">
              Fill this out and our partner team will reach out within 24
              hours.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name *
                </label>
                <input
                  required
                  value={form.name}
                  onChange={handleChange('name')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="CA Rohit Sharma"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Firm Name *
                </label>
                <input
                  required
                  value={form.firm}
                  onChange={handleChange('firm')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="Sharma & Associates"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={handleChange('email')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="you@firm.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone *
                  </label>
                  <input
                    required
                    type="tel"
                    value={form.phone}
                    onChange={handleChange('phone')}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="+91 98765 43210"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Number of SMB Clients (approx.)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.clients}
                  onChange={handleChange('clients')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="25"
                />
              </div>

              {status === 'error' && (
                <p className="text-sm text-red-600">
                  Something went wrong. Please try again or email{' '}
                  <a
                    href="mailto:partners@workforcepro.in"
                    className="underline"
                  >
                    partners@workforcepro.in
                  </a>
                  .
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'submitting'}
                className="w-full bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
              >
                {status === 'submitting' ? 'Submitting…' : 'Submit Application'}
              </button>

              <p className="text-xs text-gray-500 text-center">
                By submitting, you agree to be contacted by our partner team.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}