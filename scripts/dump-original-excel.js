const ExcelJS = require('exceljs');
const fs = require('fs');

async function fullDump() {
  const filePath = 'C:/Users/Nurbek Bereketuly/Downloads/кл антифриз (1).xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];

  let out = `Sheet: ${sheet.name}, rows: ${sheet.rowCount}, cols: ${sheet.columnCount}\n\n`;

  out += '=== MERGED RANGES ===\n';
  sheet.model.merges?.forEach(m => {
    out += `${m}\n`;
  });

  out += '\n=== ROW BY ROW ===\n';
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const rowCells = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      let val = cell.value;
      if (val && typeof val === 'object') {
        if (val.formula) val = `=${val.formula} (res=${val.result})`;
        else if (val.richText) val = val.richText.map(t => t.text).join('');
        else val = JSON.stringify(val);
      }
      rowCells.push(`[${cell.address}]: "${val}"`);
    });
    if (rowCells.length > 0) {
      out += `Row ${r.toString().padStart(2, ' ')} (h=${row.height || 'auto'}): ${rowCells.join(' | ')}\n`;
    }
  }

  fs.writeFileSync('scripts/dump-original-excel.txt', out, 'utf8');
  console.log('Dump written to scripts/dump-original-excel.txt');
}

fullDump().catch(console.error);
