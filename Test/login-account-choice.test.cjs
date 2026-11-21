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
  const button = { disabled: false, textContent: '', addEventListener(event, fn) { if (event === 'click') this.click = fn; } };
  const status = { textContent: '' };
  const calls = { signOut: 0, redirect: [], approve: [] };
  let authChanged;
  class Provider {
    setCustomParameters(params) { this.params = params; }
  }
  const ctx = {
    initializeApp: config => config,
    getAuth: () => ({ currentUser: options.cachedUser || null }),
    GoogleAuthProvider: Provider,
    getRedirectResult: async () => options.redirectResult || null,
    onAuthStateChanged: (_auth, fn) => { authChanged = fn; },
    signOut: async () => { calls.signOut++; },
    signInWithRedirect: async (_auth, provider) => { calls.redirect.push(provider.params || null); },
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

test('Android: dopo logout il browser NON usa automaticamente account Google memorizzato', async () => {
  const r = setupMobile('choose_' + 'a'.repeat(43), { cachedUser: oldUser });
  r.onAuth(oldUser);
  await tick();
  assert.equal(r.calls.approve.length, 0);
  assert.equal(r.button.textContent, 'Scegli account Google');
});

test('Android: dopo logout il nuovo login richiede la scelta Google e usa il nuovo account', async () => {
  const r = setupMobile('choose_' + 'b'.repeat(43), { cachedUser: oldUser });
  await r.button.click();
  assert.equal(r.calls.signOut, 1);
  assert.equal(r.calls.redirect.length, 1);
  assert.equal(r.calls.redirect[0].prompt, 'select_account');
  r.onAuth(chosenUser);
  await tick();
  assert.equal(r.calls.approve.length, 1);
  assert.equal(r.calls.approve[0].body.idToken, 'new_account_token');
  assert.match(r.ctx.location.href, /^runnerpulseauth:\/\/callback/);
  assert.equal(r.storage.has('runnerPulseMobileChooserRedirect'), false);
});

test('Android: se non c’è stato logout, conserva l’accesso senza imporre selezione account', async () => {
  const r = setupMobile('c'.repeat(43), { cachedUser: oldUser });
  r.onAuth(oldUser);
  await tick();
  assert.equal(r.calls.approve.length, 1);
  assert.equal(r.calls.approve[0].body.idToken, 'old_account_token');
  assert.equal(r.calls.signOut, 0);
});

test('Web: il prompt select_account è applicato solo se il logout ha attivato il flag', () => {
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
  assert.equal(fn.rpNeedsAccountChoice(), true);
  assert.equal(fn.rpGoogleProvider().params.prompt, 'select_account');
  fn.rpSetAccountChoiceAfterLogout(false);
  assert.equal(fn.rpGoogleProvider().params, undefined);
  assert.match(mainScript, /rpSetAccountChoiceAfterLogout\(true\)/);
  assert.match(mainScript, /rpSetAccountChoiceAfterLogout\(false\)/);
});
