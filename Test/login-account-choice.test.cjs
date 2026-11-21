const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const webRoot = path.join(__dirname, '..', 'public');
const mobileScript = fs.readFileSync(path.join(webRoot, 'mobile-login.js'), 'utf8').replace(/^import .*;\s*\n/gm, '');
const mainScript = fs.readFileSync(path.join(webRoot, 'login.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function setupMobile(state, options = {}) {
 const storage = new Map();
 const button = { disabled: false, textContent: 'Accedi con Google', addEventListener(event, fn) { if (event === 'click') this.click = fn; } };
 const status = { textContent: '' };
 const calls = { signOut: 0, popup: [], approve: [], redirects: 0 };
 let authChanged;
 class Provider { setCustomParameters(params) { this.params = params; } }
 const ctx = {
  initializeApp: config => config,
  getAuth: () => ({ currentUser: options.cachedUser || null }),
  GoogleAuthProvider: Provider,
  getRedirectResult: async () => options.redirectResult || null,
  onAuthStateChanged: (_auth, fn) => { authChanged = fn; },
  signOut: async () => { calls.signOut++; },
  signInWithPopup: (_auth, provider) => {
   calls.popup.push(provider.params || null);
   return options.popupError ? Promise.reject(options.popupError) : Promise.resolve({ user: options.selectedUser || chosenUser });
  },
  URLSearchParams,
  location: { search: `?state=${encodeURIComponent(state)}`, href: '' },
  document: { getElementById: name => name === 'login' ? button : status },
  sessionStorage: {
   getItem: key => storage.has(key) ? storage.get(key) : null,
   setItem: (key, value) => storage.set(key, String(value)),
   removeItem: key => storage.delete(key),
  },
  fetch: async (url, opts) => {
   calls.approve.push({ url, body: JSON.parse(opts.body) });
   return { ok: true, json: async () => ({ success: true, code: 'test_auth_code' }) };
  },
  encodeURIComponent,
  console,
 };
 vm.runInNewContext(mobileScript, ctx, { filename: 'mobile-login.js' });
 return { ctx, calls, button, status, storage, onAuth: user => authChanged(user) };
}
const oldUser = { getIdToken: async () => 'old_account_token' };
const chosenUser = { getIdToken: async () => 'new_account_token' };

test('Android: dopo logout non approva l’account Google precedente', async () => {
 const r = setupMobile('choose_' + 'a'.repeat(43), { cachedUser: oldUser });
 r.onAuth(oldUser);
 await tick();
 assert.equal(r.calls.approve.length, 0);
 assert.equal(r.calls.signOut, 1);
 assert.equal(r.button.textContent, 'Scegli account Google');
 assert.equal(r.button.disabled, false);
});

test('Android: dopo logout usa popup con account picker e invia nuovo account al server', async () => {
 const r = setupMobile('choose_' + 'b'.repeat(43), { cachedUser: oldUser });
 await tick();
 r.button.click();
 assert.equal(r.calls.popup.length, 1);
 assert.equal(r.calls.popup[0].prompt, 'select_account');
 assert.equal(r.calls.approve.length, 0);
 await tick();
 assert.equal(r.calls.approve.length, 1);
 assert.equal(r.calls.approve[0].body.idToken, 'new_account_token');
 assert.match(r.ctx.location.href, /^runnerpulseauth:\/\/callback/);
 assert.equal(r.storage.has('runnerPulseMobileAuthState'), false);
});

test('Android: normale login può continuare con sessione Google persistente', async () => {
 const r = setupMobile('c'.repeat(43), { cachedUser: oldUser });
 r.onAuth(oldUser);
 await tick();
 assert.equal(r.calls.approve.length, 1);
 assert.equal(r.calls.approve[0].body.idToken, 'old_account_token');
 assert.equal(r.calls.signOut, 0);
 assert.equal(r.calls.popup.length, 0);
});

test('Android: senza logout il popup non impone di scegliere un account', async () => {
 const r = setupMobile('d'.repeat(43));
 r.button.click();
 await tick();
 assert.equal(r.calls.popup.length, 1);
 assert.equal(r.calls.popup[0], null);
 assert.match(r.ctx.location.href, /^runnerpulseauth:\/\/callback/);
});

test('Android: se Chrome blocca il popup compare istruzione e il pulsante si riabilita', async () => {
 const r = setupMobile('choose_' + 'e'.repeat(43), { popupError: {code:'auth/popup-blocked'} });
 await tick();
 r.button.click();
 await tick();
 assert.equal(r.calls.approve.length, 0);
 assert.equal(r.button.disabled, false);
 assert.match(r.status.textContent, /Apri in Chrome/);
});

test('Web: scelta account soltanto dopo logout esplicito', () => {
 const begin = mainScript.indexOf('const RP_CHOOSE_ACCOUNT_AFTER_LOGOUT =');
 const end = mainScript.indexOf('// Foto Google e saluto della Home:');
 assert.ok(begin >= 0 && end > begin);
 const records = new Map();
 const context = {
  localStorage: {
   getItem: k => records.get(k) || null,
   setItem: (k, v) => records.set(k, v),
   removeItem: k => records.delete(k),
  },
  GoogleAuthProvider: class { setCustomParameters(params) { this.params = params; } },
 };
 vm.runInNewContext(mainScript.slice(begin, end) + '\nthis.testFns={rpNeedsAccountChoice,rpSetAccountChoiceAfterLogout,rpGoogleProvider};', context);
 const fn = context.testFns;
 assert.equal(fn.rpNeedsAccountChoice(), false);
 assert.equal(fn.rpGoogleProvider().params, undefined);
 fn.rpSetAccountChoiceAfterLogout(true);
 assert.equal(fn.rpGoogleProvider().params.prompt, 'select_account');
 fn.rpSetAccountChoiceAfterLogout(false);
 assert.equal(fn.rpGoogleProvider().params, undefined);
 assert.match(mainScript, /rpSetAccountChoiceAfterLogout\(true\)/);
 assert.match(mainScript, /rpSetAccountChoiceAfterLogout\(false\)/);
});
