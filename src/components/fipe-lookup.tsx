"use client";
import { useRef, useState } from "react";
import { money } from "@/lib/vehicle";
import type { FipeReference } from "@/lib/fipe";
type Option = { code: string; name: string };
type Selection = { brand?: string; model?: string; year?: string };
export function FipeLookup({
  priceCents,
  modelYear,
}: {
  priceCents?: number | null;
  modelYear?: number | null;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [brands, setBrands] = useState<Option[]>([]),
    [models, setModels] = useState<Option[]>([]),
    [years, setYears] = useState<Option[]>([]),
    [selected, setSelected] = useState<Selection>({}),
    [reference, setReference] = useState<FipeReference | null>(null);
  const [localInfo, setLocalInfo] = useState<{
    competence: string;
    provider: string;
    recordCount: number;
    referenceMonth: string;
    stale: boolean;
    importedAt: string;
  } | null>(null);
  const sequence = useRef(0),
    retry = useRef<() => void>(() => {});
  async function load(
    type: "brands" | "models" | "years" | "detail",
    selection: Selection = {},
  ) {
    const id = ++sequence.current;
    setBusy(true);
    setError("");
    retry.current = () => void load(type, selection);
    try {
      const params = new URLSearchParams({ type, ...selection });
      const response = await fetch(`/api/fipe?${params}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw Error(data.error || "Não foi possível consultar a referência.");
      if (id !== sequence.current) return;
      setLocalInfo(data);
      if (type === "brands") setBrands(data.options);
      else if (type === "models") setModels(data.options);
      else if (type === "years") setYears(data.options);
      else setReference(data.reference);
    } catch (e) {
      if (id === sequence.current)
        setError(
          e instanceof Error
            ? e.message
            : "Não foi possível consultar a referência.",
        );
    } finally {
      if (id === sequence.current) setBusy(false);
    }
  }
  const yearMismatch =
    !!reference && !!modelYear && reference.modelYear !== modelYear;
  return (
    <section className="panel fipe-lookup">
      <div className="fipe-heading">
        <div>
          <span className="eyebrow">UMA REFERÊNCIA A MAIS</span>
          <h2>Referência FIPE</h2>
        </div>
        <button
          type="button"
          className="button"
          aria-expanded={open}
          onClick={() => {
            setOpen(!open);
            if (!open && !brands.length) void load("brands");
          }}
        >
          {open ? "Recolher consulta" : "Consultar FIPE"}
        </button>
      </div>
      <p>
        Consulta à base mensal armazenada neste computador, sem chamada de API
        por clique. A referência é nacional; não é avaliação individual do carro
        nem média dos anúncios.
      </p>
      {open && (
        <>
          {localInfo && (
            <p className={localInfo.stale ? "discovery-notice" : "muted"}>
              Origem: {localInfo.provider} · {localInfo.recordCount}{" "}
              referência(s) importada(s). Base local ·{" "}
              {localInfo.referenceMonth} · importada em{" "}
              {new Date(localInfo.importedAt).toLocaleDateString("pt-BR")}.
              {localInfo.stale
                ? " A competência é anterior ao mês atual; não representa uma atualização deste mês."
                : ""}
            </p>
          )}
          <div className="fipe-selectors">
            <label>
              Marca FIPE
              <select
                aria-label="Marca FIPE"
                disabled={busy}
                value={selected.brand ?? ""}
                onChange={(e) => {
                  const next = { brand: e.target.value };
                  setSelected(next);
                  setModels([]);
                  setYears([]);
                  setReference(null);
                  if (next.brand) void load("models", next);
                }}
              >
                <option value="">Selecione a marca</option>
                {brands.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Modelo e versão FIPE
              <select
                aria-label="Modelo e versão FIPE"
                disabled={busy || !selected.brand}
                value={selected.model ?? ""}
                onChange={(e) => {
                  const next = { brand: selected.brand, model: e.target.value };
                  setSelected(next);
                  setYears([]);
                  setReference(null);
                  if (next.model) void load("years", next);
                }}
              >
                <option value="">Selecione o modelo e a versão</option>
                {models.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Ano-modelo e combustível FIPE
              <select
                aria-label="Ano-modelo e combustível FIPE"
                disabled={busy || !selected.model}
                value={selected.year ?? ""}
                onChange={(e) => {
                  setSelected({ ...selected, year: e.target.value });
                  setReference(null);
                }}
              >
                <option value="">Selecione o ano e combustível</option>
                {years.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="button primary"
            disabled={busy || !selected.year}
            onClick={() => void load("detail", selected)}
          >
            {busy ? "Consultando…" : "Consultar valor selecionado"}
          </button>
          {busy && <p role="status">Carregando a referência selecionada…</p>}
          {error && (
            <div className="error-box" role="alert">
              {error}
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => retry.current()}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {reference && (
            <div className="fipe-result">
              <div>
                <span className="eyebrow">
                  MÊS DE REFERÊNCIA · {reference.referenceMonth}
                </span>
                <strong className="fipe-price">
                  {money(reference.priceCents)}
                </strong>
                <p>
                  {reference.brand} · {reference.model}
                </p>
                <p>
                  {reference.modelYear === 32000
                    ? "Zero km"
                    : reference.modelYear}{" "}
                  · {reference.fuel} · Código FIPE {reference.code}
                </p>
              </div>
              {yearMismatch ? (
                <p className="discovery-notice">
                  O ano-modelo selecionado difere do ano informado nesta oferta.
                  A comparação de valores não foi calculada.
                </p>
              ) : (
                priceCents != null &&
                priceCents > 0 && (
                  <p>
                    Preço anunciado: <strong>{money(priceCents)}</strong> ·{" "}
                    {money(Math.abs(priceCents - reference.priceCents))}{" "}
                    {priceCents >= reference.priceCents ? "acima" : "abaixo"} da
                    referência selecionada.
                  </p>
                )
              )}
              <p>
                Confira se marca, versão, ano-modelo e combustível correspondem
                exatamente ao veículo. A seleção é sua; esta consulta não
                confirma equivalência nem altera a referência manual ou a
                classificação da oferta.
              </p>
              <a
                className="text-link"
                href="https://veiculos.fipe.org.br/"
                target="_blank"
                rel="noreferrer"
              >
                Conferir na consulta pública da FIPE
              </a>
            </div>
          )}
        </>
      )}
    </section>
  );
}
