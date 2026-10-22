import "@testing-library/jest-dom/vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach } from "vitest";

// Ogni file di test lavora in una directory temporanea, così le store locali scrivono in un data/ isolato.
const originalCwd = process.cwd();
const workDir = mkdtempSync(path.join(tmpdir(), "alliance-manager-test-"));
process.chdir(workDir);

// Nessuna variabile reale di auth o Blob deve influenzare i test.
for (const key of [
  "LOCAL_AUTH",
  "LOCAL_AUTH_SET",
  "NMS_DATA_DIR",
  "VERCEL",
  "VERCEL_OIDC_TOKEN",
  "NMS_STORE_ID",
  "BLOB_STORE_ID",
  "NMS_READ_WRITE_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "AUTH_URL",
  "ALLIANCE_ADMIN_EMAIL",
  "NEXT_PUBLIC_LIST_PAGE_SIZE",
  "NEXT_PUBLIC_PLANET_SYSTEMS_PAGE_SIZE",
  "DISCORD_TAXI_WEBHOOK_URL",
  "TELEGRAM_TAXI_BOT_TOKEN",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
])
  delete process.env[key];

afterEach(async () => {
  if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
  }
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(workDir, { recursive: true, force: true });
});
