import { createHash } from "node:crypto";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

const calendarConfigSchema = Type.Object({
  clientId: Type.String({ minLength: 1 }),
  clientSecret: Type.String({ minLength: 1 }),
  refreshToken: Type.String({ minLength: 1 }),
  calendarId: Type.Optional(Type.String({ minLength: 1, default: "primary" })),
}, { additionalProperties: false });

const configSchema = Type.Object({
  ownerSessionKey: Type.String(),
  allowedRequesterSessionKeys: Type.Array(Type.String(), { minItems: 1 }),
  googleCalendar: Type.Optional(calendarConfigSchema),
}, { additionalProperties: false });

const requestSchema = Type.Object({
  startDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  endDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  durationMinutes: Type.Integer({ minimum: 30, maximum: 480 }),
  earliestStart: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  latestEnd: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  timezone: Type.Literal("Asia/Taipei"),
  purposeClass: Type.Union([Type.Literal("personal_visit"), Type.Literal("meeting"), Type.Literal("appointment")]),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 128 }),
}, { additionalProperties: false });

export type AvailabilityRequest = {
  startDate: string; endDate: string; durationMinutes: number;
  earliestStart: string; latestEnd: string; timezone: "Asia/Taipei";
  purposeClass: "personal_visit" | "meeting" | "appointment"; idempotencyKey: string;
};
type BusyInterval = { start: string; end: string };
export type Slot = { slotId: string; start: string; end: string; timezone: "Asia/Taipei"; weekday: string };
export type Proposal = {
  proposalId: string; state: "proposed"; authority: "tentative";
  source: "synthetic" | "google_freebusy"; expiresAt: string; slots: Slot[];
};
type FetchLike = typeof fetch;

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
function dateAtTaipei(date: string, minuteOfDay: number): Date {
  const hour = Math.floor(minuteOfDay / 60), minute = minuteOfDay % 60;
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}
function isoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function validateWindow(request: AvailabilityRequest): number {
  const firstDay = dateAtTaipei(request.startDate, 0), lastDay = dateAtTaipei(request.endDate, 0);
  const rangeDays = Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000);
  const earliest = minutes(request.earliestStart), latest = minutes(request.latestEnd);
  if (rangeDays < 0 || rangeDays > 14) throw new Error("date range must be between 0 and 14 days");
  if (latest <= earliest || latest - earliest < request.durationMinutes) throw new Error("daily window cannot fit the requested duration");
  return rangeDays;
}

export function deriveAvailableSlots(request: AvailabilityRequest, busy: BusyInterval[]): Slot[] {
  const rangeDays = validateWindow(request), firstDay = dateAtTaipei(request.startDate, 0);
  const earliest = minutes(request.earliestStart), latest = minutes(request.latestEnd);
  const normalizedBusy = busy.map(({ start, end }) => ({ start: new Date(start).getTime(), end: new Date(end).getTime() }));
  if (normalizedBusy.some((item) => !Number.isFinite(item.start) || !Number.isFinite(item.end))) throw new Error("calendar returned an invalid busy interval");
  const slots: Slot[] = [];
  for (let day = 0; day <= rangeDays && slots.length < 3; day += 1) {
    const localDate = isoDate(new Date(firstDay.getTime() + day * 86_400_000));
    for (let startMinute = earliest; startMinute + request.durationMinutes <= latest && slots.length < 3; startMinute += 30) {
      const start = dateAtTaipei(localDate, startMinute), end = new Date(start.getTime() + request.durationMinutes * 60_000);
      if (normalizedBusy.some((item) => start.getTime() < item.end && end.getTime() > item.start)) continue;
      slots.push({
        slotId: `slot-${slots.length + 1}`, start: start.toISOString(), end: end.toISOString(),
        timezone: request.timezone,
        weekday: new Intl.DateTimeFormat("en-US", { timeZone: request.timezone, weekday: "long" }).format(start),
      });
    }
  }
  return slots;
}

function proposalFor(request: AvailabilityRequest, source: Proposal["source"], slots: Slot[], now: Date): Proposal {
  const digest = createHash("sha256").update(JSON.stringify({ request, source })).digest("hex").slice(0, 16);
  return { proposalId: `${source}-${digest}`, state: "proposed", authority: "tentative", source,
    expiresAt: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(), slots };
}
export function buildSyntheticProposal(request: AvailabilityRequest, now = new Date()): Proposal {
  return proposalFor(request, "synthetic", deriveAvailableSlots(request, []), now);
}

export async function queryGoogleFreeBusy(
  request: AvailabilityRequest,
  credentials: { clientId: string; clientSecret: string; refreshToken: string; calendarId?: string },
  fetchImpl: FetchLike = fetch,
  now = new Date(),
): Promise<Proposal> {
  validateWindow(request);
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: credentials.clientId, client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken, grant_type: "refresh_token" }),
  });
  if (!tokenResponse.ok) throw new Error("Google OAuth refresh failed");
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) throw new Error("Google OAuth response omitted access_token");
  const calendarId = credentials.calendarId ?? "primary";
  const freeBusyResponse = await fetchImpl("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { authorization: `Bearer ${token.access_token}`, "content-type": "application/json" },
    body: JSON.stringify({
      timeMin: dateAtTaipei(request.startDate, minutes(request.earliestStart)).toISOString(),
      timeMax: dateAtTaipei(request.endDate, minutes(request.latestEnd)).toISOString(),
      timeZone: request.timezone, items: [{ id: calendarId }],
    }),
  });
  if (!freeBusyResponse.ok) throw new Error("Google Calendar FreeBusy query failed");
  const body = await freeBusyResponse.json() as { calendars?: Record<string, { busy?: BusyInterval[]; errors?: unknown[] }> };
  const calendar = body.calendars?.[calendarId];
  if (!calendar || (calendar.errors?.length ?? 0) > 0) throw new Error("Google Calendar did not return usable FreeBusy data");
  return proposalFor(request, "google_freebusy", deriveAvailableSlots(request, calendar.busy ?? []), now);
}

function isAllowed(ctx: { agentId?: string; sessionKey?: string }, allowlist: string[]) {
  return ctx.agentId === "guest" && Boolean(ctx.sessionKey) && allowlist.includes(ctx.sessionKey as string);
}
function ownerEventFor(proposal: Proposal, request: AvailabilityRequest): string {
  return ["[Agent Liaison availability approval request]", `Correlation: ${proposal.proposalId}`,
    `Purpose class: ${request.purposeClass}`,
    `Authority: tentative; source: ${proposal.source}; expires: ${proposal.expiresAt}`,
    ...proposal.slots.map((slot) => `${slot.slotId}: ${slot.start} to ${slot.end} (${slot.timezone}, ${slot.weekday})`),
    "Only derived availability is included. No event title, attendee, location, or note was read or disclosed.",
    "No calendar event was created or changed."].join("\n");
}

export default defineToolPlugin({
  id: "agent-liaison", name: "Agent Liaison",
  description: "Expose bounded scheduling availability to an allowlisted Guest session.", configSchema,
  tools: (tool) => [
    tool({ name: "request_synthetic_availability", label: "Request Synthetic Availability",
      description: "Request synthetic tentative scheduling options for non-live testing.", parameters: requestSchema, optional: true,
      factory({ api, config, toolContext }) {
        if (!isAllowed(toolContext, config.allowedRequesterSessionKeys)) return null;
        return { name: "request_synthetic_availability", label: "Request Synthetic Availability",
          description: "Request synthetic tentative scheduling options for non-live testing.", parameters: requestSchema,
          executionMode: "sequential",
          async execute(_id: string, raw: unknown) {
            const request = raw as AvailabilityRequest, proposal = buildSyntheticProposal(request);
            const queued = api.runtime.system.enqueueSystemEvent(ownerEventFor(proposal, request), { sessionKey: config.ownerSessionKey, contextKey: proposal.proposalId, replace: true });
            if (queued) api.runtime.system.requestHeartbeat({ source: "other", intent: "event", reason: "agent-liaison-synthetic-request" });
            const details = { ok: true, proposal, ownerNotificationQueued: queued };
            return { content: [{ type: "text", text: JSON.stringify(details) }], details };
          } };
      } }),
    tool({ name: "request_readonly_availability", label: "Request Read-only Availability",
      description: "Request tentative slots derived from Google Calendar FreeBusy. Never returns event details or writes Calendar data.",
      parameters: requestSchema, optional: true,
      factory({ api, config, toolContext }) {
        if (!config.googleCalendar || !isAllowed(toolContext, config.allowedRequesterSessionKeys)) return null;
        return { name: "request_readonly_availability", label: "Request Read-only Availability",
          description: "Request tentative slots derived from Google Calendar FreeBusy. Never returns event details or writes Calendar data.",
          parameters: requestSchema, executionMode: "sequential",
          async execute(_id: string, raw: unknown) {
            const request = raw as AvailabilityRequest, proposal = await queryGoogleFreeBusy(request, config.googleCalendar!);
            const queued = api.runtime.system.enqueueSystemEvent(ownerEventFor(proposal, request), { sessionKey: config.ownerSessionKey, contextKey: proposal.proposalId, replace: true });
            if (queued) api.runtime.system.requestHeartbeat({ source: "other", intent: "event", reason: "agent-liaison-readonly-request" });
            const details = { ok: true, proposal, ownerNotificationQueued: queued };
            return { content: [{ type: "text", text: JSON.stringify(details) }], details };
          } };
      } }),
  ],
});
