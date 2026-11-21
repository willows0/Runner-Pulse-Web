'use strict';
// Questo test controlla che il modello di regole proposto mantenga i confini
// intenzionali. NON sostituisce i test Firebase Emulator né verifica le regole live.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rules = fs.readFileSync(path.join(__dirname, '..', 'security', 'firestore-audit', 'firestore.rules'), 'utf8');
test('proposta Firestore: proprietà esplicita dell’UID e deny-all', () => {
  assert.match(rules, /request\.auth\.uid\s*==\s*uid/);
  assert.match(rules, /match \/users\/\{uid\}\/trainingPlans\/\{planId\}/);
  assert.match(rules, /planId\s*==\s*'current'/);
  assert.match(rules, /allow list:\s*if false/);
  assert.match(rules, /allow delete:\s*if false/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write:\s*if false/);
  assert.doesNotMatch(rules, /allow\s+(?:read|write|read,\s*write):\s*if\s+true/);
});
