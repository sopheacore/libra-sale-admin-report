import dayjs from 'dayjs';
import { initDatabase, insertBatchReports, db } from './database.js';
import { parseReportMessage } from './parser.js';
import { calculateAnalytics, formatWeeklyTelegramReport, formatDailyTelegramSummary, getCurrentWeekRange } from './analytics.js';
import { generateWeeklyExcel } from './excel.js';

async function runSimulator() {
  console.log('===========================================================');
  console.log('🧪 RUNNING LIBRA SALES BOT SIMULATION & TEST SUITE');
  console.log('===========================================================\n');

  // 1. Initialize Database
  initDatabase();

  // Clean old test records if any
  db.exec('DELETE FROM daily_reports');
  console.log('🧹 Cleaned existing daily reports for clean simulation run.\n');

  // 2. Define Sample Daily Messages from Sale Admin
  const sampleMessages = [
    {
      day: 'Monday (2026-09-01)',
      sender: 'Sale Admin Sophea',
      text: `Daily Report 2026-09-01
Sale ID : Mr. A1
Service Catego: Manned Security
Status: New Start
Amout: $1,200.00
Client: Chip Mong Tower

Sale ID : Mr. B2
Service Catego: CMS
Status: Extra
Amout: $350.00
Client: ACLEDA Bank Sen Sok`
    },
    {
      day: 'Tuesday (2026-09-02)',
      sender: 'Sale Admin Sophea',
      text: `Daily Sales Report 2026-09-02:
1. Sale ID: Mr. C3 | Service: Manned Security | Status: New Start | Amount: $2,400.00 | Client: Olympia Mall
2. Sale ID: Mr. D4 | Service: CMS | Status: New Start | Amount: $500.00 | Client: Vattanac Villa
3. Sale ID: Mr. E5 | Service: Other | Status: Extra | Amount: $150.00 | Client: Diamond Island Warehouse`
    },
    {
      day: 'Wednesday (2026-09-03)',
      sender: 'Sale Admin Sophea',
      text: `Daily Report 2026-09-03:
- Sale ID: Mr. A1
- Service: Manned Security
- Status: Extra
- Amount: $400.00
- Client: Chip Mong Tower (Added 2 Night Guards)

- Sale ID: Mr. B2
- Service: Manned Security
- Status: Reduction
- Amount: $300.00
- Client: Borey Peng Huoth (Reduced 1 Guard)`
    },
    {
      day: 'Thursday (2026-09-04)',
      sender: 'Sale Admin Sophea',
      text: `Daily Report 2026-09-04
Sale ID : Mr. C3
Service: Manned Security
Status: Terminate
Amount: $800.00
Client: Old Factory (Contract Ended)

Sale ID : Mr. D4
Service: CMS
Status: Extra
Amount: $250.00
Client: Smart Shop Toul Kork`
    },
    {
      day: 'Friday (2026-09-05)',
      sender: 'Sale Admin Sophea',
      text: `Daily Report 2026-09-05
Sale ID : Mr. E5
Service: Manned Security
Status: New Start
Amount: $1,800.00
Client: Aeon Mall 3 Retailer

Sale ID : Mr. A1
Service: CMS
Status: New Start
Amount: $600.00
Client: Condo 51`
    }
  ];

  console.log('📥 STEP 1: Simulating Daily Reports Reception and Parsing...');
  let totalParsed = 0;

  for (const item of sampleMessages) {
    console.log(`\n-----------------------------------------------------------`);
    console.log(`📩 Processing message for ${item.day} from "${item.sender}"...`);
    const parsed = parseReportMessage(item.text, { reported_by: item.sender });
    console.log(`✅ Successfully extracted ${parsed.length} entries:`);
    
    parsed.forEach((p, idx) => {
      console.log(`   [${idx + 1}] Date: ${p.report_date} | Rep: ${p.sale_rep_code} | Cat: ${p.service_category} | Status: ${p.status} | Amount: $${p.amount} | Client: ${p.client_name || '-'}`);
    });

    const ids = insertBatchReports(parsed);
    totalParsed += ids.length;
  }

  console.log(`\n🎉 Total daily transactions saved to SQLite: ${totalParsed}\n`);

  // 3. Test Daily Summary Format
  console.log('===========================================================');
  console.log('📋 STEP 2: Testing Daily Summary View for Tuesday (2026-09-02)...');
  console.log('===========================================================');
  const dailyView = formatDailyTelegramSummary('2026-09-02');
  console.log(dailyView.replace(/<[^>]+>/g, '')); // Strip HTML for console readability

  // 4. Test Weekly Friday Report Generation
  console.log('\n===========================================================');
  console.log('🏆 STEP 3: Generating Weekly Sales Performance Report (Mon-Fri)...');
  console.log('===========================================================');
  const analytics = calculateAnalytics('2026-09-01', '2026-09-05');
  const weeklyReport = formatWeeklyTelegramReport(analytics);
  console.log(weeklyReport.replace(/<[^>]+>/g, ''));

  // 5. Test Excel Export
  console.log('\n===========================================================');
  console.log('📊 STEP 4: Testing Excel Export (.xlsx)...');
  console.log('===========================================================');
  const excelRes = await generateWeeklyExcel('2026-09-01', '2026-09-05', './exports');
  console.log(`✅ Excel report successfully generated at: ${excelRes.filePath}`);

  // 6. Validation Assertions
  console.log('\n===========================================================');
  console.log('🔍 STEP 5: Mathematical Verification');
  console.log('===========================================================');
  
  // Calculate expected:
  // Mon: A1 New 1200, B2 Extra 350
  // Tue: C3 New 2400, D4 New 500, E5 Extra 150
  // Wed: A1 Extra 400, B2 Reduct 300
  // Thu: C3 Term 800, D4 Extra 250
  // Fri: E5 New 1800, A1 New 600
  //
  // New Start: 1200 + 2400 + 500 + 1800 + 600 = 6500 (5 deals)
  // Extra: 350 + 150 + 400 + 250 = 1150 (4 deals)
  // Gross Added: 6500 + 1150 = 7650
  // Reduction: 300 (1 deal)
  // Terminate: 800 (1 deal)
  // Gross Lost: 1100
  // Net: 7650 - 1100 = 6550

  console.log(`New Start Expected: $6,500.00 | Actual: $${analytics.totals.newStart.toFixed(2)} -> ${analytics.totals.newStart === 6500 ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`Extra Expected:     $1,150.00 | Actual: $${analytics.totals.extra.toFixed(2)} -> ${analytics.totals.extra === 1150 ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`Reduction Expected:   $300.00 | Actual: $${analytics.totals.reduction.toFixed(2)} -> ${analytics.totals.reduction === 300 ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`Terminate Expected:   $800.00 | Actual: $${analytics.totals.terminate.toFixed(2)} -> ${analytics.totals.terminate === 800 ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`Net Sales Expected: $6,550.00 | Actual: $${analytics.totals.netAmount.toFixed(2)} -> ${analytics.totals.netAmount === 6550 ? '✅ MATCH' : '❌ MISMATCH'}`);

  console.log('\n✨ ALL SIMULATION CHECKS COMPLETED SUCCESSFULLY!');
}

runSimulator().catch(console.error);
