import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dayjs from 'dayjs';
import { 
  getReportsByDateRange, 
  getActiveSalesReps, 
  insertReport, 
  deleteReportById,
  db
} from './database.js';
import { calculateAnalytics, getCurrentWeekRange } from './analytics.js';
import { generateWeeklyExcel } from './excel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '..', 'public');

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(publicDir));

  // 1. Get Analytics Summary
  app.get('/api/summary', (req, res) => {
    try {
      let { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        const range = getCurrentWeekRange();
        startDate = range.startDate;
        endDate = range.endDate;
      }

      const analytics = calculateAnalytics(startDate, endDate);
      res.json({ success: true, data: analytics });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. Get Filtered Reports List
  app.get('/api/reports', (req, res) => {
    try {
      let { startDate, endDate, rep, category, status, search } = req.query;
      if (!startDate || !endDate) {
        const range = getCurrentWeekRange();
        startDate = range.startDate;
        endDate = range.endDate;
      }

      let query = `SELECT * FROM daily_reports WHERE report_date >= ? AND report_date <= ?`;
      const params = [startDate, endDate];

      if (rep && rep !== 'ALL') {
        query += ` AND sale_rep_code = ?`;
        params.push(rep);
      }
      if (category && category !== 'ALL') {
        query += ` AND service_category = ?`;
        params.push(category);
      }
      if (status && status !== 'ALL') {
        query += ` AND status = ?`;
        params.push(status);
      }
      if (search) {
        query += ` AND (client_name LIKE ? OR notes LIKE ? OR sale_rep_code LIKE ?)`;
        const s = `%${search}%`;
        params.push(s, s, s);
      }

      query += ` ORDER BY report_date DESC, id DESC`;

      const rows = db.prepare(query).all(...params);
      res.json({ success: true, data: rows });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. Create Report Entry
  app.post('/api/reports', (req, res) => {
    try {
      const { report_date, sale_rep_code, service_category, status, amount, client_name, notes } = req.body;

      if (!sale_rep_code || !status || amount === undefined || isNaN(amount)) {
        return res.status(400).json({ success: false, error: 'Missing required fields: sale_rep_code, status, amount' });
      }

      const newId = insertReport({
        report_date: report_date || dayjs().format('YYYY-MM-DD'),
        sale_rep_code,
        service_category: service_category || 'Manned Security',
        status,
        amount: Math.abs(parseFloat(amount)),
        client_name: client_name || null,
        notes: notes || null,
        reported_by: 'Web Dashboard UI',
        raw_text: 'Created via Web UI'
      });

      res.json({ success: true, id: newId, message: 'Report created successfully' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Delete Report Entry
  app.delete('/api/reports/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const success = deleteReportById(id);
      if (success) {
        res.json({ success: true, message: `Report #${id} deleted` });
      } else {
        res.status(404).json({ success: false, error: `Report #${id} not found` });
      }
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 5. Get Active Sales Reps
  app.get('/api/reps', (req, res) => {
    try {
      const reps = getActiveSalesReps();
      res.json({ success: true, data: reps });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 6. Export Excel
  app.get('/api/export', async (req, res) => {
    try {
      let { startDate, endDate } = req.query;
      if (!startDate || !endDate) {
        const range = getCurrentWeekRange();
        startDate = range.startDate;
        endDate = range.endDate;
      }

      const { filePath, fileName } = await generateWeeklyExcel(startDate, endDate);
      res.download(filePath, fileName);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fallback to index.html for single page application
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}
