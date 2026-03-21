import { z } from "zod";

export const UserProfileSchema = z.object({
  business_type: z.enum(["ecommerce", "service_provider", "leads_only", "other"]),
  platform: z.enum(["shopify", "woocommerce", "wix", "other"]),
  blocked_where: z.enum(["merchant_center", "google_ads", "both", "proactive"]),
  has_gmb: z.union([z.boolean(), z.null()]),
});

export const FullScanRequestSchema = z.object({
  url: z.string().min(1, "Missing required field: url"),
  profile: UserProfileSchema,
});

export const ChecklistResultValueSchema = z.enum([
  "pass",
  "fail",
  "warning",
  "unknown",
]);

export const ClaudeIssueSchema = z.object({
  item_id: z.number().int().nonnegative(),
  section: z.string(),
  title: z.string(),
  problem: z.string(),
  evidence: z.string(),
  fix: z.string(),
  effort: z.enum(["quick", "medium", "hard"]),
});

export const ClaudeRecommendationSchema = z.object({
  item_id: z.number().int().nonnegative(),
  title: z.string(),
  why: z.string(),
  benefit: z.string(),
});

export const ClaudeConsistencyIssueSchema = z.object({
  field: z.string(),
  website: z.string(),
  gmc: z.string(),
  gmb: z.string(),
  shopify: z.string(),
  status: z.enum(["match", "mismatch", "unknown"]),
});

export const ClaudeAnalysisSchema = z.object({
  risk_score: z.number().min(0).max(100),
  risk_level: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  headline: z.string(),
  critical_issues: z.array(ClaudeIssueSchema),
  recommendations: z.array(ClaudeRecommendationSchema),
  consistency_issues: z.array(ClaudeConsistencyIssueSchema),
  checklist_results: z.record(z.string(), ChecklistResultValueSchema),
  appeal_tip: z.string(),
});

export type UserProfileInput = z.infer<typeof UserProfileSchema>;
export type ClaudeAnalysisOutput = z.infer<typeof ClaudeAnalysisSchema>;

