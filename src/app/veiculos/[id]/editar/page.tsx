"use client";
import { use } from "react";
import { useWorkspace } from "@/components/workspace";
import { VehicleForm } from "@/components/vehicle-form";
import { Empty } from "@/components/vehicle-ui";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { vehicles } = useWorkspace();
  const v = vehicles.find((v) => v.id === id);
  return v ? (
    <VehicleForm vehicle={v} />
  ) : (
    <Empty
      title="Anúncio não encontrado"
      description="O registro foi excluído ou o endereço não existe."
      action={false}
    />
  );
}
