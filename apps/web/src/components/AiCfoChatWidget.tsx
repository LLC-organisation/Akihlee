'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { aiCfoApi, ChatTurn } from '@/lib/api-client';

type ChatMessage = { role: 'user' | 'assistant'; text: string };

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  text:
    "Hi! I'm your AI CFO. Ask me about your spending, cash flow, or where the business stands, " +
    "and I'll ground the answer in your approved documents.",
};

/**
 * Floating launcher + right-side slide-over chat, for dropping into any
 * already-authenticated page (Dashboard, Analytics) without linking to
 * the full /ai-cfo page. Keeps its own short-lived conversation state —
 * "Expand to full screen" hands off to /ai-cfo for the full experience
 * rather than trying to share live state across a navigation, so that
 * conversation starts fresh there (matches /ai-cfo's own page-load
 * behavior for a direct visit).
 */
export function AiCfoChatWidget() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    // Drop the synthetic welcome message so history starts on a real user
    // turn and alternates cleanly, as Bedrock's Converse API requires —
    // same convention as the full /ai-cfo page.
    const history: ChatTurn[] = messages.slice(1).map(({ role, text }) => ({ role, text }));
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const reply = await aiCfoApi.chat(text, history);
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

  const expandToFullScreen = () => {
    setOpen(false);
    router.push('/ai-cfo');
  };

  return (
    <>
      {/* Floating launcher — fixed bottom-right, above AppSidebar's z-20
          rail/header but below the panel itself. Hidden rather than
          unmounted while the panel is open, so it doesn't pop back in
          mid-close-animation. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI CFO chat"
        title="Ask the AI CFO"
        className={`fixed bottom-6 right-6 z-30 flex items-center justify-center w-14 h-14 rounded-full bg-accent-gradient text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 ${
          open ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 dark:bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative h-full w-full max-w-md flex flex-col bg-white dark:bg-surface border-l border-slate-200 dark:border-white/10 shadow-xl">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 dark:border-white/5 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-gradient text-white shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">AI CFO</h2>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={expandToFullScreen}
                  aria-label="Expand to full screen"
                  title="Open the full AI CFO page"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 20.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors duration-200"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.map((message, i) => (
                <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      message.role === 'user'
                        ? 'bg-accent-gradient text-white'
                        : 'bg-slate-50 dark:bg-canvas border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-2xl px-4 py-2 text-sm bg-slate-50 dark:bg-canvas border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
                    Thinking…
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={handleSubmit} className="p-4 border-t border-slate-100 dark:border-white/5 flex gap-2 shrink-0">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your finances…"
                disabled={sending}
                autoFocus
                className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface px-3 py-2 text-sm text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
              />
              <button
                type="submit"
                disabled={sending || !input.trim()}
                aria-label="Send"
                className="inline-flex items-center justify-center bg-accent-gradient text-white rounded-lg w-10 h-10 shrink-0 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
