"use client";
import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Heart,
  Pencil,
  Trash2,
  Columns3,
  ExternalLink,
  MapPin,
  Info,
} from "lucide-react";
import { useWorkspace } from "@/components/workspace";
import { Empty, Opportunity, VehicleImage } from "@/components/vehicle-ui";
import { money, number, location } from "@/lib/vehicle";
export default function Details({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { vehicles, favorite, selected, toggleCompare, reload, notify } =
    useWorkspace();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const v = vehicles.find((v) => v.id === id);
  if (!v)
    return (
      <Empty
        title="Anúncio não encontrado"
        description="Este registro foi excluído ou o endereço não existe."
        action={false}
      />
    );
  async function remove() {
    setDeleting(true);
    setError("");
    try {
      const response = await fetch("/api/vehicles/" + id, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível excluir o anúncio.");
      await reload();
      dialog.current?.close();
      notify("Anúncio excluído.");
      router.push("/veiculos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao excluir.");
    } finally {
      setDeleting(false);
    }
  }
  return (
    <>
      <Link href="/veiculos" className="back-link">
        <ArrowLeft size={16} />
        Voltar ao catálogo
      </Link>
      <div className="detail-heading">
        <div>
          <div className="eyebrow">{v.brand}</div>
          <h1>{v.model}</h1>
          <p>
            {v.version || "Versão não informada"} · {v.manufactureYear}/
            {v.modelYear}
          </p>
        </div>
        <div className="detail-actions">
          <button
            className="button"
            aria-pressed={v.favorite}
            onClick={() => void favorite(v)}
          >
            <Heart size={16} fill={v.favorite ? "currentColor" : "none"} />
            {v.favorite ? "Favoritado" : "Favoritar"}
          </button>
          <Link className="button" href={"/veiculos/" + v.id + "/editar"}>
            <Pencil size={16} />
            Editar
          </Link>
          <button
            className="icon-button danger"
            aria-label="Excluir anúncio"
            onClick={() => dialog.current?.showModal()}
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div>
          <div className="detail-image">
            <VehicleImage key={v.imageUrl} vehicle={v} />
          </div>
          <section className="panel technical">
            <h2>Informações do veículo</h2>
            <dl className="spec-grid">
              {[
                ["Marca", v.brand],
                ["Modelo", v.model],
                ["Versão", v.version],
                [
                  "Fabricação / modelo",
                  v.manufactureYear + " / " + v.modelYear,
                ],
                ["Quilometragem", number(v.mileage) + " km"],
                ["Combustível", v.fuel],
                ["Câmbio", v.transmission],
                ["Localização", location(v)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Não informado"}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section className="panel">
            <h2>Observações</h2>
            <p className="notes">
              {v.notes || "Nenhuma observação adicionada."}
            </p>
          </section>
        </div>
        <div className="detail-aside">
          <section className="panel price-panel">
            <span className="eyebrow">PREÇO ANUNCIADO</span>
            <strong className="detail-price">{money(v.priceCents)}</strong>
            <span className="detail-location">
              <MapPin size={15} />
              {location(v)}
            </span>
            <hr />
            <div className="reference-value">
              <span>Referência informada</span>
              <strong>{money(v.referenceCents)}</strong>
            </div>
            <Opportunity vehicle={v} full />
            <div className="info-note">
              <Info size={15} />
              <span>
                Comparação com o valor informado por você, sem consulta externa.
              </span>
            </div>
            <button
              className="button primary full"
              aria-pressed={selected.includes(v.id)}
              onClick={() => toggleCompare(v.id)}
            >
              <Columns3 size={17} />
              {selected.includes(v.id)
                ? "Remover da comparação"
                : "Adicionar à comparação"}
            </button>
          </section>
          <section className="panel">
            <h2>Sobre o anúncio</h2>
            <dl className="source-details">
              <div>
                <dt>Origem</dt>
                <dd>{v.source}</dd>
              </div>
              <div>
                <dt>Cadastrado em</dt>
                <dd>{new Date(v.createdAt).toLocaleDateString("pt-BR")}</dd>
              </div>
              <div>
                <dt>Última atualização</dt>
                <dd>{new Date(v.updatedAt).toLocaleDateString("pt-BR")}</dd>
              </div>
            </dl>
            {v.originalUrl && (
              <a
                className="button full"
                href={v.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir anúncio original
                <ExternalLink size={15} />
              </a>
            )}
          </section>
        </div>
      </div>
      <dialog ref={dialog} className="delete-dialog">
        <h2>Excluir este anúncio?</h2>
        <p>
          {v.brand} {v.model} será removido permanentemente do catálogo, dos
          favoritos e da comparação.
        </p>
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            className="button"
            disabled={deleting}
            onClick={() => dialog.current?.close()}
          >
            Cancelar
          </button>
          <button
            className="button destructive"
            disabled={deleting}
            onClick={() => void remove()}
          >
            {deleting ? "Excluindo…" : "Excluir anúncio"}
          </button>
        </div>
      </dialog>
    </>
  );
}
