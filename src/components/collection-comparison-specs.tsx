import type { ReactNode } from "react";
import Link from "next/link";
import {
  collectionPath,
  collectionView,
  type CollectionEntry,
} from "@/lib/vehicle-collection";
import { analyzeVehicle } from "@/lib/intelligence";
import { money, number, type Vehicle } from "@/lib/vehicle";
export type CollectionSpec = {
  label: string;
  group: string;
  raw: (entry: CollectionEntry) => unknown;
  value: (entry: CollectionEntry) => ReactNode;
};
const text = (value: string | null | undefined) => value || "Não informado";
export function collectionSpecs(manuals: Vehicle[]): CollectionSpec[] {
  const reference = (entry: CollectionEntry) => {
    if (entry.kind === "listing")
      return {
        kind: "Média dos anúncios observados",
        value:
          entry.listing.comparison?.status === "valid"
            ? entry.listing.comparison.meanCents
            : null,
        count: entry.listing.comparison?.count ?? 0,
      };
    const analysis = analyzeVehicle(entry.vehicle, manuals);
    return {
      kind: "Mediana do catálogo manual",
      value:
        analysis.classification !== "insufficient"
          ? analysis.comparableMedianCents
          : null,
      count: analysis.comparablesCount,
    };
  };
  const technical = (
    key: "engine" | "fuel" | "transmission",
    label: string,
  ): CollectionSpec => ({
    group: "O veículo",
    label,
    raw: (e) => {
      const t = collectionView(e).technical;
      return [t[key], t.origins[key], t.conflicts.includes(key)];
    },
    value: (e) => {
      const t = collectionView(e).technical;
      return (
        <>
          {text(t[key])}
          {t.origins[key] === "version" && (
            <small>Descrito na versão; não confirmado por inspeção</small>
          )}
          {t.conflicts.includes(key) && (
            <small>Fonte e descrição da versão divergem; conferir</small>
          )}
        </>
      );
    },
  });
  return [
    {
      group: "Preço e referências",
      label: "Preço anunciado",
      raw: (e) => collectionView(e).priceCents,
      value: (e) => <strong>{money(collectionView(e).priceCents)}</strong>,
    },
    {
      group: "Preço e referências",
      label: "Referência informada",
      raw: (e) => collectionView(e).referenceCents,
      value: (e) =>
        e.kind === "manual" ? (
          <>
            {money(e.vehicle.referenceCents)}
            <small>Valor manual, não FIPE verificada</small>
          </>
        ) : (
          "Não fornecida pela fonte"
        ),
    },
    {
      group: "Preço e referências",
      label: "Diferença da ref. manual",
      raw: (e) => {
        const r = collectionView(e);
        return r.referenceCents && r.priceCents !== null
          ? (r.priceCents - r.referenceCents) / r.referenceCents
          : null;
      },
      value: (e) => {
        const r = collectionView(e);
        if (!r.referenceCents || r.priceCents === null)
          return "Sem referência manual";
        const delta = r.priceCents - r.referenceCents;
        return (
          <>
            {money(Math.abs(delta))}{" "}
            {delta < 0 ? "abaixo" : delta > 0 ? "acima" : "de diferença"}
            <small>
              {Math.abs((delta / r.referenceCents) * 100).toLocaleString(
                "pt-BR",
                { minimumFractionDigits: 1, maximumFractionDigits: 1 },
              )}
              % da referência informada
            </small>
          </>
        );
      },
    },
    {
      group: "Preço e referências",
      label: "Referência dos semelhantes",
      raw: (e) => reference(e),
      value: (e) => {
        const r = reference(e);
        return (
          <>
            {r.value === null ? "Sem base suficiente" : money(r.value)}
            <small>
              {r.kind} · {r.count} comparáveis
            </small>
          </>
        );
      },
    },
    {
      group: "Preço e referências",
      label: "Último preço registrado",
      raw: (e) => collectionView(e).observedAt,
      value: (e) => {
        const value = collectionView(e).observedAt;
        return value
          ? new Date(value).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })
          : "Sem data de preço registrada";
      },
    },
    {
      group: "O veículo",
      label: "Marca e modelo",
      raw: (e) => {
        const r = collectionView(e);
        return [r.brand, r.model];
      },
      value: (e) => {
        const r = collectionView(e);
        return [r.brand, r.model].filter(Boolean).join(" ") || "Não informados";
      },
    },
    {
      group: "O veículo",
      label: "Fabricação / modelo",
      raw: (e) => {
        const r = collectionView(e);
        return [r.manufactureYear, r.modelYear];
      },
      value: (e) => {
        const r = collectionView(e);
        return `${r.manufactureYear ?? "Fabricação não informada"} / ${r.modelYear ?? "modelo não informado"}`;
      },
    },
    {
      group: "O veículo",
      label: "Versão",
      raw: (e) => collectionView(e).version,
      value: (e) => text(collectionView(e).version),
    },
    {
      group: "O veículo",
      label: "Quilometragem",
      raw: (e) => collectionView(e).mileage,
      value: (e) => {
        const km = collectionView(e).mileage;
        return km === null ? "Não informada" : `${number(km)} km`;
      },
    },
    technical("engine", "Motor"),
    technical("transmission", "Câmbio"),
    technical("fuel", "Combustível"),
    {
      group: "Origem e histórico",
      label: "Tipo do registro",
      raw: (e) => e.kind,
      value: (e) => collectionView(e).origin,
    },
    {
      group: "Origem e histórico",
      label: "Portal / canal",
      raw: (e) => collectionView(e).source,
      value: (e) => collectionView(e).source,
    },
    {
      group: "Origem e histórico",
      label: "Localização",
      raw: (e) => {
        const r = collectionView(e);
        return [r.city, r.state];
      },
      value: (e) => {
        const r = collectionView(e);
        return [r.city, r.state].filter(Boolean).join(" / ") || "Não informada";
      },
    },
    {
      group: "Origem e histórico",
      label: "Anunciante",
      raw: (e) => collectionView(e).seller,
      value: (e) => text(collectionView(e).seller),
    },
    {
      group: "Origem e histórico",
      label: "Observações",
      raw: (e) => collectionView(e).notes,
      value: (e) =>
        e.kind === "manual"
          ? text(e.vehicle.notes)
          : "Não fornecidas pela fonte",
    },
    {
      group: "Origem e histórico",
      label: "Registros de preço",
      raw: (e) => (e.kind === "manual" ? e.vehicle.priceHistory : null),
      value: (e) => (
        <>
          {e.kind === "manual" && e.vehicle.priceHistory?.length ? (
            <span>
              {e.vehicle.priceHistory
                .map((p) => money(p.priceCents))
                .join(" → ")}
              <small>Últimos registros; histórico completo no detalhe</small>
            </span>
          ) : (
            "Observações preservadas na origem deste registro"
          )}
          <Link href={collectionPath(e, "comparar")}>
            Ver histórico e simulação
          </Link>
        </>
      ),
    },
  ];
}
