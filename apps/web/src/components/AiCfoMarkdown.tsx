'use client';

import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// This renders LLM-generated text, so treat it as untrusted output (OWASP
// LLM02 — insecure output handling), not just formatting to prettify:
// - No rehype-raw plugin is wired in, so react-markdown never renders raw
//   HTML/script tags from the model's response — only actual Markdown
//   syntax produces elements at all.
// - Links are restricted to http(s) hrefs (a "javascript:" or "data:"
//   href would otherwise execute in the page's origin on click).
// - Images are never rendered as <img> — a model-supplied image URL is a
//   data-exfiltration vector (the URL itself can carry data to an
//   attacker-controlled host merely by being fetched), and there's no
//   legitimate reason for a financial chat reply to embed one.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-semibold mb-1">{children}</p>,
  hr: () => <hr className="my-2 border-slate-200 dark:border-white/10" />,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-slate-300 dark:border-white/20 pl-3 italic text-slate-600 dark:text-slate-400 mb-2 last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="px-1 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 text-[0.85em] font-mono">{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 last:mb-0 p-2 rounded-lg bg-slate-200/70 dark:bg-white/10 overflow-x-auto text-[0.85em] font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="mb-2 last:mb-0 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
      <table className="min-w-full text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-100 dark:bg-white/5">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-slate-100 dark:divide-white/5">{children}</tbody>,
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-2.5 py-1.5 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="px-2.5 py-1.5 whitespace-nowrap">{children}</td>,
  a: ({ href, children }) => {
    const safeHref = typeof href === 'string' && /^https?:\/\//i.test(href) ? href : undefined;
    if (!safeHref) return <>{children}</>;
    return (
      <a href={safeHref} target="_blank" rel="noopener noreferrer" className="underline text-accent hover:opacity-80">
        {children}
      </a>
    );
  },
  img: ({ alt }) => <span className="italic text-slate-400 dark:text-slate-500">[image omitted{alt ? `: ${alt}` : ''}]</span>,
};

export function AiCfoMarkdown({ text }: { text: string }) {
  return (
    <div className="text-sm [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
