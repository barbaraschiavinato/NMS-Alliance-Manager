// Costruisce Request e contesti di route per chiamare direttamente gli handler di src/app/api.
export function jsonRequest(url: string, method: string, body?: unknown) {
  return new Request(new URL(url, "http://localhost:3000"), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function routeParams<T extends Record<string, string>>(params: T) {
  return { params: Promise.resolve(params) };
}
