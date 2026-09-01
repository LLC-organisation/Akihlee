import fs from 'fs';
import path from 'path';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Akihlee',
  description: 'How Akihlee LLC collects, uses, and protects your personal information.',
};

function getPolicyHtml() {
  const filePath = path.join(process.cwd(), 'src/app/privacy/policy.html');
  return fs.readFileSync(filePath, 'utf8');
}

export default function PrivacyPolicyPage() {
  const policyHtml = getPolicyHtml();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-canvas">
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-canvas/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <Link href="/" className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors duration-200">
            &larr; Back to Akihlee
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div
          className="bg-white rounded-2xl shadow-sm p-6 sm:p-10 overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: policyHtml }}
        />
      </main>
    </div>
  );
}
