// Runner Pulse: accesso Google e test Garmin protetto dal token Firebase.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBVTj9i4545kOmvx3H78_YliE54nPSFyLg',
  authDomain: 'runnerpulse.firebaseapp.com',
  projectId: 'runnerpulse',
  storageBucket: 'runnerpulse.firebasestorage.app',
  messagingSenderId: '602428716854',
  appId: '1:602428716854:web:1bd814e1ce8534fce6e597'
};
const ALLOWED_EMAIL = 'utrefiletti@gmail.com';
const auth = getAuth(initializeApp(firebaseConfig));
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const gate = document.createElement('section');
gate.id = 'rp-login-gate';
gate.innerHTML = `<div class="rp-login-card"><div class="rp-login-heart">♥</div><h1>Runner Pulse</h1><p>Accedi con il tuo account Google per continuare.</p><button id="rp-login-button" type="button">Accedi con Google</button><p id="rp-login-error" role="alert"></p></div>`;
document.body.prepend(gate);
const button = document.getElementById('rp-login-button');
const errorEl = document.getElementById('rp-login-error');
const showError = e => { errorEl.textContent = e?.message || String(e); };
button.addEventListener('click', async () => {
  button.disabled = true;
  errorEl.textContent = '';
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      try { await signInWithRedirect(auth, provider); } catch (redirectError) { showError(redirectError); }
    } else showError(e);
  } finally { button.disabled = false; }
});
getRedirectResult(auth).catch(showError);

// Pulsante visibile in Impostazioni; non espone alcuna credenziale Garmin.
const settings = document.querySelector('#settings');
if (settings) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h3>Verifica collegamento Garmin</h3><p class="muted">Testa la connessione usando il tuo accesso Google. Non vengono creati dati fittizi.</p><button type="button" id="rp-garmin-test" style="width:100%;padding:14px;border:0;border-radius:13px;background:#6c3ca1;color:#fff;font-weight:700">Verifica Garmin</button><p id="rp-garmin-result" class="note" role="status"></p>`;
  settings.append(card);
  const testButton = card.querySelector('#rp-garmin-test');
  const result = card.querySelector('#rp-garmin-result');
  testButton.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user || user.email?.toLowerCase() !== ALLOWED_EMAIL) { result.textContent = 'Accedi prima con il tuo account Google autorizzato.'; return; }
    testButton.disabled = true;
    result.textContent = 'Verifica in corso…';
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/garmin/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      result.textContent = data.message || `Risposta HTTP ${response.status}`;
    } catch (e) { result.textContent = 'Errore di rete o autenticazione: ' + (e?.message || String(e)); }
    finally { testButton.disabled = false; }
  });
}
onAuthStateChanged(auth, async user => {
  const allowed = Boolean(user && user.email?.toLowerCase() === ALLOWED_EMAIL && user.emailVerified);
  document.body.classList.toggle('rp-authenticated', allowed);
  if (user && !allowed) {
    showError('Questo account Google non è autorizzato a utilizzare Runner Pulse.');
    await signOut(auth);
  }
});
