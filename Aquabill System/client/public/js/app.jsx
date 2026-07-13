/* ═══════════════════════════════════
   AquaBill — Main App JS
   ═══════════════════════════════════ */

const API = '';
let currentUser = null;
let customersPage = 1;
let billsPage = 1;
let paymentsPage = 1;

// ── UTILS ──────────────────────────────
function fmt(n) { return '₱' + parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) : '—'; }
function months() { return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']; }
function fullMonths() { return ['January','February','March','April','May','June','July','August','September','October','November','December']; }

function toast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  t.innerHTML = `<span>${icons[type]||'ℹ'}</span><span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json();
  if (res.status === 401) {
    showLogin();
    throw new Error('Session expired');
  }
  return data;
}

function statusBadge(status) {
  const map = {
    Active: 'badge-green', Paid: 'badge-green',
    Pending: 'badge-amber', Partial: 'badge-amber',
    Disconnected: 'badge-slate',
    Unpaid: 'badge-red', Overdue: 'badge-red',
    Residential: 'badge-blue', Commercial: 'badge-amber', Industrial: 'badge-slate',
  };
  return `<span class="badge ${map[status] || 'badge-slate'}">${status}</span>`;
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── AUTH ───────────────────────────────
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp(user) {
  currentUser = user;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
  document.getElementById('user-fullname').textContent = user.fullName;
  document.getElementById('user-role').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
  document.getElementById('user-avatar').textContent = user.fullName.charAt(0).toUpperCase();
  initApp();
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Please enter username and password.'; return; }
  const btn = document.getElementById('login-btn');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (data.success) {
      showApp(data.user);
    } else {
      errEl.textContent = data.message || 'Login failed.';
    }
  } catch (e) {
    errEl.textContent = 'Server error. Please try again.';
  } finally {
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
});

document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('login-btn').click();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  showLogin();
  toast('Signed out successfully.', 'info');
});

// ── NAV ────────────────────────────────
const pageTitles = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  'meter-reading': 'Meter Reading',
  bills: 'Bills',
  payments: 'Payments',
  reports: 'Summary Report',
};

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const page = btn.dataset.page;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`page-${page}`).classList.add('active');
    document.getElementById('page-title').textContent = pageTitles[page] || page;
    loadPage(page);
  });
});

function loadPage(page) {
  if (page === 'dashboard') loadDashboard();
  if (page === 'customers') loadCustomers();
  if (page === 'bills') loadBills();
  if (page === 'payments') loadPayments();
  if (page === 'meter-reading') loadMeterReading();
  if (page === 'reports') loadReportsPage();
}

// Close modal buttons
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
});

// ── DASHBOARD ─────────────────────────
function setHeroGreeting() {
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const name = currentUser?.fullName?.split(' ')[0] || '';
  document.getElementById('hero-greeting').textContent = `${greeting}${name ? ', ' + name : ''}`;
}

function updateTankGauge(collected, outstanding) {
  const total = collected + outstanding;
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
  document.getElementById('tank-pct').textContent = `${pct}%`;
  document.getElementById('tank-collected').textContent = fmt(collected);
  document.getElementById('tank-outstanding').textContent = fmt(outstanding);
  // Tank is 140 units tall internally (viewBox 0 0 120 140); fill rises from the bottom.
  const fillHeight = (pct / 100) * 128; // leave a little margin for the shell border
  const waterY = 134 - fillHeight;
  const waterEl = document.getElementById('tank-water');
  const waveEl = document.getElementById('tank-wave');
  waterEl.setAttribute('y', waterY);
  waterEl.setAttribute('height', fillHeight + 140);
  waveEl.setAttribute('d', `M0,${waterY} Q15,${waterY-6} 30,${waterY} T60,${waterY} T90,${waterY} T120,${waterY} L120,280 L0,280 Z`);
}

async function loadDashboard() {
  setHeroGreeting();
  try {
    const data = await api('/api/dashboard/stats');
    if (!data.success) return;
    const s = data.data;
    document.getElementById('stat-customers').textContent = s.totalCustomers ?? '—';
    document.getElementById('stat-active').textContent = `${s.activeCustomers ?? 0} active`;
    document.getElementById('stat-month').textContent = fmt(s.collectedThisMonth);
    document.getElementById('stat-year').textContent = `${fmt(s.collectedThisYear)} this year`;
    document.getElementById('stat-unpaid').textContent = s.unpaidBills ?? '—';
    document.getElementById('stat-outstanding').textContent = fmt(s.totalOutstanding);
    document.getElementById('stat-overdue').textContent = `${s.overdueBills ?? 0} overdue`;

    updateTankGauge(s.collectedThisYear || 0, s.totalOutstanding || 0);

    // Chart
    const monthly = s.monthlyCollections || [];
    const maxVal = Math.max(...monthly.map(m => m.total), 1);
    const barsEl = document.getElementById('chart-bars');
    const labelsEl = document.getElementById('chart-labels');
    const mo = months();
    barsEl.innerHTML = monthly.map((m, i) => {
      const h = Math.max(4, Math.round((m.total / maxVal) * 110));
      return `<div class="chart-bar-wrap"><div class="chart-bar" title="${mo[m.month-1]}: ${fmt(m.total)}" style="height:${h}px;"></div></div>`;
    }).join('');
    labelsEl.innerHTML = monthly.map((m, i) => `<span>${mo[m.month-1]}</span>`).join('');
    document.getElementById('chart-year').textContent = s.year || new Date().getFullYear();

    // Recent payments
    const rp = data.data.recentPayments || [];
    const rpEl = document.getElementById('recent-payments-list');
    if (!rp.length) { rpEl.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/></svg></div><p>No payments yet.</p></div>'; return; }
    rpEl.innerHTML = rp.map(p => `
      <div class="payment-item">
        <div>
          <div class="payment-item-name">${p.customer?.firstName || ''} ${p.customer?.lastName || ''}</div>
          <div class="payment-item-acct">${p.customer?.accountNumber || ''} · ${fmtDate(p.paymentDate)}</div>
        </div>
        <div class="payment-item-amt">${fmt(p.amountPaid)}</div>
      </div>
    `).join('');
  } catch(e) {}
}

// ── CUSTOMERS ─────────────────────────
let customerSearchTimer;
document.getElementById('customer-search').addEventListener('input', () => {
  clearTimeout(customerSearchTimer);
  customerSearchTimer = setTimeout(() => { customersPage = 1; loadCustomers(); }, 320);
});
document.getElementById('customer-status-filter').addEventListener('change', () => { customersPage = 1; loadCustomers(); });

async function loadCustomers() {
  const search = document.getElementById('customer-search').value;
  const status = document.getElementById('customer-status-filter').value;
  const tbody = document.getElementById('customers-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading">Loading…</div></td></tr>';
  try {
    const data = await api(`/api/customers?page=${customersPage}&limit=10&search=${encodeURIComponent(search)}&status=${status}`);
    if (!data.success) return;
    const { docs, totalPages, totalDocs, page } = data.data;
    if (!docs.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5.2 5.5-5.2s5.5 2.2 5.5 5.2"/><path d="M15.5 8.3a3.2 3.2 0 1 1 3 4.3"/><path d="M15 13.6c2.6.4 4.5 2.4 4.5 5.2"/></svg></div><p>No customers found.</p></div></td></tr>`;
    } else {
      tbody.innerHTML = docs.map(c => `
        <tr>
          <td><strong>${c.accountNumber}</strong></td>
          <td>${c.firstName} ${c.lastName}</td>
          <td>${c.meterNumber}</td>
          <td>${c.address}<br><span class="text-muted">${c.barangay}</span></td>
          <td>${statusBadge(c.connectionType)}</td>
          <td>${statusBadge(c.status)}</td>
          <td class="${c.outstandingBalance > 0 ? 'fw-600' : ''}" style="color:${c.outstandingBalance > 0 ? 'var(--red-400)' : 'inherit'}">${fmt(c.outstandingBalance)}</td>
          <td>
            <div class="gap-8">
              <button class="btn btn-secondary btn-xs" onclick="editCustomer('${c._id}')">Edit</button>
              <button class="btn btn-danger btn-xs" onclick="deleteCustomer('${c._id}','${c.firstName} ${c.lastName}')">Del</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
    renderPagination('customers-pagination', page, totalPages, totalDocs, (p) => { customersPage = p; loadCustomers(); });
  } catch(e) {}
}

document.getElementById('add-customer-btn').addEventListener('click', () => {
  document.getElementById('customer-modal-title').textContent = 'Add Customer';
  document.getElementById('customer-id').value = '';
  ['firstName','lastName','address','barangay','meterNumber','contactNumber','email'].forEach(f => document.getElementById(`c-${f}`).value = '');
  document.getElementById('c-connectionType').value = 'Residential';
  document.getElementById('c-status').value = 'Active';
  openModal('customer-modal');
});

window.editCustomer = async (id) => {
  try {
    const data = await api(`/api/customers/${id}`);
    if (!data.success) return;
    const c = data.data;
    document.getElementById('customer-modal-title').textContent = 'Edit Customer';
    document.getElementById('customer-id').value = c._id;
    document.getElementById('c-firstName').value = c.firstName;
    document.getElementById('c-lastName').value = c.lastName;
    document.getElementById('c-address').value = c.address;
    document.getElementById('c-barangay').value = c.barangay;
    document.getElementById('c-meterNumber').value = c.meterNumber;
    document.getElementById('c-contactNumber').value = c.contactNumber || '';
    document.getElementById('c-email').value = c.email || '';
    document.getElementById('c-connectionType').value = c.connectionType;
    document.getElementById('c-status').value = c.status;
    openModal('customer-modal');
  } catch(e) {}
};

document.getElementById('save-customer-btn').addEventListener('click', async () => {
  const id = document.getElementById('customer-id').value;
  const body = {
    firstName: document.getElementById('c-firstName').value.trim(),
    lastName: document.getElementById('c-lastName').value.trim(),
    address: document.getElementById('c-address').value.trim(),
    barangay: document.getElementById('c-barangay').value.trim(),
    meterNumber: document.getElementById('c-meterNumber').value.trim(),
    contactNumber: document.getElementById('c-contactNumber').value.trim(),
    email: document.getElementById('c-email').value.trim(),
    connectionType: document.getElementById('c-connectionType').value,
    status: document.getElementById('c-status').value,
  };
  if (!body.firstName || !body.lastName || !body.address || !body.barangay || !body.meterNumber) {
    toast('Please fill in all required fields.', 'error'); return;
  }
  try {
    const method = id ? 'PUT' : 'POST';
    const path = id ? `/api/customers/${id}` : '/api/customers';
    const data = await api(path, { method, body: JSON.stringify(body) });
    if (data.success) {
      toast(data.message || 'Saved!', 'success');
      closeModal('customer-modal');
      loadCustomers();
    } else {
      toast(data.message || 'Error saving.', 'error');
    }
  } catch(e) { toast('Error: ' + e.message, 'error'); }
});

window.deleteCustomer = async (id, name) => {
  if (!confirm(`Delete customer "${name}"? This cannot be undone.`)) return;
  const data = await api(`/api/customers/${id}`, { method: 'DELETE' });
  if (data.success) { toast('Customer deleted.', 'info'); loadCustomers(); }
  else toast(data.message, 'error');
};

// ── METER READING ─────────────────────
// Builds the Current Reading dropdown as: previous reading + 0 up to +100.
// This keeps entries realistic (meters only count up) while still letting
// staff pick whatever value the physical meter shows.
function populateCurrentReadingOptions(prevValue) {
  const currentSelect = document.getElementById('mr-current');
  if (!currentSelect) return;
  const base = parseFloat(prevValue) || 0;
  const previouslySelected = currentSelect.value;

  currentSelect.innerHTML = '<option value="">— Select reading —</option>';
  for (let i = 0; i <= 100; i++) {
    const val = base + i;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = val;
    currentSelect.appendChild(opt);
  }

  // Preserve the previously chosen value if it's still a valid option (e.g. re-population edge cases)
  if (previouslySelected && [...currentSelect.options].some(o => o.value === previouslySelected)) {
    currentSelect.value = previouslySelected;
  }
}

async function loadMeterReading() {
  const sel = document.getElementById('mr-customer');
  sel.innerHTML = '<option value="">— Select customer —</option>';
  const data = await api('/api/customers?limit=500');
  if (data.success) {
    data.data.docs.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = `${c.accountNumber} — ${c.firstName} ${c.lastName}`;
      // New customers with no prior bill have no currentReading yet — default to 0.
      opt.dataset.prev = c.currentReading || 0;
      sel.appendChild(opt);
    });
  }
  const now = new Date();
  document.getElementById('mr-month').value = now.getMonth() + 1;
  document.getElementById('mr-year').value = now.getFullYear();
  const due = new Date(now.getFullYear(), now.getMonth() + 1, 20);
  document.getElementById('mr-due').value = due.toISOString().split('T')[0];

  // Default dropdown range before any customer is picked.
  populateCurrentReadingOptions(0);
}

document.getElementById('mr-customer').addEventListener('change', function() {
  const opt = this.options[this.selectedIndex];
  const prevValue = opt.dataset.prev || 0;
  document.getElementById('mr-prev').value = prevValue;
  populateCurrentReadingOptions(prevValue);
  document.getElementById('bill-preview').style.display = 'none';
});

document.getElementById('mr-calc-btn').addEventListener('click', async () => {
  const customerId = document.getElementById('mr-customer').value;
  const currentReading = parseFloat(document.getElementById('mr-current').value);
  if (!customerId) { toast('Select a customer first.', 'error'); return; }
  if (isNaN(currentReading)) { toast('Select current reading.', 'error'); return; }
  const data = await api('/api/bills/calculate', { method:'POST', body: JSON.stringify({ customerId, currentReading }) });
  if (!data.success) { toast(data.message, 'error'); return; }
  const d = data.data;
  document.getElementById('prev-consumption').textContent = `${d.consumption} m³`;
  document.getElementById('prev-water').textContent = fmt(d.waterCharge);
  document.getElementById('prev-env').textContent = fmt(d.environmentFee);
  document.getElementById('prev-maint').textContent = fmt(d.maintenanceFee);
  document.getElementById('prev-balance').textContent = fmt(d.previousBalance);
  document.getElementById('prev-total').textContent = fmt(d.totalAmount);
  document.getElementById('bill-preview').style.display = 'block';
});

document.getElementById('mr-submit-btn').addEventListener('click', async () => {
  const body = {
    customerId: document.getElementById('mr-customer').value,
    currentReading: parseFloat(document.getElementById('mr-current').value),
    billingMonth: parseInt(document.getElementById('mr-month').value),
    billingYear: parseInt(document.getElementById('mr-year').value),
    dueDate: document.getElementById('mr-due').value,
    remarks: document.getElementById('mr-remarks').value,
  };
  if (!body.customerId || isNaN(body.currentReading)) { toast('Fill in required fields.', 'error'); return; }
  const data = await api('/api/bills', { method: 'POST', body: JSON.stringify(body) });
  if (data.success) {
    toast('Bill saved successfully!', 'success');
    document.getElementById('mr-current').value = '';
    document.getElementById('mr-remarks').value = '';
    document.getElementById('bill-preview').style.display = 'none';
    loadMeterReading();
  } else {
    toast(data.message || 'Error saving bill.', 'error');
  }
});

// ── BILLS ─────────────────────────────
let billsSearchTimer;
document.getElementById('bills-search').addEventListener('input', () => {
  clearTimeout(billsSearchTimer);
  billsSearchTimer = setTimeout(() => { billsPage = 1; loadBills(); }, 320);
});
document.getElementById('bills-status-filter').addEventListener('change', () => { billsPage = 1; loadBills(); });

async function loadBills() {
  const search = document.getElementById('bills-search').value;
  const status = document.getElementById('bills-status-filter').value;
  const tbody = document.getElementById('bills-tbody');
  tbody.innerHTML = '<tr><td colspan="8"><div class="loading">Loading…</div></td></tr>';
  try {
    const data = await api(`/api/bills?page=${billsPage}&limit=10&search=${encodeURIComponent(search)}&status=${status}`);
    if (!data.success) return;
    const { docs, totalPages, totalDocs, page } = data.data;
    const mo = fullMonths();
    if (!docs.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6M9 9h2"/></svg></div><p>No bills found.</p></div></td></tr>`;
    } else {
      tbody.innerHTML = docs.map(b => `
        <tr>
          <td>
            <strong>${b.customer?.firstName || ''} ${b.customer?.lastName || ''}</strong><br>
            <span class="text-muted">${b.customer?.accountNumber || ''}</span>
          </td>
          <td>${mo[(b.billingPeriod?.month || 1) - 1]} ${b.billingPeriod?.year || ''}</td>
          <td>${b.consumption ?? 0} m³</td>
          <td><strong>${fmt(b.totalAmount)}</strong></td>
          <td style="color:${b.balance > 0 ? 'var(--red-400)' : 'var(--green-400)'}">${fmt(b.balance)}</td>
          <td>${fmtDate(b.dueDate)}</td>
          <td>${statusBadge(b.status)}</td>
          <td>
            <div class="gap-8">
              ${b.status !== 'Paid' ? `<button class="btn btn-success btn-xs" onclick="payBill('${b._id}')">Pay</button>` : ''}
              ${b.amountPaid === 0 ? `<button class="btn btn-danger btn-xs" onclick="deleteBill('${b._id}')">Del</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');
    }
    renderPagination('bills-pagination', page, totalPages, totalDocs, (p) => { billsPage = p; loadBills(); });
  } catch(e) {}
}

window.deleteBill = async (billId) => {
  if (!confirm('Delete this bill? This cannot be undone.')) return;
  const data = await api(`/api/bills/${billId}`, { method: 'DELETE' });
  if (data.success) {
    toast('Bill deleted.', 'info');
    loadBills();
  } else {
    toast(data.message || 'Error deleting bill.', 'error');
  }
};

// ── PAYMENTS ──────────────────────────
let paymentsSearchTimer;
document.getElementById('payments-search').addEventListener('input', () => {
  clearTimeout(paymentsSearchTimer);
  paymentsSearchTimer = setTimeout(() => { paymentsPage = 1; loadPayments(); }, 320);
});

async function loadUnpaidBills() {
  const sel = document.getElementById('p-bill');
  sel.innerHTML = '<option value="">— Select unpaid bill —</option>';
  const data = await api('/api/bills?limit=200&status=Unpaid');
  const data2 = await api('/api/bills?limit=200&status=Overdue');
  const bills = [...(data.data?.docs || []), ...(data2.data?.docs || [])];
  const mo = fullMonths();
  bills.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b._id;
    opt.textContent = `${b.customer?.accountNumber || ''} — ${b.customer?.firstName || ''} ${b.customer?.lastName || ''} | ${mo[(b.billingPeriod?.month||1)-1]} ${b.billingPeriod?.year || ''} | ${fmt(b.balance)}`;
    sel.appendChild(opt);
  });
}

// Shared logic for opening the Record Payment modal.
// Always loads the dropdown + resets fields FIRST, then pre-selects a bill
// if one was passed in — this avoids the old race condition where two
// competing loaders could wipe out the pre-selected customer/bill.
async function openPaymentModal(preselectBillId) {
  await loadUnpaidBills();
  document.getElementById('p-amount').value = '';
  document.getElementById('p-method').value = 'Cash';
  document.getElementById('p-reference').value = '';
  document.getElementById('p-ref-group').style.display = 'none';
  document.getElementById('p-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('p-receiver').value = currentUser?.fullName || '';
  document.getElementById('p-notes').value = '';

  if (preselectBillId) {
    document.getElementById('p-bill').value = preselectBillId;
  }
  openModal('payment-modal');
}

window.payBill = (billId) => {
  openPaymentModal(billId);
};

document.getElementById('add-payment-btn').addEventListener('click', () => {
  openPaymentModal();
});

document.getElementById('p-method').addEventListener('change', (e) => {
  const isEwallet = e.target.value === 'GCash' || e.target.value === 'PayMaya';
  document.getElementById('p-ref-group').style.display = isEwallet ? '' : 'none';
});

document.getElementById('save-payment-btn').addEventListener('click', async () => {
  const body = {
    bill: document.getElementById('p-bill').value,
    amountPaid: parseFloat(document.getElementById('p-amount').value),
    paymentMethod: document.getElementById('p-method').value,
    referenceNumber: document.getElementById('p-reference').value,
    paymentDate: document.getElementById('p-date').value,
    receivedBy: document.getElementById('p-receiver').value,
    notes: document.getElementById('p-notes').value,
  };
  if (!body.bill || isNaN(body.amountPaid)) { toast('Fill in bill and amount.', 'error'); return; }
  const data = await api('/api/payments', { method:'POST', body: JSON.stringify(body) });
  if (data.success) {
    toast('Payment recorded!', 'success');
    closeModal('payment-modal');
    loadPayments();
    loadBills();
    showReceipt(data.data);
  } else {
    toast(data.message || 'Error.', 'error');
  }
});

// ── RECEIPTS ──────────────────────────
function receiptHTML(p) {
  const mo = fullMonths();
  const period = p.bill?.billingPeriod ? `${mo[(p.bill.billingPeriod.month||1)-1]} ${p.bill.billingPeriod.year}` : '—';
  const isOnline = p.channel === 'Online';
  return `
    <div class="receipt-head">
      <div class="receipt-brand">
        <div class="receipt-logo">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2.6C12 2.6 5.4 11.4 5.4 16C5.4 19.6 8.4 22 12 22C15.6 22 18.6 19.6 18.6 16C18.6 11.4 12 2.6 12 2.6Z" fill="white"/>
            <path d="M8.7 15.6c0 2 1.7 3.6 3.5 3.6" stroke="#0e7490" stroke-width="1.5" stroke-linecap="round" fill="none" opacity="0.55"/>
          </svg>
        </div>
        <div>
          <div class="receipt-brand-name">AquaBill</div>
          <div class="receipt-brand-sub">Water Billing Station</div>
        </div>
      </div>
      <div class="receipt-status-badge">${p.status || 'Completed'}</div>
    </div>
    <div class="receipt-title">Official Receipt</div>
    <div class="receipt-row"><span>Receipt No.</span><strong>${p.receiptNumber || '—'}</strong></div>
    ${p.referenceNumber ? `<div class="receipt-row"><span>Reference No.</span><strong>${p.referenceNumber}</strong></div>` : ''}
    <div class="receipt-row"><span>Date</span><strong>${fmtDate(p.paymentDate)}</strong></div>
    <div class="receipt-divider"></div>
    <div class="receipt-row"><span>Customer</span><strong>${p.customer?.firstName || ''} ${p.customer?.lastName || ''}</strong></div>
    <div class="receipt-row"><span>Account No.</span><strong>${p.customer?.accountNumber || '—'}</strong></div>
    <div class="receipt-row"><span>Bill Period</span><strong>${period}</strong></div>
    <div class="receipt-row"><span>Bill No.</span><strong>${p.bill?.billNumber || '—'}</strong></div>
    <div class="receipt-divider"></div>
    <div class="receipt-row"><span>Payment Method</span><strong>${p.paymentMode || '—'}${isOnline ? ' (Online)' : ''}</strong></div>
    ${p.payerMobile ? `<div class="receipt-row"><span>Payer Mobile</span><strong>${p.payerMobile}</strong></div>` : ''}
    <div class="receipt-row"><span>Received By</span><strong>${p.collectedBy || '—'}</strong></div>
    <div class="receipt-divider"></div>
    <div class="receipt-row receipt-total"><span>Amount Paid</span><strong>${fmt(p.amountPaid)}</strong></div>
    ${p.change ? `<div class="receipt-row"><span>Change</span><strong>${fmt(p.change)}</strong></div>` : ''}
    <div class="receipt-footer">Thank you! This receipt was generated by AquaBill.</div>
  `;
}

function showReceipt(payment) {
  document.getElementById('receipt-content').innerHTML = receiptHTML(payment);
  openModal('receipt-modal');
}

window.viewReceipt = async (paymentId) => {
  const data = await api(`/api/payments/${paymentId}`);
  if (data.success) showReceipt(data.data);
  else toast(data.message || 'Could not load receipt.', 'error');
};

document.getElementById('print-receipt-btn').addEventListener('click', () => {
  window.print();
});



async function loadPayments() {
  const search = document.getElementById('payments-search').value;
  const tbody = document.getElementById('payments-tbody');
  tbody.innerHTML = '<tr><td colspan="7"><div class="loading">Loading…</div></td></tr>';
  try {
    const data = await api(`/api/payments?page=${paymentsPage}&limit=10&search=${encodeURIComponent(search)}`);
    if (!data.success) return;
    const { docs, totalPages, totalDocs, page } = data.data;
    const mo = fullMonths();
    if (!docs.length) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/></svg></div><p>No payments found.</p></div></td></tr>`;
    } else {
      tbody.innerHTML = docs.map(p => `
        <tr>
          <td><strong>${p.receiptNumber || '—'}</strong>${p.referenceNumber ? `<br><span class="text-muted">${p.referenceNumber}</span>` : ''}</td>
          <td>
            ${p.customer?.firstName || ''} ${p.customer?.lastName || ''}<br>
            <span class="text-muted">${p.customer?.accountNumber || ''}</span>
          </td>
          <td>${p.bill ? mo[(p.bill.billingPeriod?.month||1)-1] + ' ' + p.bill.billingPeriod?.year : '—'}</td>
          <td style="color:var(--green-400);font-weight:700;">${fmt(p.amountPaid)}</td>
          <td>${p.paymentMode || '—'}${p.channel === 'Online' ? ' <span class="text-muted">(Online)</span>' : ''}</td>
          <td>${fmtDate(p.paymentDate)}</td>
          <td>${p.collectedBy || '—'}</td>
          <td><button class="btn btn-secondary btn-sm" onclick="viewReceipt('${p._id}')">View Receipt</button></td>
        </tr>
      `).join('');
    }
    renderPagination('payments-pagination', page, totalPages, totalDocs, (p) => { paymentsPage = p; loadPayments(); });
  } catch(e) {}
}

// ── SUMMARY REPORT ─────────────────────
function defaultReportDates() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toStr = d => d.toISOString().slice(0, 10);
  return { from: toStr(from), to: toStr(to) };
}

async function loadReportsPage() {
  const fromEl = document.getElementById('report-from');
  const toEl = document.getElementById('report-to');
  if (fromEl && toEl && (!fromEl.value || !toEl.value)) {
    const defaults = defaultReportDates();
    fromEl.value = defaults.from;
    toEl.value = defaults.to;
  }
  await runReport();
}

async function runReport() {
  const fromEl = document.getElementById('report-from');
  const toEl = document.getElementById('report-to');
  if (!fromEl || !toEl) return;
  const from = fromEl.value;
  const to = toEl.value;

  try {
    const res = await api(`/api/reports/summary?from=${from}&to=${to}`);
    if (!res.success) { toast(res.message || 'Failed to load report', 'error'); return; }
    renderReport(res.data);
  } catch (e) {
    toast('Server error while generating report.', 'error');
  }
}

function renderReport(d) {
  document.getElementById('rpt-bills').textContent = d.billsGenerated;
  document.getElementById('rpt-billed-total').textContent = fmt(d.totalBilled) + ' billed';
  document.getElementById('rpt-collected').textContent = fmt(d.totalCollected);
  document.getElementById('rpt-payments-count').textContent = d.paymentsCount + ' payment(s)';
  document.getElementById('rpt-outstanding').textContent = fmt(d.totalOutstanding);
  document.getElementById('rpt-new-customers').textContent = d.newCustomers;

  const statusBody = document.getElementById('rpt-bills-status-tbody');
  statusBody.innerHTML = d.billsByStatus.length
    ? d.billsByStatus.map(b => `<tr><td>${b.status}</td><td>${b.count}</td><td>${fmt(b.total)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="text-muted">No bills in this period.</td></tr>';

  const modeBody = document.getElementById('rpt-payments-mode-tbody');
  const modes = Object.entries(d.paymentsByMode || {});
  modeBody.innerHTML = modes.length
    ? modes.map(([mode, total]) => `<tr><td>${mode}</td><td>${fmt(total)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="text-muted">No payments in this period.</td></tr>';

  const brgyBody = document.getElementById('rpt-barangays-tbody');
  brgyBody.innerHTML = d.topBarangays.length
    ? d.topBarangays.map(b => `<tr><td>${b.name || '—'}</td><td>${b.count}</td><td>${fmt(b.total)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="text-muted">No data for this period.</td></tr>';
}

const reportRunBtn = document.getElementById('report-run-btn');
if (reportRunBtn) reportRunBtn.addEventListener('click', runReport);

const reportPrintBtn = document.getElementById('report-print-btn');
if (reportPrintBtn) reportPrintBtn.addEventListener('click', () => window.print());

// ── PAGINATION ────────────────────────
function renderPagination(containerId, currentPage, totalPages, total, onPage) {
  const el = document.getElementById(containerId);
  const start = (currentPage-1)*10+1;
  const end = Math.min(currentPage*10, total);
  el.innerHTML = `
    <div class="page-info">Showing ${total ? start : 0}–${end} of ${total} records</div>
    <div class="page-btns">
      <button class="page-btn" ${currentPage<=1 ? 'disabled' : ''} onclick="(${onPage})(${currentPage-1})">‹ Prev</button>
      ${Array.from({length: Math.min(totalPages, 5)}, (_,i) => {
        const p = i + Math.max(1, currentPage - 2);
        if (p > totalPages) return '';
        return `<button class="page-btn ${p===currentPage ? 'active':''}" onclick="(${onPage})(${p})">${p}</button>`;
      }).join('')}
      <button class="page-btn" ${currentPage>=totalPages ? 'disabled':''} onclick="(${onPage})(${currentPage+1})">Next ›</button>
    </div>
  `;
}

// ── INIT ──────────────────────────────
function initApp() {
  const now = new Date();
  document.getElementById('topbar-date').textContent = now.toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  loadDashboard();
}

// ── BOOTSTRAP ─────────────────────────
(async () => {
  try {
    const data = await api('/api/auth/me');
    if (data.success) {
      showApp(data.user);
    } else {
      showLogin(); 
    }
  } catch(e) {
    showLogin();
  }
})();