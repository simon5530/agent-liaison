import { describe, expect, it } from "vitest";
import entry, { buildSyntheticProposal } from "./index.js";
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
    ]);
    expect(metadata?.tools[0]?.optional).toBe(true);
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
});
