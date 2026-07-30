require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 [Test Suite] Testing Kanban Sync Integrity & State Rollback Protection (Bug #10)...');

// 1. Static check: Verify page.tsx validates response status and handles error rollbacks
const pageContent = fs.readFileSync(
  path.join(__dirname, '../../src/app/page.tsx'),
  'utf8'
);

assert.ok(
  pageContent.includes('setKanbanItems(previousItems)') || pageContent.includes('setKanbanItems(prev => prev.filter'),
  'page.tsx MUST contain rollback logic to restore previous kanban state on failure'
);

assert.ok(
  pageContent.includes("showToast(") && pageContent.includes("'error'"),
  'page.tsx MUST display error toasts when kanban server operations fail'
);

console.log('  ✅ page.tsx rollback logic & error toast notifications verified');

// 2. Static check: Verify kanban route returns HTTP 500 status on database failure
const kanbanRouteContent = fs.readFileSync(
  path.join(__dirname, '../../src/app/api/kanban/route.ts'),
  'utf8'
);

assert.ok(
  kanbanRouteContent.includes('{ status: 500 }'),
  'api/kanban/route.ts MUST return HTTP 500 status on DB error'
);

assert.ok(
  !kanbanRouteContent.includes("return NextResponse.json({ success: true, isFallback: true, cards: [] });"),
  'api/kanban/route.ts MUST NOT return false success: true on GET error'
);

console.log('  ✅ api/kanban/route.ts returns HTTP 500 status and success: false on failure');

console.log('🎉 Kanban Sync & Rollback Test Suite completed successfully!');
