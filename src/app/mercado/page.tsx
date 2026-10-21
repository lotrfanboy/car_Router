import { Suspense } from "react";
import { MarketWorkspace } from "@/components/market-workspace";
import "../market.css";

export default function MarketPage() {
  return (
    <Suspense
      fallback={
        <div className="loading" role="status">
          Preparando sua análise…
        </div>
      }
    >
      <MarketWorkspace />
    </Suspense>
  );
}
