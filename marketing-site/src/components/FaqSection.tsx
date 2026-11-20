import { useState } from 'react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'worker-app',
    question: 'Do my workers need to download an app?',
    answer:
      'No. Workers simply tap a WhatsApp link to check in and out—there is no mobile app to download, no Play Store login, and zero classroom training required.',
  },
  {
    id: 'pf-esi-calculation',
    question: 'How does it calculate PF and ESI?',
    answer:
      'WorkforcePro automatically applies statutory PF, ESI, and Professional Tax rules based on verified attendance and wage components, while flagging any structure that falls short of the 50% basic wage rule.',
  },
  {
    id: 'offline-internet',
    question: 'What happens if there is no internet at the factory?',
    answer:
      'Punches and shift entries are queued safely on the device when network connectivity drops on the shop floor, and automatically sync to your dashboard the moment internet returns.',
  },
  {
    id: 'dpdp-location-safety',
    question: "Is my worker's location data safe? (DPDP compliance).",
    answer:
      'Yes. Location and verification checks happen only at punch-in and punch-out—never continuous background tracking—with explicit worker consent logs and encryption at rest and in transit in full alignment with the DPDP Act 2023.',
  },
  {
    id: 'ca-management',
    question: 'Can my CA manage this for me?',
    answer:
      'Yes. Your Chartered Accountant can set up your company account in minutes, review monthly attendance and wage validations, and export statutory-ready payroll summaries directly.',
  },
];

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleItem = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="py-20 sm:py-24 bg-slate-50 border-t border-slate-200/80"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-blue mb-3">
            Frequently Asked Questions
          </p>
          <h2
            id="faq-heading"
            className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900"
          >
            Clear answers before you get started.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            Everything business owners and CAs ask before switching from registers or legacy biometric systems.
          </p>
        </div>

        <div className="space-y-4">
          {FAQ_ITEMS.map((item, index) => {
            const isOpen = openIndex === index;
            const buttonId = `faq-button-${item.id}`;
            const panelId = `faq-panel-${item.id}`;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-white transition-colors ${
                  isOpen
                    ? 'border-brand-blue/40 shadow-sm'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                <h3>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => toggleItem(index)}
                    className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue rounded-2xl"
                  >
                    <span className="text-base sm:text-lg font-bold text-slate-900">
                      {item.question}
                    </span>
                    <span
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        isOpen
                          ? 'bg-brand-blue text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                      aria-hidden="true"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </span>
                  </button>
                </h3>

                {isOpen && (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    className="px-6 pb-5 pt-0 text-slate-600 leading-relaxed border-t border-slate-100"
                  >
                    <p className="pt-4">{item.answer}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}