const ExcelJS = require('exceljs');
const path = require('path');

async function inspectOriginal() {
  const filePath = 'C:/Users/Nurbek Bereketuly/Downloads/кл антифриз (1).xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('Worksheets:', workbook.worksheets.map(ws => ws.name));

  const sheet = workbook.worksheets[0];
  console.log(`Sheet Name: "${sheet.name}"`);
  console.log(`Row count: ${sheet.rowCount}, Column count: ${sheet.columnCount}`);

  console.log('\n--- MERGES ---');
  if (sheet.hasMerges) {
    console.log(sheet.model.merges);
  }

  console.log('\n--- COLUMNS INFO (Widths) ---');
  sheet.columns.forEach((col, idx) => {
    console.log(`Col ${idx + 1} (${String.fromCharCode(65 + idx)}): width=${col.width}`);
  });

  console.log('\n--- ROW BY ROW DETAILS (Rows 1 to 40) ---');
  for (let r = 1; r <= Math.min(sheet.rowCount, 45); r++) {
    const row = sheet.getRow(r);
    const cells = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colLetter = String.fromCharCode(64 + colNumber);
      let val = cell.value;
      if (val && typeof val === 'object') {
        if (val.formula) val = `FORMULA[${val.formula}] (res=${val.result})`;
        else if (val.richText) val = `RICHTEXT[${val.richText.map(t => t.text).join('')}]`;
        else val = JSON.stringify(val);
      }
      const font = cell.font ? `font:[${cell.font.name || ''},${cell.font.size || ''}${cell.font.bold ? ',bold' : ''}${cell.font.color?.argb ? ',c:' + cell.font.color.argb : ''}]` : '';
      const fill = cell.fill?.type === 'pattern' ? `fill:[${cell.fill.pattern},fg=${cell.fill.fgColor?.argb || ''}]` : '';
      const align = cell.alignment ? `align:[h=${cell.alignment.horizontal || ''},v=${cell.alignment.vertical || ''},wrap=${cell.alignment.wrapText ? 1 : 0}]` : '';
      const numFmt = cell.numFmt ? `numFmt:[${cell.numFmt}]` : '';
      
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        cells.push(`${colLetter}${r}=${val} {${[font, fill, align, numFmt].filter(Boolean).join(' ')}}`);
      }
    });
    if (cells.length > 0) {
      console.log(`Row ${r} (h=${row.height || 'def'}): ${cells.join(' | ')}`);
    } else {
      console.log(`Row ${r}: <empty>`);
    }
  }
}

inspectOriginal().catch(console.error);
