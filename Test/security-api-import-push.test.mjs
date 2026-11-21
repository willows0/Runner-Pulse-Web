import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {deflateRawSync,inflateRawSync} from 'node:zlib';
import {rateLimitMobileAuthStart,acquireActivityImportSlot} from '../security-guards.js';

// isolate self-contained ZIP reader, avoiding network dependencies in local tests
async function zipReader(){
 const src=await readFile(new URL('../garmin-fit-import.js',import.meta.url),'utf8');
 const chunk=src.slice(src.indexOf('const ZIP_ENTRY_LIMIT'),src.indexOf('function parseFit('));
 const ctx=vm.createContext({inflateRawSync,Buffer});
 vm.runInContext(chunk+'\nthis.extract=unzip;',ctx);
 return ctx.extract;
}
function zipOne(name,raw,{bomb=false}={}){
 const data=Buffer.from(raw),compressed=deflateRawSync(data),n=Buffer.from(name),header=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(8,8);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(n.length,26);
 central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(8,10);central.writeUInt32LE(bomb?1:compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);
 const local=Buffer.concat([header,n,compressed]);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(local.length,16);
 return Buffer.concat([local,central,n,end]);
}
test('Login Android: blocca raffiche di richiesta senza sapere UID o credenziali',()=>{
 const now=1_900_000_000_000,addr='203.0.113.1';
 for(let i=0;i<15;i++)assert.equal(rateLimitMobileAuthStart(addr,now+i).allowed,true);
 const blocked=rateLimitMobileAuthStart(addr,now+30);
 assert.equal(blocked.allowed,false);assert.ok(blocked.retryAfterSeconds>0);
 assert.equal(rateLimitMobileAuthStart(addr,now+61_000).allowed,true);
});
test('Importazione: un solo file pesante per istanza, poi si sblocca',()=>{
 const release=acquireActivityImportSlot('user-1');assert.equal(typeof release,'function');
 assert.equal(acquireActivityImportSlot('user-1'),null);
 assert.equal(acquireActivityImportSlot('user-2'),null);
 release();release();
 const other=acquireActivityImportSlot('user-2');assert.equal(typeof other,'function');other();
});
test('ZIP valido limitato: estrae un archivio deflate minimo',async()=>{
 const extract=await zipReader(),zip=zipOne('sample.tcx',Buffer.from('<TrainingCenterDatabase />'));
 const out=extract(zip);assert.equal(out.length,1);assert.equal(out[0].name,'sample.tcx');
 assert.match(out[0].data.toString(),/TrainingCenterDatabase/);
});
test('ZIP compresso in modo anomalo viene bloccato prima di estrarre',async()=>{
 const extract=await zipReader();
 const archive=zipOne('large.fit',Buffer.alloc(120000));
 assert.throws(()=>extract(archive),/Compressione ZIP anomala/);
});
test('Server: limite di upload e token push nel POST, mai negli URL',async()=>{
 const server=await readFile(new URL('../server.js',import.meta.url),'utf8');
 const client=await readFile(new URL('../public/weekly-push.js',import.meta.url),'utf8');
 assert.match(server,/const max=40\*1024\*1024/);
 assert.match(server,/acquireActivityImportSlot\(importingUser\.uid\)/);
 assert.match(server,/finally\{releaseImport\(\);\}/);
 assert.match(server,/rateLimitMobileAuthStart\(req\.socket\?\.remoteAddress\)/);
 assert.match(server,/expireTime:Timestamp\.fromMillis/);
 assert.match(server,/\/api\/push\/status' && req\.method!=='POST'/);
 assert.ok(!server.includes("get('token')"));
 assert.equal((client.match(/fetch\('\/api\/push\/status',\{method:'POST'/g)||[]).length,2);
 assert.ok(!client.includes('/api/push/status?token='));
});
