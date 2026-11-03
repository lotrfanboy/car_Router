// Public delivery metadata only; never include payloads, addresses or credentials.
export type RadarEmailDeliveryStatus = {
  id: string;
  status: string;
  attempts: number;
  createdAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  lastError: string | null;
};

export type RadarEmailOverview = {
  latestTest: RadarEmailDeliveryStatus | null;
  lastDeliveredAt: string | null;
};

export const radarEmailDeliveryLabels: Record<string, string> = {
  preview: "Prévia criada; aguardando confirmação de envio",
  expired: "Prévia expirada; gere uma nova antes de enviar",
  pending: "E-mail pendente de envio",
  retry: "Entrega pendente de nova tentativa",
  sending: "Solicitando envio",
  unknown: "Resultado incerto; conferir no provedor antes de reenviar",
  accepted: "Aceito pelo provedor; entrega ainda não confirmada",
  delivered: "Entrega confirmada pelo provedor",
  failed: "Entrega não concluída; revisar",
};
