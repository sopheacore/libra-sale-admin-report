import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import { calculateAnalytics } from './analytics.js';

/**
 * Generate formatted Excel Workbook from weekly analytics
 */
export async function generateWeeklyExcel(startDate, endDate, outputDir = './exports') {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const analytics = calculateAnalytics(startDate, endDate);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Libra Security Sales Bot';
  workbook.created = new Date();

  // Sheet 1: Executive Summary
  const summarySheet = workbook.addWorksheet('Weekly Summary', {
    views: [{ showGridLines: true }]
  });

  // Title styling
  summarySheet.mergeCells('A1:E1');
  const titleCell = summarySheet.getCell('A1');
  titleCell.value = `LIBRA SECURITY - WEEKLY SALES REPORT (${dayjs(startDate).format('DD/MM/YYYY')} - ${dayjs(endDate).format('DD/MM/YYYY')})`;
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A365D' } }; // Dark Navy
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getRow(1).height = 30;

  // Key KPI Blocks
  summarySheet.addRow([]);
  summarySheet.addRow(['Metric', 'Count', 'Amount ($)']);
  summarySheet.getRow(3).font = { bold: true };
  summarySheet.getRow(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const kpiData = [
    ['New Start', analytics.totals.countNewStart, analytics.totals.newStart],
    ['Extra Service', analytics.totals.countExtra, analytics.totals.extra],
    ['Gross Added', analytics.totals.countNewStart + analytics.totals.countExtra, analytics.totals.grossAdded],
    ['Reduction', analytics.totals.countReduction, -analytics.totals.reduction],
    ['Terminate', analytics.totals.countTerminate, -analytics.totals.terminate],
    ['Gross Lost', analytics.totals.countReduction + analytics.totals.countTerminate, -analytics.totals.grossLost],
    ['NET REVENUE', analytics.totalRecords, analytics.totals.netAmount]
  ];

  kpiData.forEach((row, idx) => {
    const r = summarySheet.addRow(row);
    r.getCell(3).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    if (idx === 2 || idx === 5) {
      r.font = { bold: true };
    }
    if (idx === 6) {
      r.font = { bold: true, size: 11 };
      r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
    }
  });

  // Sales Rep Table
  summarySheet.addRow([]);
  summarySheet.addRow(['SALES REP BREAKDOWN']);
  summarySheet.getRow(12).font = { bold: true, size: 12 };

  summarySheet.addRow(['Sale ID', 'Name', 'New Start ($)', 'Extra ($)', 'Reduction ($)', 'Terminate ($)', 'Net Amount ($)', 'Deals']);
  const repHeaderRow = summarySheet.getRow(13);
  repHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  repHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B6CB0' } };

  analytics.bySaler.forEach(rep => {
    const row = summarySheet.addRow([
      rep.code,
      rep.name,
      rep.newStart,
      rep.extra,
      rep.reduction > 0 ? -rep.reduction : 0,
      rep.terminate > 0 ? -rep.terminate : 0,
      rep.net,
      rep.dealCount
    ]);
    row.getCell(3).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    row.getCell(4).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    row.getCell(5).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    row.getCell(6).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    row.getCell(7).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"-"';
    row.getCell(7).font = { bold: true };
  });

  // Auto-fit columns
  summarySheet.columns.forEach(column => {
    let maxLength = 15;
    column.eachCell({ includeEmpty: true }, cell => {
      const colLength = cell.value ? String(cell.value).length : 0;
      if (colLength > maxLength) maxLength = colLength;
    });
    column.width = maxLength + 3;
  });

  // Sheet 2: Itemized Transactions
  const detailSheet = workbook.addWorksheet('Daily Transactions', {
    views: [{ showGridLines: true }]
  });

  detailSheet.addRow(['ID', 'Date', 'Sale Rep', 'Service Category', 'Status', 'Amount ($)', 'Client Name', 'Notes', 'Reported By']);
  const detHeader = detailSheet.getRow(1);
  detHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  detHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3748' } };
  detailSheet.getRow(1).height = 24;

  analytics.records.forEach(r => {
    const row = detailSheet.addRow([
      r.id,
      r.report_date,
      r.sale_rep_code,
      r.service_category,
      r.status,
      r.amount,
      r.client_name || '-',
      r.notes || '-',
      r.reported_by || '-'
    ]);
    row.getCell(6).numFmt = '"$"#,##0.00';
  });

  detailSheet.columns.forEach(column => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: true }, cell => {
      const colLength = cell.value ? String(cell.value).length : 0;
      if (colLength > maxLength) maxLength = colLength;
    });
    column.width = Math.min(maxLength + 3, 35);
  });

  const fileName = `Libra_Sales_Report_${startDate}_to_${endDate}.xlsx`;
  const filePath = path.join(outputDir, fileName);
  await workbook.xlsx.writeFile(filePath);

  return { filePath, fileName, analytics };
}
