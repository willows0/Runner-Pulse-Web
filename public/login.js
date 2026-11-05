// Runner Pulse — Firebase Authentication gate
// This module is intentionally independent from the existing app.js.
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
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else showError(e);
  } finally { button.disabled = false; }
});
getRedirectResult(auth).catch(showError);
onAuthStateChanged(auth, async user => {
  const allowed = Boolean(user && user.email?.toLowerCase() === ALLOWED_EMAIL && user.emailVerified);
  document.body.classList.toggle('rp-authenticated', allowed);
  if (user && !allowed) {
    showError('Questo account Google non è autorizzato a utilizzare Runner Pulse.');
    await signOut(auth);
  }
});
