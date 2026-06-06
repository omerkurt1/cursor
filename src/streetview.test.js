import { describe, expect, it } from "vitest";
import { buildStreetViewUrl, hasStreetViewKey } from "./streetview.js";

describe("buildStreetViewUrl", () => {
  it("builds a Google Street View Static URL for the given coordinates", () => {
    const url = buildStreetViewUrl({
      lat: 40.9903,
      lng: 29.0284,
      key: "test-key",
    });
    expect(url).toBeTypeOf("string");
    const parsed = new URL(url);
    expect(parsed.host).toBe("maps.googleapis.com");
    expect(parsed.pathname).toBe("/maps/api/streetview");
    expect(parsed.searchParams.get("location")).toBe("40.9903,29.0284");
    expect(parsed.searchParams.get("key")).toBe("test-key");
    expect(parsed.searchParams.get("fov")).toBe("80");
    expect(parsed.searchParams.get("pitch")).toBe("0");
  });

  it("returns null when no API key is configured", () => {
    expect(buildStreetViewUrl({ lat: 40.99, lng: 29.02 })).toBeNull();
  });

  it("returns null when coordinates are invalid", () => {
    expect(buildStreetViewUrl({ lat: "x", lng: 29.02, key: "test-key" })).toBeNull();
    expect(buildStreetViewUrl({ key: "test-key" })).toBeNull();
  });

  it("respects custom size, fov and heading parameters", () => {
    const url = buildStreetViewUrl({
      lat: 41,
      lng: 29,
      size: "400x200",
      fov: 100,
      heading: 90,
      key: "k",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("size")).toBe("400x200");
    expect(parsed.searchParams.get("fov")).toBe("100");
    expect(parsed.searchParams.get("heading")).toBe("90");
  });
});

describe("hasStreetViewKey", () => {
  it("is false when the env key is not set in the test environment", () => {
    expect(hasStreetViewKey()).toBe(false);
  });
});
