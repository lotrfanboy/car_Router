import { FipeLookup } from "@/components/fipe-lookup";
export default function FipePage() {
  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONSULTA DE REFERÊNCIA</span>
          <h1>Tabela FIPE</h1>
          <p>
            Escolha a identificação exata do veículo e confira o mês de
            referência.
          </p>
        </div>
      </div>
      <FipeLookup />
    </div>
  );
}
