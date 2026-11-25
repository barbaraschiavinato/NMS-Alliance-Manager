import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { translate } from "@/lib/translations";
import {
  adminRequired,
  apiError,
  badRequest,
  conflict,
  forbidden,
  moderatorRequired,
  notFound,
  unauthorized,
} from "@/lib/utils/api-responses";

async function read(response: Response) {
  return { status: response.status, body: await response.json() };
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("API error responses", () => {
  it("returns the access and role errors as translation keys", async () => {
    expect(await read(unauthorized())).toEqual({ status: 401, body: { error: "errors.sign_in_required" } });
    expect(await read(moderatorRequired())).toEqual({
      status: 403,
      body: { error: "errors.moderator_permission_required" },
    });
    expect(await read(adminRequired())).toEqual({
      status: 403,
      body: { error: "errors.administrator_permission_required" },
    });
  });

  it("wraps any key with the matching status", async () => {
    expect(await read(badRequest("errors.invalid_data"))).toEqual({
      status: 400,
      body: { error: "errors.invalid_data" },
    });
    expect(await read(forbidden("errors.no_access_to_this_mission"))).toEqual({
      status: 403,
      body: { error: "errors.no_access_to_this_mission" },
    });
    expect(await read(notFound("errors.mission_not_found"))).toEqual({
      status: 404,
      body: { error: "errors.mission_not_found" },
    });
    expect(await read(conflict("errors.mission_already_completed"))).toEqual({
      status: 409,
      body: { error: "errors.mission_already_completed" },
    });
    expect(await read(apiError("errors.request_failed", 503))).toEqual({
      status: 503,
      body: { error: "errors.request_failed" },
    });
  });

  it("only uses error keys that both locales translate", () => {
    const files = [
      ...sourceFiles(join(repoRoot, "src/app/api")),
      join(repoRoot, "src/lib/messages/broadcast-request-handlers.ts"),
    ];
    const keys = new Set<string>();
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /(?:apiError|badRequest|forbidden|notFound|conflict)\(\s*"([^"]+)"|error: "([^"]+)"/g,
      )) {
        keys.add(match[1] ?? match[2]);
      }
    }
    expect(keys.size).toBeGreaterThan(50);
    const untranslated = [...keys].filter((key) => translate("en", key) === key || translate("it", key) === key);
    expect(untranslated).toEqual([]);
  });
});
