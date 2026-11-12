"use client";
import { useCallback, useEffect, useState } from "react";
import {
  RadarEmailStatus,
  type RadarEmailConfiguration,
} from "./radar-email-status";
import type { RadarEmailOverview } from "@/lib/radar-email-status";
export function RadarDiagnostics() {
  const [data, setData] = useState<{
    infrastructure: {
      missing: string[];
      emailConfiguration: RadarEmailConfiguration;
    };
    emailStatus: RadarEmailOverview;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/radars", { cache: "no-store" });
      if (!response.ok) throw Error();
      setData(await response.json());
    } catch {
      setError("Não foi possível ler a situação dos radares.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);
  return (
    <section id="radares" style={{ scrollMarginTop: 24 }}>
      <section className="panel">
        <h2>Monitoramento dos radares</h2>
        <p>
          A plataforma define a cadência e os limites de coleta. Abrir radares
          ou atualizar esta situação apenas lê os dados salvos.
        </p>
        {error ? (
          <p role="alert">
            {error}{" "}
            <button className="button small" onClick={() => void load()}>
              Tentar novamente
            </button>
          </p>
        ) : !data ? (
          <p role="status">Carregando situação…</p>
        ) : data.infrastructure.missing.length ? (
          <details>
            <summary>Monitoramento indisponível · ver diagnóstico</summary>
            <ul>
              {data.infrastructure.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        ) : (
          <p>
            Integração de monitoramento disponível. Confira o estado individual
            de cada radar.
          </p>
        )}
      </section>
      {data && (
        <RadarEmailStatus
          configuration={data.infrastructure.emailConfiguration}
          overview={data.emailStatus}
          refreshing={busy}
          onRefresh={() => void load()}
        />
      )}
    </section>
  );
}
