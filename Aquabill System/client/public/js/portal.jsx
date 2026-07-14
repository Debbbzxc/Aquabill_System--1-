/* AquaBill — Customer Portal JS */

function fmt(n) { return '₱' + parseFloat(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 }); }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric' }) : '—'; }
function fullMonths() { return ['January','February','March','April','May','June','July','August','September','October','November','December']; }

function statusBadge(status) {
  const map = {
    Active: 'badge-green', Paid: 'badge-green',
    Pending: 'badge-amber', Partial: 'badge-amber',
    Disconnected: 'badge-slate',
    Unpaid: 'badge-red', Overdue: 'badge-red',
  };
  return `<span class="badge ${map[status] || 'badge-slate'}">${status}</span>`;
}

const lookupBtn = document.getElementById('lookup-btn');
const lkAccount = document.getElementById('lk-account');
const lkLastname = document.getElementById('lk-lastname');
const lookupError = document.getElementById('lookup-error');

async function doLookup() {
  const account = lkAccount.value.trim();
  const lastName = lkLastname.value.trim();
  lookupError.textContent = '';
  if (!account || !lastName) {
    lookupError.textContent = 'Please enter both your account number and last name.';
    return;
  }
  lookupBtn.textContent = 'Looking up…';
  lookupBtn.disabled = true;
  try {
    const res = await fetch(`/api/portal/lookup?account=${encodeURIComponent(account)}&lastName=${encodeURIComponent(lastName)}`);
    const data = await res.json();
    if (!data.success) {
      lookupError.textContent = data.message || 'Account not found.';
      return;
    }
    renderResult(data.data);
  } catch (e) {
    lookupError.textContent = 'Server error. Please try again.';
  } finally {
    lookupBtn.innerHTML = '<svg class="inline-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.8-4.8"/></svg> View My Account';
    lookupBtn.disabled = false;
  }
}

lookupBtn.addEventListener('click', doLookup);
lkLastname.addEventListener('keydown', e => { if (e.key === 'Enter') doLookup(); });
lkAccount.addEventListener('keydown', e => { if (e.key === 'Enter') doLookup(); });

document.getElementById('back-btn').addEventListener('click', () => {
  document.getElementById('result-card').classList.add('hidden');
  document.getElementById('lookup-card').classList.remove('hidden');
  lookupError.textContent = '';
});

let currentAccount = null;   // { account, lastName } used to re-authenticate the /pay call
let currentBillsById = {};   // billId -> bill object, for the pay modal summary

function renderResult(data) {
  const { customer, bills, payments } = data;
  const mo = fullMonths();

  currentAccount = { account: customer.accountNumber, lastName: customer.lastName };
  currentBillsById = {};
  bills.forEach(b => { currentBillsById[b._id] = b; });

  document.getElementById('lookup-card').classList.add('hidden');
  document.getElementById('result-card').classList.remove('hidden');

  document.getElementById('profile-avatar').textContent = customer.firstName.charAt(0).toUpperCase();
  document.getElementById('profile-name').textContent = `${customer.firstName} ${customer.lastName}`;
  document.getElementById('profile-meta').textContent =
    `${customer.accountNumber} · Meter ${customer.meterNumber} · ${customer.address}, ${customer.barangay}`;
  document.getElementById('balance-amt').textContent = fmt(customer.outstandingBalance);

  const billsTbody = document.getElementById('bills-tbody');
  if (!bills.length) {
    billsTbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6M9 9h2"/></svg></div><p>No bills yet.</p></div></td></tr>`;
  } else {
    billsTbody.innerHTML = bills.map(b => `
      <tr>
        <td>${mo[(b.billingPeriod?.month || 1) - 1]} ${b.billingPeriod?.year || ''}</td>
        <td>${b.consumption ?? 0} m³</td>
        <td><strong>${fmt(b.totalAmount)}</strong></td>
        <td style="color:${b.balance > 0 ? 'var(--red-400)' : 'var(--green-400)'}">${fmt(b.balance)}</td>
        <td>${fmtDate(b.dueDate)}</td>
        <td>${statusBadge(b.status)}</td>
        <td>${b.balance > 0 ? `<button type="button" class="pay-online-btn" onclick="openPayModal('${b._id}')">Pay Online</button>` : ''}</td>
      </tr>
    `).join('');
  }

  const paymentsTbody = document.getElementById('payments-tbody');
  if (!payments.length) {
    paymentsTbody.innerHTML = `<tr><td colspan="4"><div class="empty-state"><div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/></svg></div><p>No payments yet.</p></div></td></tr>`;
  } else {
    paymentsTbody.innerHTML = payments.map(p => `
      <tr>
        <td><strong>${p.receiptNumber || '—'}</strong></td>
        <td style="color:var(--green-400);font-weight:700;">${fmt(p.amountPaid)}</td>
        <td>${p.paymentMode || '—'}</td>
        <td>${fmtDate(p.paymentDate)}</td>
      </tr>
    `).join('');
  }
}

/* PAY ONLINE (GCash / PayMaya)*/
let selectedMethod = null;
let payingBillId = null;

const payModal = document.getElementById('pay-modal');
const payMobile = document.getElementById('pay-mobile');
const payAmount = document.getElementById('pay-amount');
const payError = document.getElementById('pay-error');
const payProcessing = document.getElementById('pay-processing');
const confirmPayBtn = document.getElementById('confirm-pay-btn');

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
});

window.openPayModal = (billId) => {
  const bill = currentBillsById[billId];
  if (!bill) return;
  payingBillId = billId;
  selectedMethod = null;
  payError.textContent = '';
  payMobile.value = '';
  payAmount.value = bill.balance.toFixed(2);
  document.getElementById('pay-amount-hint').textContent = `Full balance: ${fmt(bill.balance)}. You may pay less to make a partial payment.`;

  const mo = fullMonths();
  document.getElementById('pay-bill-summary').innerHTML = `
    <div>
      <div class="pbs-label">Billing Period</div>
      <div class="pbs-value">${mo[(bill.billingPeriod?.month || 1) - 1]} ${bill.billingPeriod?.year || ''}</div>
    </div>
    <div class="pbs-balance">
      <div class="pbs-label">Balance Due</div>
      <div class="pbs-value">${fmt(bill.balance)}</div>
    </div>
  `;

  document.querySelectorAll('.ewallet-opt').forEach(el => el.classList.remove('selected'));
  payProcessing.classList.add('hidden');
  confirmPayBtn.disabled = false;
  document.getElementById('pay-cancel-btn').disabled = false;
  openModal('pay-modal');
};

document.querySelectorAll('.ewallet-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.ewallet-opt').forEach(el => el.classList.remove('selected'));
    opt.classList.add('selected');
    selectedMethod = opt.getAttribute('data-method');
  });
});

confirmPayBtn.addEventListener('click', async () => {
  payError.textContent = '';
  const bill = currentBillsById[payingBillId];
  const amount = parseFloat(payAmount.value);

  if (!selectedMethod) { payError.textContent = 'Choose GCash or PayMaya to continue.'; return; }
  if (!/^09\d{9}$/.test(payMobile.value.trim())) { payError.textContent = 'Enter a valid 11-digit mobile number (e.g. 09171234567).'; return; }
  if (isNaN(amount) || amount <= 0) { payError.textContent = 'Enter a valid amount.'; return; }
  if (amount > bill.balance + 0.01) { payError.textContent = `Amount can't exceed the balance of ${fmt(bill.balance)}.`; return; }

  confirmPayBtn.disabled = true;
  document.getElementById('pay-cancel-btn').disabled = true;
  payProcessing.classList.remove('hidden');
  document.getElementById('pay-processing-text').textContent = `Connecting to ${selectedMethod}…`;

  try {
    // Simulated gateway round-trip — this is where a real GCash/Maya
    // checkout redirect + webhook confirmation would happen instead.
    await new Promise(r => setTimeout(r, 900));
    document.getElementById('pay-processing-text').textContent = `Confirming payment with ${selectedMethod}…`;
    await new Promise(r => setTimeout(r, 700));

    const res = await fetch('/api/portal/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account: currentAccount.account,
        lastName: currentAccount.lastName,
        billId: payingBillId,
        paymentMethod: selectedMethod,
        payerMobile: payMobile.value.trim(),
        amount,
      }),
    });
    const data = await res.json();

    if (!data.success) {
      payError.textContent = data.message || 'Payment failed. Please try again.';
      payProcessing.classList.add('hidden');
      confirmPayBtn.disabled = false;
      document.getElementById('pay-cancel-btn').disabled = false;
      return;
    }

    closeModal('pay-modal');
    showReceipt(data.data);

    // Refresh the account view so balances/bills/payments reflect the new payment
    const res2 = await fetch(`/api/portal/lookup?account=${encodeURIComponent(currentAccount.account)}&lastName=${encodeURIComponent(currentAccount.lastName)}`);
    const data2 = await res2.json();
    if (data2.success) renderResult(data2.data);
  } catch (e) {
    payError.textContent = 'Server error. Please try again.';
    payProcessing.classList.add('hidden');
    confirmPayBtn.disabled = false;
    document.getElementById('pay-cancel-btn').disabled = false;
  }
});

/* ── RECEIPT ── */
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
    <div class="receipt-divider"></div>
    <div class="receipt-row receipt-total"><span>Amount Paid</span><strong>${fmt(p.amountPaid)}</strong></div>
    <div class="receipt-footer">Thank you! This receipt was generated by AquaBill.</div>
  `;
}

function showReceipt(payment) {
  document.getElementById('receipt-content').innerHTML = receiptHTML(payment);
  openModal('receipt-modal');
}

document.getElementById('print-receipt-btn').addEventListener('click', () => {
  window.print();
});
