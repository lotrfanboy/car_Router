export function vehicleImageOrigin(value: string) {
  if (/^\/api\/vehicle-images\/[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(value))
    return "Arquivo enviado do computador";
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol)
      ? `Imagem informada · ${url.hostname}`
      : "Imagem informada";
  } catch {
    return "Imagem informada";
  }
}
