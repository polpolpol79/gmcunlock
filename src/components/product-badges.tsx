"use client";

type BrandTone = "blue" | "emerald" | "amber" | "slate";

function toneClasses(tone: BrandTone) {
  switch (tone) {
    case "blue":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "emerald":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "amber":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "slate":
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}

export function BrandBadge({
  label,
  tone = "slate",
  icon,
}: {
  label: string;
  tone?: BrandTone;
  icon: React.ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm",
        toneClasses(tone),
      ].join(" ")}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
        {icon}
      </span>
      {label}
    </span>
  );
}

export function FloatingFeatureCard({
  eyebrow,
  title,
  detail,
  icon,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  detail: string;
  icon: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div
      className={[
        "app-floating-card w-[210px] rounded-[24px] px-4 py-4 shadow-[0_30px_80px_rgba(15,23,42,0.12)]",
        align === "right" ? "text-left" : "text-left",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {eyebrow}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-6 text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  );
}

export function MerchantIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7.5h14l-1.1 10.5H6.1L5 7.5Z" fill="#34A853" />
      <path d="M7 7.5A5 5 0 0 1 12 3a5 5 0 0 1 5 4.5" stroke="#4285F4" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="12" r="1.2" fill="white" />
      <circle cx="14" cy="12" r="1.2" fill="white" />
    </svg>
  );
}

export function AdsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.5 4.5a3 3 0 0 1 5.1 0l5 8.7a3 3 0 1 1-5.2 3l-5-8.7a3 3 0 0 1 .1-3Z" fill="#4285F4" />
      <path d="M9.3 7.5 4.2 16.3a3 3 0 0 0 5.2 3l5.1-8.8" fill="#34A853" />
      <circle cx="6.3" cy="17.8" r="2.2" fill="#FBBC04" />
    </svg>
  );
}

export function ShopifyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8.5h10l-1.1 10H8.1L7 8.5Z" fill="#95BF47" />
      <path d="M8.7 8.5C8.9 6 10.1 4 12 4c1.5 0 2.6 1.2 3 4.5" stroke="#5E8E3E" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m10 13.3 1.4-.4c.4-.1.5-.4.6-.8.1-.5.4-.8.8-.8.5 0 .8.3.8.8 0 .3-.1.5-.4.8l-.6.6c-.6.5-.9 1-.9 1.7v.3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PageSpeedIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" stroke="#1D4ED8" strokeWidth="1.8" />
      <path d="M12 12 17.2 9.4" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="#60A5FA" />
    </svg>
  );
}

export function TrustIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.8 18.2 6v5.4c0 4.1-2.3 7.8-6.2 9.6-3.9-1.8-6.2-5.5-6.2-9.6V6L12 3.8Z"
        fill="#0F172A"
      />
      <path d="m9.4 12.3 1.7 1.7 3.5-3.7" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
