import { describe, expect, it, vi } from "vitest";
import { onRequestError } from "@/instrumentation";

const request = {
  path: "/planets?private=value",
  method: "GET",
  headers: { cookie: "private-cookie", authorization: "private-token" },
};
const context: Parameters<typeof onRequestError>[2] = {
  routerKind: "App Router",
  routePath: "/planets",
  routeType: "render",
  renderSource: "react-server-components",
  revalidateReason: undefined,
};

describe("server error instrumentation", () => {
  it("logs the digest, route and original error without request credentials or query parameters", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const error = Object.assign(new Error("Almanac document request failed (429)"), { digest: "2695065305" });

    onRequestError(error, request, context);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      "[NMS server error]",
      {
        digest: "2695065305",
        method: "GET",
        path: "/planets",
        route: "/planets",
        routeType: "render",
        renderSource: "react-server-components",
      },
      error,
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it.each([new Error("Without digest"), "string error", null])("logs errors without a digest: %s", (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    onRequestError(error, { ...request, path: "/planets" }, context);

    expect(log).toHaveBeenCalledWith(
      "[NMS server error]",
      expect.objectContaining({ digest: undefined, path: "/planets" }),
      error,
    );
  });
});
