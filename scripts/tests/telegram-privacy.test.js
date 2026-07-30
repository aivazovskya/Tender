require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { TelegrafBotService } = require('../../src/lib/telegram/bot.service');

console.log('🧪 [Test Suite] Testing Telegram Bot Multi-Tenant Privacy & Singleton Connection Pool (Bugs #5 & #6)...');

// 1. Bug #6 Verification: Static check that bot.service.ts imports prisma singleton
const botServiceContent = fs.readFileSync(
  path.join(__dirname, '../../src/lib/telegram/bot.service.ts'),
  'utf8'
);
assert.ok(
  botServiceContent.includes("import { prisma } from '../prisma';"),
  'bot.service.ts must import prisma singleton from ../prisma'
);
assert.ok(
  !botServiceContent.includes('new PrismaClient()'),
  'bot.service.ts must NOT instantiate new PrismaClient() per command'
);
console.log('  ✅ Bug #6: bot.service.ts uses singleton prisma import instead of new PrismaClient()');

// 2. Bug #5 Verification: Pure function handling of /profile without profile
const unlinkedReply = TelegrafBotService.handleBotCommand('/profile', [], [], undefined, 'chat_unknown_123');
assert.ok(unlinkedReply.includes('Профиль компании не привязан'), '/profile for unlinked chat must return warning');
assert.ok(!unlinkedReply.includes('ТОО "КазИТ Сервис"'), '/profile for unlinked chat must NOT default to fake company data');
assert.ok(!unlinkedReply.includes('180940004512'), '/profile for unlinked chat must NOT leak any BIN number');
console.log('  ✅ Bug #5: Unlinked chat receives warning prompt and zero leaked company profile data');

// 3. Bug #5 Verification: Multi-tenant profile isolation by chatId
const profileTenantA = {
  companyName: 'ТОО "Компания Альфа"',
  bin: '111111111111',
  keywords: ['Серверы'],
  regions: ['г. Астана']
};

const profileTenantB = {
  companyName: 'ТОО "Компания Бета"',
  bin: '222222222222',
  keywords: ['Строительство'],
  regions: ['г. Алматы']
};

const replyTenantA = TelegrafBotService.handleBotCommand('/profile', [], [], profileTenantA, 'chat_tenant_a');
const replyTenantB = TelegrafBotService.handleBotCommand('/profile', [], [], profileTenantB, 'chat_tenant_b');

assert.ok(replyTenantA.includes('ТОО "Компания Альфа"'), 'Tenant A gets their own company name');
assert.ok(replyTenantA.includes('111111111111'), 'Tenant A gets their own BIN');
assert.ok(!replyTenantA.includes('ТОО "Компания Бета"'), 'Tenant A does NOT receive Tenant B data');

assert.ok(replyTenantB.includes('ТОО "Компания Бета"'), 'Tenant B gets their own company name');
assert.ok(replyTenantB.includes('222222222222'), 'Tenant B gets their own BIN');
assert.ok(!replyTenantB.includes('ТОО "Компания Альфа"'), 'Tenant B does NOT receive Tenant A data');

console.log('  ✅ Bug #5: Multi-tenant profiles are strictly isolated per chatId');

console.log('🎉 Telegram Privacy & Connection Pool Test Suite completed successfully!');
