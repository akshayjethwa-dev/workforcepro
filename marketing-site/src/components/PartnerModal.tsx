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

const DEMO_ENDPOINT = import.meta.env.VITE_DEMO_ENDPOINT as string | undefined;

export default function PartnerModal({ isOpen, onClose }: PartnerModalProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleChange =
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleClose = () => {
    setStatus('idle');
    setErrorMessage(null);
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = form.name.trim();
    const trimmedFirm = form.firm.trim();
    const trimmedEmail = form.email.trim();
    const trimmedPhone = form.phone.trim();
    const trimmedClients = form.clients.trim();

    if (!trimmedName || !trimmedFirm || !trimmedEmail || !trimmedPhone) {
      setErrorMessage('Please fill in your name, firm name, email, and phone number.');
      return;
    }

    setStatus('submitting');
    const submittedAt = new Date().toISOString();
    const endpointUrl = DEMO_ENDPOINT?.trim();

    const payload = JSON.stringify({
      name: trimmedName,
      firm: trimmedFirm,
      email: trimmedEmail,
      phone: trimmedPhone,
      clients: trimmedClients,
      // Mapped fields for compatibility with generic lead receivers:
      company: trimmedFirm,
      notes: trimmedClients ? `Approx. SMB clients: ${trimmedClients}` : '',
      submittedAt,
      source: 'marketing-site-become-partner',
    });

    try {
      if (endpointUrl) {
        const isGoogleAppsScript = endpointUrl.includes('script.google.com');

        if (isGoogleAppsScript) {
          await fetch(endpointUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8',
            },
            body: payload,
          });
        } else {
          const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: payload,
          });

          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }

      setStatus('success');
      setForm(initialForm);
    } catch (err) {
      console.error('Partner submission error:', err);
      setErrorMessage(
        'Could not submit your application right now. Please check your connection or email partners@workforcepro.in.'
      );
      setStatus('error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={handleClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
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
            <p className="text-gray-600 mb-2">
              Thanks for your interest in the WorkforcePro Partner Program. Team will contact you for this.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              Our partner team will reach out within 24 hours.
            </p>
            <button
              type="button"
              onClick={handleClose}
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
                <p role="alert" className="text-sm text-red-600">
                  {errorMessage ?? 'Something went wrong. Please try again or email '}
                  {!errorMessage && (
                    <a
                      href="mailto:partners@workforcepro.in"
                      className="underline"
                    >
                      partners@workforcepro.in
                    </a>
                  )}
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