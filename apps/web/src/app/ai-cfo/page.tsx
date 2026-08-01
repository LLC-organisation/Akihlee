'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, aiCfoApi } from '@/lib/api-client';
import { AppHeader } from '@/components/AppHeader';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  text:
    "Hi! I'm your AI CFO — this feature is still in development, so I can't give real predictions yet. " +
    'Ask me anything and I\'ll tell you what I can from your extracted data so far.',
};

export default function AiCfoPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace('/login');
      return;
    }
    setCheckedAuth(true);
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const reply = await aiCfoApi.chat(text);
      setMessages((prev) => [...prev, { role: 'assistant', text: reply }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Something went wrong reaching the AI CFO. Please try again.' },
      ]);
    } finally {
      setSending(false);
    }
  };

  if (!checkedAuth) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 flex flex-col">
      <AppHeader />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI CFO</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Chat about your finances — predictions, KPIs, and cash flow, once fully built.
          </p>
        </div>

        <div className="flex-1 bg-slate-50 dark:bg-slate-800 rounded-lg border border-primary-100 dark:border-slate-700 p-4 sm:p-6 flex flex-col min-h-[400px] max-h-[60vh] overflow-y-auto">
          <div className="flex-1 space-y-4">
            {messages.map((message, i) => (
              <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-slate-900 border border-primary-100 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-primary-100 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your spending, cash flow, or KPIs…"
            disabled={sending}
            className="flex-1 rounded-md border border-primary-200 dark:border-slate-600 px-3 py-2 text-slate-900 dark:text-white dark:bg-slate-900 focus:border-primary-500"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 dark:disabled:bg-primary-800 text-white text-sm font-medium rounded-md transition-colors"
          >
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
