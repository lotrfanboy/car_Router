import { RadarsOverview } from "@/components/radars-overview";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; novo?: string }>;
}) {
  const params = await searchParams;
  return (
    <RadarsOverview
      key={`${params.busca ?? ""}:${params.novo ?? ""}`}
      initialSearchId={params.busca}
      initialOpen={params.novo === "1"}
    />
  );
}
