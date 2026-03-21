import { ClaudeAnalysisSchema } from "@/lib/scan-schemas";

/** Minimal valid analysis JSON while a scan row is still `running` (not shown to users when polling). */
export const PENDING_ANALYSIS_PLACEHOLDER = ClaudeAnalysisSchema.parse({
  risk_score: 0,
  risk_level: "LOW",
  headline: "Scan in progress…",
  critical_issues: [],
  recommendations: [],
  consistency_issues: [],
  checklist_results: {},
  appeal_tip: "",
});
