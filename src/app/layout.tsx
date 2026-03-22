import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GMC Unlock",
  description: "Public scan and connected compliance diagnosis for Google Merchant Center and Google Ads recovery.",
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
