import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — GMC Unlock",
};

export default function TermsPage() {
  return (
    <main className="app-shell" style={{ background: "#f8fafc" }}>
      <div className="app-container" style={{ maxWidth: 760, paddingTop: 48, paddingBottom: 80 }}>
        <Link href="/" className="text-sm text-blue-600 hover:underline">&larr; Back to home</Link>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: March 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-slate-700">
          <section>
            <h2 className="text-lg font-semibold text-slate-900">1. Service Description</h2>
            <p>
              GMC Unlock provides automated website compliance scanning and reporting for merchants
              who sell through Google Merchant Center, Google Ads, and Shopify. Our service analyzes
              publicly available website data and, when authorized, connected account data to identify
              potential compliance issues and provide actionable recommendations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">2. Use of the Service</h2>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>You must provide accurate information when using the service.</li>
              <li>You may only scan websites that you own or have authorization to scan.</li>
              <li>You are responsible for any actions taken based on scan results.</li>
              <li>The service is provided &quot;as is&quot; without guarantees of specific outcomes.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">3. Scan Reports</h2>
            <p>
              Scan reports are generated using automated analysis and AI-powered compliance checking.
              While we strive for accuracy, reports are advisory in nature and should not be considered
              as legal or professional compliance advice. We recommend consulting with qualified
              professionals for critical compliance decisions.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">4. Account Connections</h2>
            <p>
              When you connect Google or Shopify accounts, you grant us temporary, read-only access
              to retrieve data for your scan. We do not store your login credentials. You can revoke
              access at any time through the respective platform&apos;s settings or through our disconnect
              feature.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">5. Payments</h2>
            <p>
              Paid scans are charged as one-time fees. Pricing is displayed before initiating a paid scan.
              Refund requests are handled on a case-by-case basis — contact us if you believe a scan
              did not deliver the expected value.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">6. Limitation of Liability</h2>
            <p>
              GMC Unlock is not responsible for any losses, suspensions, or penalties resulting from
              actions taken based on scan reports. Our service provides recommendations based on
              available data but cannot guarantee compliance with Google, Shopify, or any other
              platform&apos;s policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">7. Changes to Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of the service after changes
              constitutes acceptance of the updated terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900">8. Contact</h2>
            <p>
              For questions about these terms, contact us
              at <a href="mailto:ofer25.al@gmail.com" className="text-blue-600 hover:underline">ofer25.al@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
