import { useEffect, useState, type FormEvent } from 'react';

export interface DemoSubmission {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
  submittedAt: string;
  deliveryStatus: 'remote' | 'local-only';
}

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEMO_STORAGE_KEY = 'workforcepro_demo_requests_v1';
const DEMO_ENDPOINT = import.meta.env.VITE_DEMO_ENDPOINT as string | undefined;

function readSavedSubmissions(): DemoSubmission[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSubmissionToStorage(entry: DemoSubmission): DemoSubmission[] {
  const existing = readSavedSubmissions();
  const updated = [entry, ...existing];
  try {
    window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage quota or private-mode errors
  }
  return updated;
}

export default function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [savedSubmissions, setSavedSubmissions] = useState<DemoSubmission[]>(() =>
    readSavedSubmissions()
  );

  useEffect(() => {
    if (!isOpen) return;

    setSavedSubmissions(readSavedSubmissions());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setErrorMessage(null);
    setIsSubmitting(false);
    setIsSubmitted(false);
    setShowSavedList(false);
    setName('');
    setPhone('');
    setEmail('');
    setCompany('');
    setNotes('');
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    const trimmedEmail = email.trim();
    const trimmedCompany = company.trim();
    const trimmedNotes = notes.trim();

    if (!trimmedName || !trimmedPhone || !trimmedEmail) {
      setErrorMessage('Please fill in your name, contact number, and email address.');
      return;
    }

    setIsSubmitting(true);
    const submittedAt = new Date().toISOString();
    let deliveryStatus: DemoSubmission['deliveryStatus'] = 'local-only';

    const endpointUrl = DEMO_ENDPOINT?.trim();

    if (endpointUrl) {
      const payload = JSON.stringify({
        name: trimmedName,
        phone: trimmedPhone,
        email: trimmedEmail,
        company: trimmedCompany,
        notes: trimmedNotes,
        submittedAt,
        source: 'marketing-site-navbar-book-demo',
      });

      const isGoogleAppsScript = endpointUrl.includes('script.google.com');

      try {
        if (isGoogleAppsScript) {
          await fetch(endpointUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8',
            },
            body: payload,
          });
          deliveryStatus = 'remote';
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
          deliveryStatus = 'remote';
        }
      } catch (err) {
        console.error('Demo request endpoint error:', err);
        setErrorMessage(
          'Could not reach the server right now. Please check your connection or try again.'
        );
        setIsSubmitting(false);
        return;
      }
    }

    const record: DemoSubmission = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmedName,
      phone: trimmedPhone,
      email: trimmedEmail,
      company: trimmedCompany,
      notes: trimmedNotes,
      submittedAt,
      deliveryStatus,
    };

    const updatedList = saveSubmissionToStorage(record);
    setSavedSubmissions(updatedList);
    setIsSubmitting(false);
    setIsSubmitted(true);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={resetAndClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-white p-6 sm:p-8 shadow-2xl border border-slate-200 my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={resetAndClose}
          aria-label="Close Book a Demo modal"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>

        {isSubmitted ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-brand-green ring-4 ring-emerald-100">
              <svg
                className="w-7 h-7"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 id="demo-modal-title" className="text-2xl font-bold text-slate-900">
              Demo Request Received
            </h3>
            <p className="mt-3 text-base font-medium text-brand-blue">
              Team will contact you for this.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              We&apos;ve recorded your details ({name} • {phone}) and will reach out shortly.
            </p>

            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsSubmitted(false);
                  setName('');
                  setPhone('');
                  setEmail('');
                  setCompany('');
                  setNotes('');
                }}
                className="w-full sm:w-auto rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Submit Another
              </button>
              <button
                type="button"
                onClick={resetAndClose}
                className="w-full sm:w-auto rounded-xl bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="pr-8">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue ring-1 ring-blue-200/80">
                Personalized Walkthrough
              </span>
              <h3 id="demo-modal-title" className="mt-3 text-2xl font-bold text-slate-900">
                Book a Demo
              </h3>
              <p className="mt-1.5 text-sm text-slate-600">
                Share your contact details below and our team will schedule a quick walkthrough for your business or CA practice.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              <div>
                <label htmlFor="demo-name" className="block text-sm font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  id="demo-name"
                  name="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Rajesh Patel"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="demo-phone" className="block text-sm font-semibold text-slate-700 mb-1">
                    Contact Number <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="demo-phone"
                    name="phone"
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98250 XXXXX"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>

                <div>
                  <label htmlFor="demo-email" className="block text-sm font-semibold text-slate-700 mb-1">
                    Email Address <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="demo-email"
                    name="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="demo-company" className="block text-sm font-semibold text-slate-700 mb-1">
                  Company Name
                </label>
                <input
                  id="demo-company"
                  name="company"
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Optional — e.g., Charotar Industries"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>

              <div>
                <label htmlFor="demo-notes" className="block text-sm font-semibold text-slate-700 mb-1">
                  Team Size or Questions
                </label>
                <textarea
                  id="demo-notes"
                  name="notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional — e.g., ~45 factory workers, need PF/ESI & WhatsApp punch setup"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
                />
              </div>

              {errorMessage && (
                <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700 border border-red-200">
                  {errorMessage}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-brand-blue hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-3 px-5 text-sm sm:text-base transition-colors shadow-sm"
              >
                {isSubmitting ? 'Submitting...' : 'Request Demo'}
              </button>
            </form>

            {/* Local Preview / Lead Inspector for Testing */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                {DEMO_ENDPOINT
                  ? 'Connected to Google Sheet / backend endpoint'
                  : 'Stored locally in browser (set VITE_DEMO_ENDPOINT for Google Sheet)'}
              </span>
              <button
                type="button"
                onClick={() => setShowSavedList((prev) => !prev)}
                className="font-semibold text-brand-blue hover:underline"
              >
                {showSavedList ? 'Hide saved' : `Saved (${savedSubmissions.length})`}
              </button>
            </div>

            {showSavedList && (
              <div className="mt-3 max-h-44 overflow-y-auto rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2 text-xs">
                {savedSubmissions.length === 0 ? (
                  <p className="text-slate-500">No demo requests saved in this browser yet.</p>
                ) : (
                  savedSubmissions.map((item) => (
                    <div key={item.id} className="rounded-lg bg-white p-2.5 border border-slate-200/80">
                      <p className="font-bold text-slate-900">
                        {item.name} • {item.phone}
                      </p>
                      <p className="text-slate-600">{item.email}</p>
                      {item.company && <p className="text-slate-500">{item.company}</p>}
                      {item.notes && <p className="text-slate-500 mt-0.5">{item.notes}</p>}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}