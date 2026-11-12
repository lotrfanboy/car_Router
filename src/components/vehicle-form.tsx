"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Info } from "lucide-react";
import {
  Vehicle,
  vehicleSchema,
  states,
  fuels,
  transmissions,
  sellerTypes,
} from "@/lib/vehicle";
import { useWorkspace } from "./workspace";
import { PageHeading } from "./vehicle-ui";
import { SearchCombobox } from "./search-combobox";
import { useManualOptions } from "./use-manual-options";
import {
  parseMoneyInput,
  moneyInput,
  parseMileageInput,
  mileageInput,
} from "@/lib/manual-form-values";
export function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const { reload, notify } = useWorkspace();
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>(
    {},
  );
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const [brand, setBrand] = useState(vehicle?.brand ?? ""),
    [model, setModel] = useState(vehicle?.model ?? ""),
    [version, setVersion] = useState(vehicle?.version ?? ""),
    [state, setState] = useState(vehicle?.state ?? ""),
    [city, setCity] = useState(vehicle?.city ?? "");
  const [price, setPrice] = useState(
      vehicle ? moneyInput(vehicle.priceCents) : "",
    ),
    [reference, setReference] = useState(
      vehicle?.referenceCents ? moneyInput(vehicle.referenceCents) : "",
    ),
    [mileage, setMileage] = useState(
      vehicle ? vehicle.mileage.toLocaleString("pt-BR") : "",
    );
  const [imageUrl, setImageUrl] = useState(vehicle?.imageUrl ?? ""),
    [imageFile, setImageFile] = useState<File | null>(null),
    [filePreview, setFilePreview] = useState(""),
    [photoMode, setPhotoMode] = useState<"file" | "url">(
      vehicle?.imageUrl && !vehicle.imageUrl.startsWith("/api/vehicle-images/")
        ? "url"
        : "file",
    ),
    [photoError, setPhotoError] = useState("");
  const previewRef = useRef("");
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const [selectedCodes, setSelectedCodes] = useState<Record<string, string>>(
    {},
  );
  const brands = useManualOptions("brands");
  const same = (a: string, b: string) =>
    a.trim().toLocaleLowerCase("pt-BR") === b.trim().toLocaleLowerCase("pt-BR");
  const brandOption = brands.options.find((o) => same(o.name, brand));
  const models = useManualOptions("models", brandOption?.code ?? "");
  const modelOption = models.options.find((o) => same(o.name, model));
  const versions = useManualOptions(
    "versions",
    brandOption?.code ?? "",
    modelOption?.code ?? "",
  );
  const cities = useManualOptions("cities", state);
  function clearFile() {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = "";
    setFilePreview("");
    setImageFile(null);
  }
  function chooseFile(file: File | undefined) {
    clearFile();
    setPhotoError("");
    if (!file) return;
    if (
      file.size === 0 ||
      file.size > 8 * 1024 * 1024 ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setPhotoError("Use JPEG, PNG ou WebP de até 8 MB.");
      return;
    }
    setImageFile(file);
    previewRef.current = URL.createObjectURL(file);
    setFilePreview(previewRef.current);
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setFailure("");
    const form = new FormData(event.currentTarget);
    const data: Record<string, unknown> = Object.fromEntries(form);
    data.brand = brand;
    data.model = model;
    data.version = version;
    data.state = state;
    data.city = city;
    for (const key of ["manufactureYear", "modelYear"])
      data[key] = form.get(key) === "" ? NaN : Number(form.get(key));
    data.mileage = parseMileageInput(mileage);
    data.priceCents = parseMoneyInput(price);
    data.referenceCents = reference.trim() ? parseMoneyInput(reference) : null;
    data.imageUrl = imageFile ? "" : imageUrl;
    if (photoError) {
      setFailure("Revise a imagem selecionada.");
      return;
    }
    const parsed = vehicleSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setErrors(fieldErrors);
      setFailure(
        `${parsed.error.issues.length} ${parsed.error.issues.length === 1 ? "pendência impede" : "pendências impedem"} o salvamento. Revise os campos destacados.`,
      );
      const first = parsed.error.issues[0]?.path[0];
      requestAnimationFrame(() => {
        if (typeof first === "string")
          formRef.current
            ?.querySelector<HTMLElement>(
              `[name="${first === "priceCents" ? "price" : first === "referenceCents" ? "reference" : first}"]`,
            )
            ?.focus();
      });
      return;
    }
    setSaving(true);
    try {
      if (imageFile) {
        const upload = new FormData();
        upload.set("file", imageFile);
        const photoResponse = await fetch("/api/vehicle-images", {
          method: "POST",
          body: upload,
        });
        const photoResult = await photoResponse.json();
        if (!photoResponse.ok || typeof photoResult.url !== "string")
          throw new Error(
            photoResult.error || "Não foi possível salvar a imagem.",
          );
        parsed.data.imageUrl = photoResult.url;
        setImageUrl(photoResult.url);
        clearFile();
      }
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
    const fieldError = (key: string) => errors[key]?.[0];
    if (["brand", "model", "version", "city"].includes(name)) {
      const options =
        name === "brand"
          ? brands
          : name === "model"
            ? models
            : name === "version"
              ? versions
              : cities;
      const value =
        name === "brand"
          ? brand
          : name === "model"
            ? model
            : name === "version"
              ? version
              : city;
      const onChange = (text: string) => {
        setSelectedCodes((previous) => ({
          ...previous,
          [name]: "",
          ...(name === "brand"
            ? { model: "", version: "" }
            : name === "model"
              ? { version: "" }
              : {}),
        }));
        if (name === "brand") {
          setBrand(text);
          setModel("");
          setVersion("");
        } else if (name === "model") {
          setModel(text);
          setVersion("");
        } else if (name === "version") setVersion(text);
        else setCity(text);
      };
      return (
        <div className="manual-option-field">
          <SearchCombobox
            label={label + (opts.required ? " *" : "")}
            name={name}
            value={value}
            options={options.options}
            selectedCode={selectedCodes[name]}
            onChange={onChange}
            onSelect={(option) => {
              onChange(option.name);
              setSelectedCodes((previous) => ({
                ...previous,
                [name]: option.code,
              }));
            }}
            onManual={() => {}}
            disabled={name === "city" && !state}
            placeholder={
              name === "city" && !state
                ? "Selecione o estado primeiro"
                : (opts.placeholder ?? "Digite para procurar")
            }
            maxLength={name === "version" ? 150 : name === "city" ? 120 : 100}
            loading={options.loading}
            error={options.error}
            onRetry={options.retry}
            required={opts.required}
          />
          {fieldError(name) && (
            <span className="field-error" role="alert">
              {fieldError(name)}
            </span>
          )}
          {name === "version" && (
            <small className="muted">
              Opções limitadas ao catálogo e às versões explicitamente descritas
              em anúncios já observados. Se faltar, informe manualmente.
            </small>
          )}
        </div>
      );
    }
    if (name === "manufactureYear" || name === "modelYear") {
      const max = new Date().getFullYear() + (name === "modelYear" ? 2 : 1),
        current = vehicle?.[name];
      const years = Array.from({ length: max - 1899 }, (_, i) => max - i);
      if (current && !years.includes(current)) years.unshift(current);
      return (
        <label>
          {label}
          <span className="required"> *</span>
          <select
            name={name}
            aria-label={label}
            defaultValue={current ?? ""}
            aria-invalid={!!fieldError(name)}
          >
            <option value="">Selecione o ano</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          {fieldError(name) && (
            <span className="field-error">{fieldError(name)}</span>
          )}
        </label>
      );
    }
    if (["price", "reference", "mileage"].includes(name)) {
      const isMileage = name === "mileage",
        value = isMileage ? mileage : name === "price" ? price : reference,
        key = isMileage
          ? "mileage"
          : name === "price"
            ? "priceCents"
            : "referenceCents",
        setValue = isMileage
          ? setMileage
          : name === "price"
            ? setPrice
            : setReference;
      return (
        <label>
          {label}
          {opts.required && <span className="required"> *</span>}
          <input
            name={name}
            aria-label={label}
            type="text"
            autoComplete="off"
            inputMode={isMileage ? "numeric" : "decimal"}
            maxLength={isMileage ? 12 : 24}
            value={value}
            placeholder={isMileage ? "Ex.: 100.000" : "Ex.: 125.000,00"}
            onChange={(event) => {
              const text = event.target.value.replace(/^R\$\s*/, "");
              if (isMileage) {
                if (
                  /^[0-9.]*$/.test(text) &&
                  text.replaceAll(".", "").length <= 8
                )
                  setValue(mileageInput(text));
              } else if (/^[0-9.,\s]*$/.test(text)) setValue(text);
            }}
            onBlur={() => {
              if (!isMileage && value.trim()) {
                const cents = parseMoneyInput(value);
                if (Number.isFinite(cents)) setValue(moneyInput(cents));
              }
            }}
            aria-invalid={!!fieldError(key)}
            aria-describedby={fieldError(key) ? name + "-error" : undefined}
          />
          {fieldError(key) && (
            <span id={name + "-error"} className="field-error">
              {fieldError(key)}
            </span>
          )}
        </label>
      );
    }
    if (name === "imageUrl")
      return (
        <div className="manual-photo-editor">
          <h3>Foto do veículo</h3>
          <div
            className="manual-photo-modes"
            role="group"
            aria-label="Como adicionar foto"
          >
            <button
              type="button"
              className="button"
              aria-pressed={photoMode === "file"}
              onClick={() => {
                setPhotoMode("file");
                setPhotoError("");
              }}
            >
              Arquivo do PC
            </button>
            <button
              type="button"
              className="button"
              aria-pressed={photoMode === "url"}
              onClick={() => {
                setPhotoMode("url");
                clearFile();
                setPhotoError("");
              }}
            >
              URL da imagem
            </button>
          </div>
          {photoMode === "file" ? (
            <label>
              Selecionar foto do computador
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => chooseFile(event.target.files?.[0])}
              />
              <small>
                JPEG, PNG ou WebP · até 8 MB. A foto é salva neste ambiente
                local ao salvar o veículo.
              </small>
            </label>
          ) : (
            <label>
              URL da imagem
              <input
                name="imageUrl"
                aria-label="URL da imagem"
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
                placeholder="https://…"
                maxLength={2048}
              />
            </label>
          )}
          {(filePreview || imageUrl) && (
            <div className="manual-photo-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={filePreview || imageUrl}
                alt="Prévia da foto do veículo"
                referrerPolicy="no-referrer"
              />
              <button
                className="button"
                type="button"
                onClick={() => {
                  clearFile();
                  setImageUrl("");
                  setPhotoError("");
                }}
              >
                Remover foto deste cadastro
              </button>
            </div>
          )}
          {(photoError || fieldError("imageUrl")) && (
            <p role="alert" className="field-error">
              {photoError || fieldError("imageUrl")}
            </p>
          )}
        </div>
      );
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
          aria-label={label}
          autoComplete="off"
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
    name: "state" | "fuel" | "transmission" | "sellerType",
    label: string,
    options: string[],
  ) {
    return (
      <label>
        {label}
        <select
          name={name}
          aria-label={label}
          defaultValue={name === "state" ? undefined : vehicle?.[name] || ""}
          value={name === "state" ? state : undefined}
          onChange={
            name === "state"
              ? (event) => {
                  setState(event.target.value);
                  setCity("");
                }
              : undefined
          }
        >
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
      <form ref={formRef} onSubmit={submit} className="vehicle-form" noValidate>
        {failure && (
          <div
            className="error-box form-error-summary"
            role="alert"
            tabIndex={-1}
          >
            <strong>Revise o cadastro</strong>
            <span>{failure}</span>
          </div>
        )}
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
            {select("state", "Estado", states)}
            {field("city", "Cidade")}
            {field("source", "Portal ou canal de origem (opcional)", {
              required: false,
              placeholder: "Ex.: OLX, Webmotors, indicação",
            })}
            {select("sellerType", "Tipo de vendedor", sellerTypes)}
            <p className="muted span-all form-legacy-note">
              Cadastros antigos mantêm o texto original de origem. Se ele também
              descrever o vendedor, escolha o tipo acima sem apagar o conteúdo
              legado.
            </p>
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
                exibir. Arquivos enviados ficam neste computador; imagens por
                URL são carregadas pelo navegador.
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
