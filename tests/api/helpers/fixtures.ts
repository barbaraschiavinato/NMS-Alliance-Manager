import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AllianceMember } from "@/lib/members/member-types";
import { defaultAlliance, makeMember } from "../../helpers/members";

// Svuota data/ della directory temporanea del file di test.
export function resetData() {
  rmSync(path.join(process.cwd(), "data"), { recursive: true, force: true });
}

export function readDataFile<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "data", name), "utf8")) as T;
}

// Scrive contenuto arbitrario (anche JSON non valido) in data/, per far fallire una store.
export function writeRawDataFile(name: string, content: string) {
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), content);
}

export function readMembers() {
  return readDataFile<{ members: AllianceMember[] }>("access.json").members;
}

// Un membro per ogni caso di autorizzazione: ruoli, vista semplice, stati di approvazione, profilo offline e admin di root.
export function makeCast() {
  return {
    rootAdmin: makeMember({
      email: "root-admin@example.com",
      role: "admin",
      simpleView: false,
      approvedBy: "root-admin@example.com",
    }),
    admin: makeMember({ role: "admin", simpleView: false, specialty: "builder" }),
    moderator: makeMember({ role: "moderator", simpleView: false, specialty: "ranger" }),
    user: makeMember(),
    simpleAdmin: makeMember({ role: "admin", simpleView: true }),
    pending: makeMember({ membershipStatus: "pending", approvedBy: "", approvedAt: "" }),
    blocked: makeMember({ membershipStatus: "blocked", approvedBy: "", approvedAt: "" }),
    // lastLogin recente: registerMember altrimenti riscriverebbe il profilo senza il flag offline.
    offline: makeMember({ offline: true }),
  };
}

export type Cast = ReturnType<typeof makeCast>;

export function castMembers(cast: Cast) {
  return Object.values(cast);
}

// Missione nel formato salvato in data/missions.json (senza i campi derivati).
export function storedMission(overrides: Record<string, unknown> = {}) {
  return {
    id: `M-${Math.random().toString(36).slice(2, 8)}`,
    title: "Survey mission",
    description: "Scan the system",
    system: "Test system",
    systemAddress: "0123456789AB",
    galaxy: 0,
    targetSpecialty: "explorer",
    dueDate: "2026-12-31",
    status: "pending",
    priority: "normal",
    progress: 0,
    ...overrides,
  };
}

// Risposta di @vercel/blob get() con il contenuto indicato.
export function blobResult(body: string, contentType: string) {
  return {
    statusCode: 200 as const,
    stream: new Response(body).body as ReadableStream<Uint8Array>,
    headers: new Headers(),
    blob: {
      url: "https://blob.example/file",
      downloadUrl: "https://blob.example/file?download=1",
      pathname: "file",
      contentDisposition: "inline",
      cacheControl: "private",
      uploadedAt: new Date(0),
      etag: "etag",
      contentType,
      size: body.length,
    },
  };
}

// Implementazione di get() che serve i file indicati per pathname; gli altri non esistono.
export function blobFiles(files: Record<string, { body: string; contentType: string }>) {
  return async (pathname: string) => {
    const file = files[pathname];
    return file ? blobResult(file.body, file.contentType) : null;
  };
}

export function accessBlob(cast: Cast, alliance: Record<string, unknown> = {}) {
  return {
    "alliance-manager/access.json": {
      body: JSON.stringify({ members: castMembers(cast), alliance: { ...defaultAlliance, ...alliance } }),
      contentType: "application/json",
    },
  };
}

export function notModifiedResult() {
  const { blob } = blobResult("", "");
  return {
    statusCode: 304 as const,
    stream: null,
    headers: new Headers(),
    blob: { ...blob, contentType: null, size: null },
  };
}
