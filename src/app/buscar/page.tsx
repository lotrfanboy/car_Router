import { SearchWorkspace } from "@/components/search-workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string }>;
}) {
  return <SearchWorkspace initialSearchId={(await searchParams).busca} />;
}
