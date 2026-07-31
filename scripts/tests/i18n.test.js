require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { translations } = require('../../src/lib/i18n/translations');
const { useTranslation } = require('../../src/lib/i18n/useTranslation');

console.log('🧪 Running i18n Dictionary & Component Localization Tests...\n');

// Test 1: Verify RU and KK have exact matching key structure recursively
function getObjectKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      keys = keys.concat(getObjectKeys(obj[key], fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys;
}

const ruKeys = getObjectKeys(translations.RU).sort();
const kkKeys = getObjectKeys(translations.KK).sort();

assert.deepStrictEqual(ruKeys, kkKeys, 'RU and KK translation keys must match exactly');
console.log(`✔ Key parity check passed (${ruKeys.length} keys verified in both RU and KK)!`);

// Test 2: Verify Kazakh translations are non-empty and not raw copy-pasted Russian strings
let translatedCount = 0;
for (const keyPath of ruKeys) {
  const ruVal = keyPath.split('.').reduce((acc, k) => acc[k], translations.RU);
  const kkVal = keyPath.split('.').reduce((acc, k) => acc[k], translations.KK);

  assert(typeof kkVal === 'string' && kkVal.trim().length > 0, `Value at ${keyPath} in KK must not be empty`);

  // Ignore numbers, proper nouns, URLs, brand names, and loanwords
  const isProperNounOrBrand = /^(Каталог|Воронка|goszakup|portal\.sk\.kz|Telegram Bot|Pro \(29 900 ₸\)|TenderAI|API|REST API|Audit Trail|RAG-Чат|SLA|KZT|₸)$/i.test(ruVal.trim());
  
  if (!isProperNounOrBrand && ruVal.length > 3) {
    assert.notStrictEqual(ruVal, kkVal, `Key "${keyPath}" in KK must be translated into Kazakh, not identical to RU ("${ruVal}")`);
    translatedCount++;
  }
}

console.log(`✔ Translation quality check passed (${translatedCount} strings verified as distinct Kazakh translations)!`);

// Test 3: Verify useTranslation fallback behavior
assert.strictEqual(useTranslation('RU'), translations.RU);
assert.strictEqual(useTranslation('KK'), translations.KK);
// @ts-ignore
assert.strictEqual(useTranslation('INVALID'), translations.RU);
console.log('✔ useTranslation hook fallback behavior verified!');

// Test 4: Acceptance Criteria Check - Search for copy-pasted ternaries like `language === 'RU' ? 'Text' : 'Text'` in components
console.log('▶ Checking for duplicate copy-paste ternaries in src/components & src/app...');
const filesToScan = [];
function findSrcFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findSrcFiles(fullPath);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      filesToScan.push(fullPath);
    }
  }
}
findSrcFiles(path.join(process.cwd(), 'src'));

let duplicateTernaryCount = 0;
const duplicateTernaryRegex = /language\s*===\s*['"]RU['"]\s*\?\s*['"]([^'"]+)['"]\s*:\s*['"]\1['"]/g;

for (const file of filesToScan) {
  const content = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = duplicateTernaryRegex.exec(content)) !== null) {
    duplicateTernaryCount++;
    console.error(`❌ Duplicate ternary found in ${path.relative(process.cwd(), file)}: "${match[0]}"`);
  }
}

assert.strictEqual(duplicateTernaryCount, 0, 'No duplicate copy-paste ternaries should exist in codebase');
console.log('✔ Zero duplicate copy-paste ternaries found across entire src/ codebase!');

console.log('\n🎉 All i18n translation tests passed successfully!');
