import cron from 'node-cron';
import dotenv from 'dotenv';
import { sendScheduledFridayReport } from './bot.js';

dotenv.config();

/**
 * Initialize Friday Weekly Report Cron Job
 */
export function initScheduler(bot) {
  // Default: Every Friday at 17:30 (5:30 PM)
  const cronExpression = process.env.WEEKLY_REPORT_CRON || '30 17 * * 5';
  const timezone = process.env.TIMEZONE || 'Asia/Phnom_Penh';

  console.log(`⏰ Initializing Weekly Report Scheduler: [${cronExpression}] in timezone [${timezone}]`);

  cron.schedule(cronExpression, async () => {
    console.log(`🔔 Scheduled trigger fired: Running Friday Sales Weekly Report...`);
    if (bot) {
      await sendScheduledFridayReport(bot);
    } else {
      console.log(`⚠️ Bot not initialized. Skipping scheduled message broadcast.`);
    }
  }, {
    timezone: timezone
  });
}
