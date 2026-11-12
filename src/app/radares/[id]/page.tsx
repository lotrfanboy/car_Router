import { notFound } from "next/navigation";
import { getRadarDetail } from "@/lib/radar-detail";
import { RadarDetailWorkspace } from "@/components/radar-detail-workspace";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const detail = await getRadarDetail((await params).id);
  if (!detail) notFound();
  return <RadarDetailWorkspace data={detail} />;
}
