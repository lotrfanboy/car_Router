/** HTTP loopback is for the isolated SQLite workflow; hosted databases require HTTPS. */
export function radarAppUrl(
  value: string,
  databaseUrl = process.env.DATABASE_URL,
): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const local =
      url.protocol === "http:" &&
      databaseUrl?.startsWith("file:") &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || local ? url.href : null;
  } catch {
    return null;
  }
}
