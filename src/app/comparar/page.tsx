"use client";
import Link from "next/link";
import { X, Plus, Columns3 } from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import {
  PageHeading,
  VehicleImage,
  Opportunity,
} from "@/components/vehicle-ui";
import { Vehicle, money, number, location } from "@/lib/vehicle";
export default function Compare() {
  const { vehicles, selected, toggleCompare, clearCompare } = useWorkspace();
  const rows = selected
    .map((id) => vehicles.find((v) => v.id === id))
    .filter((v): v is Vehicle => !!v);
  const specs: [string, (v: Vehicle) => React.ReactNode][] = [
    ["Marca / modelo", (v) => v.brand + " " + v.model],
    ["Fabricação / modelo", (v) => v.manufactureYear + " / " + v.modelYear],
    ["Versão", (v) => v.version || "—"],
    ["Preço anunciado", (v) => <strong>{money(v.priceCents)}</strong>],
    ["Quilometragem", (v) => number(v.mileage) + " km"],
    ["Combustível", (v) => v.fuel || "—"],
    ["Câmbio", (v) => v.transmission || "—"],
    ["Localização", location],
    ["Origem", (v) => v.source],
    ["Referência informada", (v) => money(v.referenceCents)],
    [
      "Diferença em relação à referência",
      (v) => <Opportunity vehicle={v} full />,
    ],
  ];
  return (
    <>
      <PageHeading
        eyebrow="DECIDA COM MAIS CLAREZA"
        title="Comparador"
        description="Coloque de 2 a 3 veículos lado a lado e avalie os detalhes."
      >
        {rows.length > 0 && (
          <button className="button" onClick={clearCompare}>
            Limpar seleção
          </button>
        )}
      </PageHeading>
      {rows.length < 2 && (
        <div className="comparison-notice">
          <Columns3 size={22} />
          <div>
            <strong>
              {rows.length
                ? "Selecione mais um veículo"
                : "Escolha os veículos para comparar"}
            </strong>
            <p>Use o botão Comparar no catálogo ou selecione abaixo.</p>
          </div>
        </div>
      )}
      <div className="compare-picker">
        <label>
          Adicionar veículo
          <select
            aria-label="Adicionar veículo à comparação"
            value=""
            disabled={rows.length >= 3}
            onChange={(e) => {
              if (e.target.value) toggleCompare(e.target.value);
            }}
          >
            <option value="">
              {rows.length >= 3
                ? "Limite de 3 veículos atingido"
                : "Selecione um veículo cadastrado"}
            </option>
            {vehicles
              .filter((v) => !selected.includes(v.id))
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} · {v.modelYear} · {money(v.priceCents)}
                </option>
              ))}
          </select>
        </label>
        <Link href="/veiculos" className="button">
          <Plus size={16} />
          Selecionar no catálogo
        </Link>
      </div>
      {rows.length > 0 && (
        <div className="table-scroll comparison-table">
          <table>
            <thead>
              <tr>
                <th>
                  <span className="eyebrow">SUA SELEÇÃO</span>
                  <p>{rows.length} / 3 veículos</p>
                </th>
                {rows.map((v) => (
                  <th key={v.id}>
                    <div className="compare-image">
                      <VehicleImage vehicle={v} />
                      <button
                        className="icon-button"
                        aria-label={"Remover " + v.model + " da comparação"}
                        onClick={() => toggleCompare(v.id)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <Link href={"/veiculos/" + v.id}>
                      {v.brand} {v.model}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {specs.map(([label, get]) => (
                <tr key={label}>
                  <th>{label}</th>
                  {rows.map((v) => (
                    <td key={v.id}>{get(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="comparison-footnote">
        A análise utiliza exclusivamente os preços e valores de referência
        cadastrados por você. Verifique as condições de cada veículo antes de
        decidir.
      </p>
    </>
  );
}
