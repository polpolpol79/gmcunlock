import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GMC Unlock",
  description: "GMC Unlock helps merchants prevent Google suspensions, improve site trust, and diagnose Merchant Center and Google Ads recovery issues with evidence-backed scans.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
