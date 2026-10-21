import { Suspense } from "react";
import { Catalog } from "@/components/catalog";
export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          Carregando filtros…
        </div>
      }
    >
      <Catalog />
    </Suspense>
  );
}
