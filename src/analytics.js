import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import { getReportsByDateRange, getActiveSalesReps } from './database.js';

dayjs.extend(isoWeek);

/**
 * Format currency helper ($1,234.50)
 */
export function formatCurrency(num) {
  const n = Number(num) || 0;
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Get date range for the current week (Monday to Friday)
 */
export function getCurrentWeekRange(referenceDate = null) {
  const ref = referenceDate ? dayjs(referenceDate) : dayjs();
  const monday = ref.isoWeekday(1).format('YYYY-MM-DD');
  const friday = ref.isoWeekday(5).format('YYYY-MM-DD');
  const sunday = ref.isoWeekday(7).format('YYYY-MM-DD');

  return {
    startDate: monday,
    endDate: friday, // By default sales week evaluates Mon-Fri
    weekNumber: ref.isoWeek(),
    year: ref.year(),
    fullWeekEnd: sunday
  };
}

/**
 * Get date range for the current month
 */
export function getCurrentMonthRange(referenceDate = null) {
  const ref = referenceDate ? dayjs(referenceDate) : dayjs();
  const start = ref.startOf('month').format('YYYY-MM-DD');
  const end = ref.endOf('month').format('YYYY-MM-DD');
  return { startDate: start, endDate: end, monthName: ref.format('MMMM YYYY') };
}

/**
 * Calculate full analytics for a given date range
 */
export function calculateAnalytics(startDate, endDate) {
  const records = getReportsByDateRange(startDate, endDate);
  const salesReps = getActiveSalesReps();

  // Metrics initialization
  let totalNewStart = 0;
  let totalExtra = 0;
  let totalReduction = 0;
  let totalTerminate = 0;

  let countNewStart = 0;
  let countExtra = 0;
  let countReduction = 0;
  let countTerminate = 0;

  // Breakdown dictionaries
  const bySaler = {};
  const byCategory = {
    'Manned Security': { newStart: 0, extra: 0, reduction: 0, terminate: 0, net: 0, count: 0 },
    'CMS': { newStart: 0, extra: 0, reduction: 0, terminate: 0, net: 0, count: 0 },
    'Other': { newStart: 0, extra: 0, reduction: 0, terminate: 0, net: 0, count: 0 }
  };
  const byDate = {};

  // Pre-fill active reps
  for (const rep of salesReps) {
    bySaler[rep.code] = {
      code: rep.code,
      name: rep.name,
      newStart: 0,
      extra: 0,
      reduction: 0,
      terminate: 0,
      net: 0,
      dealCount: 0
    };
  }

  // Process all records
  for (const r of records) {
    const amt = Number(r.amount) || 0;
    const repCode = r.sale_rep_code || 'Unknown';
    const cat = r.service_category || 'Other';
    const status = r.status;
    const dateStr = r.report_date;

    // Ensure saler exists in map
    if (!bySaler[repCode]) {
      bySaler[repCode] = {
        code: repCode,
        name: repCode,
        newStart: 0,
        extra: 0,
        reduction: 0,
        terminate: 0,
        net: 0,
        dealCount: 0
      };
    }

    // Ensure category exists
    if (!byCategory[cat]) {
      byCategory[cat] = { newStart: 0, extra: 0, reduction: 0, terminate: 0, net: 0, count: 0 };
    }

    // Ensure date bucket exists
    if (!byDate[dateStr]) {
      byDate[dateStr] = { date: dateStr, newStart: 0, extra: 0, reduction: 0, terminate: 0, net: 0, count: 0 };
    }

    bySaler[repCode].dealCount += 1;
    byCategory[cat].count += 1;
    byDate[dateStr].count += 1;

    if (status === 'New Start') {
      totalNewStart += amt;
      countNewStart += 1;
      bySaler[repCode].newStart += amt;
      bySaler[repCode].net += amt;
      byCategory[cat].newStart += amt;
      byCategory[cat].net += amt;
      byDate[dateStr].newStart += amt;
      byDate[dateStr].net += amt;
    } else if (status === 'Extra') {
      totalExtra += amt;
      countExtra += 1;
      bySaler[repCode].extra += amt;
      bySaler[repCode].net += amt;
      byCategory[cat].extra += amt;
      byCategory[cat].net += amt;
      byDate[dateStr].extra += amt;
      byDate[dateStr].net += amt;
    } else if (status === 'Reduction') {
      totalReduction += amt;
      countReduction += 1;
      bySaler[repCode].reduction += amt;
      bySaler[repCode].net -= amt;
      byCategory[cat].reduction += amt;
      byCategory[cat].net -= amt;
      byDate[dateStr].reduction += amt;
      byDate[dateStr].net -= amt;
    } else if (status === 'Terminate') {
      totalTerminate += amt;
      countTerminate += 1;
      bySaler[repCode].terminate += amt;
      bySaler[repCode].net -= amt;
      byCategory[cat].terminate += amt;
      byCategory[cat].net -= amt;
      byDate[dateStr].terminate += amt;
      byDate[dateStr].net -= amt;
    }
  }

  const grossAdded = totalNewStart + totalExtra;
  const grossLost = totalReduction + totalTerminate;
  const netAmount = grossAdded - grossLost;

  // Sort salers by net performance descending
  const sortedSalers = Object.values(bySaler).sort((a, b) => b.net - a.net);

  return {
    startDate,
    endDate,
    totalRecords: records.length,
    totals: {
      newStart: totalNewStart,
      countNewStart,
      extra: totalExtra,
      countExtra,
      reduction: totalReduction,
      countReduction,
      terminate: totalTerminate,
      countTerminate,
      grossAdded,
      grossLost,
      netAmount
    },
    bySaler: sortedSalers,
    byCategory,
    byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    records
  };
}

/**
 * Format Weekly Report for Telegram Message (Clean & Short)
 */
export function formatWeeklyTelegramReport(analytics) {
  const { startDate, endDate, totals, bySaler, byCategory } = analytics;
  
  const startFmt = dayjs(startDate).format('DD MMM');
  const endFmt = dayjs(endDate).format('DD MMM YYYY');

  const netEmoji = totals.netAmount >= 0 ? '📈' : '📉';
  const netSign = totals.netAmount >= 0 ? '+' : '';

  let msg = `📊 <b>WEEKLY SALES REPORT</b>\n`;
  msg += `📅 ${startFmt} – ${endFmt}\n\n`;

  // 1. Summary
  msg += `💰 <b>SUMMARY</b>\n`;
  msg += `• New Start (${totals.countNewStart}): <b>${formatCurrency(totals.newStart)}</b>\n`;
  msg += `• Extra (${totals.countExtra}): <b>${formatCurrency(totals.extra)}</b>\n`;
  if (totals.countReduction > 0) msg += `• Reduction (${totals.countReduction}): <b>-${formatCurrency(totals.reduction)}</b>\n`;
  if (totals.countTerminate > 0) msg += `• Terminate (${totals.countTerminate}): <b>-${formatCurrency(totals.terminate)}</b>\n`;
  msg += `${netEmoji} <b>NET TOTAL:</b> <b>${netSign}${formatCurrency(totals.netAmount)}</b>\n\n`;

  // 2. Sales Rep Leaderboard
  msg += `🏆 <b>SALES RANKING</b>\n`;
  bySaler.forEach((rep, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '👤';
    const repSign = rep.net >= 0 ? '+' : '';
    let details = [];
    if (rep.newStart > 0) details.push(`New ${formatCurrency(rep.newStart)}`);
    if (rep.extra > 0) details.push(`Extra ${formatCurrency(rep.extra)}`);
    if (rep.reduction > 0) details.push(`Reduct -${formatCurrency(rep.reduction)}`);
    if (rep.terminate > 0) details.push(`Term -${formatCurrency(rep.terminate)}`);
    
    const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
    msg += `${medal} <b>${rep.code}:</b> <b>${repSign}${formatCurrency(rep.net)}</b>${detailStr}\n`;
  });
  msg += `\n`;

  // 3. Service Breakdown
  msg += `🏢 <b>SERVICES</b>\n`;
  for (const [catName, data] of Object.entries(byCategory)) {
    if (data.count > 0 || catName === 'Manned Security' || catName === 'CMS') {
      const catSign = data.net >= 0 ? '+' : '';
      const icon = catName === 'Manned Security' ? '👮' : catName === 'CMS' ? '🚨' : '📦';
      const shortName = catName === 'Manned Security' ? 'Manned' : catName;
      msg += `• ${icon} ${shortName}: <b>${catSign}${formatCurrency(data.net)}</b>\n`;
    }
  }

  return msg;
}

/**
 * Format Today's Daily Summary (Clean & Short)
 */
export function formatDailyTelegramSummary(dateStr) {
  const analytics = calculateAnalytics(dateStr, dateStr);
  const formattedDate = dayjs(dateStr).format('DD MMM YYYY');

  let msg = `📋 <b>TODAY'S SALES (${formattedDate})</b>\n\n`;

  if (analytics.totalRecords === 0) {
    msg += `<i>No sales recorded today yet.</i>`;
    return msg;
  }

  analytics.records.forEach((r, i) => {
    const icon = r.status === 'New Start' ? '🟢' : r.status === 'Extra' ? '✨' : r.status === 'Reduction' ? '🔻' : '❌';
    const client = r.client_name ? ` (${r.client_name})` : '';
    const catShort = r.service_category === 'Manned Security' ? 'Manned' : r.service_category;
    msg += `${i + 1}. ${icon} <b>${r.sale_rep_code}</b> | ${catShort} | ${r.status}: <b>${formatCurrency(r.amount)}</b>${client}\n`;
  });

  const netSign = analytics.totals.netAmount >= 0 ? '+' : '';
  msg += `\n👉 <b>Today Net:</b> <b>${netSign}${formatCurrency(analytics.totals.netAmount)}</b>`;

  return msg;
}

/**
 * Format Salers Only Ranking
 */
export function formatSalersTelegramReport(analytics) {
  const { startDate, endDate, bySaler } = analytics;
  const startFmt = dayjs(startDate).format('DD MMM');
  const endFmt = dayjs(endDate).format('DD MMM YYYY');

  let msg = `🏆 <b>SALES RANKING (${startFmt} – ${endFmt})</b>\n\n`;
  bySaler.forEach((rep, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '👤';
    const repSign = rep.net >= 0 ? '+' : '';
    msg += `${medal} <b>${rep.code}</b>\n`;
    msg += `   • Net: <b>${repSign}${formatCurrency(rep.net)}</b> (${rep.dealCount} deals)\n`;
    msg += `   • New: ${formatCurrency(rep.newStart)} | Extra: ${formatCurrency(rep.extra)}\n`;
    if (rep.reduction > 0 || rep.terminate > 0) {
      msg += `   • Reduct: -${formatCurrency(rep.reduction)} | Term: -${formatCurrency(rep.terminate)}\n`;
    }
  });

  return msg;
}

/**
 * Format Totals Summary Only
 */
export function formatTotalsTelegramReport(analytics) {
  const { startDate, endDate, totals, totalRecords } = analytics;
  const startFmt = dayjs(startDate).format('DD MMM');
  const endFmt = dayjs(endDate).format('DD MMM YYYY');
  const netEmoji = totals.netAmount >= 0 ? '📈' : '📉';
  const netSign = totals.netAmount >= 0 ? '+' : '';

  let msg = `💰 <b>TOTALS SUMMARY (${startFmt} – ${endFmt})</b>\n\n`;
  msg += `• 🟢 New Start: <b>${formatCurrency(totals.newStart)}</b> (${totals.countNewStart})\n`;
  msg += `• ✨ Extra: <b>${formatCurrency(totals.extra)}</b> (${totals.countExtra})\n`;
  msg += `• ➕ Gross Added: <b>${formatCurrency(totals.grossAdded)}</b>\n`;
  msg += `• 🔻 Reduction: <b>-${formatCurrency(totals.reduction)}</b> (${totals.countReduction})\n`;
  msg += `• ❌ Terminate: <b>-${formatCurrency(totals.terminate)}</b> (${totals.countTerminate})\n`;
  msg += `• ➖ Gross Lost: <b>-${formatCurrency(totals.grossLost)}</b>\n`;
  msg += `────────────────────\n`;
  msg += `${netEmoji} <b>NET SALES REVENUE:</b> <b>${netSign}${formatCurrency(totals.netAmount)}</b>\n`;
  msg += `📊 Total Transactions: <b>${totalRecords}</b>`;

  return msg;
}
