// Telegram WebApp initialization
if (window.Telegram && window.Telegram.WebApp) {
  window.Telegram.WebApp.ready();
  window.Telegram.WebApp.expand();
}

// State Management
const state = {
  startDate: '',
  endDate: '',
  activePreset: 'thisWeek',
  summary: null,
  reports: [],
  salesReps: [],
  filters: {
    rep: 'ALL',
    category: 'ALL',
    status: 'ALL',
    search: ''
  }
};

// Chart Instances
let dailyBarChart = null;
let servicePieChart = null;

// Helpers
function formatCurrency(amount) {
  const num = Number(amount) || 0;
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-check-circle' : 'fa-triangle-exclamation';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Calculate Date Presets
function setDatePreset(preset) {
  const now = new Date();
  let start = new Date();
  let end = new Date();

  if (preset === 'thisWeek') {
    // Monday to Friday
    const day = now.getDay(); // 0 is Sunday, 1 is Monday
    const diffToMon = (day === 0 ? -6 : 1) - day;
    start.setDate(now.getDate() + diffToMon);
    end = new Date(start);
    end.setDate(start.getDate() + 4); // Friday
  } else if (preset === 'lastWeek') {
    const day = now.getDay();
    const diffToMon = (day === 0 ? -6 : 1) - day - 7;
    start.setDate(now.getDate() + diffToMon);
    end = new Date(start);
    end.setDate(start.getDate() + 4); // Friday
  } else if (preset === 'thisMonth') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  const startStr = start.toISOString().split('T')[0];
  const endStr = end.toISOString().split('T')[0];

  state.startDate = startStr;
  state.endDate = endStr;
  state.activePreset = preset;

  document.getElementById('startDate').value = startStr;
  document.getElementById('endDate').value = endStr;

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.range === preset);
  });
}

// Fetch Active Sales Reps
async function fetchSalesReps() {
  try {
    const res = await fetch('/api/reps');
    const json = await res.json();
    if (json.success) {
      state.salesReps = json.data;
      populateRepDropdowns();
    }
  } catch (err) {
    console.error('Error fetching reps:', err);
  }
}

function populateRepDropdowns() {
  const filterRep = document.getElementById('filterRep');
  const formRep = document.getElementById('formRep');

  if (filterRep) {
    filterRep.innerHTML = '<option value="ALL">All Salers</option>';
    state.salesReps.forEach(r => {
      filterRep.innerHTML += `<option value="${r.code}">${r.code}</option>`;
    });
  }

  if (formRep) {
    formRep.innerHTML = '';
    state.salesReps.forEach(r => {
      formRep.innerHTML += `<option value="${r.code}">${r.code} (${r.name})</option>`;
    });
  }
}

// Fetch Summary Analytics
async function fetchSummary() {
  try {
    const res = await fetch(`/api/summary?startDate=${state.startDate}&endDate=${state.endDate}`);
    const json = await res.json();
    if (json.success) {
      state.summary = json.data;
      renderKPIs();
      renderCharts();
      renderLeaderboard();
    }
  } catch (err) {
    console.error('Error fetching summary:', err);
    showToast('Failed to load summary analytics', 'error');
  }
}

// Render KPI Cards
function renderKPIs() {
  if (!state.summary) return;
  const { totals, startDate, endDate } = state.summary;

  const netEl = document.getElementById('kpiNetRevenue');
  const netSign = totals.netAmount >= 0 ? '+' : '';
  netEl.textContent = `${netSign}${formatCurrency(totals.netAmount)}`;
  netEl.style.color = totals.netAmount >= 0 ? '#93c5fd' : '#fda4af';

  document.getElementById('kpiGrossAdded').textContent = formatCurrency(totals.grossAdded);
  document.getElementById('kpiNewStart').textContent = `🟢 New: ${formatCurrency(totals.newStart)} (${totals.countNewStart})`;
  document.getElementById('kpiExtra').textContent = `✨ Extra: ${formatCurrency(totals.extra)} (${totals.countExtra})`;

  document.getElementById('kpiGrossLost').textContent = `-${formatCurrency(totals.grossLost)}`;
  document.getElementById('kpiReduction').textContent = `🔻 Reduct: -${formatCurrency(totals.reduction)} (${totals.countReduction})`;
  document.getElementById('kpiTerminate').textContent = `❌ Term: -${formatCurrency(totals.terminate)} (${totals.countTerminate})`;

  document.getElementById('kpiDealsCount').textContent = state.summary.totalRecords;
  const avgDeal = state.summary.totalRecords > 0 ? (totals.grossAdded / (totals.countNewStart + totals.countExtra || 1)) : 0;
  document.getElementById('kpiAvgDeal').textContent = `Avg Deal: ${formatCurrency(avgDeal)}`;

  document.getElementById('kpiPeriodText').textContent = `${startDate} – ${endDate}`;
}

// Render Charts
function renderCharts() {
  if (!state.summary) return;
  const { byDate, byCategory } = state.summary;

  // 1. Daily Bar Chart
  const ctxBar = document.getElementById('dailyBarChart').getContext('2d');
  const labels = byDate.map(d => d.date.split('-').slice(1).join('/'));
  const addedData = byDate.map(d => d.newStart + d.extra);
  const lostData = byDate.map(d => d.reduction + d.terminate);

  if (dailyBarChart) dailyBarChart.destroy();

  dailyBarChart = new Chart(ctxBar, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['No Data'],
      datasets: [
        {
          label: 'Gross Added ($)',
          data: addedData.length > 0 ? addedData : [0],
          backgroundColor: '#10b981',
          borderRadius: 6
        },
        {
          label: 'Gross Lost ($)',
          data: lostData.length > 0 ? lostData : [0],
          backgroundColor: '#f43f5e',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        },
        y: {
          ticks: { 
            color: '#94a3b8',
            callback: (val) => '$' + val
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' }
        }
      }
    }
  });

  // 2. Service Distribution Pie Chart
  const ctxPie = document.getElementById('servicePieChart').getContext('2d');
  const catNames = Object.keys(byCategory);
  const catValues = catNames.map(k => byCategory[k].newStart + byCategory[k].extra);

  if (servicePieChart) servicePieChart.destroy();

  servicePieChart = new Chart(ctxPie, {
    type: 'doughnut',
    data: {
      labels: catNames,
      datasets: [
        {
          data: catValues.some(v => v > 0) ? catValues : [1],
          backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6', '#06b6d4'],
          borderWidth: 0
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }
        }
      },
      cutout: '70%'
    }
  });
}

// Render Sales Rep Leaderboard
function renderLeaderboard() {
  if (!state.summary) return;
  const { bySaler } = state.summary;
  const container = document.getElementById('repsContainer');
  container.innerHTML = '';

  document.getElementById('repsCountTag').textContent = `${bySaler.length} Salers`;

  bySaler.forEach((rep, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '👤';
    const repSign = rep.net >= 0 ? '+' : '';

    const card = document.createElement('div');
    card.className = 'rep-card';
    card.innerHTML = `
      <div class="rep-header">
        <div class="rep-name-box">
          <span class="rep-rank">${medal}</span>
          <span class="rep-name">${rep.code}</span>
        </div>
        <span class="rep-deals-count">${rep.dealCount} deals</span>
      </div>
      <div class="rep-net-box">
        <span class="rep-net-label">Net Sales</span>
        <span class="rep-net-val" style="color: ${rep.net >= 0 ? '#93c5fd' : '#fda4af'}">${repSign}${formatCurrency(rep.net)}</span>
      </div>
      <div class="rep-breakdown">
        <div class="rep-breakdown-item">
          <span>🟢 New:</span>
          <span>${formatCurrency(rep.newStart)}</span>
        </div>
        <div class="rep-breakdown-item">
          <span>✨ Extra:</span>
          <span>${formatCurrency(rep.extra)}</span>
        </div>
        <div class="rep-breakdown-item">
          <span>🔻 Reduct:</span>
          <span>-${formatCurrency(rep.reduction)}</span>
        </div>
        <div class="rep-breakdown-item">
          <span>❌ Term:</span>
          <span>-${formatCurrency(rep.terminate)}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Fetch Filtered Reports List
async function fetchReports() {
  try {
    const params = new URLSearchParams({
      startDate: state.startDate,
      endDate: state.endDate,
      rep: state.filters.rep,
      category: state.filters.category,
      status: state.filters.status,
      search: state.filters.search
    });

    const res = await fetch(`/api/reports?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      state.reports = json.data;
      renderTable();
    }
  } catch (err) {
    console.error('Error fetching reports:', err);
  }
}

// Render Data Table
function renderTable() {
  const tbody = document.getElementById('tableBody');
  const countBadge = document.getElementById('tableCountBadge');
  countBadge.textContent = `${state.reports.length} Records`;

  if (state.reports.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 24px; color: var(--text-muted);">No sales records found for this period.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  state.reports.forEach(r => {
    const statusBadge = 
      r.status === 'New Start' ? '<span class="badge badge-success">🟢 New Start</span>' :
      r.status === 'Extra' ? '<span class="badge badge-warning">✨ Extra</span>' :
      r.status === 'Reduction' ? '<span class="badge badge-danger">🔻 Reduction</span>' :
      '<span class="badge badge-danger">❌ Terminate</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${r.id}</td>
      <td>${r.report_date}</td>
      <td><strong>${r.sale_rep_code}</strong></td>
      <td>${r.service_category}</td>
      <td>${statusBadge}</td>
      <td><strong>${formatCurrency(r.amount)}</strong></td>
      <td>${r.client_name || '-'}</td>
      <td><span style="color: var(--text-secondary)">${r.notes || '-'}</span></td>
      <td>
        <button class="btn btn-danger" onclick="handleDelete(${r.id})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Delete Handler
window.handleDelete = async function(id) {
  if (!confirm(`Are you sure you want to delete report #${id}?`)) return;

  try {
    const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast(`Report #${id} deleted successfully`);
      fetchSummary();
      fetchReports();
    } else {
      showToast(json.error || 'Failed to delete', 'error');
    }
  } catch (err) {
    showToast('Delete request failed', 'error');
  }
};

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial Preset
  setDatePreset('thisWeek');
  document.getElementById('formDate').value = new Date().toISOString().split('T')[0];

  // 2. Fetch Initial Data
  fetchSalesReps();
  fetchSummary();
  fetchReports();

  // 3. Preset Buttons
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setDatePreset(btn.dataset.range);
      fetchSummary();
      fetchReports();
    });
  });

  // 4. Custom Date Apply
  document.getElementById('btnApplyDate').addEventListener('click', () => {
    const s = document.getElementById('startDate').value;
    const e = document.getElementById('endDate').value;
    if (s && e) {
      state.startDate = s;
      state.endDate = e;
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      fetchSummary();
      fetchReports();
    }
  });

  // 5. Table Filters
  document.getElementById('tableSearch').addEventListener('input', (e) => {
    state.filters.search = e.target.value.trim();
    fetchReports();
  });

  document.getElementById('filterRep').addEventListener('change', (e) => {
    state.filters.rep = e.target.value;
    fetchReports();
  });

  document.getElementById('filterCategory').addEventListener('change', (e) => {
    state.filters.category = e.target.value;
    fetchReports();
  });

  document.getElementById('filterStatus').addEventListener('change', (e) => {
    state.filters.status = e.target.value;
    fetchReports();
  });

  // 6. Modal Controls
  const modal = document.getElementById('entryModal');
  const btnNewEntry = document.getElementById('btnNewEntry');
  const btnCloseModal = document.getElementById('btnCloseModal');
  const btnCancelModal = document.getElementById('btnCancelModal');

  btnNewEntry.addEventListener('click', () => modal.classList.add('active'));
  btnCloseModal.addEventListener('click', () => modal.classList.remove('active'));
  btnCancelModal.addEventListener('click', () => modal.classList.remove('active'));

  // 7. Save Entry Form
  document.getElementById('newEntryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      report_date: document.getElementById('formDate').value,
      sale_rep_code: document.getElementById('formRep').value,
      service_category: document.getElementById('formCategory').value,
      status: document.getElementById('formStatus').value,
      amount: parseFloat(document.getElementById('formAmount').value),
      client_name: document.getElementById('formClient').value.trim(),
      notes: document.getElementById('formNotes').value.trim()
    };

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast('Sales report added successfully!');
        modal.classList.remove('active');
        document.getElementById('newEntryForm').reset();
        document.getElementById('formDate').value = new Date().toISOString().split('T')[0];
        fetchSummary();
        fetchReports();
      } else {
        showToast(json.error || 'Failed to add report', 'error');
      }
    } catch (err) {
      showToast('Error connecting to server', 'error');
    }
  });

  // 8. Excel Export
  document.getElementById('btnExportExcel').addEventListener('click', () => {
    window.location.href = `/api/export?startDate=${state.startDate}&endDate=${state.endDate}`;
  });
});
