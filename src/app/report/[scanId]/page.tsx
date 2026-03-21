import { redirect } from "next/navigation";

export default function ReportByIdPage({
  params,
}: {
  params: { scanId: string };
}) {
  redirect(`/report?scan_id=${encodeURIComponent(params.scanId)}`);
}

