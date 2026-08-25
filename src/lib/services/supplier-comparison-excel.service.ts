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
   * Generates a fully styled .xlsx buffer matching the corporate template
   */
  static async generateExcelWorkbook(comparisonData: TenderSupplierComparisonData): Promise<Buffer> {
    const { totalBudgetKzt0, totalBudgetKzt12, summaries } = SupplierComparisonService.computeSummaries(comparisonData);
    const exchangeRate = Number(comparisonData.exchangeRate) || 5.20;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TenderAI Platform';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Конкурентный лист', {
      views: [{ showGridLines: true }]
    });

    // 1. Column layout calculation
    // Base cols: 1:№, 2:Код МПЗ, 3:Наименование, 4:Ед.изм, 5:Кол-во
    // Budget cols: 6:Цена0, 7:Сумма0, 8:Цена12, 9:Сумма12
    // Supplier k cols: 7 cols per supplier (Предл. наим, Цена KZT 0, Сумма KZT 0, Цена KZT 12, Сумма KZT 12, Цена RUB 0, Сумма RUB 0)
    const baseColCount = 5;
    const budgetColCount = 4;
    const colsPerSupplier = 7;
    const suppliers = comparisonData.suppliers && comparisonData.suppliers.length > 0
      ? comparisonData.suppliers
      : [{ id: 'supp-1', name: 'Поставщик 1', order: 0 }];

    const totalCols = baseColCount + budgetColCount + (suppliers.length * colsPerSupplier);

    // Border definitions
    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };

    const headerBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'medium', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };

    const doubleBottomBorder: Partial<ExcelJS.Borders> = {
      top: { style: 'thin', color: { argb: 'FF1E293B' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'double', color: { argb: 'FF1E293B' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
    };

    // 2. HEADER TITLE (Row 2)
    const titleRow = sheet.getRow(2);
    titleRow.height = 30;
    sheet.mergeCells(2, 1, 2, totalCols);
    const titleCell = sheet.getCell('A2');
    titleCell.value = 'КОНКУРЕНТНЫЙ ЛИСТ ПО ВЫБОРУ ПОСТАВЩИКА';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF0F172A' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' }
    };

    // 3. METADATA SECTION (Rows 4–8)
    const metaStartRow = 4;
    const addMetaRow = (r: number, label1: string, val1: string, label2?: string, val2?: string) => {
      const row = sheet.getRow(r);
      row.height = 20;

      // Col 1 & 2
      const c1 = sheet.getCell(r, 1);
      c1.value = label1;
      c1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };

      sheet.mergeCells(r, 2, r, 5);
      const c2 = sheet.getCell(r, 2);
      c2.value = val1;
      c2.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } };

      if (label2 && val2) {
        const c3 = sheet.getCell(r, 6);
        c3.value = label2;
        c3.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } };

        sheet.mergeCells(r, 7, r, 9);
        const c4 = sheet.getCell(r, 7);
        c4.value = val2;
        c4.font = { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } };
      }
    };

    addMetaRow(
      4,
      'Номер тендера:',
      comparisonData.tenderNumber || '—',
      'Торговая площадка:',
      comparisonData.tradingPlatform || 'goszakup.gov.kz'
    );
    addMetaRow(
      5,
      'Заказчик:',
      `${comparisonData.customerName || '—'}${comparisonData.customerBin ? ` (БИН: ${comparisonData.customerBin})` : ''}`,
      'Курс НБ РК (RUB → KZT):',
      `${exchangeRate.toFixed(2)} ₸`
    );
    addMetaRow(
      6,
      'Дата начала приема:',
      comparisonData.publishDate ? new Date(comparisonData.publishDate).toLocaleDateString('ru-RU') : '—',
      'Дата вскрытия (дедлайн):',
      comparisonData.deadlineDate ? new Date(comparisonData.deadlineDate).toLocaleDateString('ru-RU') : '—'
    );
    addMetaRow(
      7,
      'Наименование закупки:',
      comparisonData.tenderTitle || '—',
      'Бюджет тендера (с НДС):',
      `${totalBudgetKzt12.toLocaleString('ru-RU')} ₸`
    );

    // 4. SUPPLIERS REQUISITES BLOCK (Rows 10–14)
    const suppReqStartRow = 10;
    sheet.getRow(suppReqStartRow).height = 22;
    sheet.mergeCells(suppReqStartRow, 1, suppReqStartRow, 9);
    const reqHeader = sheet.getCell(suppReqStartRow, 1);
    reqHeader.value = 'СВЕДЕНИЯ О ПОСТАВЩИКАХ (КОНТРАГЕНТАХ)';
    reqHeader.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } };
    reqHeader.alignment = { horizontal: 'left', vertical: 'middle' };
    reqHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    // Set supplier headers in rows 10-14
    suppliers.forEach((s, idx) => {
      const startCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      const endCol = startCol + colsPerSupplier - 1;

      // Row 10: Supplier Name
      sheet.mergeCells(10, startCol, 10, endCol);
      const sNameCell = sheet.getCell(10, startCol);
      const isWinner = s.isSelected || comparisonData.selectedSupplierId === s.id;
      sNameCell.value = `${s.name}${isWinner ? '  ★ [ВЫБРАННЫЙ ПОБЕДИТЕЛЬ]' : ''}`;
      sNameCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: isWinner ? 'FF065F46' : 'FF0F172A' } };
      sNameCell.alignment = { horizontal: 'center', vertical: 'middle' };
      sNameCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isWinner ? 'FFD1FAE5' : 'FFF8FAFC' }
      };

      // Row 11: Address
      sheet.mergeCells(11, startCol, 11, endCol);
      const sAddrCell = sheet.getCell(11, startCol);
      sAddrCell.value = `Адрес: ${s.address || '—'}`;
      sAddrCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };

      // Row 12: Contacts
      sheet.mergeCells(12, startCol, 12, endCol);
      const sContCell = sheet.getCell(12, startCol);
      sContCell.value = `Контакты: ${s.email || '—'} / ${s.phone || '—'}`;
      sContCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };

      // Row 13: Payment Terms
      sheet.mergeCells(13, startCol, 13, endCol);
      const sPayCell = sheet.getCell(13, startCol);
      sPayCell.value = `Оплата: ${s.paymentTerms || '—'} (${s.paymentForm || 'Безнал'})`;
      sPayCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };

      // Row 14: Bid Security
      sheet.mergeCells(14, startCol, 14, endCol);
      const sSecCell = sheet.getCell(14, startCol);
      sSecCell.value = `Обеспечение: ${s.bidSecurity ? `${Number(s.bidSecurity).toLocaleString('ru-RU')} ₸` : 'Не требуется'}`;
      sSecCell.font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };

      for (let r = 10; r <= 14; r++) {
        for (let c = startCol; c <= endCol; c++) {
          sheet.getCell(r, c).border = thinBorder;
        }
      }
    });

    for (let r = 11; r <= 14; r++) {
      sheet.mergeCells(r, 1, r, 9);
      const leftNote = sheet.getCell(r, 1);
      leftNote.border = thinBorder;
      if (r === 11) leftNote.value = 'Реквизиты и условия контрагентов';
      if (r === 12) leftNote.value = 'Форма взаиморасчетов и предоплата';
      if (r === 13) leftNote.value = 'Обеспечение заявки и договора';
      if (r === 14) leftNote.value = 'Скидки и специальные предложения';
      leftNote.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
    }

    // 5. MAIN TABLE HEADERS (Rows 15 and 16)
    sheet.getRow(15).height = 25;
    sheet.getRow(16).height = 28;

    // Base header cells (merge rows 15-16 for cols 1..5)
    const baseHeaders = [
      { col: 1, text: '№' },
      { col: 2, text: 'Код МПЗ' },
      { col: 3, text: 'Наименование ТРУ (по техспецификации)' },
      { col: 4, text: 'Ед. изм.' },
      { col: 5, text: 'Кол-во' }
    ];

    baseHeaders.forEach(bh => {
      sheet.mergeCells(15, bh.col, 16, bh.col);
      const cell = sheet.getCell(15, bh.col);
      cell.value = bh.text;
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      sheet.getCell(15, bh.col).border = headerBorder;
      sheet.getCell(16, bh.col).border = headerBorder;
    });

    // Budget Header (merge cols 6..9 in row 15, then 4 sub-headers in row 16)
    sheet.mergeCells(15, 6, 15, 9);
    const budgetHeader = sheet.getCell(15, 6);
    budgetHeader.value = 'БЮДЖЕТ ЗАКАЗЧИКА';
    budgetHeader.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
    budgetHeader.alignment = { horizontal: 'center', vertical: 'middle' };
    budgetHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const budgetSubHeaders = [
      { col: 6, text: 'Цена за ед. KZT (0%)' },
      { col: 7, text: 'Сумма KZT (0%)' },
      { col: 8, text: 'Цена за ед. KZT (12%)' },
      { col: 9, text: 'Сумма KZT (12%)' }
    ];
    budgetSubHeaders.forEach(bsh => {
      const cell = sheet.getCell(16, bsh.col);
      cell.value = bsh.text;
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF1E3A8A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      cell.border = headerBorder;
      sheet.getCell(15, bsh.col).border = headerBorder;
    });

    // Supplier Table Headers
    suppliers.forEach((s, idx) => {
      const startCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      const endCol = startCol + colsPerSupplier - 1;
      const isWinner = s.isSelected || comparisonData.selectedSupplierId === s.id;

      // Row 15: Supplier Name Box
      sheet.mergeCells(15, startCol, 15, endCol);
      const sBox = sheet.getCell(15, startCol);
      sBox.value = `КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ: ${s.name}`;
      sBox.font = { name: 'Calibri', size: 10, bold: true, color: { argb: isWinner ? 'FF065F46' : 'FF0F172A' } };
      sBox.alignment = { horizontal: 'center', vertical: 'middle' };
      sBox.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isWinner ? 'FFD1FAE5' : 'FFF1F5F9' }
      };

      const sSubHeaders = [
        { offset: 0, text: 'Предлагаемое наименование' },
        { offset: 1, text: 'Цена KZT (0%)' },
        { offset: 2, text: 'Сумма KZT (0%)' },
        { offset: 3, text: 'Цена KZT (12%)' },
        { offset: 4, text: 'Сумма KZT (12%)' },
        { offset: 5, text: 'Цена RUB (0%)' },
        { offset: 6, text: 'Сумма RUB (0%)' }
      ];

      sSubHeaders.forEach(ssh => {
        const cIdx = startCol + ssh.offset;
        const cell = sheet.getCell(16, cIdx);
        cell.value = ssh.text;
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF334155' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isWinner ? 'FFA7F3D0' : 'FFE2E8F0' }
        };
        cell.border = headerBorder;
        sheet.getCell(15, cIdx).border = headerBorder;
      });
    });

    // 6. LINE ITEMS DATA (Rows 17 onwards)
    const dataStartRow = 17;
    const lineItems = comparisonData.lineItems && comparisonData.lineItems.length > 0
      ? comparisonData.lineItems
      : [{ order: 1, name: comparisonData.tenderTitle || 'Товар', quantity: 1, prices: {} } as any];

    let currentRow = dataStartRow;

    lineItems.forEach((item, rIdx) => {
      const row = sheet.getRow(currentRow);
      row.height = 24;

      const qty = Number(item.quantity) || 1;
      const bPrice0 = Number(item.budgetPriceKzt0) || 0;
      const bPrice12 = Number(item.budgetPriceKzt12) || (bPrice0 * 1.12);

      // Col A (1): №
      const cNum = sheet.getCell(currentRow, 1);
      cNum.value = rIdx + 1;
      cNum.alignment = { horizontal: 'center', vertical: 'middle' };
      cNum.border = thinBorder;

      // Col B (2): Код МПЗ
      const cMpz = sheet.getCell(currentRow, 2);
      cMpz.value = item.mpzCode || '—';
      cMpz.alignment = { horizontal: 'center', vertical: 'middle' };
      cMpz.border = thinBorder;

      // Col C (3): Наименование ТРУ
      const cName = sheet.getCell(currentRow, 3);
      cName.value = item.name;
      cName.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      cName.border = thinBorder;

      // Col D (4): Ед. изм.
      const cUnit = sheet.getCell(currentRow, 4);
      cUnit.value = item.unit || 'шт';
      cUnit.alignment = { horizontal: 'center', vertical: 'middle' };
      cUnit.border = thinBorder;

      // Col E (5): Кол-во
      const cQty = sheet.getCell(currentRow, 5);
      cQty.value = qty;
      cQty.numFmt = '#,##0.00';
      cQty.alignment = { horizontal: 'right', vertical: 'middle' };
      cQty.border = thinBorder;

      const qtyCol = getColLetter(5); // "E"

      // Col F (6): Бюджет Цена 0%
      const cB0 = sheet.getCell(currentRow, 6);
      cB0.value = bPrice0;
      cB0.numFmt = '#,##0.00';
      cB0.alignment = { horizontal: 'right', vertical: 'middle' };
      cB0.border = thinBorder;

      // Col G (7): Бюджет Сумма 0% (Formula = E{r} * F{r})
      const cBSum0 = sheet.getCell(currentRow, 7);
      cBSum0.value = {
        formula: `${qtyCol}${currentRow}*${getColLetter(6)}${currentRow}`,
        result: qty * bPrice0
      };
      cBSum0.numFmt = '#,##0.00';
      cBSum0.alignment = { horizontal: 'right', vertical: 'middle' };
      cBSum0.border = thinBorder;
      cBSum0.font = { bold: true };

      // Col H (8): Бюджет Цена 12%
      const cB12 = sheet.getCell(currentRow, 8);
      cB12.value = bPrice12;
      cB12.numFmt = '#,##0.00';
      cB12.alignment = { horizontal: 'right', vertical: 'middle' };
      cB12.border = thinBorder;

      // Col I (9): Бюджет Сумма 12% (Formula = E{r} * H{r})
      const cBSum12 = sheet.getCell(currentRow, 9);
      cBSum12.value = {
        formula: `${qtyCol}${currentRow}*${getColLetter(8)}${currentRow}`,
        result: qty * bPrice12
      };
      cBSum12.numFmt = '#,##0.00';
      cBSum12.alignment = { horizontal: 'right', vertical: 'middle' };
      cBSum12.border = thinBorder;
      cBSum12.font = { bold: true };

      // Supplier columns for this row
      suppliers.forEach((s, sIdx) => {
        const startCol = baseColCount + budgetColCount + (sIdx * colsPerSupplier) + 1;
        const suppKey = s.id || s.name;
        const pObj = item.prices ? (item.prices[suppKey] || item.prices[s.id || ''] || item.prices[s.name]) : null;

        let p0 = 0;
        let p12 = 0;
        let pRub = 0;

        if (pObj) {
          pRub = Number(pObj.priceRub0) || 0;
          if (pObj.currency === 'RUB' && pRub > 0) {
            p0 = pRub * exchangeRate;
            p12 = p0 * 1.12;
          } else {
            p0 = Number(pObj.priceKzt0) || 0;
            p12 = Number(pObj.priceKzt12) || (p0 * 1.12);
            if (pRub === 0 && p0 > 0 && exchangeRate > 0) {
              pRub = Math.round((p0 / exchangeRate) * 100) / 100;
            }
          }
        }

        // Col S+0: Proposed Name
        const cPName = sheet.getCell(currentRow, startCol);
        cPName.value = pObj?.proposedName || item.name;
        cPName.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        cPName.border = thinBorder;

        // Col S+1: Цена KZT 0%
        const cP0 = sheet.getCell(currentRow, startCol + 1);
        cP0.value = p0;
        cP0.numFmt = '#,##0.00';
        cP0.alignment = { horizontal: 'right', vertical: 'middle' };
        cP0.border = thinBorder;

        // Col S+2: Сумма KZT 0% (Formula = E{r} * {col(S+1)}{r})
        const cSum0 = sheet.getCell(currentRow, startCol + 2);
        const p0Col = getColLetter(startCol + 1);
        cSum0.value = {
          formula: `${qtyCol}${currentRow}*${p0Col}${currentRow}`,
          result: qty * p0
        };
        cSum0.numFmt = '#,##0.00';
        cSum0.alignment = { horizontal: 'right', vertical: 'middle' };
        cSum0.border = thinBorder;

        // Col S+3: Цена KZT 12%
        const cP12 = sheet.getCell(currentRow, startCol + 3);
        cP12.value = p12;
        cP12.numFmt = '#,##0.00';
        cP12.alignment = { horizontal: 'right', vertical: 'middle' };
        cP12.border = thinBorder;

        // Col S+4: Сумма KZT 12% (Formula = E{r} * {col(S+3)}{r})
        const cSum12 = sheet.getCell(currentRow, startCol + 4);
        const p12Col = getColLetter(startCol + 3);
        cSum12.value = {
          formula: `${qtyCol}${currentRow}*${p12Col}${currentRow}`,
          result: qty * p12
        };
        cSum12.numFmt = '#,##0.00';
        cSum12.alignment = { horizontal: 'right', vertical: 'middle' };
        cSum12.border = thinBorder;
        cSum12.font = { bold: true };

        // Col S+5: Цена RUB 0%
        const cPRub = sheet.getCell(currentRow, startCol + 5);
        cPRub.value = pRub;
        cPRub.numFmt = '#,##0.00';
        cPRub.alignment = { horizontal: 'right', vertical: 'middle' };
        cPRub.border = thinBorder;

        // Col S+6: Сумма RUB 0% (Formula = E{r} * {col(S+5)}{r})
        const cSumRub = sheet.getCell(currentRow, startCol + 6);
        const pRubCol = getColLetter(startCol + 5);
        cSumRub.value = {
          formula: `${qtyCol}${currentRow}*${pRubCol}${currentRow}`,
          result: qty * pRub
        };
        cSumRub.numFmt = '#,##0.00';
        cSumRub.alignment = { horizontal: 'right', vertical: 'middle' };
        cSumRub.border = thinBorder;
      });

      currentRow++;
    });

    const dataEndRow = currentRow - 1;

    // 7. SUMMARY & TOTALS FOOTER ROWS
    // Row 1: ИТОГО СУММА (Formula =SUM(col17:colN))
    const totalRowIdx = currentRow;
    const totalRow = sheet.getRow(totalRowIdx);
    totalRow.height = 26;

    sheet.mergeCells(totalRowIdx, 1, totalRowIdx, 5);
    const totalLabel = sheet.getCell(totalRowIdx, 1);
    totalLabel.value = 'ИТОГО СУММА:';
    totalLabel.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
    totalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    for (let c = 1; c <= 5; c++) sheet.getCell(totalRowIdx, c).border = headerBorder;

    // Budget totals
    const gCol = getColLetter(7); // Сумма 0%
    const iCol = getColLetter(9); // Сумма 12%
    sheet.getCell(totalRowIdx, 6).border = headerBorder;
    sheet.getCell(totalRowIdx, 8).border = headerBorder;

    const bSum0Total = sheet.getCell(totalRowIdx, 7);
    bSum0Total.value = {
      formula: `SUM(${gCol}${dataStartRow}:${gCol}${dataEndRow})`,
      result: totalBudgetKzt0
    };
    bSum0Total.numFmt = '#,##0.00';
    bSum0Total.font = { bold: true };
    bSum0Total.alignment = { horizontal: 'right', vertical: 'middle' };
    bSum0Total.border = headerBorder;
    bSum0Total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const bSum12Total = sheet.getCell(totalRowIdx, 9);
    bSum12Total.value = {
      formula: `SUM(${iCol}${dataStartRow}:${iCol}${dataEndRow})`,
      result: totalBudgetKzt12
    };
    bSum12Total.numFmt = '#,##0.00';
    bSum12Total.font = { bold: true };
    bSum12Total.alignment = { horizontal: 'right', vertical: 'middle' };
    bSum12Total.border = headerBorder;
    bSum12Total.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    // Supplier Totals
    suppliers.forEach((s, sIdx) => {
      const startCol = baseColCount + budgetColCount + (sIdx * colsPerSupplier) + 1;
      const sSum0Col = getColLetter(startCol + 2);
      const sSum12Col = getColLetter(startCol + 4);
      const sSumRubCol = getColLetter(startCol + 6);
      const sumObj = summaries.find(sm => sm.supplierId === (s.id || s.name));

      for (let c = startCol; c <= startCol + colsPerSupplier - 1; c++) {
        sheet.getCell(totalRowIdx, c).border = headerBorder;
      }

      const cSum0 = sheet.getCell(totalRowIdx, startCol + 2);
      cSum0.value = {
        formula: `SUM(${sSum0Col}${dataStartRow}:${sSum0Col}${dataEndRow})`,
        result: sumObj?.totalKzt0 || 0
      };
      cSum0.numFmt = '#,##0.00';
      cSum0.font = { bold: true };
      cSum0.alignment = { horizontal: 'right', vertical: 'middle' };

      const cSum12 = sheet.getCell(totalRowIdx, startCol + 4);
      cSum12.value = {
        formula: `SUM(${sSum12Col}${dataStartRow}:${sSum12Col}${dataEndRow})`,
        result: sumObj?.totalKzt12 || 0
      };
      cSum12.numFmt = '#,##0.00';
      cSum12.font = { bold: true, color: { argb: sumObj?.isBestPrice ? 'FF065F46' : 'FF0F172A' } };
      cSum12.alignment = { horizontal: 'right', vertical: 'middle' };
      if (sumObj?.isBestPrice) {
        cSum12.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      }

      const cSumRub = sheet.getCell(totalRowIdx, startCol + 6);
      cSumRub.value = {
        formula: `SUM(${sSumRubCol}${dataStartRow}:${sSumRubCol}${dataEndRow})`,
        result: sumObj?.totalRub0 || 0
      };
      cSumRub.numFmt = '#,##0.00';
      cSumRub.font = { bold: true };
      cSumRub.alignment = { horizontal: 'right', vertical: 'middle' };
    });

    currentRow++;

    // Row 2: СКИДКА ПОСТАВЩИКА (%)
    const discountRowIdx = currentRow;
    sheet.mergeCells(discountRowIdx, 1, discountRowIdx, 9);
    const discLabel = sheet.getCell(discountRowIdx, 1);
    discLabel.value = 'Скидка поставщика (%):';
    discLabel.font = { name: 'Calibri', size: 10, bold: true };
    discLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    for (let c = 1; c <= 9; c++) sheet.getCell(discountRowIdx, c).border = thinBorder;

    suppliers.forEach((s, sIdx) => {
      const startCol = baseColCount + budgetColCount + (sIdx * colsPerSupplier) + 1;
      const endCol = startCol + colsPerSupplier - 1;
      sheet.mergeCells(discountRowIdx, startCol, discountRowIdx, endCol);
      const cell = sheet.getCell(discountRowIdx, startCol);
      cell.value = `${s.discountPercent || 0}%`;
      cell.font = { name: 'Calibri', size: 10, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let c = startCol; c <= endCol; c++) sheet.getCell(discountRowIdx, c).border = thinBorder;
    });

    currentRow++;

    // Row 3: ИТОГО С УЧЕТОМ СКИДОК
    const discTotalRowIdx = currentRow;
    sheet.mergeCells(discTotalRowIdx, 1, discTotalRowIdx, 9);
    const discTotalLabel = sheet.getCell(discTotalRowIdx, 1);
    discTotalLabel.value = 'ИТОГО С УЧЕТОМ СКИДКИ (KZT, с НДС 12%):';
    discTotalLabel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    discTotalLabel.alignment = { horizontal: 'right', vertical: 'middle' };
    for (let c = 1; c <= 9; c++) sheet.getCell(discTotalRowIdx, c).border = doubleBottomBorder;

    suppliers.forEach((s, sIdx) => {
      const startCol = baseColCount + budgetColCount + (sIdx * colsPerSupplier) + 1;
      const endCol = startCol + colsPerSupplier - 1;
      const sumObj = summaries.find(sm => sm.supplierId === (s.id || s.name));
      const sSum12Col = getColLetter(startCol + 4);

      sheet.mergeCells(discTotalRowIdx, startCol, discTotalRowIdx, endCol);
      const cell = sheet.getCell(discTotalRowIdx, startCol);
      const disc = Number(s.discountPercent) || 0;
      cell.value = {
        formula: `${sSum12Col}${totalRowIdx}*(1-${disc}/100)`,
        result: sumObj?.totalWithDiscountKzt12 || 0
      };
      cell.numFmt = '#,##0.00 "₸"';
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: sumObj?.isBestPrice ? 'FF065F46' : 'FF0F172A' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      if (sumObj?.isBestPrice) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
      }
      for (let c = startCol; c <= endCol; c++) sheet.getCell(discTotalRowIdx, c).border = doubleBottomBorder;
    });

    currentRow += 2;

    // 8. PROFITABILITY & CREDIT CALCULATION SECTION (Rows 22+)
    const profHeaderRowIdx = currentRow;
    sheet.mergeCells(profHeaderRowIdx, 1, profHeaderRowIdx, totalCols);
    const profHeader = sheet.getCell(profHeaderRowIdx, 1);
    profHeader.value = 'РАСЧЕТ ДОХОДНОСТИ, КРЕДИТОВАНИЯ И РЕНТАБЕЛЬНОСТИ СДЕЛКИ';
    profHeader.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E293B' } };
    profHeader.alignment = { horizontal: 'left', vertical: 'middle' };
    profHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    currentRow++;

    // Table of profitability per supplier
    const winnerSummary = summaries.find(s => s.isSelected) || summaries.find(s => s.isBestPrice) || summaries[0];
    const creditAmt = Number(comparisonData.creditAmount) || 0;
    const creditDays = Number(comparisonData.creditDays) || 0;
    const creditCost = Number(comparisonData.creditCost) || 0;

    const profRows = [
      {
        label: 'Выручка по договору (Бюджет тендера)',
        val: `${totalBudgetKzt12.toLocaleString('ru-RU')} ₸`,
        note: 'Сумма контракта с заказчиком (с НДС 12%)'
      },
      {
        label: `Сумма закупки у поставщика (${winnerSummary?.name || 'Выбранный контрагент'})`,
        val: `${(winnerSummary?.totalWithDiscountKzt12 || 0).toLocaleString('ru-RU')} ₸`,
        note: `С учетом скидки ${winnerSummary?.discountPercent || 0}%`
      },
      {
        label: 'Валовый доход (Маржа без учета кредита)',
        val: `${(winnerSummary?.grossMarginKzt || 0).toLocaleString('ru-RU')} ₸ (${winnerSummary?.grossMarginPct || 0}%)`,
        note: '= Выручка - Закупка'
      },
      {
        label: 'Расходы на привлечение кредита',
        val: `${creditCost.toLocaleString('ru-RU')} ₸`,
        note: creditAmt > 0 ? `${creditAmt.toLocaleString('ru-RU')} ₸ на ${creditDays} дней` : 'Кредитные средства не привлекаются'
      },
      {
        label: 'Чистый доход с вычетом кредита',
        val: `${(winnerSummary?.netMarginWithCreditKzt || 0).toLocaleString('ru-RU')} ₸`,
        note: '= Валовый доход - Стоимость кредита'
      },
      {
        label: 'Итоговая чистая рентабельность сделки',
        val: `${winnerSummary?.netMarginWithCreditPct || 0}%`,
        note: '= Чистый доход / Выручка * 100'
      }
    ];

    profRows.forEach((pr, prIdx) => {
      const rIdx = currentRow;
      sheet.getRow(rIdx).height = 20;

      sheet.mergeCells(rIdx, 1, rIdx, 4);
      const lCell = sheet.getCell(rIdx, 1);
      lCell.value = pr.label;
      lCell.font = { name: 'Calibri', size: 10, bold: prIdx >= 4 };
      lCell.alignment = { horizontal: 'left', vertical: 'middle' };

      sheet.mergeCells(rIdx, 5, rIdx, 7);
      const vCell = sheet.getCell(rIdx, 5);
      vCell.value = pr.val;
      vCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: prIdx === 5 ? 'FF065F46' : 'FF0F172A' } };
      vCell.alignment = { horizontal: 'right', vertical: 'middle' };

      sheet.mergeCells(rIdx, 8, rIdx, totalCols);
      const nCell = sheet.getCell(rIdx, 8);
      nCell.value = pr.note;
      nCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };
      nCell.alignment = { horizontal: 'left', vertical: 'middle' };

      for (let c = 1; c <= totalCols; c++) {
        sheet.getCell(rIdx, c).border = thinBorder;
      }
      if (prIdx === 5) {
        for (let c = 1; c <= totalCols; c++) {
          sheet.getCell(rIdx, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        }
      }

      currentRow++;
    });

    // 9. COLUMN WIDTHS
    sheet.getColumn(1).width = 6;   // №
    sheet.getColumn(2).width = 14;  // Код МПЗ
    sheet.getColumn(3).width = 42;  // Наименование ТРУ
    sheet.getColumn(4).width = 10;  // Ед. изм.
    sheet.getColumn(5).width = 12;  // Кол-во
    sheet.getColumn(6).width = 16;  // Бюджет Цена 0%
    sheet.getColumn(7).width = 18;  // Бюджет Сумма 0%
    sheet.getColumn(8).width = 16;  // Бюджет Цена 12%
    sheet.getColumn(9).width = 18;  // Бюджет Сумма 12%

    suppliers.forEach((s, idx) => {
      const startCol = baseColCount + budgetColCount + (idx * colsPerSupplier) + 1;
      sheet.getColumn(startCol).width = 30;     // Предлагаемое наименование
      sheet.getColumn(startCol + 1).width = 16; // Цена KZT 0%
      sheet.getColumn(startCol + 2).width = 18; // Сумма KZT 0%
      sheet.getColumn(startCol + 3).width = 16; // Цена KZT 12%
      sheet.getColumn(startCol + 4).width = 18; // Сумма KZT 12%
      sheet.getColumn(startCol + 5).width = 16; // Цена RUB 0%
      sheet.getColumn(startCol + 6).width = 18; // Сумма RUB 0%
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
