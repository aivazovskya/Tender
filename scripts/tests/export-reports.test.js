require('tsx/cjs');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

console.log('🧪 [Test Suite] Testing Excel & PDF Report Exports (Task / ТЗ Excel & PDF Exports)...\n');

// 1. Verify Cyrillic font file exists in public/fonts/
console.log('▶ 1. Verifying Cyrillic TTF Font File Availability...');
const fontPath = path.join(__dirname, '../../public/fonts/arial.ttf');
assert(fs.existsSync(fontPath), 'public/fonts/arial.ttf must exist to ensure cross-platform Cyrillic PDF rendering!');
console.log('  ✅ Cyrillic TTF font public/fonts/arial.ttf verified successfully!');

// 2. Test Subscription Guard Authorization Logic
console.log('\n▶ 2. Testing Subscription Guard Access Control (FREE/PRO vs TEAM/ENTERPRISE)...');
const { validateExportAccess } = require('../../src/lib/security/subscription-guard');

// Mock request helper
function mockReq(headersObj = {}) {
  return {
    headers: {
      get: (key) => headersObj[key.toLowerCase()] || headersObj[key] || null
    }
  };
}

(async () => {
  // Test Free Plan (Forbidden)
  const freeRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'FREE' }));
  assert.strictEqual(freeRes.authorized, false, 'Free plan must be rejected');
  assert.strictEqual(freeRes.response.status, 403, 'Free plan must return HTTP 403');
  console.log('  ✅ FREE subscription plan correctly denied access (HTTP 403 Forbidden)!');

  // Test Pro Plan (Forbidden)
  const proRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'PRO' }));
  assert.strictEqual(proRes.authorized, false, 'Pro plan must be rejected');
  assert.strictEqual(proRes.response.status, 403, 'Pro plan must return HTTP 403');
  console.log('  ✅ PRO subscription plan correctly denied access (HTTP 403 Forbidden)!');

  // Test Team Plan (Allowed)
  const teamRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'TEAM' }));
  assert.strictEqual(teamRes.authorized, true, 'Team plan must be authorized');
  console.log('  ✅ TEAM subscription plan correctly authorized!');

  // Test Enterprise Plan (Allowed)
  const entRes = await validateExportAccess(mockReq({ 'X-User-Plan': 'ENTERPRISE' }));
  assert.strictEqual(entRes.authorized, true, 'Enterprise plan must be authorized');
  console.log('  ✅ ENTERPRISE subscription plan correctly authorized!');

  // 3. Test Excel Export generation logic
  console.log('\n▶ 3. Testing Excel (.xlsx) Catalog Export Generation...');
  const { POST: tendersExportPOST } = require('../../src/app/api/export/tenders/route');
  
  const reqExcel = {
    headers: {
      get: (k) => k.toLowerCase() === 'x-user-plan' ? 'TEAM' : null
    },
    json: async () => ({ region: 'Все регионы' })
  };

  const excelResponse = await tendersExportPOST(reqExcel);
  assert.strictEqual(excelResponse.status, 200, 'Excel export endpoint must return 200 OK');
  assert.strictEqual(excelResponse.headers.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const excelArrayBuffer = await excelResponse.arrayBuffer();
  const excelBuffer = Buffer.from(excelArrayBuffer);
  const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
  assert(workbook.SheetNames.includes('Реестр тендеров'), 'Workbook must contain sheet "Реестр тендеров"');
  
  const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets['Реестр тендеров']);
  assert(sheetData.length > 0, 'Excel sheet must contain tender records');
  assert('Номер лота' in sheetData[0], 'Excel sheet must contain "Номер лота" header');
  assert('Сумма (KZT)' in sheetData[0], 'Excel sheet must contain "Сумма (KZT)" header');
  console.log(`  ✅ Excel catalog export generated successfully (${sheetData.length} rows parsed via SheetJS)!`);

  // 4. Test Kanban Excel Export generation logic
  console.log('\n▶ 4. Testing Kanban Excel (.xlsx) Export Generation...');
  const { POST: kanbanExportPOST } = require('../../src/app/api/export/kanban/route');

  const reqKanbanExcel = {
    headers: {
      get: (k) => k.toLowerCase() === 'x-user-plan' ? 'TEAM' : null
    },
    json: async () => ({})
  };

  const kanbanResponse = await kanbanExportPOST(reqKanbanExcel);
  assert.strictEqual(kanbanResponse.status, 200);
  assert.strictEqual(kanbanResponse.headers.get('Content-Type'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const kanbanArrayBuffer = await kanbanResponse.arrayBuffer();
  const kanbanWorkbook = XLSX.read(Buffer.from(kanbanArrayBuffer), { type: 'buffer' });
  assert(kanbanWorkbook.SheetNames.includes('Воронка Kanban'));
  
  const kanbanRows = XLSX.utils.sheet_to_json(kanbanWorkbook.Sheets['Воронка Kanban']);
  assert(kanbanRows.length > 0);
  assert('Этап воронки' in kanbanRows[0], 'Kanban export must include "Этап воронки"');
  assert('Приоритет' in kanbanRows[0], 'Kanban export must include "Приоритет"');
  assert('Ответственный' in kanbanRows[0], 'Kanban export must include "Ответственный"');
  assert('Заметки' in kanbanRows[0], 'Kanban export must include "Заметки"');
  console.log(`  ✅ Kanban Excel export generated successfully with stage, priority, assignee & notes (${kanbanRows.length} cards)!`);

  // 5. Test PDF Export generation logic
  console.log('\n▶ 5. Testing PDF Tender Report Generation...');
  const { GET: pdfExportGET } = require('../../src/app/api/export/tenders/[id]/pdf/route');

  const reqPDF = {
    headers: {
      get: (k) => k.toLowerCase() === 'x-user-plan' ? 'TEAM' : null
    }
  };

  const pdfResponse = await pdfExportGET(reqPDF, { params: { id: '777100-2026' } });
  assert.strictEqual(pdfResponse.status, 200, 'PDF export must return 200 OK');
  assert.strictEqual(pdfResponse.headers.get('Content-Type'), 'application/pdf');

  const pdfArrayBuffer = await pdfResponse.arrayBuffer();
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  assert(pdfBuffer.toString('utf8', 0, 5).startsWith('%PDF-'), 'PDF buffer header must start with %PDF-');
  assert(pdfBuffer.length > 2000, 'Generated PDF report must contain valid content');
  console.log(`  ✅ PDF Tender Report generated successfully (${pdfBuffer.length} bytes)!`);

  console.log('\n🎉 Excel & PDF Report Exports Test Suite completed successfully!');
})().catch(err => {
  console.error('💥 Test Execution Error:', err);
  process.exit(1);
});
