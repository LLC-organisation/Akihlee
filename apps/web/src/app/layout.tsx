import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="antialiased bg-gray-50">{children}</body>
    </html>
  );
}
