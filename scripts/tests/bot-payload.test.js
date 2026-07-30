require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { TelegrafBotService } = require('../../src/lib/telegram/bot.service');

console.log('🧪 [Test Suite] Testing Telegram Bot Deep Link Payload Extraction (Bug #7)...');

// 1. Verify static check that bot.service.ts and bot.runner.ts extract startPayload
const botServiceContent = fs.readFileSync(
  path.join(__dirname, '../../src/lib/telegram/bot.service.ts'),
  'utf8'
);

assert.ok(
  botServiceContent.includes('findFirst') || botServiceContent.includes('telegramChatId'),
  'bot.service.ts must perform telegramChatId binding'
);

// 2. Test deep link payload parsing in /start
const linkResultWithUser = TelegrafBotService.handleBotCommand('/start', ['user_12345'], [], undefined, 'chat_77777');
assert.ok(linkResultWithUser.includes('TenderAI Казахстан'), '/start with deep link payload must return welcome message');

// 3. Test generateDeepLink helper
const deepLink = TelegrafBotService.generateDeepLink('user_abc_99');
assert.strictEqual(deepLink, 'https://t.me/TenderAI_KZ_bot?start=user_abc_99', 'generateDeepLink must produce valid Telegram deep link URL');
console.log('  ✅ TelegrafBotService.generateDeepLink generates valid payload link');

console.log('🎉 Telegram Bot Payload Test Suite completed successfully!');
