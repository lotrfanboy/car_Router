/** Calendar month in UTC, stated explicitly in the dashboard. No provider calls. */
export function overviewMonth(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );
  return {
    start,
    end,
    label: start.toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}
export function overviewActivity(
  dates: { createdAt: Date }[],
  now = new Date(),
) {
  const month = overviewMonth(now),
    days = new Date(month.end.getTime() - 1).getUTCDate();
  const buckets = Array.from({ length: Math.ceil(days / 7) }, (_, i) => ({
    label: `${i * 7 + 1}–${Math.min(days, (i + 1) * 7)}`,
    count: 0,
  }));
  for (const { createdAt } of dates)
    if (createdAt >= month.start && createdAt < month.end && createdAt <= now)
      buckets[Math.floor((createdAt.getUTCDate() - 1) / 7)].count++;
  return {
    label: month.label,
    buckets,
    count: buckets.reduce((n, b) => n + b.count, 0),
  };
}
export type OverviewSource = {
  source: "olx" | "webmotors";
  status: "ok" | "error" | "unconfigured";
  observedAt: string;
  received: number | null;
  partial: boolean;
};
export function overviewSources(
  runs: { result: string; createdAt: Date | string }[],
): OverviewSource[] {
  const latest = new Map<string, OverviewSource>();
  for (const run of runs) {
    try {
      const result: unknown = JSON.parse(run.result);
      if (
        !result ||
        typeof result !== "object" ||
        !("sources" in result) ||
        !Array.isArray(result.sources)
      )
        continue;
      for (const item of result.sources) {
        if (
          !item ||
          !["olx", "webmotors"].includes(item.source) ||
          !["ok", "error", "unconfigured"].includes(item.status)
        )
          continue;
        const observedAt =
          typeof item.observedAt === "string" &&
          Number.isFinite(Date.parse(item.observedAt))
            ? item.observedAt
            : new Date(run.createdAt).toISOString();
        const prior = latest.get(item.source);
        if (!prior || Date.parse(observedAt) > Date.parse(prior.observedAt))
          latest.set(item.source, {
            source: item.source,
            status: item.status,
            observedAt,
            received:
              Number.isSafeInteger(item.received) && item.received >= 0
                ? item.received
                : Array.isArray(item.listings)
                  ? item.listings.length
                  : null,
            partial: item.partial === true,
          });
      }
    } catch {
      /* A malformed old run does not become a successful source. */
    }
  }
  return [...latest.values()];
}
export async function workspaceOverview() {
  const { db } = await import("./db");
  const now = new Date(),
    month = overviewMonth(now);
  const [
    observed,
    prices,
    searches,
    runs,
    saved,
    manuals,
    radars,
    enabledRadars,
    recentRuns,
    monthRuns,
  ] = await Promise.all([
    db.discoveredListing.count(),
    db.listingPrice.count(),
    db.savedSearch.count(),
    db.searchRun.count(),
    db.discoveredListing.count({ where: { savedAt: { not: null } } }),
    db.vehicle.count(),
    db.radar.count(),
    db.radar.count({ where: { enabled: true } }),
    db.searchRun.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        searchId: true,
        createdAt: true,
        result: true,
        search: { select: { name: true } },
      },
    }),
    db.searchRun.findMany({
      where: { createdAt: { gte: month.start, lt: month.end, lte: now } },
      select: { createdAt: true },
    }),
  ]);
  return {
    readAt: now.toISOString(),
    activity: overviewActivity(monthRuns, now),
    scope: "local-workspace" as const,
    counts: {
      observed,
      prices,
      searches,
      runs,
      saved,
      manuals,
      radars,
      enabledRadars,
    },
    schedulerEnabled: process.env.RADAR_SCHEDULER_ENABLED === "true",
    sources: overviewSources(recentRuns),
    sourceRunWindow: 50,
    recentSearches: recentRuns.slice(0, 5).map((run) => ({
      id: run.searchId,
      name: run.search.name,
      observedAt: run.createdAt.toISOString(),
      runId: run.id,
    })),
  };
}
export type WorkspaceOverview = Awaited<ReturnType<typeof workspaceOverview>>;
