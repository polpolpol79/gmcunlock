import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — GMC Unlock",
};

export default function PrivacyPage() {
  return (
    <main className="app-shell" style={{ background: "#f8fafc" }}>
      <div className="app-container" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 80 }}>
        <Link href="/" className="text-sm text-blue-600 hover:underline">&larr; Back to home</Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. What We Collect</h2>
            <p>
              GMC Unlock collects only the information necessary to perform website compliance scans
              and deliver reports. This includes:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>The URL you submit for scanning.</li>
              <li>Business profile details you provide (business type, platform, etc.).</li>
              <li>Google Merchant Center data accessed via OAuth (read-only).</li>
              <li>Shopify store data accessed via OAuth (read-only).</li>
              <li>Publicly available website content retrieved during the scan.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. How We Use Your Data</h2>
            <p>Your data is used exclusively to:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Generate your compliance scan report.</li>
              <li>Compare data across connected sources for consistency analysis.</li>
              <li>Improve the accuracy and quality of our scanning service.</li>
            </ul>
            <p className="mt-2">We do not sell, rent, or share your data with third parties for marketing purposes.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Third-Party Services</h2>
            <p>We use the following third-party services to operate:</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li><strong>Google APIs</strong> — to access Merchant Center data (read-only) and PageSpeed Insights.</li>
              <li><strong>Shopify API</strong> — to access store data (read-only) when you connect your store.</li>
              <li><strong>Anthropic (Claude AI)</strong> — to analyze scan data and generate compliance reports.</li>
              <li><strong>Supabase</strong> — to securely store scan results and connection tokens.</li>
              <li><strong>Vercel</strong> — to host and serve the application.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Google & Shopify Permissions</h2>
            <p>
              When you connect your Google or Shopify account, we request <strong>read-only</strong> access.
              We never edit, delete, or modify any data in your accounts. You can disconnect at any time
              from the scan report page.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Data Retention</h2>
            <p>
              Scan reports are stored in our database for your future reference. OAuth tokens are stored
              securely and used only to fetch data during scans. You may request deletion of your data
              by contacting us.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Security</h2>
            <p>
              All data is transmitted over HTTPS. OAuth tokens are stored securely in our database
              and are never exposed to the client. We follow industry-standard security practices.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Contact</h2>
            <p>
              For questions about this privacy policy or to request data deletion, contact us
              at <a href="mailto:ofer25.al@gmail.com" className="text-blue-600 hover:underline">ofer25.al@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
