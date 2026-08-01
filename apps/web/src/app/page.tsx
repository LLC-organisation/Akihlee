export default function Home() {
  return (
    <div className="relative min-h-screen bg-white dark:bg-canvas">
      <div className="bg-glow" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        <main className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-slate-900 dark:text-white mb-4">Akihlee</h1>
          <p className="text-xl text-slate-500 dark:text-slate-400 mb-8">
            AI Finance Operating System for SMEs
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            <div className="p-6 bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Document Capture</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Automatically extract data from receipts and invoices
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </span>
              <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">Financial Visibility</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Real-time P&L, cash flow, and financial insights
              </p>
            </div>

            <div className="p-6 bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none hover:-translate-y-0.5 hover:shadow-md transition-all duration-200">
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 mb-4">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <h3 className="text-lg font-semibold mb-2 text-slate-900 dark:text-white">AI CFO</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Intelligent recommendations and financial automation
              </p>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-center gap-4">
            <a
              href="/register"
              className="px-6 py-3 bg-accent-gradient text-white font-medium rounded-lg hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200"
            >
              Get Started
            </a>
            <a
              href="/login"
              className="px-6 py-3 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition-colors duration-200"
            >
              Log in
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
