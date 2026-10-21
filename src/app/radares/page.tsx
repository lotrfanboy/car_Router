import { RadarsWorkspace } from "@/components/radars-workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>;
}) {
  return <RadarsWorkspace initialSearchId={(await searchParams).busca} />;
}
