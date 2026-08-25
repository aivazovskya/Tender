import ExcelJS from 'exceljs';
import { TenderSupplierComparisonData } from '../types/tender';
import { SupplierComparisonService } from './supplier-comparison.service';

function getColLetter(colIdx: number): string {
  let letter = '';
  while (colIdx > 0) {
    const mod = (colIdx - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    colIdx = Math.floor((colIdx - mod) / 26);
  }
  return letter;
}

export class SupplierComparisonExcelService {
  /**
   * Generates a fully styled .xlsx buffer matching the corporate template (кл_антифриз__1_.xlsx)
   */
  static async generateExcelWorkbook(comparisonData: TenderSupplierComparisonData): Promise<Buffer> {
    const { totalBudgetKzt0, totalBudgetKzt12, summaries } = SupplierComparisonService.computeSummaries(comparisonData);
    const exchangeRate = Number(comparisonData.exchangeRate) || 5.65;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TenderAI Platform';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Конкурентный лист', {
      views: [{ showGridLines: true }]
    });

    const suppliers = comparisonData.suppliers && comparisonData.suppliers.length > 0
      ? comparisonData.suppliers
      : [{ id: 'supp-1', name: 'Поставщик 1', order: 0 }];

    const lineItems = comparisonData.lineItems && comparisonData.lineItems.length > 0
      ? comparisonData.lineItems
      : [];

    // Column structure:
    // Base cols:
    // Col 1 (A): №
    // Col 2 (B): Код МПЗ из "Ellipse"
    // Col 3 (C): Наименование товара, работ, услуг
    // Col 4 (D): ед.изм.
    // Col 5 (E): кол-во
    // Budget cols:
    // Col 6 (F): Цена за ед. в тенге, с НДС 0 %
    // Col 7 (G): Сумма в тенге, с НДС 0 %
    // Col 8 (H): Цена за ед. в тенге, с НДС 12 %
    // Col 9 (I): Сумма в тенге, с НДС 12 %
    // Each Supplier (7 columns):
    // 1. Предлагаемое наименование
    // 2. Цена за ед. в рублях, с НДС 0 %
    // 3. Сумма в рублях, с НДС 0 %
    // 4. Цена за ед. в тенге, с НДС 0 %
    // 5. Сумма в тенге, с НДС 0 %
    // 6. Цена за ед. в тенге, с НДС 12 %
    // 7. Сумма в тенге, с НДС 12 %
    // Profit & Margin columns (5 columns):
    // 1. Доход (KZT)
    // 2. Доход БЕЗ кредита (KZT)
    // 3. Доход с вычетом кредита (KZT)
    // 4. НДС 12% (KZT)
    // 5. Рентабельность (%)

    const baseColCount = 5;
    const budgetColCount = 4;
    const colsPerSupplier = 7;
    const profitColCount = 5;

    const totalCols = baseColCount + budgetColCount + (suppliers.length * colsPerSupplier) + profitColCount;

    // Set Column Widths
    sheet.getColumn(1).width = 6;    // A: №
    sheet.getColumn(2).width = 16;   // B: Код МПЗ
    sheet.getColumn(3).width = 40;   // C: Наименование
    sheet.getColumn(4).width = 10;   // D: Ед. изм.
    sheet.getColumn(5).width = 12;   // E: Кол-во
    sheet.getColumn(6).width = 16;   // F: Цена 0%
    sheet.getColumn(7).width = 18;   // G: Сумма 0%
    sheet.getColumn(8).width = 16;   // H: Цена 12%
    sheet.getColumn(9).width = 18;   // I: Сумма 12%

    suppliers.forEach((_, idx) => {
      const sCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      sheet.getColumn(sCol).width = 30;     // Предлагаемое наименование
      sheet.getColumn(sCol + 1).width = 15; // Цена RUB 0%
      sheet.getColumn(sCol + 2).width = 16; // Сумма RUB 0%
      sheet.getColumn(sCol + 3).width = 15; // Цена KZT 0%
      sheet.getColumn(sCol + 4).width = 16; // Сумма KZT 0%
      sheet.getColumn(sCol + 5).width = 15; // Цена KZT 12%
      sheet.getColumn(sCol + 6).width = 16; // Сумма KZT 12%
    });

    const profitStartCol = baseColCount + budgetColCount + (suppliers.length * colsPerSupplier) + 1;
    sheet.getColumn(profitStartCol).width = 18;     // Доход
    sheet.getColumn(profitStartCol + 1).width = 18; // Доход БЕЗ кредита
    sheet.getColumn(profitStartCol + 2).width = 20; // Доход с вычетом кредита
    sheet.getColumn(profitStartCol + 3).width = 14; // НДС 12%
    sheet.getColumn(profitStartCol + 4).width = 16; // Рентабельность

    // Common Borders
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };

    const mediumBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      right: { style: 'medium', color: { argb: 'FF000000' } }
    };

    // 1. HEADER SECTION (Rows 2–9)
    // Row 2: "Конкурентный лист"
    sheet.mergeCells(2, 1, 2, totalCols);
    const r2Cell = sheet.getCell('A2');
    r2Cell.value = 'Конкурентный лист';
    r2Cell.font = { name: 'Times New Roman', size: 14, bold: true };
    r2Cell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // Row 3: "по выбору поставщика"
    sheet.mergeCells(3, 1, 3, totalCols);
    const r3Cell = sheet.getCell('A3');
    r3Cell.value = 'по выбору поставщика';
    r3Cell.font = { name: 'Times New Roman', size: 14, bold: true };
    r3Cell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(3).height = 20;

    // Row 4: "ТЕНДЕР НОМЕР ..."
    sheet.mergeCells(4, 3, 4, 10);
    const r4Cell = sheet.getCell('C4');
    r4Cell.value = `ТЕНДЕР НОМЕР ${comparisonData.tenderNumber || ''}`;
    r4Cell.font = { name: 'Times New Roman', size: 12, bold: true };
    sheet.getRow(4).height = 18;

    // Row 5: "Торговая площадка: "
    sheet.mergeCells(5, 1, 5, 10);
    const r5Cell = sheet.getCell('A5');
    r5Cell.value = `Торговая площадка:  ${comparisonData.tradingPlatform || 'goszakup.gov.kz'}`;
    r5Cell.font = { name: 'Times New Roman', size: 12, bold: true };
    sheet.getRow(5).height = 18;

    // Row 6: "Заказчик: "
    sheet.mergeCells(6, 1, 6, 15);
    const r6Cell = sheet.getCell('A6');
    r6Cell.value = `Заказчик:  ${comparisonData.customerName || ''}${comparisonData.customerBin ? ` (БИН: ${comparisonData.customerBin})` : ''}`;
    r6Cell.font = { name: 'Times New Roman', size: 12, bold: true };
    sheet.getRow(6).height = 18;

    // Row 7: "Начало: "
    sheet.mergeCells(7, 1, 7, 10);
    const r7Cell = sheet.getCell('A7');
    const pubDateStr = comparisonData.publishDate ? new Date(comparisonData.publishDate).toLocaleDateString('ru-RU') : '';
    r7Cell.value = `Начало:  ${pubDateStr ? pubDateStr + 'г.' : ''}`;
    r7Cell.font = { name: 'Times New Roman', size: 12, bold: true };
    sheet.getRow(7).height = 18;

    // Row 8: "Вскрытие: "
    sheet.mergeCells(8, 1, 8, 10);
    const r8Cell = sheet.getCell('A8');
    const deadDateStr = comparisonData.deadlineDate ? new Date(comparisonData.deadlineDate).toLocaleDateString('ru-RU') : '';
    r8Cell.value = `Вскрытие:  ${deadDateStr ? deadDateStr + 'г.' : ''}`;
    r8Cell.font = { name: 'Times New Roman', size: 12, bold: true };
    sheet.getRow(8).height = 18;

    // Row 9: "Курс валют Нац.Банка РК: 1 рос. рубль = X,XX тенге"
    sheet.mergeCells(9, 1, 9, 10);
    const r9Cell = sheet.getCell('A9');
    r9Cell.value = `Курс валют Нац.Банка РК: 1 рос. рубль = ${exchangeRate.toFixed(2).replace('.', ',')} тенге`;
    r9Cell.font = { name: 'Times New Roman', size: 12, bold: true };

    const lastColLetter = getColLetter(totalCols);
    const r9DateCell = sheet.getCell(`${lastColLetter}9`);
    r9DateCell.value = new Date().toLocaleDateString('ru-RU') + 'г.';
    r9DateCell.font = { name: 'Times New Roman', size: 12, bold: true };
    r9DateCell.alignment = { horizontal: 'right' };
    sheet.getRow(9).height = 18;

    // 2. SUPPLIERS REQUISITES & TABLE HEADERS (Rows 10–15)
    // Row 10: Top Headers
    sheet.getRow(10).height = 24;
    const a10 = sheet.getCell('A10');
    a10.value = '№';
    a10.font = { name: 'Times New Roman', size: 14, bold: true };
    a10.alignment = { horizontal: 'center', vertical: 'middle' };
    a10.border = thinBorder;

    // Merge B10:E10: "Наименование"
    sheet.mergeCells('B10:E10');
    const b10 = sheet.getCell('B10');
    b10.value = 'Наименование';
    b10.font = { name: 'Times New Roman', size: 14, bold: true };
    b10.alignment = { horizontal: 'center', vertical: 'middle' };
    for (let c = 2; c <= 5; c++) sheet.getCell(10, c).border = thinBorder;

    // Merge F10:I13 (or F10:I14): "Данные по бюджету (Перечень закупок/ Инвест.программа)"
    sheet.mergeCells('F10:I13');
    const f10 = sheet.getCell('F10');
    f10.value = 'Данные по бюджету (Перечень закупок/ Инвест.программа)';
    f10.font = { name: 'Times New Roman', size: 12, bold: true };
    f10.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    f10.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCFF' } }; // Light purple
    for (let r = 10; r <= 13; r++) {
      for (let c = 6; c <= 9; c++) {
        sheet.getCell(r, c).border = thinBorder;
        sheet.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCFF' } };
      }
    }

    // Rows 11-14: Labels in B11..B14
    const reqLabels = [
      { num: '1', row: 11, label: 'Наименование поставщика: ' },
      { num: '2', row: 12, label: 'Адрес:' },
      { num: '3', row: 13, label: 'Е-mail:' },
      { num: '4', row: 14, label: 'Телефон:' }
    ];

    reqLabels.forEach(item => {
      const aCell = sheet.getCell(`A${item.row}`);
      aCell.value = item.num;
      aCell.font = { name: 'Times New Roman', size: 14, bold: true };
      aCell.alignment = { horizontal: 'center', vertical: 'middle' };
      aCell.border = thinBorder;

      sheet.mergeCells(`B${item.row}:E${item.row}`);
      const bCell = sheet.getCell(`B${item.row}`);
      bCell.value = item.label;
      bCell.font = { name: 'Times New Roman', size: 12, bold: true };
      bCell.alignment = { horizontal: 'left', vertical: 'middle' };
      for (let c = 2; c <= 5; c++) sheet.getCell(item.row, c).border = thinBorder;
    });

    // Per-Supplier Columns (Rows 10–14)
    suppliers.forEach((s, idx) => {
      const startCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      const endCol = startCol + colsPerSupplier - 1;
      const isWinner = s.isSelected || (!comparisonData.selectedSupplierId && summaries[idx]?.isBestPrice);
      const suppBgColor = isWinner ? 'FFCCFFCC' : 'FFFFCC99'; // Winner: light green, others: light beige/orange

      // Row 10: "Поставщик № X"
      sheet.mergeCells(10, startCol, 10, endCol);
      const s10Cell = sheet.getCell(10, startCol);
      s10Cell.value = `Поставщик № ${idx + 1}${isWinner ? '  ★ [ВЫБРАННЫЙ ПОБЕДИТЕЛЬ]' : ''}`;
      s10Cell.font = { name: 'Times New Roman', size: 14, bold: true };
      s10Cell.alignment = { horizontal: 'center', vertical: 'middle' };
      s10Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: suppBgColor } };

      // Row 11: Supplier Name
      sheet.mergeCells(11, startCol, 11, endCol);
      const s11Cell = sheet.getCell(11, startCol);
      s11Cell.value = s.name;
      s11Cell.font = { name: 'Times New Roman', size: 12, bold: true };
      s11Cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      s11Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: suppBgColor } };

      // Row 12: Address
      sheet.mergeCells(12, startCol, 12, endCol);
      const s12Cell = sheet.getCell(12, startCol);
      s12Cell.value = s.address || '—';
      s12Cell.font = { name: 'Times New Roman', size: 11 };
      s12Cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      s12Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: suppBgColor } };

      // Row 13: Email
      sheet.mergeCells(13, startCol, 13, endCol);
      const s13Cell = sheet.getCell(13, startCol);
      s13Cell.value = s.email || '—';
      s13Cell.font = { name: 'Times New Roman', size: 11 };
      s13Cell.alignment = { horizontal: 'center', vertical: 'middle' };
      s13Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: suppBgColor } };

      // Row 14: Phone
      sheet.mergeCells(14, startCol, 14, endCol);
      const s14Cell = sheet.getCell(14, startCol);
      s14Cell.value = s.phone || '—';
      s14Cell.font = { name: 'Times New Roman', size: 11 };
      s14Cell.alignment = { horizontal: 'center', vertical: 'middle' };
      s14Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: suppBgColor } };

      for (let r = 10; r <= 14; r++) {
        for (let c = startCol; c <= endCol; c++) {
          sheet.getCell(r, c).border = thinBorder;
        }
      }
    });

    // Profit & Margin Header Columns (Rows 10–14)
    const p1Col = profitStartCol;
    const profitHeaders = [
      { col: p1Col, title: 'Доход\n(Маржа)', width: 18 },
      { col: p1Col + 1, title: 'Доход\nБЕЗ кредита', width: 18 },
      { col: p1Col + 2, title: `Доход\nс вычетом кредита\n(${comparisonData.creditDays || 75} дн.)`, width: 20 },
      { col: p1Col + 3, title: 'НДС 12%\n(тенге)', width: 14 },
      { col: p1Col + 4, title: 'Рентабельность\n(%)', width: 16 }
    ];

    profitHeaders.forEach(ph => {
      sheet.mergeCells(10, ph.col, 14, ph.col);
      const pCell = sheet.getCell(10, ph.col);
      pCell.value = ph.title;
      pCell.font = { name: 'Times New Roman', size: 12, bold: true };
      pCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      pCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } }; // Light blue

      for (let r = 10; r <= 14; r++) {
        sheet.getCell(r, ph.col).border = thinBorder;
        sheet.getCell(r, ph.col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } };
      }
    });

    // Row 15: Table Columns Header (Section 5)
    sheet.getRow(15).height = 65;
    const a15 = sheet.getCell('A15');
    a15.value = '5';
    a15.font = { name: 'Times New Roman', size: 14, bold: true };
    a15.alignment = { horizontal: 'center', vertical: 'middle' };
    a15.border = thinBorder;

    const colHeaders: { col: number; text: string; bg?: string }[] = [
      { col: 2, text: 'Код МПЗ из "Ellipse"' },
      { col: 3, text: 'Наименование товара, работ, услуг' },
      { col: 4, text: 'ед.изм.' },
      { col: 5, text: 'кол-во ' },
      { col: 6, text: 'Цена за ед.\nв тенге,\nс НДС 0 %', bg: 'FFCCCCFF' },
      { col: 7, text: 'Сумма\nв тенге,\nс НДС 0 %', bg: 'FFCCCCFF' },
      { col: 8, text: 'Цена за ед.\nв тенге,\nс НДС 12 %', bg: 'FFCCCCFF' },
      { col: 9, text: 'Сумма\nв тенге,\nс НДС 12 %', bg: 'FFCCCCFF' }
    ];

    suppliers.forEach((s, idx) => {
      const sCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      const isWinner = s.isSelected || (!comparisonData.selectedSupplierId && summaries[idx]?.isBestPrice);
      const bg = isWinner ? 'FFCCFFCC' : 'FFFFCC99';

      colHeaders.push(
        { col: sCol, text: 'Предлагаемое наименование', bg },
        { col: sCol + 1, text: 'Цена за ед.\nв рублях,\nс НДС 0 %', bg },
        { col: sCol + 2, text: 'Сумма\nв рублях,\nс НДС 0 %', bg },
        { col: sCol + 3, text: 'Цена за ед.\nв тенге,\nс НДС 0 %', bg },
        { col: sCol + 4, text: 'Сумма\nв тенге,\nс НДС 0 %', bg },
        { col: sCol + 5, text: 'Цена за ед.\nв тенге,\nс НДС 12 %', bg },
        { col: sCol + 6, text: 'Сумма\nв тенге,\nс НДС 12 %', bg }
      );
    });

    // Profit headers row 15
    colHeaders.push(
      { col: p1Col, text: 'Сумма\nв тенге,\nс НДС 0 %', bg: 'FF99CCFF' },
      { col: p1Col + 1, text: 'Сумма\nв тенге,\nс НДС 12 %', bg: 'FF99CCFF' },
      { col: p1Col + 2, text: 'Сумма\nв тенге,\nс НДС 12 %', bg: 'FF99CCFF' },
      { col: p1Col + 3, text: 'тенге', bg: 'FF99CCFF' },
      { col: p1Col + 4, text: '%', bg: 'FF99CCFF' }
    );

    colHeaders.forEach(ch => {
      const cell = sheet.getCell(15, ch.col);
      cell.value = ch.text;
      cell.font = { name: 'Times New Roman', size: 11, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      if (ch.bg) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ch.bg } };
      }
    });

    // 3. TABLE BODY (Rows 16 .. 15 + N)
    const itemsStartRow = 16;
    const rowCount = Math.max(lineItems.length, 1);

    for (let i = 0; i < rowCount; i++) {
      const curRow = itemsStartRow + i;
      const item = lineItems[i];
      const row = sheet.getRow(curRow);
      row.height = 24;

      // Col A: Sequence
      const aCell = sheet.getCell(curRow, 1);
      aCell.value = curRow === itemsStartRow ? 1 : { formula: `A${curRow - 1}+1`, result: i + 1 };
      aCell.font = { name: 'Times New Roman', size: 12 };
      aCell.alignment = { horizontal: 'center', vertical: 'middle' };
      aCell.border = thinBorder;

      // Col B: MPZ Code
      const bCell = sheet.getCell(curRow, 2);
      bCell.value = item?.mpzCode || '';
      bCell.font = { name: 'Times New Roman', size: 12 };
      bCell.alignment = { horizontal: 'center', vertical: 'middle' };
      bCell.border = thinBorder;

      // Col C: Name
      const cCell = sheet.getCell(curRow, 3);
      cCell.value = item?.name || '';
      cCell.font = { name: 'Times New Roman', size: 12 };
      cCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cCell.border = thinBorder;

      // Col D: Unit
      const dCell = sheet.getCell(curRow, 4);
      dCell.value = item?.unit || 'шт';
      dCell.font = { name: 'Times New Roman', size: 12 };
      dCell.alignment = { horizontal: 'center', vertical: 'middle' };
      dCell.border = thinBorder;

      // Col E: Quantity
      const eCell = sheet.getCell(curRow, 5);
      eCell.value = item ? Number(item.quantity) : 0;
      eCell.font = { name: 'Times New Roman', size: 12 };
      eCell.alignment = { horizontal: 'right', vertical: 'middle' };
      eCell.numFmt = '#,##0.00';
      eCell.border = thinBorder;

      // Col F: Budget Price KZT 0%
      const fCell = sheet.getCell(curRow, 6);
      fCell.value = item ? Number(item.budgetPriceKzt0) : 0;
      fCell.font = { name: 'Times New Roman', size: 12 };
      fCell.alignment = { horizontal: 'right', vertical: 'middle' };
      fCell.numFmt = '#,##0.00';
      fCell.border = thinBorder;

      // Col G: Budget Sum KZT 0% (=E{r}*F{r})
      const gCell = sheet.getCell(curRow, 7);
      gCell.value = {
        formula: `E${curRow}*F${curRow}`,
        result: item ? Number(item.quantity) * Number(item.budgetPriceKzt0) : 0
      };
      gCell.font = { name: 'Times New Roman', size: 12 };
      gCell.alignment = { horizontal: 'right', vertical: 'middle' };
      gCell.numFmt = '#,##0.00';
      gCell.border = thinBorder;

      // Col H: Budget Price KZT 12%
      const hCell = sheet.getCell(curRow, 8);
      hCell.value = item ? Number(item.budgetPriceKzt12) : 0;
      hCell.font = { name: 'Times New Roman', size: 12 };
      hCell.alignment = { horizontal: 'right', vertical: 'middle' };
      hCell.numFmt = '#,##0.00';
      hCell.border = thinBorder;

      // Col I: Budget Sum KZT 12% (=E{r}*H{r})
      const iCell = sheet.getCell(curRow, 9);
      iCell.value = {
        formula: `E${curRow}*H${curRow}`,
        result: item ? Number(item.quantity) * Number(item.budgetPriceKzt12) : 0
      };
      iCell.font = { name: 'Times New Roman', size: 12 };
      iCell.alignment = { horizontal: 'right', vertical: 'middle' };
      iCell.numFmt = '#,##0.00';
      iCell.border = thinBorder;

      // Supplier Columns
      suppliers.forEach((s, sIdx) => {
        const sCol = baseColCount + budgetColCount + (sIdx * colsPerSupplier) + 1;
        const sp = item?.prices?.[s.id];

        const propName = sp?.proposedName || item?.name || '';
        const priceRub0 = sp ? Number(sp.priceRub0) || 0 : 0;
        const priceKzt0 = sp ? Number(sp.priceKzt0) || 0 : 0;
        const priceKzt12 = sp ? Number(sp.priceKzt12) || 0 : 0;
        const qty = item ? Number(item.quantity) : 0;

        // 1. Proposed Name
        const pnCell = sheet.getCell(curRow, sCol);
        pnCell.value = propName;
        pnCell.font = { name: 'Times New Roman', size: 12 };
        pnCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        pnCell.border = thinBorder;

        // 2. Price RUB 0%
        const prCell = sheet.getCell(curRow, sCol + 1);
        prCell.value = priceRub0;
        prCell.font = { name: 'Times New Roman', size: 12 };
        prCell.alignment = { horizontal: 'right', vertical: 'middle' };
        prCell.numFmt = '#,##0.00';
        prCell.border = thinBorder;

        // 3. Sum RUB 0% (=E{r}*col{sCol+1}{r})
        const prLetter = getColLetter(sCol + 1);
        const srCell = sheet.getCell(curRow, sCol + 2);
        srCell.value = {
          formula: `E${curRow}*${prLetter}${curRow}`,
          result: qty * priceRub0
        };
        srCell.font = { name: 'Times New Roman', size: 12 };
        srCell.alignment = { horizontal: 'right', vertical: 'middle' };
        srCell.numFmt = '#,##0.00';
        srCell.border = thinBorder;

        // 4. Price KZT 0%
        const pk0Cell = sheet.getCell(curRow, sCol + 3);
        pk0Cell.value = priceKzt0;
        pk0Cell.font = { name: 'Times New Roman', size: 12 };
        pk0Cell.alignment = { horizontal: 'right', vertical: 'middle' };
        pk0Cell.numFmt = '#,##0.00';
        pk0Cell.border = thinBorder;

        // 5. Sum KZT 0% (=E{r}*col{sCol+3}{r})
        const pk0Letter = getColLetter(sCol + 3);
        const sk0Cell = sheet.getCell(curRow, sCol + 4);
        sk0Cell.value = {
          formula: `E${curRow}*${pk0Letter}${curRow}`,
          result: qty * priceKzt0
        };
        sk0Cell.font = { name: 'Times New Roman', size: 12 };
        sk0Cell.alignment = { horizontal: 'right', vertical: 'middle' };
        sk0Cell.numFmt = '#,##0.00';
        sk0Cell.border = thinBorder;

        // 6. Price KZT 12%
        const pk12Cell = sheet.getCell(curRow, sCol + 5);
        pk12Cell.value = priceKzt12;
        pk12Cell.font = { name: 'Times New Roman', size: 12 };
        pk12Cell.alignment = { horizontal: 'right', vertical: 'middle' };
        pk12Cell.numFmt = '#,##0.00';
        pk12Cell.border = thinBorder;

        // 7. Sum KZT 12% (=E{r}*col{sCol+5}{r})
        const pk12Letter = getColLetter(sCol + 5);
        const sk12Cell = sheet.getCell(curRow, sCol + 6);
        sk12Cell.value = {
          formula: `E${curRow}*${pk12Letter}${curRow}`,
          result: qty * priceKzt12
        };
        sk12Cell.font = { name: 'Times New Roman', size: 12 };
        sk12Cell.alignment = { horizontal: 'right', vertical: 'middle' };
        sk12Cell.numFmt = '#,##0.00';
        sk12Cell.border = thinBorder;
      });

      // Profit Columns for line item (comparing with chosen/best supplier, e.g. supplier 1)
      const bestSuppKzt0SumCol = getColLetter(baseColCount + budgetColCount + 5);  // Col KZT 0% sum of supp 1
      const bestSuppKzt12SumCol = getColLetter(baseColCount + budgetColCount + 7); // Col KZT 12% sum of supp 1

      // 1. Доход KZT 0% (=G{r}-SuppKzt0Sum{r})
      const p1Cell = sheet.getCell(curRow, p1Col);
      p1Cell.value = { formula: `G${curRow}-${bestSuppKzt0SumCol}${curRow}` };
      p1Cell.font = { name: 'Times New Roman', size: 12 };
      p1Cell.alignment = { horizontal: 'right', vertical: 'middle' };
      p1Cell.numFmt = '#,##0.00';
      p1Cell.border = thinBorder;

      // 2. Доход KZT 12% (=I{r}-SuppKzt12Sum{r})
      const p2Cell = sheet.getCell(curRow, p1Col + 1);
      p2Cell.value = { formula: `I${curRow}-${bestSuppKzt12SumCol}${curRow}` };
      p2Cell.font = { name: 'Times New Roman', size: 12 };
      p2Cell.alignment = { horizontal: 'right', vertical: 'middle' };
      p2Cell.numFmt = '#,##0.00';
      p2Cell.border = thinBorder;

      // 3. Доход с вычетом кредита
      const p3Cell = sheet.getCell(curRow, p1Col + 2);
      p3Cell.value = '';
      p3Cell.font = { name: 'Times New Roman', size: 12 };
      p3Cell.border = thinBorder;

      // 4. НДС 12%
      const p4Cell = sheet.getCell(curRow, p1Col + 3);
      p4Cell.value = '';
      p4Cell.font = { name: 'Times New Roman', size: 12 };
      p4Cell.border = thinBorder;

      // 5. Рентабельность
      const p5Cell = sheet.getCell(curRow, p1Col + 4);
      p5Cell.value = '';
      p5Cell.font = { name: 'Times New Roman', size: 12 };
      p5Cell.border = thinBorder;
    }

    // 4. SUMMARY & FOOTER ROWS (Section 6 .. 18)
    const itemsEndRow = itemsStartRow + rowCount - 1;
    let nextRow = itemsEndRow + 1;

    // Row 6: "Итого сумма "
    sheet.getRow(nextRow).height = 26;
    const aSum = sheet.getCell(nextRow, 1);
    aSum.value = '6';
    aSum.font = { name: 'Times New Roman', size: 14, bold: true };
    aSum.alignment = { horizontal: 'center', vertical: 'middle' };
    aSum.border = thinBorder;

    sheet.mergeCells(nextRow, 2, nextRow, 4);
    const bSum = sheet.getCell(nextRow, 2);
    bSum.value = 'Итого сумма ';
    bSum.font = { name: 'Times New Roman', size: 14, bold: true };
    bSum.alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = 2; c <= 4; c++) sheet.getCell(nextRow, c).border = thinBorder;

    // Col E: Total Quantity (=SUM(E16:E{end}))
    const eSum = sheet.getCell(nextRow, 5);
    eSum.value = { formula: `SUM(E${itemsStartRow}:E${itemsEndRow})` };
    eSum.font = { name: 'Times New Roman', size: 12, bold: true };
    eSum.alignment = { horizontal: 'right', vertical: 'middle' };
    eSum.numFmt = '#,##0.00';
    eSum.border = thinBorder;

    // Budget Totals (Cols F, G, H, I)
    sheet.getCell(nextRow, 6).border = thinBorder;
    const gSum = sheet.getCell(nextRow, 7);
    gSum.value = { formula: `SUM(G${itemsStartRow}:G${itemsEndRow})`, result: totalBudgetKzt0 };
    gSum.font = { name: 'Times New Roman', size: 12, bold: true };
    gSum.alignment = { horizontal: 'right', vertical: 'middle' };
    gSum.numFmt = '#,##0.00';
    gSum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCFF' } };
    gSum.border = thinBorder;

    sheet.getCell(nextRow, 8).border = thinBorder;
    const iSum = sheet.getCell(nextRow, 9);
    iSum.value = { formula: `SUM(I${itemsStartRow}:I${itemsEndRow})`, result: totalBudgetKzt12 };
    iSum.font = { name: 'Times New Roman', size: 12, bold: true };
    iSum.alignment = { horizontal: 'right', vertical: 'middle' };
    iSum.numFmt = '#,##0.00';
    iSum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCFF' } };
    iSum.border = thinBorder;

    // Supplier Totals
    suppliers.forEach((s, idx) => {
      const sCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      const isWinner = s.isSelected || (!comparisonData.selectedSupplierId && summaries[idx]?.isBestPrice);
      const bg = isWinner ? 'FFCCFFCC' : 'FFFFCC99';

      // Blank for prop name & unit prices
      sheet.getCell(nextRow, sCol).border = thinBorder;
      sheet.getCell(nextRow, sCol + 1).border = thinBorder;
      sheet.getCell(nextRow, sCol + 3).border = thinBorder;
      sheet.getCell(nextRow, sCol + 5).border = thinBorder;

      // Sum RUB 0%
      const srLetter = getColLetter(sCol + 2);
      const srSum = sheet.getCell(nextRow, sCol + 2);
      srSum.value = { formula: `SUM(${srLetter}${itemsStartRow}:${srLetter}${itemsEndRow})` };
      srSum.font = { name: 'Times New Roman', size: 12, bold: true };
      srSum.alignment = { horizontal: 'right', vertical: 'middle' };
      srSum.numFmt = '#,##0.00';
      srSum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      srSum.border = thinBorder;

      // Sum KZT 0%
      const sk0Letter = getColLetter(sCol + 4);
      const sk0Sum = sheet.getCell(nextRow, sCol + 4);
      sk0Sum.value = { formula: `SUM(${sk0Letter}${itemsStartRow}:${sk0Letter}${itemsEndRow})` };
      sk0Sum.font = { name: 'Times New Roman', size: 12, bold: true };
      sk0Sum.alignment = { horizontal: 'right', vertical: 'middle' };
      sk0Sum.numFmt = '#,##0.00';
      sk0Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      sk0Sum.border = thinBorder;

      // Sum KZT 12%
      const sk12Letter = getColLetter(sCol + 6);
      const sk12Sum = sheet.getCell(nextRow, sCol + 6);
      sk12Sum.value = { formula: `SUM(${sk12Letter}${itemsStartRow}:${sk12Letter}${itemsEndRow})` };
      sk12Sum.font = { name: 'Times New Roman', size: 12, bold: true };
      sk12Sum.alignment = { horizontal: 'right', vertical: 'middle' };
      sk12Sum.numFmt = '#,##0.00';
      sk12Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      sk12Sum.border = thinBorder;
    });

    // Profit Totals in Row 6
    const p1Letter = getColLetter(p1Col);
    const p1Sum = sheet.getCell(nextRow, p1Col);
    p1Sum.value = { formula: `SUM(${p1Letter}${itemsStartRow}:${p1Letter}${itemsEndRow})` };
    p1Sum.font = { name: 'Times New Roman', size: 12, bold: true };
    p1Sum.alignment = { horizontal: 'right', vertical: 'middle' };
    p1Sum.numFmt = '#,##0.00';
    p1Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } };
    p1Sum.border = thinBorder;

    const p2Letter = getColLetter(p1Col + 1);
    const p2Sum = sheet.getCell(nextRow, p1Col + 1);
    p2Sum.value = { formula: `SUM(${p2Letter}${itemsStartRow}:${p2Letter}${itemsEndRow})` };
    p2Sum.font = { name: 'Times New Roman', size: 12, bold: true };
    p2Sum.alignment = { horizontal: 'right', vertical: 'middle' };
    p2Sum.numFmt = '#,##0.00';
    p2Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } };
    p2Sum.border = thinBorder;

    // Profit with credit deduction: =p2Sum - creditCost
    const p3Sum = sheet.getCell(nextRow, p1Col + 2);
    const creditCostNum = Number(comparisonData.creditCost) || 0;
    p3Sum.value = { formula: `${p2Letter}${nextRow}-${creditCostNum}` };
    p3Sum.font = { name: 'Times New Roman', size: 12, bold: true };
    p3Sum.alignment = { horizontal: 'right', vertical: 'middle' };
    p3Sum.numFmt = '#,##0.00';
    p3Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } };
    p3Sum.border = thinBorder;

    // NDS
    const p4Letter = getColLetter(p1Col + 3);
    const p4Sum = sheet.getCell(nextRow, p1Col + 3);
    p4Sum.value = { formula: `${p2Letter}${nextRow}-${p1Letter}${nextRow}` };
    p4Sum.font = { name: 'Times New Roman', size: 12, bold: true };
    p4Sum.alignment = { horizontal: 'right', vertical: 'middle' };
    p4Sum.numFmt = '#,##0.00';
    p4Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } };
    p4Sum.border = thinBorder;

    // Rentability (%): = Profit / TotalBudget * 100
    const p5Letter = getColLetter(p1Col + 4);
    const p5Sum = sheet.getCell(nextRow, p1Col + 4);
    p5Sum.value = { formula: `${p3Letter(p1Col + 2)}${nextRow}/I${nextRow}` };
    p5Sum.font = { name: 'Times New Roman', size: 12, bold: true };
    p5Sum.alignment = { horizontal: 'right', vertical: 'middle' };
    p5Sum.numFmt = '0.00%';
    p5Sum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF99CCFF' } };
    p5Sum.border = thinBorder;

    function p3Letter(col: number) {
      return getColLetter(col);
    }

    const sumRowIdx = nextRow;
    nextRow++;

    // Row 7: "Итого сумма закупа (с учетом скидок) по каждому Поставщику"
    sheet.getRow(nextRow).height = 36;
    const a7 = sheet.getCell(nextRow, 1);
    a7.value = '7';
    a7.font = { name: 'Times New Roman', size: 14, bold: true };
    a7.alignment = { horizontal: 'center', vertical: 'middle' };
    a7.border = thinBorder;

    sheet.mergeCells(nextRow, 2, nextRow, 5);
    const b7 = sheet.getCell(nextRow, 2);
    b7.value = 'Итого сумма закупа (с учетом скидок) по каждому Поставщику';
    b7.font = { name: 'Times New Roman', size: 13, bold: true };
    b7.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    for (let c = 2; c <= 5; c++) sheet.getCell(nextRow, c).border = thinBorder;

    // Budget empty cells
    for (let c = 6; c <= 9; c++) sheet.getCell(nextRow, c).border = thinBorder;

    suppliers.forEach((s, idx) => {
      const sCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      const endCol = sCol + colsPerSupplier - 1;
      const discount = Number(s.discountPercent) || 0;
      const sk12Letter = getColLetter(sCol + 6);
      const isWinner = s.isSelected || (!comparisonData.selectedSupplierId && summaries[idx]?.isBestPrice);
      const bg = isWinner ? 'FFCCFFCC' : 'FFFFCC99';

      sheet.mergeCells(nextRow, sCol, nextRow, endCol);
      const cell = sheet.getCell(nextRow, sCol);
      if (discount > 0) {
        cell.value = { formula: `${sk12Letter}${sumRowIdx}*(1-${discount}/100)` };
      } else {
        cell.value = { formula: `${sk12Letter}${sumRowIdx}` };
      }
      cell.font = { name: 'Times New Roman', size: 14, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.numFmt = '#,##0.00 ₸';
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

      for (let c = sCol; c <= endCol; c++) sheet.getCell(nextRow, c).border = thinBorder;
    });

    for (let c = profitStartCol; c <= totalCols; c++) sheet.getCell(nextRow, c).border = thinBorder;

    nextRow++;

    // Helper to add footer requisite rows (8 to 18)
    const addFooterRequisiteRow = (secNum: string, title: string, height: number, getVal: (s: any) => string) => {
      sheet.getRow(nextRow).height = height;

      // Col A: Sec Number
      const aCell = sheet.getCell(nextRow, 1);
      aCell.value = secNum;
      aCell.font = { name: 'Times New Roman', size: 14 };
      aCell.alignment = { horizontal: 'center', vertical: 'middle' };
      aCell.border = thinBorder;

      // Col B:E: Title
      sheet.mergeCells(nextRow, 2, nextRow, 5);
      const bCell = sheet.getCell(nextRow, 2);
      bCell.value = title;
      bCell.font = { name: 'Times New Roman', size: 12 };
      bCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      for (let c = 2; c <= 5; c++) sheet.getCell(nextRow, c).border = thinBorder;

      // Budget empty cells
      for (let c = 6; c <= 9; c++) sheet.getCell(nextRow, c).border = thinBorder;

      // Suppliers
      suppliers.forEach((s, idx) => {
        const sCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
        const endCol = sCol + colsPerSupplier - 1;
        const isWinner = s.isSelected || (!comparisonData.selectedSupplierId && summaries[idx]?.isBestPrice);
        const bg = isWinner ? 'FFCCFFCC' : 'FFFFCC99';

        sheet.mergeCells(nextRow, sCol, nextRow, endCol);
        const cell = sheet.getCell(nextRow, sCol);
        cell.value = getVal(s);
        cell.font = { name: 'Times New Roman', size: 11, bold: isWinner };
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

        for (let c = sCol; c <= endCol; c++) sheet.getCell(nextRow, c).border = thinBorder;
      });

      for (let c = profitStartCol; c <= totalCols; c++) sheet.getCell(nextRow, c).border = thinBorder;

      nextRow++;
    };

    // Rows 8 .. 18
    addFooterRequisiteRow('8', 'Условия оплаты ', 45, s => s.paymentTerms || '—');
    addFooterRequisiteRow('9', 'Форма оплаты', 20, s => s.paymentForm || 'Безналичный расчет в KZT');
    addFooterRequisiteRow('10', 'Размер обеспечения тендерной заявки', 20, s => s.bidSecurity ? `${Number(s.bidSecurity).toLocaleString('ru-RU')} ₸` : 'Не требуется');
    addFooterRequisiteRow('11', 'Срок поставки/выполнения работ  ', 30, s => s.deliveryPeriod || '—');
    addFooterRequisiteRow('12', 'Гарантийный срок ', 20, s => s.warrantyPeriod || '—');
    addFooterRequisiteRow('13', 'Базис поставки (согласно Инкотермс-2010)', 30, s => s.incotermsBasis || '—');
    addFooterRequisiteRow('14', 'Способ доставки (ж/д, авиа, авто)', 20, s => s.deliveryMethod || '—');
    addFooterRequisiteRow('15', 'Толеранс', 20, s => s.tolerance || '0%');
    addFooterRequisiteRow('16', 'Номер и дата ценового предложения', 20, s => s.commercialOfferNumberDate || '—');
    addFooterRequisiteRow('17', 'Поставщик по ПСД', 20, s => s.supplierPsd || 'Нет');
    addFooterRequisiteRow('18', 'Дополнительная информация', 30, s => s.additionalInfo || '—');

    // 5. CREDIT CALCULATION BANNER (Underneath)
    nextRow++;
    sheet.getRow(nextRow).height = 24;
    sheet.mergeCells(nextRow, 2, nextRow, 12);
    const crBanner = sheet.getCell(nextRow, 2);
    const creditAmt = Number(comparisonData.creditAmount) || 0;
    const creditDays = Number(comparisonData.creditDays) || 75;
    const creditCost = Number(comparisonData.creditCost) || 0;
    crBanner.value = `КРЕДИТ: ${creditAmt.toLocaleString('ru-RU')} тг на ${creditDays} дней = ${creditCost.toLocaleString('ru-RU')} тг расходов`;
    crBanner.font = { name: 'Times New Roman', size: 12, bold: true, color: { argb: 'FF1E293B' } };
    crBanner.alignment = { horizontal: 'left', vertical: 'middle' };
    crBanner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
