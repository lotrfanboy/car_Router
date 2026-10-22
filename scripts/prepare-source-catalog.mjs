/** Explicit offline preparation by default. Never invoked by UI, tests or deploy. */
import { mkdir, writeFile, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const request = {
  method: "POST",
  url: "https://api.reefapi.com/webmotors/v1/makes_models",
  body: { vehicle_type: "car" },
};
const plan = {
  request,
  documentedCredits: 1,
  documentation: "https://reefapi.com/docs/webmotors",
  documentationCheckedAt: "2026-10-22",
  scope: "Brand/model catalog only. No listing searches, versions not assumed.",
  output: "validation-private/reef-makes-models.json",
};
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ ...plan, executed: false }, null, 2));
} else {
  if (!process.argv.includes("--approved-credits=1"))
    throw new Error(
      "Obtain explicit approval for 1 credit before using --approved-credits=1.",
    );
  if (!process.env.REEF_API_KEY || process.env.REEF_FREE_TRIAL !== "true")
    throw new Error(
      "Use the existing Reef credential and free-trial opt-in in the execution environment. Do not paste credentials into source or chat.",
    );
  const destination = path.resolve(plan.output);
  try {
    await access(destination);
    throw new Error(
      "A saved response already exists. Inspect and reuse it; no request was made.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: {
      "x-api-key": process.env.REEF_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  // Persist even an error envelope for investigation. Never automatically retry a billed request.
  const body = await response.text();
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body, { mode: 0o600, flag: "wx" });
  await writeFile(
    destination + ".provenance.json",
    JSON.stringify(
      {
        ...plan,
        status: response.status,
        retrievedAt: new Date().toISOString(),
        sha256: createHash("sha256").update(body).digest("hex"),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    JSON.stringify({
      status: response.status,
      saved: plan.output,
      bytes: Buffer.byteLength(body),
      next: "Inspect the actual schema and completeness before importing; no versions were inferred.",
    }),
  );
}
