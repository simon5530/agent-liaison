import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

const HOUR = 3600000;
const key = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex');
const dateAt = ms => new Date(ms + 8 * HOUR).toISOString().slice(0, 10);
const fields = ['agentId', 'channel', 'accountId', 'senderId', 'conversationId', 'sessionKey', 'threadId'];
function need(ok, reason) { if (!ok) throw new Error(reason); }
function exact(value, keys) {
  need(value && typeof value === 'object' && !Array.isArray(value), 'invalid-input');
  need(Object.keys(value).every(k => keys.includes(k)), 'unexpected-field');
}
function routeOf(input) {
  need(input && input.channel === 'line', 'unsupported-channel');
  const route = {};
  for (const field of fields) {
    const value = input[field] ?? (field === 'threadId' ? '' : undefined);
    need(typeof value === 'string' && value.length <= 512 && (field === 'threadId' || value.length > 0), 'unverified-route');
    route[field] = value;
  }
  return route;
}
export function eveningSlots(date, now) {
  need(typeof date === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date), 'invalid-date');
  const midnight = Date.parse(date + 'T00:00:00+08:00');
  need(Number.isFinite(midnight) && dateAt(midnight) === date, 'invalid-date');
  need(date === dateAt(now), 'only-current-evening');
  const slots = [18, 19, 20, 21].map(h => midnight + h * HOUR).filter(ms => ms > now);
  need(slots.length > 0, 'no-remaining-slots');
  return { slots, expiresAt: midnight + 22 * HOUR };
}

/** Privileged broker: never expose this object, event intake or dispatch to a model.
 * Only bindTools() closures belong on the agent tool surface. The host must derive
 * route/event provenance from authenticated runtime metadata, not prompt text.
 * No scheduler, timer, network or messaging implementation is hidden here.
 */
export class ReminderBroker {
  #db; #clock; #capabilities = new WeakMap(); #ready = false;
  constructor({ database = ':memory:', clock = Date.now } = {}) {
    this.#clock = clock;
    this.#db = new DatabaseSync(database);
    this.#db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;' +
      'CREATE TABLE IF NOT EXISTS scopes (scope TEXT PRIMARY KEY, route TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0);' +
      'CREATE TABLE IF NOT EXISTS events (scope TEXT NOT NULL, event TEXT NOT NULL, seq INTEGER NOT NULL, PRIMARY KEY(scope,event));' +
      'CREATE TABLE IF NOT EXISTS series (id TEXT PRIMARY KEY, scope TEXT NOT NULL, event TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, day TEXT NOT NULL, expiry INTEGER NOT NULL, state TEXT NOT NULL, UNIQUE(scope,event));' +
      'CREATE TABLE IF NOT EXISTS slots (series TEXT NOT NULL, due INTEGER NOT NULL, state TEXT NOT NULL, receipt TEXT, PRIMARY KEY(series,due));' +
      'CREATE TABLE IF NOT EXISTS attempts (scope TEXT NOT NULL, due INTEGER NOT NULL, series TEXT NOT NULL, PRIMARY KEY(scope,due));'
    );
  }
  #tx(fn) {
    this.#db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.#db.exec('COMMIT'); return result; }
    catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  /** Host admission switch; off after every restart until ingress is reconciled. */
  setReady(ready) { need(typeof ready === 'boolean', 'invalid-ready'); this.#ready = ready; }
  close() { this.#ready = false; this.#db.close(); }

  /** Called for every admitted human inbound, before model execution.
   * Retransmits are idempotent. Arrival order is conservative: a late distinct
   * human event cancels too. Non-human/internal events must never be passed here.
   * Returned opaque capability is turn-local and not serializable by a model.
   */
  acceptHuman({ route: input, eventId, human, requestAuthorized = false }) {
    need(human === true, 'human-provenance-required');
    need(typeof eventId === 'string' && eventId.length > 0 && eventId.length <= 512, 'event-id-required');
    need(typeof requestAuthorized === 'boolean', 'invalid-authorization');
    const route = routeOf(input), scope = key(route), event = key(eventId);
    const seq = this.#tx(() => {
      const prior = this.#db.prepare('SELECT seq FROM events WHERE scope=? AND event=?').get(scope, event);
      if (prior) return prior.seq;
      this.#db.prepare('INSERT OR IGNORE INTO scopes(scope,route,seq) VALUES(?,?,0)').run(scope, JSON.stringify(route));
      this.#db.prepare('UPDATE scopes SET seq=seq+1 WHERE scope=?').run(scope);
      const next = this.#db.prepare('SELECT seq FROM scopes WHERE scope=?').get(scope).seq;
      this.#db.prepare('INSERT INTO events VALUES(?,?,?)').run(scope, event, next);
      this.#db.prepare("UPDATE series SET state='cancelled' WHERE scope=? AND state='active'").run(scope);
      return next;
    });
    const cap = Object.freeze({});
    this.#capabilities.set(cap, { scope, event, seq, requestAuthorized, validUntil: this.#clock() + 10 * 60000 });
    return cap;
  }
  #context(cap) {
    const c = this.#capabilities.get(cap);
    need(c && this.#clock() <= c.validUntil, 'invalid-or-expired-turn');
    need(this.#db.prepare('SELECT seq FROM scopes WHERE scope=?').get(c.scope)?.seq === c.seq, 'superseded-turn');
    return c;
  }
  /** Only this frozen facade is registered as create/status/cancel tools. */
  bindTools(cap) {
    return Object.freeze({
      create: args => this.#create(cap, args),
      status: () => this.#status(cap),
      cancel: () => this.#cancel(cap),
    });
  }
  #create(cap, args) {
    exact(args, ['content', 'date']);
    const c = this.#context(cap);
    need(c.requestAuthorized, 'explicit-reminder-request-required');
    need(this.#ready, 'backend-not-ready');
    need(typeof args.content === 'string' && args.content.trim().length > 0 && args.content.length <= 300 && !Array.from(args.content).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127), 'invalid-content');
    const body = args.content.trim();
    return this.#tx(() => {
      const old = this.#db.prepare('SELECT * FROM series WHERE scope=? AND event=?').get(c.scope, c.event);
      if (old) {
        need(old.body === body && old.day === args.date, 'idempotency-conflict');
        return this.#public(old);
      }
      const { slots, expiresAt } = eveningSlots(args.date, this.#clock());
      const created = this.#db.prepare('SELECT COUNT(*) AS n FROM series WHERE scope=? AND day=?').get(c.scope,args.date).n;
      need(created < 8, 'daily-creation-limit');
      this.#db.prepare("UPDATE series SET state='cancelled' WHERE scope=? AND state='active'").run(c.scope);
      const id = randomUUID();
      this.#db.prepare('INSERT INTO series VALUES(?,?,?,?,?,?,?,?)').run(id,c.scope,c.event,c.seq,body,args.date,expiresAt,'active');
      for (const due of slots) this.#db.prepare("INSERT INTO slots VALUES(?,?,'pending',NULL)").run(id,due);
      return this.#public(this.#db.prepare('SELECT * FROM series WHERE id=?').get(id));
    });
  }
  #public(row) {
    return { id:row.id, content:row.body, date:row.day, state:row.state === 'active' && this.#clock() >= row.expiry ? 'expired' : row.state,
      expiresAt:new Date(row.expiry).toISOString(), timezone:'Asia/Taipei',
      slots:this.#db.prepare('SELECT due,state FROM slots WHERE series=? ORDER BY due').all(row.id).map(x=>({at:new Date(x.due).toISOString(),state:x.state})) };
  }
  #status(cap) {
    const c = this.#context(cap);
    return this.#db.prepare('SELECT * FROM series WHERE scope=? ORDER BY rowid DESC LIMIT 1').all(c.scope).map(row=>this.#public(row));
  }
  #cancel(cap) {
    const c = this.#context(cap);
    return { cancelled:this.#db.prepare("UPDATE series SET state='cancelled' WHERE scope=? AND state='active'").run(c.scope).changes };
  }
  /** Host-only scheduling plan, explicit original-session target; not agent args. */
  plan(id) {
    const row=this.#db.prepare('SELECT series.*,scopes.route FROM series JOIN scopes USING(scope) WHERE id=?').get(id);
    need(row, 'unknown-series');
    return { series:id, route:JSON.parse(row.route), expiresAt:row.expiry,
      slots:this.#db.prepare('SELECT due FROM slots WHERE series=? ORDER BY due').all(id).map(s=>s.due) };
  }
  /** Host-owned native scheduler invokes at a slot. Native dispatch adapter must
   * synchronously submit to the existing session's admitted message path; it must
   * not await or enqueue before the final admission check. SQLite claim commits
   * BEFORE invocation: a crash/unknown outcome sacrifices a send, never retries it.
   */
  async dispatch({ id, due, route: input }, nativeMessage) {
    need(Number.isSafeInteger(due), 'invalid-due');
    need(typeof nativeMessage === 'function', 'native-dispatch-required');
    const scope = key(routeOf(input));
    const claim = this.#tx(() => {
      const row=this.#db.prepare('SELECT * FROM series WHERE id=? AND scope=?').get(id,scope);
      if (!row) return {state:'denied'};
      const now=this.#clock();
      if (!this.#ready) return {state:'blocked'};
      if (now>=row.expiry) {
        this.#db.prepare("UPDATE series SET state='expired' WHERE id=? AND state='active'").run(id);
        return {state:'expired'};
      }
      if (row.state!=='active') return {state:row.state};
      const slot=this.#db.prepare('SELECT state FROM slots WHERE series=? AND due=?').get(id,due);
      if (!slot) return {state:'denied'};
      if(slot.state!=='pending') return {state:slot.state};
      if(now<due) return {state:'early'};
      if(now>=due+60000) {
        this.#db.prepare("UPDATE slots SET state='missed' WHERE series=? AND due=?").run(id,due);
        return {state:'missed'};
      }
      const attempt=this.#db.prepare('INSERT OR IGNORE INTO attempts VALUES(?,?,?)').run(scope,due,id);
      if(!attempt.changes) return {state:'already-attempted'};
      this.#db.prepare("UPDATE slots SET state='unknown' WHERE series=? AND due=?").run(id,due);
      return {state:'claimed', text:'提醒：'+row.body+'。回覆任何訊息即可關閉這次提醒。'};
    });
    if(claim.state!=='claimed') return claim;
    // There is intentionally no await between the final check and native submit.
    // The host must serialize ingress and submit on this same broker instance.
    let receipt;
    try { receipt=await nativeMessage(Object.freeze({route:Object.freeze(routeOf(input)),text:claim.text,slotKey:key(id,due)})); }
    catch { return {state:'unknown'}; }
    const confirmed = receipt?.ok === true && typeof receipt.messageId === 'string' && receipt.messageId.length>0;
    if(confirmed) this.#db.prepare("UPDATE slots SET state='sent',receipt=? WHERE series=? AND due=?").run(receipt.messageId.slice(0,512),id,due);
    return {state:confirmed?'sent':'unknown'};
  }
}
