import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import entry, {createCandidateProposal,getProposalStatus,ownerReceipt,listOwnerProposals,reopenProposalStoreForTests,scheduleOnce,submitContextualCandidates,recordOwnerDecision} from "./index.js";
const request={startDate:"2026-10-10",endDate:"2026-10-11",durationMinutes:60,earliestStart:"18:00",latestEnd:"22:00",timezone:"Asia/Taipei" as const,purposeClass:"meeting" as const,idempotencyKey:"synthetic-secret-key"};
const candidates=[{start:"2026-10-10T10:00:00.000Z",end:"2026-10-10T11:00:00.000Z"}];
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),"liaison-durable-"));reopenProposalStoreForTests(dir);});
function tools(schedule=vi.fn(async()=>({id:"synthetic-job"}))) {
 const registered=new Map<string,(ctx:unknown)=>any>();
 entry.register({pluginConfig:{ownerSessionKey:"owner",allowedRequesterSessionKeys:["guest-a","guest-b"]},registerTool(factory:any,options:any){registered.set(options.name,factory);},session:{workflow:{scheduleSessionTurn:schedule}}} as never);
 return {schedule,get:(name:string,agentId="main",sessionKey="owner")=>registered.get(name)!({agentId,sessionKey})};
}
describe("durable receipts",()=>{
 it("recovers in a fresh process, with owner-only file permissions",()=>{
  const p=createCandidateProposal(request,"guest-a");
  expect(statSync(dir).mode&0o777).toBe(0o700);expect(statSync(join(dir,"broker.sqlite")).mode&0o777).toBe(0o600);
  const script='import {reopenProposalStoreForTests,listOwnerProposals} from "./dist/index.js"; reopenProposalStoreForTests(process.argv[1]); console.log(JSON.stringify(listOwnerProposals()));';
  const result=JSON.parse(execFileSync(process.execPath,["--input-type=module","-e",script,dir],{encoding:"utf8"}));
  expect(result[0].proposal.proposalId).toBe(p.proposalId);
  expect(result[0].events[0].kind).toBe("submission_accepted");
 });
 it("serializes separate processes claiming the same effect",async()=>{
  const p=createCandidateProposal(request,"guest-a");
  const script='import {reopenProposalStoreForTests,scheduleOnce} from "./dist/index.js"; reopenProposalStoreForTests(process.argv[1]); await scheduleOnce(process.argv[2],"owner_review",async()=>{console.log("CALLED"); await new Promise(r=>setTimeout(r,50));return {id:"synthetic"};});';
  const results=await Promise.all([1,2,3].map(()=>promisify(execFile)(process.execPath,["--input-type=module","-e",script,dir,p.proposalId])));
  expect(results.map(r=>r.stdout).join("").match(/CALLED/g)).toHaveLength(1);
 });
 it("rejects capacity rather than evicting retained proposals",()=>{
  createCandidateProposal(request,"guest-a");const db=new DatabaseSync(join(dir,"broker.sqlite"));const row=db.prepare("SELECT * FROM proposals").get()!;const original=JSON.parse(String(row.body));const insert=db.prepare("INSERT INTO proposals VALUES(?,?,?)");db.exec("BEGIN");
  for(let n=1;n<1000;n++){const body=structuredClone(original);body.value.proposal.proposalId="candidate-"+n.toString(16).padStart(64,"0");insert.run(body.value.proposal.proposalId,row.created,JSON.stringify(body));}db.exec("COMMIT");db.close();
  expect(()=>createCandidateProposal({...request,idempotencyKey:"new-request-key"},"guest-a")).toThrow(/capacity/);expect(listOwnerProposals(50)).toHaveLength(50);
 });
 it("canonicalizes retried typed input field ordering",()=>{
  const first=createCandidateProposal(request,"guest-a");const reordered=Object.fromEntries(Object.entries(request).reverse());expect(createCandidateProposal(reordered as typeof request,"guest-a").proposalId).toBe(first.proposalId);
 });
 it("rejects corrupt database without resetting it",()=>{
  writeFileSync(join(dir,"broker.sqlite"),"corrupt",{mode:0o600});
  expect(()=>listOwnerProposals()).toThrow();expect(readFileSync(join(dir,"broker.sqlite"),"utf8")).toBe("corrupt");
 });
 it("rejects corrupt typed rows and unsafe permissions",()=>{
  createCandidateProposal(request,"guest-a");
  const db=new DatabaseSync(join(dir,"broker.sqlite"));db.exec("UPDATE proposals SET body='{}'");db.close();
  expect(()=>listOwnerProposals()).toThrow();
  reopenProposalStoreForTests(dir);chmodSync(join(dir,"broker.sqlite"),0o644);expect(()=>listOwnerProposals()).toThrow(/unsafe/);
 });
 it("precommits claims, serializes concurrent replay, and never retries unknown outcomes",async()=>{
  const p=createCandidateProposal(request,"guest-a");let release!:()=>void;
  const call=vi.fn(async()=>{expect(ownerReceipt(p.proposalId).effects.owner_review).toBe("attempted");await new Promise<void>(r=>release=r);throw new Error("private-secret-error");});
  const first=scheduleOnce(p.proposalId,"owner_review",call);
  expect(await scheduleOnce(p.proposalId,"owner_review",call)).toBe(false);release();await first;
  reopenProposalStoreForTests(dir);await scheduleOnce(p.proposalId,"owner_review",call);
  expect(call).toHaveBeenCalledTimes(1);expect(ownerReceipt(p.proposalId).effects.owner_review).toBe("unknown");
  expect(JSON.stringify(ownerReceipt(p.proposalId))).not.toContain("private-secret-error");
 });
 it("does not retry a recovered attempted claim",async()=>{
  const p=createCandidateProposal(request,"guest-a");const db=new DatabaseSync(join(dir,"broker.sqlite"));const row=db.prepare("SELECT body FROM proposals").get()!;const body=JSON.parse(String(row.body));body.effects.owner_review="attempted";body.events.push({kind:"scheduling_attempted",effect:"owner_review",at:new Date().toISOString()});db.prepare("UPDATE proposals SET body=?").run(JSON.stringify(body));db.close();reopenProposalStoreForTests(dir);
  const call=vi.fn();await scheduleOnce(p.proposalId,"owner_review",call);expect(call).not.toHaveBeenCalled();
 });
 it("retains accepted ID and independent receipts after partial scheduling failure",async()=>{
  const schedule=vi.fn().mockResolvedValueOnce({id:"job"}).mockRejectedValueOnce(new Error("secret"));const t=tools(schedule);const tool=t.get("request_candidate_times","guest","guest-a");
  const result=await tool.execute("one",request);const id=result.details.proposal.proposalId;
  expect(result.details.ownerNotificationScheduled).toBe(true);expect(result.details.ownerReminderScheduled).toBe(false);
  expect(ownerReceipt(id).effects).toEqual({owner_review:"scheduled",owner_reminder:"unknown"});
  await tool.execute("retry",request);expect(schedule).toHaveBeenCalledTimes(2);expect(listOwnerProposals()[0].proposal.proposalId).toBe(id);
 });
 it("keeps the proposal ID when a later receipt write fails",async()=>{
  const schedule=vi.fn(async()=>{const db=new DatabaseSync(join(dir,"broker.sqlite"));db.exec("CREATE TRIGGER synthetic_block BEFORE INSERT ON proposals BEGIN SELECT RAISE(FAIL,'blocked'); END");db.close();return {id:"synthetic"};});
  const result=await tools(schedule).get("request_candidate_times","guest","guest-a").execute("f",request);
  expect(result.details.proposal.proposalId).toMatch(/^candidate-/);expect(result.details.ownerNotificationScheduled).toBe(false);expect(schedule).toHaveBeenCalledTimes(1);
  const db=new DatabaseSync(join(dir,"broker.sqlite"));db.exec("DROP TRIGGER synthetic_block");db.close();
  expect(ownerReceipt(result.details.proposal.proposalId).effects.owner_review).toBe("attempted");
 });
 it("recovers an interrupted uncommitted transaction",()=>{
  const p=createCandidateProposal(request,"guest-a");
  const script='import {DatabaseSync} from "node:sqlite";const db=new DatabaseSync(process.argv[1]);db.exec("BEGIN IMMEDIATE; DELETE FROM proposals;");process.exit(0);';
  execFileSync(process.execPath,["--input-type=module","-e",script,join(dir,"broker.sqlite")]);reopenProposalStoreForTests(dir);expect(ownerReceipt(p.proposalId).proposal.proposalId).toBe(p.proposalId);
 });
 it("records disabled scheduling as failed rather than delivered",async()=>{
  const p=createCandidateProposal(request,"guest-a");await scheduleOnce(p.proposalId,"owner_review",async()=>undefined);
  expect(ownerReceipt(p.proposalId)).toMatchObject({effects:{owner_review:"failed"},delivery:"not_observed"});
 });
 it("enforces key conflicts, context/decision replay and no duplicate requester notifications",async()=>{
  const t=tools();const p=createCandidateProposal(request,"guest-a");expect(()=>createCandidateProposal({...request,durationMinutes:90},"guest-a")).toThrow(/conflict/);
  const context={proposalId:p.proposalId,candidates,source:"main_memory",contextBasis:["owner_time_boundaries"]};
  const submit=t.get("submit_contextual_candidate_times");await submit.execute("1",context);await submit.execute("2",context);
  const decision=t.get("record_owner_scheduling_decision");await decision.execute("3",{proposalId:p.proposalId,decision:"approve",selectedSlotId:"slot-1"});await decision.execute("4",{proposalId:p.proposalId,decision:"approve",selectedSlotId:"slot-1"});
  expect(t.schedule).toHaveBeenCalledTimes(2);expect(ownerReceipt(p.proposalId).events.filter(e=>e.kind==="decision_recorded")).toHaveLength(1);
  expect(()=>recordOwnerDecision(p.proposalId,"decline")).toThrow();
 });
 it("denies unrelated main/guest and limits Guest to own minimal status",async()=>{
  const t=tools();for(const name of ["list_owner_candidate_proposals","check_owner_candidate_status","submit_contextual_candidate_times","record_owner_scheduling_decision"]){expect(t.get(name,"main","unrelated")).toBeNull();expect(t.get(name,"guest","guest-a")).toBeNull();}
  expect(t.get("request_candidate_times","guest","unrelated")).toBeNull();expect(t.get("request_candidate_times","main","owner")).toBeNull();
  const p=createCandidateProposal(request,"guest-a");expect(()=>getProposalStatus(p.proposalId,"guest-b")).toThrow();
  const guest=await t.get("check_candidate_status","guest","guest-a").execute("g",{proposalId:p.proposalId});expect(Object.keys(guest.details)).toEqual(["ok","proposal"]);expect(JSON.stringify(guest)).not.toContain("guest-a");
  const list=await t.get("list_owner_candidate_proposals").execute("o",{});expect(list.details.proposals).toHaveLength(1);expect(()=>listOwnerProposals(51)).toThrow();
 });
 it("expires and prunes retention on access",()=>{
  const now=new Date();const p=createCandidateProposal(request,"guest-a",now);
  const expired=new Date(+now+8*3600000+1);expect(getProposalStatus(p.proposalId,"guest-a",expired).state).toBe("expired");
  expect(ownerReceipt(p.proposalId,expired).events.at(-1)?.kind).toBe("expired");
  expect(listOwnerProposals(20,new Date(+now+30*86400000+1))).toEqual([]);
 });
 it("rejects free text and never stores raw key/error/memory text",()=>{
  expect(()=>createCandidateProposal({...request,notes:"secret-memory"} as any,"guest-a")).toThrow();
  const p=createCandidateProposal(request,"guest-a");expect(()=>submitContextualCandidates(p.proposalId,candidates,"main_memory",["secret-memory"] as any)).toThrow();
  const bytes=readFileSync(join(dir,"broker.sqlite")).toString();expect(bytes).not.toContain(request.idempotencyKey);expect(bytes).not.toContain("secret-memory");
 });
});
