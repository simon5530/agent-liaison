import test from 'node:test';
import assert from 'node:assert/strict';
import { minimatch, Minimatch } from 'minimatch';
import { z } from 'zod';
import { MockAgent, fetch } from 'undici';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

test('minimatch override preserves path, brace, dot and negation matching',()=>{
 assert.equal(minimatch('src/main.ts','**/*.{ts,js}'),true);
 assert.equal(minimatch('src/main.py','**/*.{ts,js}'),false);
 assert.equal(minimatch('.secret','*'),false);
 assert.equal(minimatch('.secret','*',{dot:true}),true);
 assert.equal(minimatch('public.txt','!private.*'),true);
 assert.equal(new Minimatch('src/**',{nocase:true}).match('SRC/main.ts'),true);
});
test('zod override preserves strict parsing, bounds and JSON schema',()=>{
 const schema=z.object({items:z.array(z.string()).max(2)}).strict();
 assert.deepEqual(schema.parse({items:['ok']}),{items:['ok']});
 assert.equal(schema.safeParse({items:['a','b','c']}).success,false);
 assert.equal(schema.safeParse({items:[],extra:true}).success,false);
 assert.equal(z.toJSONSchema(schema).type,'object');
});
test('undici override supports mocked fetch without external networking',async()=>{
 const agent=new MockAgent();agent.disableNetConnect();
 try {
  agent.get('https://fixture.invalid').intercept({path:'/test'}).reply(200,{ok:true});
  const response=await fetch('https://fixture.invalid/test',{dispatcher:agent});
  assert.deepEqual(await response.json(),{ok:true});agent.assertNoPendingInterceptors();
 } finally {await agent.close();}
});
test('MCP override negotiates and lists tools entirely in memory',async()=>{
 const client=new Client({name:'fixture-client',version:'1.0.0'});
 const server=new Server({name:'fixture-server',version:'1.0.0'},{capabilities:{tools:{}}});
 server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[]}));
 const [a,b]=InMemoryTransport.createLinkedPair();
 try {await server.connect(b);await client.connect(a);assert.deepEqual((await client.listTools()).tools,[]);}
 finally {await client.close();await server.close();}
});
