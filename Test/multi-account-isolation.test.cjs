'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Verifiche di regressione per il sito multiutente.
// Non leggono Firestore reale e non modificano dati: testano il percorso API
// di lettura delle attività Health Connect con un database fittizio separato.
const server = fs.readFileSync(path.resolve(__dirname, '../server.js'), 'utf8');

function routeSource(startMarker, endMarker) {
  const start = server.indexOf(startMarker);
  const end = server.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Route non trovata: ${startMarker}`);
  return server.slice(start, end);
}

const listHealth = routeSource(
  "if(req.url?.split('?')[0]==='/api/health-connect/activities'){",
  "if(req.url?.startsWith('/api/health-connect/import'))"
);
const deleteHealth = routeSource(
  "if(req.url?.split('?')[0]==='/api/health-connect/delete-activity'){",
  "if(req.url?.split('?')[0]==='/api/health-connect/activities')"
);
const importHealth = routeSource(
  "if(req.url?.startsWith('/api/health-connect/import'))",
  "if(req.url?.startsWith('/api/mobile-auth/'))"
);
const pushSubscribe = routeSource(
  "if(pathname==='/api/push/subscribe'){",
  "if(pathname==='/api/push/unsubscribe' || pathname==='/api/push/status')"
);
const pushStatus = routeSource(
  "if(pathname==='/api/push/unsubscribe' || pathname==='/api/push/status'){",
  "if(pathname==='/api/push/test')"
);
const garminStatus = routeSource(
  "if(pathname==='/api/garmin/account-status'){",
  "if(pathname==='/api/garmin/connect')"
);

function mockHealthList() {
  const accountActivities = {
    'account-uno': [{id:'corsa-personale-1', source:'honor'}],
    'account-due': [{id:'corsa-personale-2', source:'health-connect'}]
  };
  const requestedUids = [];
  const db = {
    collection(collectionName) {
      assert.equal(collectionName, 'runnerPulseGarmin');
      return {
        doc(uid) {
          requestedUids.push(uid);
          return {
            collection(name) {
              assert.equal(name, 'healthConnectActivities');
              return {
                orderBy(field, direction) {
                  assert.equal(field, 'startTimeInSeconds');
                  assert.equal(direction, 'desc');
                  return {
                    limit(max) {
                      assert.equal(max, 300);
                      return {async get() {
                        return {docs:(accountActivities[uid] || []).map(row=>({
                          id:row.id,
                          data:()=>({source:row.source})
                        }))};
                      }};
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
  const context = {
    garminGoogleUser: async req => req.authUser || null,
    getFirestore: () => db,
    json: (res, code, body) => {
      res.code=code;
      res.body=body;
      return body;
    },
    console
  };
  vm.runInNewContext(`this.handleHealthList = async function(req,res){\n${listHealth}\n};`, context);
  return {run:context.handleHealthList,requestedUids};
}

test('Account Google diversi: HONOR/Health Connect restituisce solo le attività del proprietario', async () => {
  const {run, requestedUids}=mockHealthList();
  const first={};
  await run({url:'/api/health-connect/activities',method:'GET',authUser:{uid:'account-uno'}},first);
  assert.equal(first.code,200);
  assert.deepEqual(Array.from(first.body.activities, x=>x.id),['corsa-personale-1']);

  const second={};
  await run({url:'/api/health-connect/activities',method:'GET',authUser:{uid:'account-due'}},second);
  assert.equal(second.code,200);
  assert.deepEqual(Array.from(second.body.activities,x=>x.id),['corsa-personale-2']);
  assert.deepEqual(requestedUids,['account-uno','account-due']);
});

test('Senza login Google: elenco HONOR negato e nessuna lettura dal database',async()=>{
  const {run,requestedUids}=mockHealthList();
  const response={};
  await run({url:'/api/health-connect/activities',method:'GET',authUser:null},response);
  assert.equal(response.code,401);
  assert.deepEqual(requestedUids,[]);
});

test('Eliminazione/importazione Health Connect operano sulla cartella del token autenticato',()=>{
  for(const [label,source] of [['cancellazione',deleteHealth],['importazione',importHealth]]){
    assert.match(source,/const user=await garminGoogleUser\(req\)/,label);
    assert.match(source,/if\(!user\)return json\(res,401/,label);
    assert.match(source,/collection\('runnerPulseGarmin'\)\.doc\(user\.uid\)/,label);
    assert.doesNotMatch(source,/\.doc\(body\.(?:uid|userId|ownerUid)\)/,label);
  }
  assert.match(deleteHealth,/deletedBy:user\.uid/);
  assert.match(importHealth,/root\.collection\('deletedHealthConnectActivities'\)/);
});

test('Notifiche: iscrizione e controllo sono legati al UID Google verificato',()=>{
  for(const source of [pushSubscribe,pushStatus]){
    assert.match(source,/getAuth\(\)\.verifyIdToken\(match\[1\],true\)/);
    assert.match(source,/if\(!verifiedGoogleIdentity\(user\)\)/);
    assert.match(source,/collection\('runnerPulsePush'\)\.doc\(user\.uid\)/);
  }
});

test('Garmin: lo stato del dispositivo viene letto dall’account autenticato',()=>{
  assert.match(garminStatus,/const user=await garminGoogleUser\(req\)/);
  assert.match(garminStatus,/if\(!user\)return json\(res,401/);
  assert.match(garminStatus,/garminOAuthDoc\(user\.uid\)/);
});
