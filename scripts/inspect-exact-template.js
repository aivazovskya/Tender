const ExcelJS = require('exceljs');

async function inspectExactTemplate() {
  const filePath = 'C:/Users/Nurbek Bereketuly/Downloads/кл антифриз (1).xlsx';
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  console.log('=== COLUMN WIDTHS ===');
  for (let c = 1; c <= 40; c++) {
    const col = ws.getColumn(c);
    const colLetter = ws.getCell(15, c).address.replace(/[0-9]/g, '');
    console.log(`Col ${c} (${colLetter}): width=${col.width}`);
  }

  console.log('\n=== ROWS 10-15 (HEADER OF TABLE) ===');
  for (let r = 10; r <= 15; r++) {
    const row = ws.getRow(r);
    console.log(`\n--- Row ${r} (h=${row.height}) ---`);
    for (let c = 1; c <= 30; c++) {
      const cell = ws.getCell(r, c);
      if (cell.address === cell.master.address) {
        console.log(`  ${cell.address}: val="${String(cell.value).replace(/\n/g, '\\n')}" | font=${cell.font?.name} ${cell.font?.size}pt bold=${cell.font?.bold} | fill=${cell.fill?.fgColor?.argb} | align=${cell.alignment?.horizontal}/${cell.alignment?.vertical}`);
      }
    }
  }

  console.log('\n=== ROWS 36-48 (FOOTER / SUMMARY) ===');
  for (let r = 36; r <= 48; r++) {
    const row = ws.getRow(r);
    console.log(`\n--- Row ${r} (h=${row.height}) ---`);
    for (let c = 1; c <= 30; c++) {
      const cell = ws.getCell(r, c);
      if (cell.address === cell.master.address) {
        let v = cell.value;
        if (v && typeof v === 'object' && v.formula) v = `=${v.formula}`;
        console.log(`  ${cell.address}: val="${String(v).replace(/\n/g, '\\n')}" | font=${cell.font?.name} ${cell.font?.size}pt bold=${cell.font?.bold} | fill=${cell.fill?.fgColor?.argb}`);
      }
    }
  }
}

inspectExactTemplate().catch(console.error);
