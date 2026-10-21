"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Info } from "lucide-react";
import {
  Vehicle,
  vehicleSchema,
  states,
  fuels,
  transmissions,
} from "@/lib/vehicle";
import { useWorkspace } from "./workspace";
import { PageHeading } from "./vehicle-ui";
export function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const router = useRouter();
  const { reload, notify } = useWorkspace();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>(
    {},
  );
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFailure("");
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(form);
    for (const key of ["manufactureYear", "modelYear", "mileage"])
      data[key] = form.get(key) === "" ? NaN : Number(form.get(key));
    data.priceCents = Math.round(Number(form.get("price")) * 100);
    data.referenceCents = form.get("reference")
      ? Math.round(Number(form.get("reference")) * 100)
      : null;
    const parsed = vehicleSchema.safeParse(data);
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors);
      setFailure("Revise os campos destacados antes de salvar.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        "/api/vehicles" + (vehicle ? "/" + vehicle.id : ""),
        {
          method: vehicle ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        setErrors(result.fields || {});
        throw new Error(result.error || "Não foi possível salvar.");
      }
      await reload();
      notify(vehicle ? "Anúncio atualizado." : "Anúncio cadastrado.");
      router.push("/veiculos/" + result.id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  function field(
    name: string,
    label: string,
    opts: {
      type?: string;
      required?: boolean;
      placeholder?: string;
      min?: number;
      max?: number;
      step?: string;
    } = {},
  ) {
    let value: string | number = vehicle
      ? ((vehicle[name as keyof Vehicle] as string | number) ?? "")
      : "";
    if (name === "price") value = vehicle ? vehicle.priceCents / 100 : "";
    if (name === "reference")
      value = vehicle?.referenceCents ? vehicle.referenceCents / 100 : "";
    const errorKey =
      name === "price"
        ? "priceCents"
        : name === "reference"
          ? "referenceCents"
          : name;
    return (
      <label>
        {label}
        {opts.required && <span className="required"> *</span>}
        <input
          name={name}
          type={opts.type || "text"}
          defaultValue={value}
          {...opts}
          aria-invalid={!!errors[errorKey]}
          aria-describedby={errors[errorKey] ? name + "-error" : undefined}
        />
        {errors[errorKey] && (
          <span id={name + "-error"} className="field-error">
            {errors[errorKey]?.[0]}
          </span>
        )}
      </label>
    );
  }
  function select(
    name: "state" | "fuel" | "transmission",
    label: string,
    options: string[],
  ) {
    return (
      <label>
        {label}
        <select name={name} defaultValue={vehicle?.[name] || ""}>
          <option value="">Não informado</option>
          {options.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        {errors[name] && (
          <span className="field-error">{errors[name]?.[0]}</span>
        )}
      </label>
    );
  }
  return (
    <>
      <Link
        className="back-link"
        href={vehicle ? "/veiculos/" + vehicle.id : "/veiculos"}
      >
        <ArrowLeft size={16} />
        Voltar {vehicle ? "ao anúncio" : "ao catálogo"}
      </Link>
      <PageHeading
        eyebrow="CADASTRO MANUAL"
        title={vehicle ? "Editar anúncio" : "Novo anúncio"}
        description="Reúna as informações do veículo. Campos com * são obrigatórios."
      />
      <form onSubmit={submit} className="vehicle-form">
        <section className="form-section">
          <div className="form-section-title">
            <span>01</span>
            <div>
              <h2>Identificação do veículo</h2>
              <p>Os detalhes que distinguem este anúncio.</p>
            </div>
          </div>
          <div className="form-grid">
            {field("brand", "Marca", {
              required: true,
              placeholder: "Ex.: Toyota",
            })}
            {field("model", "Modelo", {
              required: true,
              placeholder: "Ex.: Corolla",
            })}
            {field("version", "Versão", { placeholder: "Ex.: XEi 2.0" })}
            {field("manufactureYear", "Ano de fabricação", {
              type: "number",
              required: true,
              min: 1900,
              max: new Date().getFullYear() + 1,
            })}
            {field("modelYear", "Ano do modelo", {
              type: "number",
              required: true,
              min: 1900,
              max: new Date().getFullYear() + 2,
            })}
            {field("mileage", "Quilometragem (km)", {
              type: "number",
              required: true,
              min: 0,
              max: 10000000,
            })}
            {select("fuel", "Combustível", fuels)}
            {select("transmission", "Câmbio", transmissions)}
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-title">
            <span>02</span>
            <div>
              <h2>Preço e referência</h2>
              <p>Valores em reais, com até duas casas decimais.</p>
            </div>
          </div>
          <div className="form-grid two">
            {field("price", "Preço anunciado (R$)", {
              type: "number",
              required: true,
              min: 0.01,
              max: 20000000,
              step: "0.01",
            })}
            {field("reference", "Valor de referência (R$)", {
              type: "number",
              min: 0.01,
              max: 20000000,
              step: "0.01",
            })}
          </div>
          <div className="info-note">
            <Info size={16} />
            <span>
              A referência é informada por você. Não há consulta automática à
              FIPE ou a outros serviços.
            </span>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-title">
            <span>03</span>
            <div>
              <h2>Localização e origem</h2>
              <p>Saiba onde encontrar o veículo e seu anúncio.</p>
            </div>
          </div>
          <div className="form-grid">
            {field("city", "Cidade")}
            {select("state", "Estado", states)}
            {field("source", "Origem do anúncio", {
              required: true,
              placeholder: "Ex.: Loja, particular, OLX",
            })}
            <div className="span-all">
              {field("originalUrl", "URL do anúncio original", {
                type: "url",
                placeholder: "https://…",
              })}
            </div>
            <div className="span-all">
              {field("imageUrl", "URL da imagem", {
                type: "url",
                placeholder: "https://…",
              })}
              <small className="muted">
                Use somente uma foto deste veículo que você tenha permissão para
                exibir. A origem será identificada; a imagem será carregada pelo
                navegador.
              </small>
            </div>
          </div>
        </section>
        <section className="form-section">
          <div className="form-section-title">
            <span>04</span>
            <div>
              <h2>Suas observações</h2>
              <p>Histórico, estado de conservação e pontos para verificar.</p>
            </div>
          </div>
          <label>
            Observações
            <textarea
              name="notes"
              rows={5}
              maxLength={5000}
              defaultValue={vehicle?.notes || ""}
              placeholder="O que vale lembrar sobre este veículo?"
            />
            {errors.notes && (
              <span className="field-error">{errors.notes[0]}</span>
            )}
          </label>
        </section>
        {failure && (
          <div className="error-box" role="alert">
            {failure}
          </div>
        )}
        <div className="form-actions">
          <Link
            className="button"
            href={vehicle ? "/veiculos/" + vehicle.id : "/veiculos"}
          >
            Cancelar
          </Link>
          <button className="button primary" disabled={saving} type="submit">
            <Save size={17} />
            {saving
              ? "Salvando…"
              : vehicle
                ? "Salvar alterações"
                : "Cadastrar veículo"}
          </button>
        </div>
      </form>
    </>
  );
}
