import {
  radarEmailDeliveryLabels,
  type RadarEmailOverview,
} from "@/lib/radar-email-status";

export type RadarEmailConfiguration = {
  configured: boolean;
  enabled: boolean;
};

function when(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

export function RadarEmailStatus({
  configuration,
  overview,
  refreshing,
  onRefresh,
}: {
  configuration: RadarEmailConfiguration;
  overview: RadarEmailOverview;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="panel" aria-label="Situação do e-mail">
      <div className="listing-topline">
        <h2>E-mail dos radares</h2>
        <button
          className="button small"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Atualizando…" : "Atualizar situação"}
        </button>
      </div>
      <p>
        {!configuration.configured
          ? "Configuração de e-mail incompleta. Revise o remetente, o destinatário e a conexão com o provedor no servidor."
          : configuration.enabled
            ? "E-mail configurado. Envio automático habilitado."
            : "E-mail configurado. Envio automático desativado; valide o teste antes de habilitar os resumos."}
      </p>
      <p>
        <strong>Último teste: </strong>
        {overview.latestTest
          ? `${radarEmailDeliveryLabels[overview.latestTest.status] ?? "Estado não reconhecido; revisar"}. Criado em ${when(overview.latestTest.createdAt)} (Brasília).`
          : "Nenhum teste registrado."}
      </p>
      {overview.latestTest?.lastError && <p>{overview.latestTest.lastError}</p>}
      <p>
        <strong>Última entrega confirmada: </strong>
        {overview.lastDeliveredAt
          ? `${when(overview.lastDeliveredAt)} (Brasília).`
          : "Nenhuma confirmação registrada pelo provedor."}
      </p>
      <p className="muted">
        O teste de envio é independente dos radares e não consulta anúncios.
        Atualizar esta situação apenas lê os registros; não envia mensagens. A
        aceitação pelo provedor ainda não confirma o recebimento.
      </p>
    </section>
  );
}
