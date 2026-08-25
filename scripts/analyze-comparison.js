const ExcelJS = require('exceljs');

async function analyzeComparison() {
  const filePath = 'C:/Users/Nurbek Bereketuly/Downloads/кл антифриз (1).xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  console.log('=== HEADER ROWS 1-9 ===');
  for (let r = 1; r <= 9; r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      vals.push(`${cell.address}="${cell.value}"`);
    });
    console.log(`Row ${r}: ${vals.join(', ')}`);
  }

  console.log('\n=== SUPPLIER HEADER BLOCKS (Rows 10-14) ===');
  for (let r = 10; r <= 14; r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.address === cell.master.address) {
        vals.push(`${cell.address}="${cell.value}"`);
      }
    });
    console.log(`Row ${r}: ${vals.join(', ')}`);
  }

  console.log('\n=== TABLE HEADERS (Row 15) ===');
  const row15 = ws.getRow(15);
  row15.eachCell({ includeEmpty: false }, (cell, col) => {
    const colLetter = String.fromCharCode(64 + col > 90 ? [65, 64 + col - 26] : [64 + col]);
    console.log(`Col ${col} (${cell.address}): "${String(cell.value).replace(/\n/g, ' ')}"`);
  });

  console.log('\n=== SUMMARY & FOOTER ROWS (Row 36 to end) ===');
  for (let r = 36; r <= 50; r++) {
    const row = ws.getRow(r);
    const vals = [];
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.address === cell.master.address) {
        let v = cell.value;
        if (v && typeof v === 'object' && v.formula) v = `=${v.formula}`;
        vals.push(`${cell.address}="${v}"`);
      }
    });
    if (vals.length > 0) {
      console.log(`Row ${r}: ${vals.join(', ')}`);
    }
  }
}

analyzeComparison().catch(console.error);
