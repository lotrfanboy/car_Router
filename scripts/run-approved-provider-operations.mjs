import pg from "pg";
import { createHash } from "node:crypto";
import {
  APPROVED_BATCH,
  MAX_OPERATIONS,
  OperationError,
  claimNextOperation,
  performOperation,
} from "./provider-operations.mjs";

// The persisted, bounded queue is the opt-in. No queued work means no provider calls.
const connectionString = process.env.DATABASE_URL;
if (connectionString && !connectionString.startsWith("file:")) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 10000,
    statement_timeout: 10000,
  });
  try {
    await client.connect();
    for (let count = 0; count < MAX_OPERATIONS; count++) {
      const claimed = await claimNextOperation(client, process.env);
      if (!claimed) break;
      if (claimed.skipped) continue;
      const { operation, request } = claimed;
      try {
        const response = await performOperation(
          operation,
          process.env[request.credential],
        );
        const serialized = JSON.stringify(response);
        const summary = JSON.stringify({
          kind: operation.kind,
          provider: operation.provider,
          observedAt: new Date().toISOString(),
          sha256: createHash("sha256").update(serialized).digest("hex"),
          bytes: Buffer.byteLength(serialized),
          ...(operation.kind === "validation"
            ? { received: response.received, total: response.total }
            : {}),
        });
        await client.query(
          "UPDATE \"ProviderOperation\" SET status='succeeded', response=$2, summary=$3, \"completedAt\"=now() WHERE id=$1 AND status='running'",
          [operation.id, serialized, summary],
        );
        console.log(
          `Approved provider operation completed (${operation.provider}/${operation.kind}).`,
        );
      } catch (error) {
        const code =
          error instanceof OperationError
            ? error.code
            : "operation_completion_failed";
        await client.query(
          "UPDATE \"ProviderOperation\" SET status='failed', error=$2, \"completedAt\"=now() WHERE id=$1 AND status='running'",
          [operation.id, code],
        );
        console.warn(
          `Approved provider operation stopped (${code}); no automatic retry.`,
        );
      }
    }
  } catch {
    // Never disclose connection strings, credentials, response bodies or arbitrary errors.
    // A missing table/connection or interrupted operation must not block the web service.
    console.warn(
      `Approved provider batch ${APPROVED_BATCH} unavailable; web startup will continue.`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}
