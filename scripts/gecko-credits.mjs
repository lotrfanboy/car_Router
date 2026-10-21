// Read-only account check. No extraction, subscription, purchase or retry.
import { existsSync } from "node:fs";
if (existsSync(".env.gecko.local")) process.loadEnvFile(".env.gecko.local");
const key = process.env.GECKO_API_KEY?.trim();
if (!key) {
  console.error(
    "Configure GECKO_API_KEY em .env.gecko.local; não envie a chave no chat.",
  );
  process.exitCode = 1;
} else {
  try {
    const start = performance.now();
    const response = await fetch("https://api.geckoapi.com.br/v1/me/credits", {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    const result = {
      httpStatus: response.status,
      elapsedMs: Math.round(performance.now() - start),
    };
    if (response.ok) {
      const data = await response.json();
      // Never print raw response: it includes account identifiers.
      for (const field of ["currentCredits", "planId", "creditsConsumed"])
        if (data[field] !== undefined) result[field] = data[field];
      console.log(JSON.stringify(result, null, 2));
      if (!Number.isFinite(data.currentCredits)) process.exitCode = 1;
    } else {
      console.error(JSON.stringify(result));
      process.exitCode = 1;
    }
  } catch {
    console.error(
      "Falha ao consultar saldo (rede, timeout ou resposta inválida). Sem repetição automática.",
    );
    process.exitCode = 1;
  }
}
