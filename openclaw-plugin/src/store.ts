import { DatabaseSync } from "node:sqlite";
import { mkdirSync, lstatSync, openSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

export const RETENTION_MS = 30 * 86400000;
export const MAX_RECORDS = 1000;
export type Effect = "owner_review" | "owner_reminder" | "requester_options" | "requester_decision";
export type EventKind = "submission_accepted" | "context_submitted" | "decision_recorded" | "expired" | "scheduling_attempted" | "scheduled" | "failed" | "unknown";
export type Receipt = { at: string; kind: EventKind; effect?: Effect };
export type Envelope<T> = { value: T; events: Receipt[]; effects: Partial<Record<Effect, "attempted" | "scheduled" | "failed" | "unknown">>; contextDigest?: string; decisionDigest?: string };

// All callbacks are synchronous: never hold a SQLite transaction over host calls.
export class DurableStore<T> {
  private db: DatabaseSync;
  constructor(directory: string, private validate: (value: unknown) => value is T) {
    directory = resolve(directory);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const dir = lstatSync(directory);
    if (!dir.isDirectory() || dir.isSymbolicLink() || (dir.mode & 0o077) || dir.uid !== process.getuid?.()) throw new Error("unsafe broker state directory");
    const file = join(directory, "broker.sqlite");
    let created = false;
    try { closeSync(openSync(file, "wx", 0o600)); created = true; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error("unsafe broker state file");
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;");
    const version = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
    if ((!created && version.user_version !== 1) || (created && version.user_version !== 0)) throw new Error("unsupported broker state version");
    const integrity = this.db.prepare("PRAGMA quick_check").get();
    if (!integrity || Object.values(integrity)[0] !== "ok") throw new Error("corrupt broker state");
    if (created) this.db.exec("BEGIN IMMEDIATE; CREATE TABLE proposals (id TEXT PRIMARY KEY, created INTEGER NOT NULL, body TEXT NOT NULL); PRAGMA user_version=1; COMMIT;");
    this.db.exec("PRAGMA secure_delete=ON;");
  }
  close() { this.db.close(); }
  transaction<R>(now: Date, fn: (rows: Map<string, Envelope<T>>) => R): R {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const rows = new Map<string, Envelope<T>>();
      const raw = this.db.prepare("SELECT id,created,body FROM proposals").all();
      if (raw.length > MAX_RECORDS) throw new Error("corrupt broker state");
      for (const row of raw) {
        const body = JSON.parse(String(row.body)) as Envelope<T>;
        if (!this.validEnvelope(body) || String(row.id) !== (body.value as {proposal:{proposalId:string}}).proposal.proposalId || Number(row.created) !== Date.parse((body.value as {proposal:{createdAt:string}}).proposal.createdAt)) throw new Error("corrupt broker state");
        if (Number(row.created) > now.getTime() - RETENTION_MS) rows.set(String(row.id), body);
      }
      const result = fn(rows);
      if (rows.size > MAX_RECORDS) throw new Error("broker capacity reached");
      this.db.exec("DELETE FROM proposals");
      const insert = this.db.prepare("INSERT INTO proposals VALUES (?,?,?)");
      for (const [id, body] of rows) {
        if (!this.validEnvelope(body)) throw new Error("invalid broker state");
        insert.run(id, Date.parse((body.value as { proposal: { createdAt: string } }).proposal.createdAt), JSON.stringify(body));
      }
      this.db.exec("COMMIT");
      return structuredClone(result);
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private validEnvelope(body: Envelope<T>): boolean {
    const effects = ["owner_review", "owner_reminder", "requester_options", "requester_decision"];
    const kinds = ["submission_accepted", "context_submitted", "decision_recorded", "expired", "scheduling_attempted", "scheduled", "failed", "unknown"];
    return !!body && Object.keys(body).every(k => ["value", "events", "effects", "contextDigest", "decisionDigest"].includes(k)) && this.validate(body.value)
      && [body.contextDigest, body.decisionDigest].every(d => d === undefined || /^[a-f0-9]{64}$/.test(d))
      && Array.isArray(body.events) && body.events.length <= 16 && body.events.every(e => Object.keys(e).every(k => ["at", "kind", "effect"].includes(k)) && Number.isFinite(Date.parse(e.at)) && kinds.includes(e.kind) && (!e.effect || effects.includes(e.effect)))
      && !!body.effects && Object.entries(body.effects).every(([k,v]) => effects.includes(k) && ["attempted", "scheduled", "failed", "unknown"].includes(v));
  }
}
export function defaultStateDirectory() {
  return join(process.env.OPENCLAW_STATE_DIR || join(homedir(), ".openclaw"), "agent-liaison");
}
