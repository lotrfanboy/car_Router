// libSQL can retain native handles until the test worker exits on Windows.
// Own the temporary directory in the parent and clean it after Vitest exits.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const tempParent = path.resolve(tmpdir());
const root = mkdtempSync(path.join(tempParent, "radar-suite-"));
if (path.dirname(path.resolve(root)) !== tempParent)
  throw new Error("Invalid test directory");
let status = 1;
try {
  const result = spawnSync(
    process.execPath,
    ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: { ...process.env, RADAR_TEST_ROOT: root },
    },
  );
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  rmSync(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
process.exitCode = status;
