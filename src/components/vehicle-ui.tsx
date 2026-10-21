"use client";
import { useState } from "react";
import Link from "next/link";
import {
  CarFront,
  Heart,
  MapPin,
  ArrowUpRight,
  Columns3,
  Plus,
  ArrowDownRight,
  Radar,
} from "lucide-react";
import { Vehicle, money, number, location, opportunity } from "@/lib/vehicle";
import { analyzeVehicle, priceRecordDate } from "@/lib/intelligence";
import { useWorkspace } from "./workspace";
export function VehicleImage({ vehicle }: { vehicle: Vehicle }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl !== null && failedUrl === vehicle.imageUrl;
  return (
    <div className="vehicle-image">
      {vehicle.imageUrl && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={vehicle.imageUrl}
          alt={vehicle.brand + " " + vehicle.model}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(vehicle.imageUrl)}
          decoding="async"
        />
      ) : (
        <div className="image-placeholder">
          <CarFront size={48} strokeWidth={1} />
          <span>
            {failed ? "Imagem indisponível" : "Fotografia não disponível"}
          </span>
        </div>
      )}
      {vehicle.imageUrl && !failed && (
        <span className="photo-origin">
          Imagem informada · {new URL(vehicle.imageUrl).hostname}
        </span>
      )}
    </div>
  );
}
export function Opportunity({
  vehicle,
  full = false,
}: {
  vehicle: Vehicle;
  full?: boolean;
}) {
  const result = opportunity(vehicle.priceCents, vehicle.referenceCents);
  if (!result)
    return <span className="neutral-note">Sem referência informada</span>;
  const below = result.difference < 0;
  return (
    <span
      title="Comparação com a referência manual cadastrada. Não é FIPE verificada."
      className={
        below
          ? "opportunity below"
          : result.difference > 0
            ? "opportunity above"
            : "opportunity equal"
      }
    >
      {below ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
      {result.difference === 0
        ? "No valor de referência"
        : Math.abs(result.percentage).toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
          }) +
          "% " +
          (below ? "abaixo" : "acima")}
      <span className="reference-label"> da ref. manual</span>
      {full && result.difference !== 0
        ? " · " + money(Math.abs(result.difference))
        : ""}
    </span>
  );
}
export function VehicleCard({ vehicle: v }: { vehicle: Vehicle }) {
  const { vehicles, favorite, selected, toggleCompare } = useWorkspace();
  const analysis = analyzeVehicle(v, vehicles);
  return (
    <article className="vehicle-card">
      <div className="image-wrap">
        <Link href={"/veiculos/" + v.id}>
          <VehicleImage vehicle={v} />
        </Link>
        <span className="source-tag">{v.source}</span>
        <button
          className={"favorite-button " + (v.favorite ? "is-favorite" : "")}
          aria-label={
            v.favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"
          }
          aria-pressed={v.favorite}
          onClick={() => void favorite(v)}
        >
          <Heart size={18} fill={v.favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="card-body">
        <div className="card-eyebrow">{v.brand}</div>
        <Link className="card-title" href={"/veiculos/" + v.id}>
          {v.model}
          <ArrowUpRight size={18} />
        </Link>
        <p className="version">{v.version || "Versão não informada"}</p>
        <div className="vehicle-meta">
          <span>
            {v.manufactureYear}/{v.modelYear}
          </span>
          <span>{number(v.mileage)} km</span>
          <span>{v.transmission || "Câmbio n/i"}</span>
        </div>
        <div className="card-price">{money(v.priceCents)}</div>
        <Opportunity vehicle={v} />
        <div className="card-analysis">
          <span
            className={"analysis-label " + analysis.classification}
            title={[...analysis.reasons, ...analysis.limitations].join(" ")}
          >
            {analysis.label}
          </span>
          <span title="Data do último preço registrado no catálogo">
            {new Date(priceRecordDate(v)).toLocaleDateString("pt-BR", {
              timeZone: "America/Sao_Paulo",
            })}
          </span>
        </div>
        <div className="card-bottom">
          <span>
            <MapPin size={13} />
            {location(v)}
          </span>
          <button
            aria-pressed={selected.includes(v.id)}
            className={
              selected.includes(v.id)
                ? "compare-toggle selected"
                : "compare-toggle"
            }
            onClick={() => toggleCompare(v.id)}
          >
            <Columns3 size={14} />
            {selected.includes(v.id) ? "Selecionado" : "Comparar"}
          </button>
          {v.originalUrl && (
            <a
              href={v.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="original-action"
              aria-label={`Abrir anúncio original de ${v.model}`}
              title="Abrir anúncio original"
            >
              <ArrowUpRight size={15} />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
export function Empty({
  title = "Seu radar começa aqui",
  description = "Cadastre o primeiro veículo para organizar anúncios e encontrar oportunidades.",
  action = true,
}: {
  title?: string;
  description?: string;
  action?: boolean;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Radar size={36} strokeWidth={1.1} />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action && (
        <Link href="/veiculos/novo" className="button primary">
          <Plus size={17} />
          Cadastrar veículo
        </Link>
      )}
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
