import test, { after, before } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';

const projectId = 'demo-runner-pulse-firestore-audit';
let env;
const data = (uid='alice') => ({sessions: [{kind: 'corsa', duration: 60}], ownerUid: uid, updatedAt: '2026-11-21T15:00:00.000Z'});
const plan = (context, uid, name='current') => doc(context.firestore(), 'users', uid, 'trainingPlans', name);

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1', port: 8080,
      rules: readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8')
    }
  });
});
after(async () => { await env?.cleanup(); });

test('utente anonimo: non può leggere o scrivere un piano', async () => {
  const a = env.unauthenticatedContext();
  await assertFails(getDoc(plan(a, 'alice')));
  await assertFails(setDoc(plan(a, 'alice'), data()));
});

test('utente autenticato: può creare e leggere soltanto il proprio piano current', async () => {
  const alice = env.authenticatedContext('alice');
  await assertSucceeds(setDoc(plan(alice,'alice'), data()));
  await assertSucceeds(getDoc(plan(alice,'alice')));
  await assertFails(getDoc(plan(alice, 'alice', 'draft')));
  await assertFails(setDoc(plan(alice, 'alice','draft'), data()));
});

test('isola due account: non si può leggere, scrivere o cancellare il piano altrui', async () => {
  const alice = env.authenticatedContext('alice');
  await assertFails(getDoc(plan(alice, 'bob')));
  await assertFails(setDoc(plan(alice, 'bob'), data('bob')));
  await assertFails(deleteDoc(plan(alice, 'bob')));
});

test('nega liste di piani anche al proprietario', async () => {
  const alice = env.authenticatedContext('alice');
  await assertFails(getDocs(collection(alice.firestore(), 'users','alice','trainingPlans')));
});

test('nega delete del proprio piano', async () => {
  const alice = env.authenticatedContext('alice');
  await assertFails(deleteDoc(plan(alice, 'alice')));
});

test('nega documenti privi di ownerUid corretto o con campi estranei', async () => {
  const alice = env.authenticatedContext('alice');
  await assertFails(setDoc(plan(alice, 'alice'), data('bob')));
  await assertFails(setDoc(plan(alice, 'alice'), {...data(), admin: true}));
  await assertFails(setDoc(plan(alice, 'alice'), {...data(), sessions: Array(81).fill({})}));
  await assertFails(setDoc(plan(alice, 'alice'), {...data(), updatedAt: 1234}));
  await assertFails(setDoc(plan(alice, 'alice'), {sessions: []}));
});

test('nega accesso client diretto ai dati salute, notifiche e token OAuth', async () => {
  const alice = env.authenticatedContext('alice');
  const db = alice.firestore();
  for (const path of [
    ['runnerPulseGarmin','alice','activities','run1'],
    ['runnerPulseGarmin','bob','activities','run1'],
    ['runnerPulseGarminHealth','alice','dailies','2026-11-21'],
    ['runnerPulsePush','alice','devices','device1'],
    ['runnerPulseGarminOAuth','alice']
  ]) {
    await assertFails(getDoc(doc(db, ...path)));
  }
  await assertFails(setDoc(doc(db,'runnerPulsePush','alice'), {pushEnabled:true}));
});
