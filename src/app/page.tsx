"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [attempted, setAttempted] = useState(false);
  const trimmedUrl = useMemo(() => url.trim(), [url]);
  const hasError = attempted && trimmedUrl.length === 0;

  function onScan() {
    setAttempted(true);
    if (!trimmedUrl) return;
    window.location.assign(`/scan?url=${encodeURIComponent(trimmedUrl)}`);
  }

  return (
    <div className="home-shell">
      {/* ── NAV ── */}
      <nav className="home-nav">
        <div className="home-nav-inner">
          <Image src="/logo-clean.png" alt="GMC Unlock" width={360} height={90} unoptimized className="h-9 w-auto" />
          <div className="home-nav-links">
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
          </div>
          <div className="home-nav-actions">
            <button type="button" className="home-btn-ghost" onClick={onScan}>Sign in</button>
            <button type="button" className="home-btn-dark" onClick={onScan}>Start scan</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="home-hero">
        {/* Floating cards */}
        <div className="home-float home-float-tl" aria-hidden="true">
          <div className="home-card-sticky">
            <p className="home-card-sticky-text">Check trust signals, policies, and contact data to avoid a Google block.</p>
          </div>
        </div>

        <div className="home-float home-float-tr" aria-hidden="true">
          <div className="home-card-reminder">
            <div className="home-card-reminder-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#334155" strokeWidth="1.5"/><path d="M12 7v5l3 3" stroke="#334155" strokeWidth="1.5" strokeLinecap="round"/></svg>
            </div>
            <p className="home-card-reminder-label">Scan Status</p>
            <div className="home-card-reminder-item">
              <span>Compliance Audit</span>
              <span className="home-card-reminder-tag">Active</span>
            </div>
            <div className="home-card-reminder-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#94a3b8" strokeWidth="1.5"/><path d="M12 7v5l3 3" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/></svg>
              <span>Running now</span>
            </div>
          </div>
        </div>

        <div className="home-float home-float-bl" aria-hidden="true">
          <div className="home-card-tasks">
            <p className="home-card-tasks-title">Scan results</p>
            <div className="home-card-tasks-row">
              <div className="home-card-tasks-dot home-card-tasks-dot-green" />
              <span>Business identity verified</span>
              <div className="home-card-tasks-bar"><div className="home-card-tasks-fill" style={{ width: "100%" }} /></div>
            </div>
            <div className="home-card-tasks-row">
              <div className="home-card-tasks-dot home-card-tasks-dot-blue" />
              <span>PageSpeed analysis</span>
              <div className="home-card-tasks-bar"><div className="home-card-tasks-fill home-card-tasks-fill-blue" style={{ width: "72%" }} /></div>
            </div>
            <div className="home-card-tasks-row">
              <div className="home-card-tasks-dot home-card-tasks-dot-amber" />
              <span>Policy compliance</span>
              <div className="home-card-tasks-bar"><div className="home-card-tasks-fill home-card-tasks-fill-amber" style={{ width: "45%" }} /></div>
            </div>
          </div>
        </div>

        <div className="home-float home-float-br" aria-hidden="true">
          <div className="home-card-integrations">
            <p className="home-card-integrations-label">Connected sources</p>
            <div className="home-card-integrations-icons">
              <div className="home-card-integrations-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5.26 9.6A6.97 6.97 0 0 1 12 4c3.04 0 5.63 1.94 6.6 4.65" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 4v7l4.5 2.6" stroke="#34A853" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="12" r="8" stroke="#EA4335" strokeWidth="1.5" strokeDasharray="3 3"/></svg>
              </div>
              <div className="home-card-integrations-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M5 7.5h14l-1.1 10.5H6.1L5 7.5Z" fill="#95BF47"/><path d="M7 7.5A5 5 0 0 1 12 3a5 5 0 0 1 5 4.5" stroke="#5E8E3E" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
              <div className="home-card-integrations-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="3" stroke="#FBBC04" strokeWidth="1.5"/><path d="M7 12h4M13 12h4" stroke="#FBBC04" strokeWidth="1.5" strokeLinecap="round"/></svg>
              </div>
            </div>
          </div>
        </div>

        {/* Center content */}
        <div className="home-hero-center">
          <div className="home-hero-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="11" width="7" height="10" rx="1" stroke="#22c55e" strokeWidth="1.6"/>
              <path d="M6.5 7.5V6a5.5 5.5 0 0 1 11 0v1.5" stroke="#22c55e" strokeWidth="1.6" strokeLinecap="round"/>
              <rect x="5" y="11" width="14" height="10" rx="2" stroke="#1e293b" strokeWidth="1.6"/>
              <circle cx="12" cy="16" r="1.5" fill="#22c55e"/>
            </svg>
          </div>

          <h1 className="home-hero-title">
            Scan, diagnose, and fix
            <br />
            <span className="home-hero-title-light">all in one place</span>
          </h1>

          <p className="home-hero-sub">
            Check your website&apos;s Google Merchant Center compliance before it costs you traffic, ads, or trust.
          </p>

          <div className="home-hero-cta">
            <div className="home-hero-input-wrap">
              <input
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://your-store.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onScan()}
                className={`home-hero-input ${hasError ? "home-hero-input-error" : ""}`}
              />
              <button type="button" onClick={onScan} className="home-hero-btn">
                Get free scan
              </button>
            </div>
            {hasError && <p className="home-hero-error">Please enter a website URL.</p>}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="home-features">
        <div className="home-features-inner">
          {[
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="12" r="9" stroke="#2563eb" strokeWidth="1.5"/></svg>
              ),
              title: "Trust signal audit",
              text: "We scan your public site for missing policies, weak contact data, and broken trust signals that trigger Google reviews.",
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ),
              title: "Business identity detection",
              text: "Automatically detect your business name, email, phone, address, platform, and site type from the live website.",
            },
            {
              icon: (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" stroke="#2563eb" strokeWidth="1.5"/><path d="M8 12h8M8 8h5M8 16h6" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round"/></svg>
              ),
              title: "Evidence-backed report",
              text: "Every finding includes exact evidence from your site. No guessing, no generic advice — just facts you can act on.",
            },
          ].map((f) => (
            <div key={f.title} className="home-feature-card">
              <div className="home-feature-icon">{f.icon}</div>
              <h3 className="home-feature-title">{f.title}</h3>
              <p className="home-feature-text">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="home-how">
        <p className="home-section-label">How it works</p>
        <h2 className="home-section-title">Three steps to a clean report</h2>
        <div className="home-how-grid">
          {[
            { step: "1", title: "Enter your URL", text: "Paste your website address and answer 4 quick questions about your business type." },
            { step: "2", title: "We scan everything", text: "Crawler, PageSpeed, OSINT, and AI analysis run in parallel to build a complete picture." },
            { step: "3", title: "Get your report", text: "A clear, evidence-backed report with findings, recommendations, and a compliance score." },
          ].map((s) => (
            <div key={s.step} className="home-how-card">
              <div className="home-how-step">{s.step}</div>
              <h3 className="home-how-title">{s.title}</h3>
              <p className="home-how-text">{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="home-pricing">
        <p className="home-section-label">Pricing</p>
        <h2 className="home-section-title">Start free, upgrade when you need connected data</h2>
        <div className="home-pricing-grid">
          <div className="home-pricing-card">
            <p className="home-pricing-tier">Free scan</p>
            <p className="home-pricing-price">$0</p>
            <p className="home-pricing-desc">Public trust audit, business identity, and AI recommendations.</p>
            <ul className="home-pricing-list">
              <li>Public crawl &amp; policy check</li>
              <li>Business identity fingerprint</li>
              <li>PageSpeed analysis</li>
              <li>Evidence-backed findings</li>
              <li>Customized per business type</li>
            </ul>
            <button type="button" onClick={onScan} className="home-pricing-btn-primary">Run Free Scan</button>
          </div>
          <div className="home-pricing-card home-pricing-card-highlight">
            <p className="home-pricing-tier">Full diagnosis</p>
            <p className="home-pricing-price">$99</p>
            <p className="home-pricing-desc">Connected Google &amp; Shopify data with full 77-rule compliance.</p>
            <ul className="home-pricing-list">
              <li>Everything in Free</li>
              <li>Google Merchant Center data</li>
              <li>Shopify store data</li>
              <li>Cross-platform consistency</li>
              <li>Full 77-rule diagnosis</li>
            </ul>
            <button type="button" onClick={onScan} className="home-pricing-btn-outline">Start With Free Scan</button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="home-footer">
        <div className="home-footer-top">
          <Image src="/logo-clean.png" alt="GMC Unlock" width={360} height={90} unoptimized className="h-7 w-auto opacity-60" />
          <p>Google Merchant Center compliance scanning for stores and agencies.</p>
        </div>
        <div className="home-footer-links">
          <a href="/privacy">Privacy Policy</a>
          <span className="home-footer-sep">·</span>
          <a href="/terms">Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
