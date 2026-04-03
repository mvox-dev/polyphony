// Tests for org URL building helper
import { describe, it, expect } from "vitest";
import { buildOrgUrl } from "$lib/nav";

describe("buildOrgUrl", () => {
  it("builds URL with /events/roster path for production domain", () => {
    const url = buildOrgUrl(
      "hannijoggi",
      "crede",
      "https:",
      "crede.polyphony.uk",
    );
    expect(url).toBe("https://hannijoggi.polyphony.uk/events/roster");
  });

  it("replaces only the subdomain part of the host", () => {
    const url = buildOrgUrl("hov", "crede", "https:", "crede.polyphony.uk");
    expect(url).toBe("https://hov.polyphony.uk/events/roster");
  });

  it("works with localhost for development", () => {
    const url = buildOrgUrl(
      "hannijoggi",
      "crede",
      "http:",
      "crede.localhost:5173",
    );
    expect(url).toBe("http://hannijoggi.localhost:5173/events/roster");
  });

  it("falls back to polyphony.uk domain when no host context", () => {
    const url = buildOrgUrl("hannijoggi", "crede");
    expect(url).toBe("https://hannijoggi.polyphony.uk/events/roster");
  });
});
