import dotenv from 'dotenv';
import { initDatabase, getActiveSalesReps } from './database.js';
import { createBot, registerBotCommands } from './bot.js';
import { initScheduler } from './scheduler.js';
import { createServer } from './server.js';

dotenv.config();

async function main() {
  console.log('====================================================');
  console.log('🛡️  LIBRA SECURITY - SALES REPORT TELEGRAM BOT & WEB UI');
  console.log('====================================================');

  // 1. Initialize SQLite Database
  initDatabase();
  const reps = getActiveSalesReps();
  console.log(`📦 Database initialized with ${reps.length} active sales reps.`);

  // 2. Start Express Web Server & REST API
  const port = process.env.PORT || 3000;
  const app = createServer();
  app.listen(port, () => {
    console.log(`🌐 Web Dashboard & Mini App running at: http://localhost:${port}`);
  });

  // 3. Initialize Telegram Bot
  const bot = createBot();
  if (bot) {
    bot.start({
      onStart: async (botInfo) => {
        console.log(`🤖 Telegram Bot @${botInfo.username} is RUNNING and listening...`);
        await registerBotCommands(bot);
      }
    }).catch(err => {
      console.error('❌ Bot startup error:', err.message);
    });
  } else {
    console.log('ℹ️  Bot token not found in .env. To start live bot, add TELEGRAM_BOT_TOKEN to .env');
    console.log('💡 You can run local simulation test with: npm run test:sim');
  }

  // 4. Initialize Cron Scheduler
  initScheduler(bot);

  console.log('🚀 Service ready.');
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

