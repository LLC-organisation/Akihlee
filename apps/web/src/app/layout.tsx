import type { Metadata } from "next";
import "./globals.css";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Akihlee - AI Finance OS for SMEs",
  description: "Intelligent finance operations platform for small and medium businesses",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Applied before first paint so dark-mode users don't see a light flash */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased bg-white dark:bg-slate-900 transition-colors">{children}</body>
    </html>
  );
}
