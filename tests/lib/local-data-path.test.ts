import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { localDataPath } from "@/lib/storage/local-data-path";

describe("localDataPath", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the data folder by default", () => {
    vi.stubEnv("NMS_DATA_DIR", "");
    expect(localDataPath("missions.json")).toBe(path.join(process.cwd(), "data", "missions.json"));
  });

  it("uses NMS_DATA_DIR when it is set", () => {
    vi.stubEnv("NMS_DATA_DIR", "data-test");
    expect(localDataPath("access.json")).toBe(path.join(process.cwd(), "data-test", "access.json"));
  });
});
