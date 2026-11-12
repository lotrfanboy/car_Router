"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
export function RadarControl({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const router = useRouter(),
    pending = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/radars/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: enabled ? "pause" : "resume" }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Não foi possível alterar o radar.");
      setMessage(
        result.enabled
          ? "Radar ativado dentro do limite já autorizado."
          : "Radar pausado.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o radar.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="radar-control">
      <button
        className="button"
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {busy ? "Atualizando…" : enabled ? "Pausar radar" : "Ativar radar"}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
