import { Bot, InputFile, InlineKeyboard, Keyboard } from 'grammy';
import dotenv from 'dotenv';
import dayjs from 'dayjs';
import { 
  insertBatchReports, 
  deleteReportById, 
  getReportById, 
  getActiveSalesReps, 
  upsertSalesRep,
  recordWeeklySummary 
} from './database.js';
import { parseReportMessage } from './parser.js';
import { 
  calculateAnalytics, 
  formatWeeklyTelegramReport, 
  formatDailyTelegramSummary, 
  getCurrentWeekRange,
  getCurrentMonthRange,
  formatSalersTelegramReport,
  formatTotalsTelegramReport,
  formatCurrency 
} from './analytics.js';
import { generateWeeklyExcel } from './excel.js';

dotenv.config();

export function createBot(token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token || token === 'your_telegram_bot_token_here') {
    console.warn('⚠️ No TELEGRAM_BOT_TOKEN provided. Running in offline/simulation mode.');
    return null;
  }

  const bot = new Bot(token);

  // Global error handler
  bot.catch((err) => {
    console.error('⚠️ Telegram Bot Error caught:', err.message);
  });

  // Logging middleware
  bot.use(async (ctx, next) => {
    if (ctx.message?.text) {
      console.log(`📩 [Chat: ${ctx.chat?.title || ctx.chat?.id}] From ${ctx.from?.first_name}: "${ctx.message.text}"`);
    }
    await next();
  });

  // Helper to check if sender is admin
  function isAdmin(userId) {
    const adminIds = (process.env.ADMIN_USER_IDS || '').split(',').map(id => id.trim());
    return adminIds.includes(String(userId));
  }

  // Persistent bottom Reply Keyboard (Always visible at bottom of chat)
  function buildPersistentKeyboard() {
    return new Keyboard()
      .text('📅 Today').text('📊 This Week').row()
      .text('🗓️ This Month').text('🏆 Salers').row()
      .text('💰 Totals').text('📥 Excel')
      .resized();
  }

  // Inline buttons attached to message
  function buildInlineKeyboard() {
    const port = process.env.PORT || 3000;
    const webAppUrl = process.env.WEB_APP_URL || '';
    const keyboard = new InlineKeyboard();

    keyboard
      .text('📅 Today', 'menu_today')
      .text('📊 Weekly', 'menu_weekly')
      .row()
      .text('🗓️ Monthly', 'menu_monthly')
      .text('🏆 By Sales', 'menu_bysales')
      .row()
      .text('💰 Totals', 'menu_totals');

    if (webAppUrl.startsWith('https://')) {
      keyboard.webApp('📈 Dashboard', webAppUrl);
    } else {
      keyboard.text('📈 Dashboard', 'menu_dashboard');
    }

    keyboard
      .row()
      .text('📥 Excel Export', 'menu_excel')
      .text('📝 Template', 'menu_help');

    return keyboard;
  }

  // Handler for /start and /menu
  const sendMainMenu = async (ctx) => {
    const welcome = `🛡️ <b>LIBRA SALES REPORT MENU</b>\n\n` +
      `Tap any button below or choose an option:`;

    await ctx.reply(welcome, {
      parse_mode: 'HTML',
      reply_markup: buildPersistentKeyboard()
    });
  };

  bot.command(['start', 'menu'], sendMainMenu);
  bot.hears(/^\/(start|menu)(@\w+)?/i, sendMainMenu);
  bot.hears(/^(menu|help|hi|hello)$/i, sendMainMenu);

  // Listeners for Persistent Keyboard Button Taps
  bot.hears(['📅 Today', 'today', '/today'], async (ctx) => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    const summary = formatDailyTelegramSummary(todayStr);
    await ctx.reply(summary, { parse_mode: 'HTML' });
  });

  bot.hears(['📊 This Week', 'weekly', '/thisweek', '/weekly_report'], async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatWeeklyTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  bot.hears(['🗓️ This Month', 'month', '/month'], async (ctx) => {
    const { startDate, endDate } = getCurrentMonthRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatWeeklyTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  bot.hears(['🏆 Salers', 'sales', '/sales', '/sales_rank'], async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatSalersTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  bot.hears(['💰 Totals', 'totals', '/totals'], async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatTotalsTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  bot.hears(['📥 Excel', 'excel', '/export_excel'], async (ctx) => {
    await ctx.reply('⏳ Generating Excel report...');
    const { startDate, endDate } = getCurrentWeekRange();
    try {
      const { filePath, fileName } = await generateWeeklyExcel(startDate, endDate);
      await ctx.replyWithDocument(new InputFile(filePath, fileName), {
        caption: `📊 <b>Sales Report (${startDate} to ${endDate})</b>`,
        parse_mode: 'HTML'
      });
    } catch (err) {
      await ctx.reply(`❌ Failed to generate Excel: ${err.message}`);
    }
  });

  bot.callbackQuery('menu_help', async (ctx) => {
    await ctx.answerCallbackQuery();
    const helpMsg = `📝 <b>Daily Report Template:</b>\n\n` +
      `<code>Sale ID: Mr. Chun Sros\nService: Manned Security\nStatus: New Start\nAmount: $1,200.00\nClient: Chip Mong</code>\n\n` +
      `<b>⚡ Shorthand:</b>\n` +
      `<code>Mr. Chun Sros | Manned | New Start | $1,200\nMr. Heng Chin | CMS | Extra | $350</code>\n\n` +
      `<i>Statuses: New Start, Extra, Reduction, Terminate</i>`;
    await ctx.reply(helpMsg, { parse_mode: 'HTML' });
  });

  bot.callbackQuery('menu_dashboard', async (ctx) => {
    await ctx.answerCallbackQuery();
    const port = process.env.PORT || 3000;
    const webAppUrl = process.env.WEB_APP_URL || `http://localhost:${port}`;
    await ctx.reply(
      `🌐 <b>Libra Sales Web Dashboard</b>\n\n` +
      `Open in your browser:\n` +
      `👉 <code>${webAppUrl}</code>\n\n` +
      `<i>(Live charts, sales leaderboard, and itemized records)</i>`,
      { parse_mode: 'HTML' }
    );
  });

  bot.callbackQuery('menu_excel', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Generating Excel...' });
    const { startDate, endDate } = getCurrentWeekRange();
    try {
      const { filePath, fileName } = await generateWeeklyExcel(startDate, endDate);
      await ctx.replyWithDocument(new InputFile(filePath, fileName), {
        caption: `📊 <b>Sales Report (${startDate} to ${endDate})</b>`,
        parse_mode: 'HTML'
      });
    } catch (err) {
      await ctx.reply(`❌ Failed to generate Excel: ${err.message}`);
    }
  });

  // /dashboard command
  bot.command('dashboard', async (ctx) => {
    const port = process.env.PORT || 3000;
    const webAppUrl = process.env.WEB_APP_URL || `http://localhost:${port}`;

    if (webAppUrl.startsWith('https://')) {
      const keyboard = new InlineKeyboard().webApp('📊 Open Sales Dashboard', webAppUrl);
      await ctx.reply(
        `📊 <b>Libra Sales Interactive Dashboard</b>\n\nClick below to open:`,
        { parse_mode: 'HTML', reply_markup: keyboard }
      );
    } else {
      await ctx.reply(
        `🌐 <b>Libra Sales Web Dashboard</b>\n\n` +
        `Open in your browser:\n` +
        `👉 <code>${webAppUrl}</code>`,
        { parse_mode: 'HTML' }
      );
    }
  });

  // /help command
  bot.command('help', async (ctx) => {
    const helpMsg = `📝 <b>Daily Report Template:</b>\n\n` +
      `<code>Sale ID: Mr. Chun Sros\nService: Manned Security\nStatus: New Start\nAmount: $1,200.00\nClient: Chip Mong</code>\n\n` +
      `<b>⚡ Shorthand:</b>\n` +
      `<code>Mr. Chun Sros | Manned | New Start | $1,200\nMr. Heng Chin | CMS | Extra | $350</code>\n\n` +
      `<i>Statuses: New Start, Extra, Reduction, Terminate</i>`;

    await ctx.reply(helpMsg, { parse_mode: 'HTML' });
  });

  // /today command
  bot.command('today', async (ctx) => {
    const todayStr = dayjs().format('YYYY-MM-DD');
    const summary = formatDailyTelegramSummary(todayStr);
    await ctx.reply(summary, { parse_mode: 'HTML' });
  });

  // /thisweek command
  bot.command('thisweek', async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatWeeklyTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  // /month command
  bot.command('month', async (ctx) => {
    const { startDate, endDate } = getCurrentMonthRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatWeeklyTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  // /sales_rank command
  bot.command('sales_rank', async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatSalersTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  // /totals command
  bot.command('totals', async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const report = formatTotalsTelegramReport(analytics);
    await ctx.reply(report, { parse_mode: 'HTML' });
  });

  // /weekly_report command
  bot.command('weekly_report', async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const reportText = formatWeeklyTelegramReport(analytics);

    // Save summary record
    recordWeeklySummary({
      week_start: startDate,
      week_end: endDate,
      total_new_start: analytics.totals.newStart,
      total_extra: analytics.totals.extra,
      total_reduction: analytics.totals.reduction,
      total_terminate: analytics.totals.terminate,
      net_amount: analytics.totals.netAmount,
      total_entries: analytics.totalRecords,
      summary_payload: JSON.stringify(analytics),
      sent_to_telegram: 1
    });

    await ctx.reply(reportText, { parse_mode: 'HTML' });
  });

  // /export_excel command
  bot.command('export_excel', async (ctx) => {
    const { startDate, endDate } = getCurrentWeekRange();
    await ctx.reply('⏳ Generating Excel report...');

    try {
      const { filePath, fileName } = await generateWeeklyExcel(startDate, endDate);
      await ctx.replyWithDocument(new InputFile(filePath, fileName), {
        caption: `📊 <b>Sales Report (${startDate} to ${endDate})</b>`,
        parse_mode: 'HTML'
      });
    } catch (err) {
      console.error('Excel generation error:', err);
      await ctx.reply(`❌ Failed to generate Excel: ${err.message}`);
    }
  });

  // /sales command
  bot.command('sales', async (ctx) => {
    const reps = getActiveSalesReps();
    let msg = `👥 <b>Active Salers:</b>\n\n`;
    reps.forEach((r, idx) => {
      msg += `${idx + 1}. <b>${r.code}</b>\n`;
    });
    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // /delete [id] command
  bot.command('delete', async (ctx) => {
    const args = ctx.message.text.split(/\s+/).slice(1);
    const id = parseInt(args[0], 10);
    if (isNaN(id)) {
      return ctx.reply('❌ Example: <code>/delete 12</code>', { parse_mode: 'HTML' });
    }

    const existing = getReportById(id);
    if (!existing) {
      return ctx.reply(`❌ Report #${id} not found.`);
    }

    const success = deleteReportById(id);
    if (success) {
      await ctx.reply(`✅ Deleted entry <b>#${id}</b> (${existing.sale_rep_code} - ${existing.status} ${formatCurrency(existing.amount)})`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply(`❌ Could not delete #${id}.`);
    }
  });

  // /add_rep command
  bot.command('add_rep', async (ctx) => {
    const text = ctx.message.text.replace('/add_rep', '').trim();
    const parts = text.split('|').map(p => p.trim());
    if (parts.length < 2) {
      return ctx.reply('❌ Format: <code>/add_rep [Code] | [Full Name]</code>', { parse_mode: 'HTML' });
    }

    upsertSalesRep(parts[0], parts[1]);
    await ctx.reply(`✅ Added Saler: <b>${parts[0]}</b> (${parts[1]})`, { parse_mode: 'HTML' });
  });

  // Group Message Listener (Daily Reports)
  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const chatId = ctx.chat.id;
    const chatType = ctx.chat.type;
    const chatTitle = ctx.chat.title || 'Private Chat';

    if (chatType === 'group' || chatType === 'supergroup') {
      if (!process.env.TELEGRAM_GROUP_ID) {
        process.env.TELEGRAM_GROUP_ID = String(chatId);
        console.log(`📌 Auto-detected Sales Group: "${chatTitle}" (Chat ID: ${chatId}). Set as active reporting group!`);
      }
    }

    // Ignore commands starting with '/'
    if (text.startsWith('/')) return;

    const senderName = ctx.from?.first_name || ctx.from?.username || 'Sale Admin';
    const messageMeta = {
      reported_by: senderName,
      telegram_message_id: ctx.message.message_id
    };

    // Try parsing the message
    const parsedItems = parseReportMessage(text, messageMeta);

    if (parsedItems && parsedItems.length > 0) {
      insertBatchReports(parsedItems);

      const dateFormatted = dayjs(parsedItems[0].report_date).format('DD MMM YYYY');
      const entryText = parsedItems.length === 1 ? '1 entry' : `${parsedItems.length} entries`;
      const replyText = `✅ <b>Saved (${entryText}) • ${dateFormatted}</b>`;

      await ctx.reply(replyText, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id
      });
    }
  });

  return bot;
}

/**
 * Trigger Friday automated weekly report broadcast
 */
export async function sendScheduledFridayReport(bot, targetGroupId = process.env.TELEGRAM_GROUP_ID) {
  if (!bot || !targetGroupId) {
    console.log('⚠️ Scheduled Friday Report: Bot or TELEGRAM_GROUP_ID not configured.');
    return;
  }

  try {
    const { startDate, endDate } = getCurrentWeekRange();
    const analytics = calculateAnalytics(startDate, endDate);
    const reportText = formatWeeklyTelegramReport(analytics);

    // 1. Send Markdown/HTML summary
    await bot.api.sendMessage(targetGroupId, reportText, { parse_mode: 'HTML' });

    // 2. Generate and send Excel report
    const { filePath, fileName } = await generateWeeklyExcel(startDate, endDate);
    await bot.api.sendDocument(targetGroupId, new InputFile(filePath, fileName), {
      caption: `📎 <b>Official Libra Sales Report Sheet (${startDate} to ${endDate})</b>`,
      parse_mode: 'HTML'
    });

    // 3. Save weekly summary record
    recordWeeklySummary({
      week_start: startDate,
      week_end: endDate,
      total_new_start: analytics.totals.newStart,
      total_extra: analytics.totals.extra,
      total_reduction: analytics.totals.reduction,
      total_terminate: analytics.totals.terminate,
      net_amount: analytics.totals.netAmount,
      total_entries: analytics.totalRecords,
      summary_payload: JSON.stringify(analytics),
      sent_to_telegram: 1
    });

    console.log(`✅ Friday Weekly Report successfully posted to Telegram group ${targetGroupId}`);
  } catch (error) {
    console.error('❌ Failed to post scheduled Friday report:', error);
  }
}

/**
 * Register Native Telegram Bot Commands for All Groups & Private Chats
 */
export async function registerBotCommands(bot) {
  if (!bot) return;
  const commandList = [
    { command: 'menu', description: '📋 Open Report Menu' },
    { command: 'today', description: "📅 Today's Sales Log" },
    { command: 'thisweek', description: '📊 This Week Performance' },
    { command: 'month', description: '🗓️ This Month Summary' },
    { command: 'sales_rank', description: '🏆 Sales Rep Ranking' },
    { command: 'totals', description: '💰 Financial Totals' },
    { command: 'dashboard', description: '🌐 Open Web Dashboard' },
    { command: 'export_excel', description: '📥 Download Excel Report' },
    { command: 'help', description: '📝 Report Format Template' }
  ];

  try {
    await bot.api.setMyCommands(commandList, { scope: { type: 'default' } });
    await bot.api.setMyCommands(commandList, { scope: { type: 'all_group_chats' } });
    await bot.api.setMyCommands(commandList, { scope: { type: 'all_private_chats' } });
    await bot.api.setChatMenuButton({ menu_button: { type: 'commands' } });
    console.log('✅ Successfully synced Telegram Menu commands for all groups & chats.');
  } catch (err) {
    console.warn('Could not sync Telegram commands list:', err.message);
  }
}
