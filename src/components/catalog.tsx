"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  Heart,
  Columns3,
  X,
} from "lucide-react";
import { useWorkspace } from "./workspace";
import { Empty, PageHeading, VehicleCard, Opportunity } from "./vehicle-ui";
import {
  defaultFilters,
  filterVehicles,
  states,
  money,
  number,
  location,
} from "@/lib/vehicle";
export function Catalog({ favorites = false }: { favorites?: boolean }) {
  const { vehicles, favorite, selected, toggleCompare } = useWorkspace();
  const [filters, setFilters] = useState({
    ...defaultFilters,
    favorite: favorites,
  });
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<"cards" | "table">("cards");
  const results = filterVehicles(vehicles, {
    ...filters,
    favorite: favorites || filters.favorite,
  });
  const change = (name: string, value: string | boolean) =>
    setFilters({ ...filters, [name]: value });
  const active = Object.entries(filters).filter(
    ([key, value]) =>
      key !== "sort" &&
      value !== "" &&
      value !== false &&
      !(favorites && key === "favorite"),
  ).length;
  const rangeError =
    (filters.yearMin &&
      filters.yearMax &&
      Number(filters.yearMin) > Number(filters.yearMax)) ||
    (filters.priceMin &&
      filters.priceMax &&
      Number(filters.priceMin) > Number(filters.priceMax));
  return (
    <>
      <PageHeading
        eyebrow="ACOMPANHE CADA POSSIBILIDADE"
        title={favorites ? "Favoritos" : "Catálogo de veículos"}
        description={
          favorites
            ? "Os anúncios que merecem um olhar mais atento."
            : "Todos os seus anúncios, organizados em um só lugar."
        }
      />
      <div className="catalog-toolbar">
        <div className="search-field">
          <Search size={18} />
          <input
            aria-label="Buscar veículos"
            placeholder="Buscar marca, modelo, versão ou cidade…"
            value={filters.q}
            onChange={(e) => change("q", e.target.value)}
          />
          {filters.q && (
            <button aria-label="Limpar busca" onClick={() => change("q", "")}>
              <X size={16} />
            </button>
          )}
        </div>
        <button
          className={"button " + (expanded ? "filter-active" : "")}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} />
          Filtros {active > 0 && <span className="count">{active}</span>}
        </button>
      </div>
      {expanded && (
        <section className="filter-panel" aria-label="Filtros de veículos">
          <div className="filter-grid">
            {[
              ["brand", "Marca"],
              ["model", "Modelo"],
              ["yearMin", "Ano mínimo"],
              ["yearMax", "Ano máximo"],
              ["priceMin", "Preço mínimo (R$)"],
              ["priceMax", "Preço máximo (R$)"],
              ["mileageMax", "Km máxima"],
              ["city", "Cidade"],
              ["source", "Origem"],
            ].map(([name, label]) => (
              <label key={name}>
                {label}
                <input
                  type={
                    [
                      "yearMin",
                      "yearMax",
                      "priceMin",
                      "priceMax",
                      "mileageMax",
                    ].includes(name)
                      ? "number"
                      : "text"
                  }
                  min="0"
                  step={name.startsWith("price") ? "0.01" : "1"}
                  value={String(filters[name as keyof typeof filters])}
                  onChange={(e) => change(name, e.target.value)}
                  placeholder="Todos"
                />
              </label>
            ))}
            <label>
              Estado
              <select
                value={filters.state}
                onChange={(e) => change("state", e.target.value)}
              >
                <option value="">Todos os estados</option>
                {states.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="filter-footer">
            {!favorites && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={filters.favorite}
                  onChange={(e) => change("favorite", e.target.checked)}
                />
                Somente favoritos
              </label>
            )}
            <button
              className="text-button"
              onClick={() =>
                setFilters({ ...defaultFilters, favorite: favorites })
              }
            >
              Limpar filtros
            </button>
          </div>
          {rangeError && (
            <p role="alert" className="field-error">
              O valor mínimo deve ser menor ou igual ao máximo.
            </p>
          )}
        </section>
      )}
      <div className="results-bar">
        <span>
          <strong>{results.length}</strong>{" "}
          {results.length === 1 ? "veículo encontrado" : "veículos encontrados"}
        </span>
        <div className="results-options">
          <select
            aria-label="Ordenar veículos"
            value={filters.sort}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="recent">Mais recentes</option>
            <option value="priceAsc">Menor preço</option>
            <option value="priceDesc">Maior preço</option>
            <option value="mileage">Menor quilometragem</option>
            <option value="year">Maior ano</option>
          </select>
          <div className="view-switch">
            <button
              aria-label="Visualização em cards"
              aria-pressed={view === "cards"}
              className={view === "cards" ? "active" : ""}
              onClick={() => setView("cards")}
            >
              <LayoutGrid size={17} />
            </button>
            <button
              aria-label="Visualização em tabela"
              aria-pressed={view === "table"}
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              <List size={18} />
            </button>
          </div>
        </div>
      </div>
      {!results.length ? (
        <Empty
          title={
            vehicles.length
              ? "Nenhum veículo por aqui"
              : "Seu catálogo está pronto para começar"
          }
          description={
            vehicles.length
              ? "Ajuste os filtros ou adicione anúncios aos seus favoritos."
              : "Cadastre um anúncio com os dados que você quer acompanhar."
          }
          action={!vehicles.length}
        />
      ) : view === "cards" ? (
        <div className="cards">
          {results.map((v) => (
            <VehicleCard key={v.id} vehicle={v} />
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Veículo</th>
                <th>Ano</th>
                <th>Quilometragem</th>
                <th>Preço / referência</th>
                <th>Localização</th>
                <th>Origem</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {results.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link className="table-title" href={"/veiculos/" + v.id}>
                      {v.brand} {v.model}
                    </Link>
                    <small>{v.version || "—"}</small>
                  </td>
                  <td>{v.modelYear}</td>
                  <td>{number(v.mileage)} km</td>
                  <td>
                    <strong>{money(v.priceCents)}</strong>
                    <Opportunity vehicle={v} />
                  </td>
                  <td>{location(v)}</td>
                  <td>{v.source}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="icon-button"
                        aria-label={
                          v.favorite
                            ? "Remover dos favoritos"
                            : "Adicionar aos favoritos"
                        }
                        aria-pressed={v.favorite}
                        onClick={() => void favorite(v)}
                      >
                        <Heart
                          size={17}
                          fill={v.favorite ? "currentColor" : "none"}
                        />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Selecionar para comparar"
                        aria-pressed={selected.includes(v.id)}
                        onClick={() => toggleCompare(v.id)}
                      >
                        <Columns3 size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
