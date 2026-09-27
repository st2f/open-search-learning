import { describe, expect, test } from "vitest";
import { assertSafeTestEndpoint } from "../support/opensearch-test-safety.ts";

describe("assertSafeTestEndpoint", () => {
  test.each([
    "http://localhost:9200",
    "http://127.0.0.1:9200",
    "http://[::1]:9200",
  ])("accepts the local endpoint %s", (endpoint) => {
    expect(() => assertSafeTestEndpoint(endpoint, "local")).not.toThrow();
  });

  test("rejects a non-local endpoint in local mode", () => {
    expect(() =>
      assertSafeTestEndpoint("https://search.example.com", "local"),
    ).toThrow(
      "Refusing destructive integration-test setup against non-local OpenSearch endpoint",
    );
  });

  test("accepts an endpoint owned by the Testcontainers lifecycle", () => {
    expect(() =>
      assertSafeTestEndpoint(
        "http://remote-docker-runtime.example:49183",
        "testcontainers",
      ),
    ).not.toThrow();
  });
});
