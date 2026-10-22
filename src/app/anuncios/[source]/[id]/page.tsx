import { ListingDetail } from "@/components/listing-detail";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ source: string; id: string }>;
  searchParams: Promise<{ busca?: string | string[]; origem?: string | string[] }>;
}) {
  const query = await searchParams;
  const origin = query.origem === "salvos" || query.origem === "comparar-anuncios" ? query.origem : undefined;
  return (
    <ListingDetail {...await params} searchId={typeof query.busca === "string" ? query.busca : undefined} origin={origin} />
  );
}
