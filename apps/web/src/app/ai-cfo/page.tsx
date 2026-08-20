'use client';

import { useCallback, useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthToken, aiCfoApi, AiCfoConversationSummary } from '@/lib/api-client';
import { AppSidebar } from '@/components/AppSidebar';
import { AiCfoMarkdown } from '@/components/AiCfoMarkdown';

type ChatMessage = {
  role: 'user' | 'assistant';
  text: string;
};

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  text:
    "Hi! I'm your AI CFO. Ask me about your spending, cash flow, or where the business stands, " +
    "and I'll ground the answer in your approved documents.",
};

export default function AiCfoPage() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [conversations, setConversations] = useState<AiCfoConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
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

  const loadConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      const list = await aiCfoApi.listConversations();
      setConversations(list);
    } catch {
      // Non-fatal — the chat panel itself still works for a fresh conversation.
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  useEffect(() => {
    if (checkedAuth) loadConversations();
  }, [checkedAuth, loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([WELCOME_MESSAGE]);
  };

  const openConversation = async (id: string) => {
    if (id === activeConversationId) return;
    setActiveConversationId(id);
    try {
      const detail = await aiCfoApi.getConversation(id);
      setMessages(detail.messages.map(({ role, text }) => ({ role, text })));
    } catch {
      setMessages([{ role: 'assistant', text: "Couldn't load that conversation. Please try again." }]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((prev) => [...prev, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const result = await aiCfoApi.sendMessage(activeConversationId, text);
      setMessages((prev) => [...prev, { role: 'assistant', text: result.reply }]);

      const now = new Date().toISOString();
      if (activeConversationId === null) {
        setActiveConversationId(result.conversationId);
        setConversations((prev) => [
          { id: result.conversationId, title: result.title, createdAt: now, updatedAt: now },
          ...prev,
        ]);
      } else {
        setConversations((prev) => {
          const match = prev.find((c) => c.id === result.conversationId);
          if (!match) return prev;
          const bumped = { ...match, updatedAt: now };
          return [bumped, ...prev.filter((c) => c.id !== result.conversationId)];
        });
      }
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
    <div className="relative min-h-screen bg-white dark:bg-canvas flex flex-col">
      <div className="bg-glow" />
      <AppSidebar />
      <div className="relative z-10 flex flex-col flex-1 lg:pl-20">
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8 flex flex-col">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">AI CFO</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Chat about your finances — spending, cash flow, and where the business stands.
            </p>
          </div>

          <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
            <aside className="lg:w-64 shrink-0 bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-3 flex flex-col max-h-56 lg:max-h-none lg:h-auto overflow-hidden">
              <button
                type="button"
                onClick={startNewChat}
                className="inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-3 py-2 mb-2 hover:opacity-90 transition-all duration-200 shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New chat
              </button>

              <div className="flex-1 overflow-y-auto space-y-1">
                {loadingConversations && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1.5">Loading…</p>
                )}
                {!loadingConversations && conversations.length === 0 && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1.5">
                    No conversations yet — send a message to start one.
                  </p>
                )}
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => openConversation(conversation.id)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-200 ${
                      conversation.id === activeConversationId
                        ? 'bg-slate-100 dark:bg-white/10'
                        : 'hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                  >
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{conversation.title}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                      {new Date(conversation.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </p>
                  </button>
                ))}
              </div>
            </aside>

            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 bg-white dark:bg-surface border border-slate-200 dark:border-white/10 rounded-2xl shadow-sm dark:shadow-none p-4 sm:p-6 flex flex-col min-h-[400px] max-h-[60vh] overflow-y-auto transition-all duration-200">
                <div className="flex-1 space-y-4">
                  {messages.map((message, i) => (
                    <div key={i} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                          message.role === 'user'
                            ? 'bg-accent-gradient text-white'
                            : 'bg-slate-50 dark:bg-canvas border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {message.role === 'assistant' ? <AiCfoMarkdown text={message.text} /> : message.text}
                      </div>
                    </div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="max-w-[80%] rounded-2xl px-4 py-2 text-sm bg-slate-50 dark:bg-canvas border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400">
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
                  className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface px-3 py-2.5 text-slate-900 dark:text-white focus:border-blue-500 dark:focus:border-blue-400 transition-colors duration-200"
                />
                <button
                  type="submit"
                  disabled={sending || !input.trim()}
                  className="inline-flex items-center justify-center gap-2 bg-accent-gradient text-white text-sm font-medium rounded-lg px-5 py-2.5 hover:opacity-90 hover:shadow-md hover:shadow-blue-500/20 transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
