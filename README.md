# 🛡️ Libra Sales Telegram Reporting Bot

Automated Telegram Bot designed for the **Libra Security Sales Team (5 Salers + 1 Sale Admin)**. It automatically captures daily sales logs submitted in Telegram group chats, calculates weekly aggregates, and broadcasts an executive performance summary every Friday.

---

## 🚀 Key Features

1. **Intelligent Daily Report Parser**:
   - Automatically listens to messages posted by Sale Admin in the Telegram group.
   - Parses single or multi-deal messages effortlessly.
   - Extracts:
     - **Sale ID / Rep**: (e.g., `Mr. A1`, `Mr. B2`, `Mr. C3`, `Mr. D4`, `Mr. E5`)
     - **Service Category**: `Manned Security`, `CMS` (CMS 911 Alarm), or `Other`
     - **Status**: `New Start` (+), `Extra` (+), `Reduction` (-), `Terminate` (-)
     - **Amount**: `$xxxx.xx`
     - **Client Name & Remarks** (Optional)

2. **Automated Weekly Friday Report**:
   - Automatically triggers **every Friday at 17:30 (GMT+7 Phnom Penh time)**.
   - Calculates **Gross Added**, **Gross Lost**, and **Net Sales Revenue**.
   - Generates a **Sales Rep Performance Leaderboard (Ranked 1st to 5th)**.
   - Generates a **Service Category Breakdown** (`Manned Security` vs `CMS`).

3. **Interactive Telegram Commands**:
   - `/today` – Live summary of sales logged today.
   - `/thisweek` – Live progress and totals for the ongoing week.
   - `/weekly_report` – On-demand generation of the full Friday performance report.
   - `/export_excel` – Generates and uploads a styled `.xlsx` workbook to Telegram.
   - `/sales` – Lists all active registered sales representatives.
   - `/delete <id>` – Delete a mistaken entry by ID (e.g. `/delete 5`).
   - `/add_rep <code | name>` – Register or update sales reps (e.g. `/add_rep Mr. F6 | John Doe`).
   - `/help` – Displays reporting templates and instructions.

4. **Persistent SQLite Database**:
   - Stored in `./data/sales_reports.db` with WAL mode enabled.
   - Keeps historical transaction records, rep data, and weekly summaries.

---

## 📋 Daily Report Message Formats

Sale Admin can post in any of these flexible formats into the Telegram group:

### Format A: Multi-Line Standard Template (Recommended)
```text
Daily Report 2026-09-07
Sale ID : Mr. A1
Service Catego: Manned Security
Status: New Start
Amout: $1,200.00
Client: Chip Mong Tower

Sale ID : Mr. B2
Service Catego: CMS
Status: Extra
Amout: $350.00
Client: ACLEDA Bank
```

### Format B: Numbered / Pipe Shorthand
```text
1. Sale ID: Mr. C3 | Service: Manned Security | Status: New Start | Amount: $2,400.00 | Client: Olympia Mall
2. Sale ID: Mr. D4 | Service: CMS | Status: Extra | Amount: $250.00 | Client: Smart Shop
3. Sale ID: Mr. E5 | Service: Manned Security | Status: Reduction | Amount: $400.00 | Client: Factory A
```

### Format C: Quick Shorthand
```text
Mr. A1 | Manned Security | New Start | $1,200 | Chip Mong
Mr. B2 | CMS | Extra | $350 | ACLEDA
```

---

## 🛠️ Setup & Configuration

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```

Fill in your configuration:
```ini
# Get this from @BotFather on Telegram
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ

# Telegram Group Chat ID where the bot should send scheduled reports
# Tip: Add @userinfobot or @RawDataBot to your group to find the Chat ID (starts with -100...)
TELEGRAM_GROUP_ID=-1001234567890

# (Optional) Telegram User IDs of Admins
ADMIN_USER_IDS=123456789

# Weekly report cron: Default every Friday at 17:30 (5:30 PM)
WEEKLY_REPORT_CRON=30 17 * * 5

# Timezone
TIMEZONE=Asia/Phnom_Penh

# Database file location
DB_PATH=./data/sales_reports.db
```

### 3. Run Local Test Simulation
Verify message parsing, SQLite operations, mathematical calculations, and Excel creation:
```bash
npm run test:sim
```

### 4. Start the Telegram Bot
```bash
# Start bot
npm start

# Or with live auto-reload during development
npm run dev
```

### 5. Production Background Deployment (PM2)
To keep the bot running 24/7 on a Mac/Linux server:
```bash
npm install -g pm2
pm2 start src/index.js --name "libra-sales-bot"
pm2 save
```

---

## 📊 Sample Output Preview

```text
🛡️ LIBRA SECURITY - WEEKLY SALES REPORT
📅 Period: 01 Sep – 05 Sep 2026 (Week Ending Friday)
📊 Total Transactions Logged: 11
────────────────────────────

💰 FINANCIAL SUMMARY
🟢 New Start (5): $6,500.00
✨ Extra Service (4): $1,150.00
➕ Gross Added: $7,650.00
─────────────
🔻 Reduction (1): -$300.00
❌ Terminate (1): -$800.00
➖ Gross Lost: -$1,100.00
─────────────
📈 NET SALES REVENUE: +$6,550.00

🏆 SALES REP PERFORMANCE (5 PAX)
🥇 Mr. A1 (Saler A1)
   • Net: +$2,200.00 (3 activities)
   • New: $1,800.00 | Extra: $400.00
🥈 Mr. E5 (Saler E5)
   • Net: +$1,950.00 (2 activities)
   • New: $1,800.00 | Extra: $150.00
🥉 Mr. C3 (Saler C3)
   • Net: +$1,600.00 (2 activities)
   • New: $2,400.00 | Extra: $0.00
   • Reduct: -$0.00 | Term: -$800.00
👤 Mr. D4 (Saler D4)
   • Net: +$750.00 (2 activities)
   • New: $500.00 | Extra: $250.00
👤 Mr. B2 (Saler B2)
   • Net: +$50.00 (2 activities)
   • New: $0.00 | Extra: $350.00
   • Reduct: -$300.00 | Term: -$0.00

🏢 SERVICE CATEGORY BREAKDOWN
👮 Manned Security: Net +$4,700.00
   [+$5,800.00 / -$1,100.00 | 6 deals]
🚨 CMS: Net +$1,700.00
   [+$1,700.00 / -$0.00 | 4 deals]
📦 Other: Net +$150.00
   [+$150.00 / -$0.00 | 1 deals]

────────────────────────────
Generated automatically by Libra Sales Bot • Every Friday 17:30
```
