export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <main className="max-w-4xl mx-auto text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Akihlee
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          AI Finance Operating System for SMEs
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <div className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2">Document Capture</h3>
            <p className="text-gray-600 text-sm">
              Automatically extract data from receipts and invoices
            </p>
          </div>

          <div className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2">Financial Visibility</h3>
            <p className="text-gray-600 text-sm">
              Real-time P&L, cash flow, and financial insights
            </p>
          </div>

          <div className="p-6 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-semibold mb-2">AI CFO</h3>
            <p className="text-gray-600 text-sm">
              Intelligent recommendations and financial automation
            </p>
          </div>
        </div>

        <div className="mt-12">
          <a
            href="/dashboard"
            className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Get Started
          </a>
        </div>
      </main>
    </div>
  );
}
