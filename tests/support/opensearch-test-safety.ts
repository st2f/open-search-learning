export type TestEndpointOwner = "local" | "testcontainers";

const loopbackHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertSafeTestEndpoint(
  endpoint: string,
  owner: TestEndpointOwner,
): void {
  const url = new URL(endpoint);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Unsupported OpenSearch test protocol: ${url.protocol}`);
  }

  if (owner === "testcontainers") {
    return;
  }

  if (!loopbackHostnames.has(url.hostname)) {
    throw new Error(
      `Refusing destructive integration-test setup against non-local OpenSearch endpoint: ${url.origin}`,
    );
  }
}
