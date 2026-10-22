export type RadarState = "paused" | "pending" | "scheduled" | "running" | "success" | "error";

export function radarState({
  enabled,
  ready,
  schedulerSeen,
  connected,
  latest,
  now = Date.now(),
}: {
  enabled: boolean;
  ready: boolean;
  schedulerSeen: boolean;
  connected: boolean;
  latest?: { status: string; startedAt: Date } | null;
  now?: number;
}): RadarState {
  if (!enabled) return "paused";
  if (latest?.status === "running" && now - latest.startedAt.getTime() < 45 * 60_000) return "running";
  if (!ready || !schedulerSeen || !connected) return "pending";
  if (!latest) return "scheduled";
  return latest.status === "ok" ? "success" : "error";
}
