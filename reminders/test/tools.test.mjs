import test from 'node:test';
import assert from 'node:assert/strict';
import {ReminderBroker} from '../src/broker.mjs';
import {bindReminderTools,toolSchemas} from '../src/tools.mjs';
const now=Date.parse('2026-12-31T17:00:00+08:00');
const route={agentId:'guest',channel:'line',accountId:'fixture',senderId:'human',conversationId:'room',sessionKey:'session',threadId:''};
const args={content:'task',date:'2026-12-31'};
test('only three constrained schemas; status/cancel reject arbitrary IDs',t=>{
 const b=new ReminderBroker({clock:()=>now});t.after(()=>b.close());b.setReady(true);
 const cap=b.acceptHuman({route,eventId:'first',human:true,requestAuthorized:true});const tools=bindReminderTools(b,cap);
 assert.deepEqual(Object.keys(tools),['reminder_create','reminder_status','reminder_cancel']);
 for(const schema of Object.values(toolSchemas)) assert.equal(schema.additionalProperties,false);
 tools.reminder_create.execute(args);
 for(const name of ['reminder_status','reminder_cancel']) assert.throws(()=>tools[name].execute({id:'someone-else'}),/unexpected-field/);
 assert.equal(tools.reminder_cancel.execute({}).cancelled,1);
 assert.equal(tools.reminder_status.execute({})[0].state,'cancelled');
});
test('daily creation budget survives duplicate retries and cannot be reset by cancellation',t=>{
 const b=new ReminderBroker({clock:()=>now});t.after(()=>b.close());b.setReady(true);
 for(let i=0;i<8;i++){
  const cap=b.acceptHuman({route,eventId:String(i),human:true,requestAuthorized:true});const tools=b.bindTools(cap);
  const a=tools.create(args);assert.equal(tools.create(args).id,a.id);tools.cancel();
 }
 const cap=b.acceptHuman({route,eventId:'ninth',human:true,requestAuthorized:true});
 assert.throws(()=>b.bindTools(cap).create(args),/daily-creation-limit/);
});
test('all minute positions admit only remaining slots and expire at 22',async t=>{
 for(let minute=0;minute<24*60;minute++){
  let clock=Date.parse('2026-12-31T00:00:00+08:00')+minute*60000;
  const b=new ReminderBroker({clock:()=>clock});b.setReady(true);
  try{
    const cap=b.acceptHuman({route,eventId:'fixture',human:true,requestAuthorized:true});
    if(minute>=21*60){assert.throws(()=>b.bindTools(cap).create(args),/no-remaining/);continue;}
    const s=b.bindTools(cap).create(args);const expected=[18,19,20,21].filter(h=>h*60>minute);
    assert.equal(s.slots.length,expected.length);
    for(let i=0;i<expected.length;i++) assert.equal(new Date(s.slots[i].at).getUTCHours(),expected[i]-8);
    clock=Date.parse('2026-12-31T22:00:00+08:00');let sent=false;
    const r=await b.dispatch({id:s.id,due:Date.parse(s.slots[0].at),route},()=>{sent=true;return {ok:true,messageId:'x'};});
    assert.equal(r.state,'expired');assert.equal(sent,false);
  }finally{b.close();}
 }
});

test('all tools reject malformed non-object arguments without effects',t=>{
 const b=new ReminderBroker({clock:()=>now});t.after(()=>b.close());b.setReady(true);
 const tools=bindReminderTools(b,b.acceptHuman({route,eventId:'first',human:true,requestAuthorized:true}));
 for(const tool of Object.values(tools)) for(const input of [undefined,null,[],true,1,'text'])
  assert.throws(()=>tool.execute(input),/invalid-input/);
 assert.deepEqual(tools.reminder_status.execute({}),[]);
});
