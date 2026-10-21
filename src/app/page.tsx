"use client";
import Link from "next/link";
import {
  CarFront,
  Heart,
  ChartNoAxesColumn,
  ArrowDownRight,
  ArrowRight,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { Empty, PageHeading, VehicleCard } from "@/components/vehicle-ui";
import { money } from "@/lib/vehicle";
export default function Dashboard() {
  const { vehicles } = useWorkspace();
  const below = vehicles.filter(
    (v) => v.referenceCents && v.priceCents < v.referenceCents,
  );
  const sources = Object.entries(
    vehicles.reduce<Record<string, number>>((a, v) => {
      a[v.source] = (a[v.source] || 0) + 1;
      return a;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const metrics = [
    {
      label: "Veículos no radar",
      value: vehicles.length,
      detail: "Anúncios cadastrados",
      icon: CarFront,
    },
    {
      label: "Seus favoritos",
      value: vehicles.filter((v) => v.favorite).length,
      detail: "Na sua lista de interesse",
      icon: Heart,
    },
    {
      label: "Preço médio",
      value: vehicles.length
        ? money(
            Math.round(
              vehicles.reduce((a, v) => a + v.priceCents, 0) / vehicles.length,
            ),
          )
        : "—",
      detail: "Entre os anúncios cadastrados",
      icon: ChartNoAxesColumn,
    },
    {
      label: "Abaixo da referência",
      value: below.length,
      detail: "Referência informada por você",
      icon: ArrowDownRight,
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="SEU MERCADO, EM PERSPECTIVA"
        title="Visão geral"
        description="Um olhar sobre os veículos que você está acompanhando."
      />
      <div className="metrics">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <section className="metric" key={label}>
            <div>
              {label}
              <Icon size={18} />
            </div>
            <strong>{value}</strong>
            <small>{detail}</small>
          </section>
        ))}
      </div>
      <div className="section-heading">
        <h2>
          Adicionados recentemente{" "}
          <span className="count">{vehicles.length}</span>
        </h2>
        <Link href="/veiculos">
          Ver catálogo <ArrowRight size={15} />
        </Link>
      </div>
      {vehicles.length ? (
        <div className="cards">
          {vehicles.slice(0, 3).map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      ) : (
        <Empty />
      )}
      <div className="dashboard-bottom">
        <section className="panel">
          <div className="section-heading">
            <h2>Origem dos anúncios</h2>
            <span className="caption">CADASTRO MANUAL</span>
          </div>
          {sources.length ? (
            sources.map(([source, count]) => (
              <div className="source-row" key={source}>
                <div>
                  <span>{source}</span>
                  <strong>{count}</strong>
                </div>
                <div className="source-track">
                  <span
                    style={{ width: (count / vehicles.length) * 100 + "%" }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="muted panel-copy">
              A distribuição aparecerá quando você cadastrar seus anúncios.
            </p>
          )}
        </section>
        <section className="panel reference-panel">
          <div className="eyebrow">ANÁLISE COM CONTEXTO</div>
          <h2>
            O preço certo começa
            <br />
            com uma boa referência.
          </h2>
          <p>
            Informe um valor de mercado no cadastro e veja a diferença em reais
            e em percentual. Você define a referência.
          </p>
          <Link href="/veiculos">
            Explorar meu catálogo <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </>
  );
}
