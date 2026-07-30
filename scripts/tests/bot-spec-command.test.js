require('tsx/cjs');
const assert = require('assert');
const { TelegrafBotService } = require('../../src/lib/telegram/bot.service');
const { INITIAL_TENDERS } = require('../../src/lib/mockData');

console.log('🧪 [Test Suite] Testing Telegram Bot /spec & /tz commands (Task 1)...');

// 1. Test /spec without arguments
const noArgResult = TelegrafBotService.handleBotCommand('/spec', [], INITIAL_TENDERS, undefined, 'chat_123');
assert.ok(noArgResult.includes('Пожалуйста, укажите ID лота'), '/spec without args must prompt user for lot ID or index');
console.log('  ✅ /spec without args returns helpful prompt');

// 2. Test /spec with valid externalId
const sampleTender = INITIAL_TENDERS[0]; // 987150-2026
const specResult = TelegrafBotService.handleBotCommand('/spec', [sampleTender.externalId], INITIAL_TENDERS, undefined, 'chat_123');
assert.ok(specResult.includes(`Резюме лота №${sampleTender.externalId}`), '/spec must include externalId header');
assert.ok(specResult.includes('Ключевые требования:'), '/spec must include key requirements header');
assert.ok(specResult.includes('Оценка риска участия:'), '/spec must include risk score header');
console.log('  ✅ /spec with valid externalId returns formatted AI summary HTML');

// 3. Test /tz alias with ordinal index (1)
const searchRes = TelegrafBotService.handleBotCommand('/search', ['серверы'], INITIAL_TENDERS, undefined, 'chat_123');
const tzIndexResult = TelegrafBotService.handleBotCommand('/tz', ['1'], INITIAL_TENDERS, undefined, 'chat_123');
assert.ok(tzIndexResult.includes('Резюме лота №'), '/tz with ordinal index 1 must return first tender summary');
console.log('  ✅ /tz 1 returns summary for first searched tender');

// 4. Test /spec with non-existent ID
const unknownResult = TelegrafBotService.handleBotCommand('/spec', ['NON_EXISTENT_ID_9999'], INITIAL_TENDERS, undefined, 'chat_123');
assert.ok(unknownResult.includes('не найден'), '/spec with invalid ID must return graceful error message');
console.log('  ✅ /spec with invalid ID returns graceful error message');

// 5. Test /help updated command list
const helpResult = TelegrafBotService.handleBotCommand('/help', [], INITIAL_TENDERS, undefined, 'chat_123');
assert.ok(helpResult.includes('/spec'), '/help must list /spec command');
console.log('  ✅ /help includes /spec documentation');

console.log('🎉 Telegram Bot /spec & /tz Command Test Suite completed successfully!');
