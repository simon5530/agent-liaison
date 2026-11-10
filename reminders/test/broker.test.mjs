import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReminderBroker, eveningSlots } from '../src/broker.mjs';
const day='2026-12-31';
const at=(time,date=day)=>Date.parse(date+'T'+time+':00+08:00');
const route={agentId:'guest',channel:'line',accountId:'fixture',senderId:'human-a',conversationId:'chat-a',sessionKey:'fixture-session-a',threadId:''};
const args={date:day,content:'明天要帶電腦'};
function setup(t, database=':memory:') {
  let now=at('17:00'); const broker=new ReminderBroker({database,clock:()=>now});
  t.after(()=>broker.close()); broker.setReady(true);
  const event=(id='create',r=route,auth=true)=>broker.acceptHuman({route:r,eventId:id,human:true,requestAuthorized:auth});
  const tools=broker.bindTools(event());
  return {broker,tools,event,time:value=>{now=value;}};
}
const ok=()=>({ok:true,messageId:'fixture-delivery'});
test('four evening slots and exclusive 22:00 cutoff',()=>{
  const p=eveningSlots(day,at('17:00'));
  assert.deepEqual(p.slots,[18,19,20,21].map(h=>at(h+':00')));
  assert.equal(p.expiresAt,at('22:00'));
});
test('late creation uses future slots only',()=>{
 assert.deepEqual(eveningSlots(day,at('18:30')).slots,[19,20,21].map(h=>at(h+':00')));
 assert.deepEqual(eveningSlots(day,at('18:00')).slots,[19,20,21].map(h=>at(h+':00')));
 assert.throws(()=>eveningSlots(day,at('21:01')),/no-remaining/);
});
test('invalid dates and next-day scheduling rejected',()=>{
 for(const date of ['2026-02-30','2026-13-01','not-date','2027-01-01']) assert.throws(()=>eveningSlots(date,at('17:00')));
 assert.equal(eveningSlots('2027-01-01',at('17:00','2027-01-01')).slots.length,4);
});
test('opaque turn capability and no scheduler/target arguments',t=>{
 const {broker,tools}=setup(t);
 assert.throws(()=>broker.bindTools({}).create(args),/invalid-or-expired/);
 for(const field of ['target','sessionKey','senderId','script','toolsAllow','cron','jobId']) assert.throws(()=>tools.create({...args,[field]:'x'}),/unexpected-field/);
 assert.deepEqual(Object.keys(tools),['create','status','cancel']);
});
test('unready backend and missing authorization cannot create',t=>{
 const {broker,tools,event}=setup(t); broker.setReady(false);
 assert.throws(()=>tools.create(args),/backend-not-ready/);
 broker.setReady(true);
 assert.throws(()=>broker.bindTools(event('noauth',route,false)).create(args),/explicit-reminder/);
});
test('blank/control/oversized content rejected',t=>{
 const {tools}=setup(t);
 for(const content of ['', ' ', 'a'.repeat(301),String.fromCharCode(10),'a'+String.fromCharCode(0)]) assert.throws(()=>tools.create({...args,content}),/invalid-content/);
});
test('duplicate inbound and create are idempotent; changed payload rejected',t=>{
 const {broker,tools,event}=setup(t);const a=tools.create(args);
 const duplicate=broker.bindTools(event()).create(args);
 assert.equal(duplicate.id,a.id);assert.equal(duplicate.state,'active');
 assert.throws(()=>tools.create({...args,content:'other'}),/idempotency-conflict/);
});
for(const kind of ['text','sticker','image','voice','new-request']) test(kind+' inbound cancels before first send',async t=>{
 const {broker,tools,event,time}=setup(t);const s=tools.create(args);
 event(kind,route,false);time(at('18:00'));let sent=0;
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},()=>{sent++;return ok();})).state,'cancelled');assert.equal(sent,0);
});
for(const field of ['senderId','accountId','conversationId','sessionKey','threadId','agentId']) test('isolation on '+field,async t=>{
 const {broker,tools,event,time}=setup(t);const s=tools.create(args);const other={...route,[field]:'other'};
 const otherTools=broker.bindTools(event('other',other));assert.deepEqual(otherTools.status(),[]);otherTools.cancel();
 time(at('18:00'));let sends=0;
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route:other},()=>{sends++;return ok();})).state,'denied');
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},()=>{sends++;return ok();})).state,'sent');assert.equal(sends,1);
});
test('bot/internal/missing provenance rejected',t=>{
 const {broker}=setup(t);
 assert.throws(()=>broker.acceptHuman({route,eventId:'bot',human:false}),/human-provenance/);
 assert.throws(()=>broker.acceptHuman({route:{...route,senderId:''},eventId:'bad',human:true}),/unverified-route/);
});
test('superseded or expired turn cannot revive cancelled reminder',t=>{
 const {broker,tools,event,time}=setup(t);tools.create(args);event('reply');
 assert.throws(()=>tools.create(args),/superseded-turn/);
 const newer=broker.bindTools(event('new'));time(at('17:11'));
 assert.throws(()=>newer.create(args),/invalid-or-expired/);
});
test('four scheduled native-message attempts, duplicate ticks ignored',async t=>{
 const {broker,tools,time}=setup(t);const s=tools.create(args);let sends=0;
 for(const hour of [18,19,20,21]){
   const due=at(hour+':00');time(due);
   const submit=packet=>{sends++;assert.deepEqual(packet.route,route);assert.match(packet.text,/回覆任何訊息/);return ok();};
   assert.equal((await broker.dispatch({id:s.id,due,route},submit)).state,'sent');
   assert.equal((await broker.dispatch({id:s.id,due,route},submit)).state,'sent');
 }
 assert.equal(sends,4);time(at('22:00'));assert.equal((await broker.dispatch({id:s.id,due:at('21:00'),route},ok)).state,'expired');
});
test('early/missed/unknown slot do not send; no catch-up',async t=>{
 const {broker,tools,time}=setup(t);const s=tools.create(args);let sends=0;const submit=()=>{sends++;return ok();};
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},submit)).state,'early');
 time(at('18:01'));assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},submit)).state,'missed');
 assert.equal((await broker.dispatch({id:s.id,due:at('18:30'),route},submit)).state,'denied');assert.equal(sends,0);
});
test('unknown delivery never retried',async t=>{
 const {broker,tools,time}=setup(t);const s=tools.create(args);time(at('18:00'));let sends=0;
 const submit=()=>{sends++;throw new Error('network-unknown');};
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},submit)).state,'unknown');
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},submit)).state,'unknown');assert.equal(sends,1);
});
test('queued response is not delivered',async t=>{
 const {broker,tools,time}=setup(t);const s=tools.create(args);time(at('18:00'));
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},()=>({status:'queued'}))).state,'unknown');
});
test('cancellation during in-flight send blocks later slots',async t=>{
 const {broker,tools,event,time}=setup(t);const s=tools.create(args);time(at('18:00'));
 let resolve;const p=broker.dispatch({id:s.id,due:at('18:00'),route},()=>new Promise(r=>{resolve=r;}));
 event('reply',route,false);resolve(ok());assert.equal((await p).state,'sent');
 time(at('19:00'));assert.equal((await broker.dispatch({id:s.id,due:at('19:00'),route},ok)).state,'cancelled');
});
test('new explicit request replaces old series',t=>{
 const {broker,tools,event}=setup(t);const first=tools.create(args);
 const next=broker.bindTools(event('new-request')).create({...args,content:'another task'});
 assert.notEqual(next.id,first.id);assert.equal(next.state,'active');
});
test('persistent cancel and unknown receipts survive restart; startup blocks dispatch',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'reminder-fixture-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const db=join(dir,'state.db');let now=at('17:00');const make=()=>new ReminderBroker({database:db,clock:()=>now});
 let b=make();b.setReady(true);let cap=b.acceptHuman({route,eventId:'create',human:true,requestAuthorized:true});
 const s=b.bindTools(cap).create(args);now=at('18:00');await b.dispatch({id:s.id,due:at('18:00'),route},()=>({ok:false}));b.close();
 b=make();assert.equal((await b.dispatch({id:s.id,due:at('18:00'),route},ok)).state,'blocked');b.setReady(true);
 assert.equal((await b.dispatch({id:s.id,due:at('18:00'),route},ok)).state,'unknown');
 b.acceptHuman({route,eventId:'reply',human:true});b.close();b=make();b.setReady(true);now=at('19:00');
 assert.equal((await b.dispatch({id:s.id,due:at('19:00'),route},ok)).state,'cancelled');b.close();
});

test('malformed host due cannot bypass the missed-slot deadline',async t=>{
 const {broker,tools,time}=setup(t);const s=tools.create(args);time(at('18:02'));let sends=0;
 const submit=()=>{sends++;return ok();};
 for(const due of [String(at('18:00')),NaN,Infinity,null,undefined,1.5,{},[]])
  await assert.rejects(broker.dispatch({id:s.id,due,route},submit),/invalid-due/);
 assert.equal((await broker.dispatch({id:s.id,due:at('18:00'),route},submit)).state,'missed');
 assert.equal(sends,0);
});
test('attempt ledger remains scope-wide across replacement series',async t=>{
 const {broker,tools,event,time}=setup(t);const first=tools.create(args);let sends=0;
 const submit=()=>{sends++;return ok();};time(at('18:00'));
 assert.equal((await broker.dispatch({id:first.id,due:at('18:00'),route},submit)).state,'sent');
 // Clock rollback deliberately makes the same slot available to a replacement.
 time(at('17:59'));const next=broker.bindTools(event('replacement')).create(args);time(at('18:00'));
 assert.equal((await broker.dispatch({id:next.id,due:at('18:00'),route},submit)).state,'already-attempted');
 assert.equal(sends,1);
});
test('create-event idempotency survives process restart',t=>{
 const dir=mkdtempSync(join(tmpdir(),'reminder-replay-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const database=join(dir,'state.db');const make=()=>new ReminderBroker({database,clock:()=>at('17:00')});
 const inbound={route,eventId:'same-create',human:true,requestAuthorized:true};
 let b=make();b.setReady(true);const first=b.bindTools(b.acceptHuman(inbound)).create(args);b.close();
 b=make();t.after(()=>b.close());b.setReady(true);const tools=b.bindTools(b.acceptHuman(inbound));
 assert.equal(tools.create(args).id,first.id);assert.equal(tools.status().length,1);
 assert.throws(()=>tools.create({...args,content:'changed'}),/idempotency-conflict/);
});
