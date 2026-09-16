import { describe, expect, it } from "vitest";
import entry, {
  buildSyntheticProposal,
  deriveAvailableSlots,
  queryGoogleFreeBusy,
} from "./index.js";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";

const request = {
  startDate: "2026-09-21",
  endDate: "2026-09-23",
  durationMinutes: 120,
  earliestStart: "18:00",
  latestEnd: "22:00",
  timezone: "Asia/Taipei" as const,
  purposeClass: "personal_visit" as const,
  idempotencyKey: "request-001",
};

describe("agent-liaison", () => {
  it("declares only the bounded optional tool", () => {
    const metadata = getToolPluginMetadata(entry);
    expect(metadata?.tools.map((tool) => tool.name)).toEqual([
      "request_synthetic_availability",
      "request_readonly_availability",
    ]);
    expect(metadata?.tools.every((tool) => tool.optional)).toBe(true);
  });

  it("returns deterministic identifiers and synthetic tentative slots", () => {
    const now = new Date("2026-09-16T01:00:00Z");
    const first = buildSyntheticProposal(request, now);
    const retry = buildSyntheticProposal(request, now);
    expect(first.proposalId).toBe(retry.proposalId);
    expect(first.authority).toBe("tentative");
    expect(first.source).toBe("synthetic");
    expect(first.slots).toHaveLength(3);
    expect(first.slots[0]?.timezone).toBe("Asia/Taipei");
    expect(first.slots[0]?.weekday).toBe("Monday");
  });

  it("fails closed for an oversized range", () => {
    expect(() =>
      buildSyntheticProposal({ ...request, endDate: "2026-10-20" }),
    ).toThrow(/0 and 14 days/);
  });

  it("excludes every slot that overlaps a busy interval", () => {
    const slots = deriveAvailableSlots(request, [
      { start: "2026-09-21T10:00:00.000Z", end: "2026-09-21T12:00:00.000Z" },
    ]);
    expect(slots[0]?.start).toBe("2026-09-21T12:00:00.000Z");
    expect(slots).toHaveLength(3);
  });

  it("queries only OAuth token and Calendar FreeBusy endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(JSON.stringify({ access_token: "redacted-access-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        calendars: { primary: { busy: [
          { start: "2026-09-21T10:00:00.000Z", end: "2026-09-21T12:00:00.000Z" },
        ] } },
      }), { status: 200 });
    };
    const result = await queryGoogleFreeBusy(request, {
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      calendarId: "primary",
    }, fakeFetch as typeof fetch, new Date("2026-09-16T01:00:00Z"));
    expect(calls.map((call) => call.url)).toEqual([
      "https://oauth2.googleapis.com/token",
      "https://www.googleapis.com/calendar/v3/freeBusy",
    ]);
    expect(calls[1]?.init?.method).toBe("POST");
    expect(String((calls[1]?.init?.headers as Record<string, string>).authorization)).toBe("Bearer redacted-access-token");
    expect(result.source).toBe("google_freebusy");
    expect(result.authority).toBe("tentative");
    expect(result.slots[0]?.start).toBe("2026-09-21T12:00:00.000Z");
  });

  it("fails closed when OAuth refresh fails", async () => {
    const fakeFetch = async () => new Response("denied", { status: 401 });
    await expect(queryGoogleFreeBusy(request, {
      clientId: "client-id", clientSecret: "client-secret", refreshToken: "refresh-token",
    }, fakeFetch as typeof fetch)).rejects.toThrow(/OAuth refresh failed/);
  });
});
