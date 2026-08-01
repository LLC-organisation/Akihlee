export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-900">
      <main className="max-w-4xl mx-auto text-center">
        <h1 className="text-5xl font-bold text-primary-700 dark:text-primary-300 mb-4">Akihlee</h1>
        <p className="text-xl text-slate-600 dark:text-slate-400 mb-8">
          AI Finance Operating System for SMEs
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 bg-slate-50 dark:bg-slate-800 border border-primary-100 dark:border-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-primary-700 dark:text-primary-300">Document Capture</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Automatically extract data from receipts and invoices
            </p>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800 border border-primary-100 dark:border-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-primary-700 dark:text-primary-300">Financial Visibility</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Real-time P&L, cash flow, and financial insights
            </p>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-slate-800 border border-primary-100 dark:border-slate-700 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-primary-700 dark:text-primary-300">AI CFO</h3>
            <p className="text-slate-600 dark:text-slate-400 text-sm">
              Intelligent recommendations and financial automation
            </p>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-4">
          <a
            href="/register"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Get Started
          </a>
          <a
            href="/login"
            className="px-6 py-3 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
          >
            Log in
          </a>
        </div>
      </main>
    </div>
  );
}
