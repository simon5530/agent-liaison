# Integration evidence and limits

## Decision

Extend the existing Agent Liaison repository with a separately tested broker, without changing or replacing its installed meeting plugin. No third-party dependency needed for the broker beyond Node's built-in SQLite. No new plugin installed.

## Installed documentation inspected (2026-11-10)

- OpenClaw plugins/tool-plugins.md: defineToolPlugin is tool-only, not hooks/services. Tool metadata alone cannot implement inbound cancellation.
- plugins/hooks/reference.md: observation hooks can be fire-and-forget and overlap; priority does not serialize their side effects. Gate hooks block on failure, while message-sending modifying hooks can log-and-skip on failure.
- automation/hooks/event-types.md: message:received is asynchronous and not a complete transport audit; some suppressed/fast paths may omit events.
- automations schema: supports native session-target agent turns, not a documented atomic reply-stop field.

## SDK review disposition (2026-11-10)

Two independent read-only reviews completed: SDK feasibility and focused core static inspection. Neither executed target code or verified a live channel. Core inspection found no confirmed security finding, but identified malformed host timestamp handling; fixed by rejecting non-safe-integer due values before database access.

Main directly verified these installed OpenClaw 2026.11.2 source excerpts (paths relative to its dist directory):

- registry-wjpI9g9x.mjs:319–320: schedulePluginSessionTurn returns without scheduling for non-bundled plugins. Do not mistake the existing meeting plugin's convenience call for a verified external scheduler.
- dispatch-from-config-Bavt4mfl.mjs:2659–2672: message_received is suppressible and fire-and-forget, not a synchronous durable acceptance boundary.
- deliver-prepare-D-HSGelI.mjs:197–248: outbound hook exceptions return unchanged payload. This is not a fail-closed send authorization guard.
- config-contracts-0_35lKDI.d.ts:48560–48638: trusted route/sender and invocation guards are present; no exact inbound message-ID field is provided in the tool factory context.

The SDK reviewer additionally reports: LINE durably queues before later agent processing; sticker-only coverage was not verified; default received-event mapping does not populate the proposed run-ID correlation bridge; service getCron exposes mutations but its reduced public contract was not validated as a complete one-shot native-message path. These are focused review observations, not a proof that all service scheduling is impossible. The repository's old plugin dependency is not the inspected host SDK.

**Blocked production gates:** host/provider-owned durable cancellation at accepted human ingress (including stickers); exact accepted-event-to-tool binding; supported durable one-shot registration; trusted reminder identity and fixed original route at an enforced fail-closed native message admission point. Cleanup alone cannot prevent sends. No latest-message cache, content marker, permissive observer hook, direct provider call or generic Guest scheduler substitutes for these gates.

The local broker intentionally accepts host-owned ports rather than disguising a fake SDK call as production integration. Resolving these gaps requires supported host/provider facilities; no installed host or provider was patched.

## Verification receipt (2026-11-10)

- Native command node --test test/*.test.mjs: exit 0, 34 passed, 0 failed. Includes all 1,440 minute positions, numeric-string/malformed due rejection with zero sends, replacement-series attempt uniqueness, restart create-event replay and malformed tool inputs.
- Existing liaison Python suite: 7 passed before this review fix; no Python or meeting-plugin files changed afterward.
- All dispatch callbacks and identities are fixtures. No LINE message, live scheduler, plugin installation or runtime permission change occurred.
- Focused static review is not a full security certification. Production remains unavailable.

## Review recovery lesson

A host-only numeric-string timestamp can match a SQLite integer while JavaScript deadline addition concatenates strings. Validate numeric types before persistence lookup and arithmetic; the regression checks an 18:00 string timestamp at 18:02, rejects it, and confirms zero callbacks. Host-only input still needs defensive validation.

## Implemented boundary

Trusted host: ingress provenance, explicit intent authorization, durable scheduler registration, exclusive process ownership, protected storage, native message tool admission.

Untrusted agent: reminder content and current-evening date only. Text is literal content, not an instruction to the dispatcher.

Broker: scope capability, deterministic slots, durable cancellation, replay dedupe, expired-turn protection, at-most-once attempts and receipt classification.

## Development recovery

Source readback caught escaped regular-expression characters being consumed by the JavaScript code-writing layer, plus an INSERT placeholder count mismatch, before the first test run. Replaced the date class with [0-9], control-character check with code-point checks, and aligned placeholders with the eight table fields. Syntax check and the first native test run then passed 27 tests. Keep source readback and native tests rather than relying on a successful write receipt.
