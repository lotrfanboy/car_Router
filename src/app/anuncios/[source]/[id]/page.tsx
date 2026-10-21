import { ListingDetail } from "@/components/listing-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ source: string; id: string }>;
  searchParams: Promise<{ busca?: string }>;
}) {
  return (
    <ListingDetail {...await params} searchId={(await searchParams).busca} />
  );
}
