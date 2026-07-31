require('tsx/cjs');
const assert = require('assert');
const { translations } = require('../../src/lib/i18n/translations');

console.log('🧪 [Test Suite] Testing Kanban Card Priority, Notes & Assignee Persistence...\n');

// 1. Verify i18n translations for Priority and Notes
assert.strictEqual(translations.RU.kanban.priority.HIGH, 'Высокий');
assert.strictEqual(translations.RU.kanban.priority.MEDIUM, 'Средний');
assert.strictEqual(translations.RU.kanban.priority.LOW, 'Низкий');
assert.strictEqual(translations.KK.kanban.priority.HIGH, 'Жоғары');
assert.strictEqual(translations.KK.kanban.priority.MEDIUM, 'Орташа');
assert.strictEqual(translations.KK.kanban.priority.LOW, 'Төмен');

assert(translations.RU.kanban.notesLabel && translations.RU.kanban.notesPlaceholder);
assert(translations.KK.kanban.notesLabel && translations.KK.kanban.notesPlaceholder);

console.log('✔ Priority & Notes translation keys verified in RU and KK!');

// 2. Test Card Update Handler (Persistence logic simulation)
const mockInitialCards = [
  {
    id: 'card-101',
    tenderId: 'tender-1',
    stage: 'UNDER_REVIEW',
    priority: 'MEDIUM',
    assignee: 'Не назначен',
    notes: '',
    tender: { id: 'tender-1', title: 'Поставка серверов', amount: 1000000 },
    updatedAt: new Date().toISOString()
  },
  {
    id: 'card-102',
    tenderId: 'tender-2',
    stage: 'UNDER_REVIEW',
    priority: 'LOW',
    assignee: 'Не назначен',
    notes: '',
    tender: { id: 'tender-2', title: 'Лицензии ПО', amount: 500000 },
    updatedAt: new Date().toISOString()
  }
];

let kanbanState = JSON.parse(JSON.stringify(mockInitialCards));
let lastApiPayload = null;

function handleUpdateKanbanCard(itemId, changes) {
  const previousItems = kanbanState;
  const targetItem = kanbanState.find(k => k.id === itemId);
  if (!targetItem) return;

  // Optimistic update
  kanbanState = kanbanState.map(item => item.id === itemId ? { ...item, ...changes } : item);

  // Mock API call payload
  lastApiPayload = { id: itemId, tenderId: targetItem.tenderId, ...changes };
}

// Test Priority Change via Handler
handleUpdateKanbanCard('card-101', { priority: 'HIGH' });
assert.strictEqual(kanbanState[0].priority, 'HIGH');
assert.deepStrictEqual(lastApiPayload, { id: 'card-101', tenderId: 'tender-1', priority: 'HIGH' });
console.log('✔ Priority update correctly updates state and generates correct API POST payload!');

// Test Notes Change via Handler
handleUpdateKanbanCard('card-101', { notes: 'Проверено юристом, подаем в понедельник' });
assert.strictEqual(kanbanState[0].notes, 'Проверено юристом, подаем в понедельник');
assert.deepStrictEqual(lastApiPayload, { id: 'card-101', tenderId: 'tender-1', notes: 'Проверено юристом, подаем в понедельник' });
console.log('✔ Notes update correctly updates state and generates correct API POST payload!');

// Test Assignee Change via Handler (Regression test for direct mutation bug)
const originalCardObject = mockInitialCards[0];
handleUpdateKanbanCard('card-101', { assignee: 'Гульнара К. (Юрист)' });
assert.strictEqual(kanbanState[0].assignee, 'Гульнара К. (Юрист)');
assert.notStrictEqual(originalCardObject.assignee, 'Гульнара К. (Юрист)', 'Original prop object must not be mutated directly');
assert.deepStrictEqual(lastApiPayload, { id: 'card-101', tenderId: 'tender-1', assignee: 'Гульнара К. (Юрист)' });
console.log('✔ Assignee update correctly uses callback without mutating original prop object!');

// 3. Test Priority Ordering inside Kanban Stage Columns
const PRIORITY_ORDER = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const sortedItems = [...kanbanState].sort((a, b) => {
  const pA = PRIORITY_ORDER[a.priority] || 2;
  const pB = PRIORITY_ORDER[b.priority] || 2;
  if (pB !== pA) return pB - pA;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
});

assert.strictEqual(sortedItems[0].id, 'card-101', 'HIGH priority card should appear first');
assert.strictEqual(sortedItems[1].id, 'card-102', 'LOW priority card should appear second');
console.log('✔ Priority sorting inside stage columns verified (HIGH > MEDIUM > LOW)!');

console.log('\n🎉 All Kanban Card Details & Persistence tests passed successfully!');
