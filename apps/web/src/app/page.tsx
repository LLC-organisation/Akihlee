import Link from 'next/link';

const primaryButtonClasses =
  'inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200';
const ghostButtonClasses =
  'inline-flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-200';
const cardClasses =
  'bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none';

function Logo() {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo-icon.png" alt="Akihlee" className="w-9 h-9 rounded-xl object-contain shrink-0" />
  );
}

function HeroPreviewCard() {
  return (
    <div className="flex justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mobile-preview.jpeg"
        alt="Akihlee dashboard running on a mobile phone, showing net cash flow and expenses by category"
        className="w-auto max-h-[560px] rounded-[44px] shadow-lg dark:shadow-black/40"
      />
    </div>
  );
}

// Full literal class strings (not built from an interpolated color name) —
// Tailwind's content scanner only picks up classes it can find as complete
// strings in source, so `bg-${color}-50` would silently produce no styles.
const FEATURES = [
  {
    iconWrapperClass: 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    ),
    title: 'Document Capture',
    description: 'Upload receipts and invoices, or send them by email or WhatsApp. OCR extracts the numbers automatically.',
  },
  {
    iconWrapperClass: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    icon: (
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    ),
    title: 'Financial Visibility',
    description: 'A live dashboard of P&L, cash flow, and every document status, reviewed and corrected by you, not guessed at.',
  },
  {
    iconWrapperClass: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />,
    title: 'AI CFO',
    description: 'Ask questions about your finances in plain language and get answers grounded in your actual extracted data.',
  },
] as const;

const STEPS = [
  {
    title: 'Upload & Connect',
    description: 'Send receipts by upload, email, or WhatsApp, or sync transactions in from Square.',
  },
  {
    title: 'AI Extracts the Numbers',
    description: 'OCR reads every merchant, amount, and line item. You review and fix anything it got wrong.',
  },
  {
    title: 'See Where You Stand',
    description: 'A real-time dashboard and AI CFO turn reviewed documents into P&L, cash flow, and answers.',
  },
] as const;

export default function Home() {
  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10">
        <header className="sticky top-0 z-20 bg-white/80 dark:bg-canvas/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-lg font-bold text-slate-900 dark:text-white">Akihlee</span>
            </div>
            <nav className="hidden sm:flex items-center gap-8 text-sm font-medium text-slate-500 dark:text-slate-400">
              <a href="#features" className="hover:text-slate-900 dark:hover:text-white transition-colors duration-200">
                Features
              </a>
              <a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-white transition-colors duration-200">
                How it Works
              </a>
            </nav>
            <div className="flex items-center gap-4">
              <Link href="/login" className={ghostButtonClasses}>
                Log in
              </Link>
              <Link href="/register" className={primaryButtonClasses}>
                Get Started
              </Link>
            </div>
          </div>
        </header>

        <main>
          <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 dark:text-white leading-tight mb-5">
                Real-time financial clarity for growing businesses
              </h1>
              <p className="text-lg text-slate-500 dark:text-slate-400 mb-8">
                Stop manually tracking expenses. Upload receipts, connect Square, and let AI turn them into a
                live P&amp;L and cash flow picture, with a real person (you) reviewing every number.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/register" className={primaryButtonClasses}>
                  Get Started
                </Link>
                <Link href="/login" className={ghostButtonClasses}>
                  Log in
                </Link>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-4">
                Free to get started &middot; No credit card required
              </p>
            </div>

            <HeroPreviewCard />
          </section>

          <section className="border-y border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
            <div className="max-w-6xl mx-auto px-4 py-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <span>Works with the tools you already use:</span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                Square
              </span>
              <span className="text-slate-300 dark:text-slate-600">&middot;</span>
              <span>Receipts by upload, email, or WhatsApp</span>
            </div>
          </section>

          <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className={`${cardClasses} p-6 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200`}
                >
                  <span
                    className={`flex items-center justify-center w-11 h-11 rounded-xl mb-4 ${feature.iconWrapperClass}`}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      {feature.icon}
                    </svg>
                  </span>
                  <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">{feature.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white text-center mb-10">
              Three steps to total financial visibility
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {STEPS.map((step, index) => (
                <div key={step.title} className={`${cardClasses} p-6`}>
                  <span className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-white dark:text-canvas text-sm font-bold mb-4">
                    {index + 1}
                  </span>
                  <h3 className="text-base font-semibold mb-2 text-slate-900 dark:text-white">{step.title}</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 text-center">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
              Ready to see your numbers clearly?
            </h2>
            <Link href="/register" className={primaryButtonClasses}>
              Get Started
            </Link>
          </section>
        </main>
      </div>
    </div>
  );
}
