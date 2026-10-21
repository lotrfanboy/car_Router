"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Database,
  ShieldCheck,
  Info,
  RefreshCw,
} from "lucide-react";
import { PageHeading } from "@/components/vehicle-ui";
import { useWorkspace } from "@/components/workspace";
import { OPPORTUNITY_RULES } from "@/lib/intelligence";
type Integration = {
  source: string;
  configured: boolean;
  cost: number;
  reservedToday: number;
  dailyLimit: number;
};
export default function Settings() {
  const { vehicles } = useWorkspace();
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [error, setError] = useState("");
  async function load() {
    await Promise.resolve();
    setError("");
    try {
      const response = await fetch("/api/searches", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setIntegrations(data.integrations);
    } catch {
      setError("Não foi possível carregar o estado das fontes.");
    }
  }
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (active) return load();
    });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeading
        eyebrow="TRANSPARÊNCIA POR PRINCÍPIO"
        title="Configurações"
        description="Suas fontes, a qualidade da base e os critérios por trás de cada análise."
      />
      <section className="panel">
        <h2>Média dos anúncios semelhantes</h2>
        <p>
          A busca usa a média aritmética de pelo menos cinco anúncios recentes,
          sem o próprio candidato e sem cortar comparáveis pelo orçamento. O
          detalhe de cada resultado mostra os preços, links, datas, critérios e
          limitações. A versão pode ser inferida do campo de modelo e é
          identificada como tal.
        </p>
        <p>
          Mesma marca, modelo, versão e UF; ano-modelo até um ano de diferença;
          km até 20 mil ou 25% de diferença. Observações dos últimos 7 dias.
          Valores extremos são tratados por 1,5 × IQR; amostras dispersas não
          sustentam comparação.
        </p>
        <Link href="/buscar" className="text-link">
          Buscar carros
        </Link>
      </section>
      <div className="settings-layout">
        <section className="panel">
          <div className="section-heading">
            <h2>Fontes de anúncios</h2>
            <Link href="/buscar">
              Gerenciar buscas <ArrowUpRight size={15} />
            </Link>
          </div>
          <p className="settings-copy">
            Consultas externas ocorrem ao buscar ou quando um Radar configurado
            executa. Abrir esta tela não consome créditos dos fornecedores.
          </p>
          {error ? (
            <div className="error-box" role="alert">
              {error}
              <button className="button small" onClick={() => void load()}>
                <RefreshCw size={14} /> Tentar novamente
              </button>
            </div>
          ) : !integrations ? (
            <p className="settings-copy" role="status">
              Carregando configuração das fontes…
            </p>
          ) : (
            integrations.map((i) => (
              <div className="integration-row" key={i.source}>
                <div>
                  <strong>{i.source === "olx" ? "OLX" : "Webmotors"}</strong>
                  <small>
                    {i.source === "olx"
                      ? "Gecko · localização complementar via Reef"
                      : "Reef · anúncios Webmotors"}
                  </small>
                </div>
                <span
                  className={
                    "integration-state " + (i.configured ? "ready" : "")
                  }
                >
                  {i.configured ? "Configurada" : "Não configurada"}
                </span>
                <p>
                  {i.reservedToday} de {i.dailyLimit} créditos reservados hoje
                  (UTC). Consulta: {i.cost} crédito(s), sem incluir possível
                  resolução de localização.
                </p>
              </div>
            ))
          )}
          <p className="info-note">
            <Info size={15} /> “Configurada” indica credencial presente; a
            disponibilidade será verificada na próxima consulta. O contador
            local não é o saldo oficial.
          </p>
          <div className="integration-row">
            <div>
              <strong>Referência FIPE</strong>
              <small>
                Sem fornecedor ou correspondência verificada configurados.
              </small>
            </div>
            <span className="integration-state">Não conectada</span>
            <p>
              O valor informado no cadastro é uma referência manual. Não será
              convertido em FIPE nem usado para criar uma classificação sozinho.
            </p>
          </div>
        </section>
        <section className="panel local-data-panel">
          <Database size={24} strokeWidth={1.2} />
          <div className="eyebrow">SEU ESPAÇO PESSOAL</div>
          <h2>Dados no seu computador.</h2>
          <p className="settings-copy">
            {vehicles.length} anúncios no catálogo. Favoritos, buscas e
            históricos persistem no SQLite local.
          </p>
          <div className="settings-rule">
            <ShieldCheck size={17} />
            <p>
              Uso pessoal em endereço local. A aplicação ainda não possui
              autenticação para hospedagem pública.
            </p>
          </div>
          <h3>Antes de atualizar</h3>
          <p className="settings-copy">
            Pare a aplicação e faça uma cópia do banco SQLite e dos arquivos
            auxiliares de journal/WAL, se existirem. Siga o procedimento do
            README do projeto.
          </p>
          <h3>Fotografias</h3>
          <p className="settings-copy">
            Informe apenas imagens do próprio anúncio que você possa exibir. A
            origem é mostrada no veículo; imagens indisponíveis recebem um
            estado neutro. Os conectores atuais não fornecem galerias.
          </p>
        </section>
      </div>
      <section className="panel methodology-panel" id="metodologia">
        <div className="eyebrow">METODOLOGIA LEGADA · CATÁLOGO PESSOAL</div>
        <h2>Análises secundárias do catálogo pessoal.</h2>
        <p className="settings-copy">
          Estas análises secundárias usam preços anunciados cadastrados e
          mediana, separadas da média dos resultados de busca. Não avalia a
          condição do carro, o vendedor, a segurança da compra ou a
          probabilidade de revenda.
        </p>
        <div className="method-grid">
          <div>
            <span>01</span>
            <h3>Comparar o equivalente</h3>
            <p>
              Mesma marca, modelo, versão, ano do modelo, combustível e UF. O
              próprio anúncio e URLs repetidas são excluídos. Dados de
              identificação incompletos limitam a análise.
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>Exigir amostra suficiente</h3>
            <p>
              No mínimo {OPPORTUNITY_RULES.minComparables} comparáveis com preço
              registrado há menos de {OPPORTUNITY_RULES.staleDays} dias.
              Extremos são tratados por intervalo interquartil; dispersão
              excessiva ou desconto acima de {OPPORTUNITY_RULES.maximumDiscount}
              % geram incerteza.
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>Explicar o sinal</h3>
            <p>
              Potencial oportunidade: pelo menos{" "}
              {OPPORTUNITY_RULES.potentialDiscount}% abaixo da mediana. Forte:{" "}
              {OPPORTUNITY_RULES.strongMinComparables} comparáveis, desconto de{" "}
              {OPPORTUNITY_RULES.strongDiscount}% e redução recente registrada
              de {OPPORTUNITY_RULES.strongReductionPercent}% ou mais. Referência
              manual não cria oportunidade.
            </p>
          </div>
        </div>
        <details>
          <summary>Fórmulas e limites da leitura</summary>
          <ul>
            <li>
              Desconto nos comparáveis = (mediana − preço anunciado) ÷ mediana ×
              100.
            </li>
            <li>
              Diferença na referência manual = preço anunciado − referência.
              Percentual = diferença ÷ referência × 100.
            </li>
            <li>
              Mediana: ponto central dos preços ordenados. Com quantidade par,
              média dos dois valores centrais, arredondada ao centavo.
            </li>
            <li>
              Redução recente: diferença entre os dois últimos preços distintos
              registrados; a última alteração deve ter até 30 dias e
              corresponder ao preço atual.
            </li>
            <li>
              Simulação: capital = compra + custos; resultado = venda estimada −
              capital; margem (%) = resultado ÷ venda estimada × 100. Preço
              máximo = venda × (1 − margem-alvo ÷ 100) − custos.
            </li>
            <li>
              Alterar um favorito não renova a data de observação de preço.
              Cadastro local não é publicação do anúncio; ausência no resultado
              não comprova venda.
            </li>
            <li>
              Os portais mantêm suas próprias observações. O catálogo
              normalizado é o universo das análises e gráficos desta versão.
            </li>
          </ul>
        </details>
      </section>
    </>
  );
}
