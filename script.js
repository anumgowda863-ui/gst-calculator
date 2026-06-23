/* ============================================================
   GST INVOICE CALCULATOR
   script.js
   ============================================================ */

'use strict';

const GST_SLABS = [0, 3, 5, 12, 18, 28];
const DRAFT_KEY = 'kn_gst_draft_v1';
const COUNTER_KEY = 'kn_gst_invoice_counter';

/* ── State ─────────────────────────────────────────────────── */
let rowId = 0;
let logoDataUrl = '';
let saveTimer = null;
let lastComputed = null;

/* ── DOM Refs ──────────────────────────────────────────────── */
const itemsBody       = document.getElementById('items-body');
const btnAddRow        = document.getElementById('btn-add-row');
const btnCalculate    = document.getElementById('btn-calculate');
const fabCalculate    = document.getElementById('fab-calculate');
const btnPrint        = document.getElementById('btn-print');
const btnCopy         = document.getElementById('btn-copy');
const btnCsv          = document.getElementById('btn-csv');
const summaryEmpty    = document.getElementById('summary-empty');
const summaryContent  = document.getElementById('summary-content');
const breakdownBody   = document.getElementById('breakdown-body');
const breakdownFoot   = document.getElementById('breakdown-foot');
const totalsBlock     = document.getElementById('totals-block');
const invoicePreview  = document.getElementById('invoice-preview');
const themeToggle     = document.getElementById('theme-toggle');
const progressFill    = document.getElementById('progress-fill');
const draftStatus     = document.getElementById('draft-status');
const btnClearForm    = document.getElementById('btn-clear-form');
const logoInput       = document.getElementById('biz-logo');
const logoPreview     = document.getElementById('logo-preview');
const logoImg         = document.getElementById('logo-img');
const logoPlaceholder = document.getElementById('logo-placeholder');
const btnRemoveLogo   = document.getElementById('btn-remove-logo');
const presetChips     = document.getElementById('preset-chips');

/* ── Boot ──────────────────────────────────────────────────── */
function init() {
  initTheme();
  initCollapsibles();

  // Default invoice date to today
  const dateInput = document.getElementById('invoice-date');
  dateInput.value = new Date().toISOString().split('T')[0];

  // Auto invoice number
  document.getElementById('invoice-no').value = nextInvoiceNumber(false);

  const restored = restoreDraft();
  if (!restored) {
    addRow();
    addRow();
  }

  // Events
  btnAddRow.addEventListener('click', () => addRow());
  btnCalculate.addEventListener('click', calculate);
  fabCalculate.addEventListener('click', calculate);
  btnPrint.addEventListener('click', printInvoice);
  btnCopy.addEventListener('click', copySummary);
  btnCsv.addEventListener('click', exportCsv);
  themeToggle.addEventListener('click', toggleTheme);
  btnClearForm.addEventListener('click', clearForm);
  logoInput.addEventListener('change', handleLogoUpload);
  btnRemoveLogo.addEventListener('click', removeLogo);

  presetChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    addRow({ desc: chip.dataset.desc, gst: chip.dataset.gst });
  });

  document.addEventListener('input', () => { scheduleSave(); updateProgress(); });
  document.addEventListener('change', () => { scheduleSave(); updateProgress(); });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      calculate();
    }
  });

  updateProgress();
}

/* ── Theme ─────────────────────────────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('kn_gst_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (saved === 'dark' || (!saved && prefersDark)) {
    document.body.classList.add('dark');
  }
}
function toggleTheme() {
  document.body.classList.toggle('dark');
  localStorage.setItem('kn_gst_theme', document.body.classList.contains('dark') ? 'dark' : 'light');
}

/* ── Collapsible fieldsets ────────────────────────────────── */
function initCollapsibles() {
  document.querySelectorAll('.fieldset-legend-toggle').forEach(legend => {
    legend.addEventListener('click', () => {
      const targetId = legend.dataset.target;
      const body = document.getElementById(targetId);
      const wrap = legend.closest('.fieldset-collapsible');
      const isHidden = body.hasAttribute('hidden');
      if (isHidden) { body.removeAttribute('hidden'); wrap.classList.add('open'); }
      else { body.setAttribute('hidden', ''); wrap.classList.remove('open'); }
    });
  });
}

/* ── Invoice numbering ─────────────────────────────────────── */
function nextInvoiceNumber(advance) {
  let n = parseInt(localStorage.getItem(COUNTER_KEY) || '1', 10);
  const numStr = String(n).padStart(3, '0');
  if (advance) localStorage.setItem(COUNTER_KEY, String(n + 1));
  return `INV-${numStr}`;
}

/* ── Logo Upload ───────────────────────────────────────────── */
function handleLogoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1.5 * 1024 * 1024) { showToast('Logo too large — pick an image under 1.5MB.', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    logoDataUrl = reader.result;
    logoImg.src = logoDataUrl;
    logoImg.hidden = false;
    logoPlaceholder.hidden = true;
    btnRemoveLogo.hidden = false;
    scheduleSave();
  };
  reader.readAsDataURL(file);
}
function removeLogo() {
  logoDataUrl = '';
  logoImg.hidden = true;
  logoImg.src = '';
  logoPlaceholder.hidden = false;
  btnRemoveLogo.hidden = true;
  logoInput.value = '';
  scheduleSave();
}

/* ── Add Row ───────────────────────────────────────────────── */
function addRow(prefill) {
  rowId++;
  const id  = rowId;
  const tr  = document.createElement('tr');
  tr.dataset.rowId = id;

  const defaultGst = prefill?.gst ?? 18;
  const slabOptions = GST_SLABS.map(s =>
    `<option value="${s}"${String(s) === String(defaultGst) ? ' selected' : ''}>${s}%</option>`
  ).join('');

  tr.innerHTML = `
    <td><input type="text"   class="item-desc"  placeholder="Item / service" value="${prefill?.desc ? escapeAttr(prefill.desc) : ''}" /></td>
    <td><input type="text"   class="item-hsn"   placeholder="9983" maxlength="8" value="${prefill?.hsn ? escapeAttr(prefill.hsn) : ''}" /></td>
    <td><input type="number" class="item-qty"   value="${prefill?.qty ?? 1}" min="0" step="any" /></td>
    <td><input type="number" class="item-rate"  placeholder="0.00" min="0" step="any" value="${prefill?.rate ?? ''}" /></td>
    <td>
      <select class="item-gst">${slabOptions}</select>
    </td>
    <td>
      <div class="row-actions">
        <button class="btn-dup-row" title="Duplicate row" data-row="${id}" type="button">⧉</button>
        <button class="btn-delete-row" title="Remove row" data-row="${id}" type="button">×</button>
      </div>
    </td>
  `;

  tr.querySelector('.btn-delete-row').addEventListener('click', () => removeRow(id));
  tr.querySelector('.btn-dup-row').addEventListener('click', () => duplicateRow(id));
  itemsBody.appendChild(tr);
  scheduleSave();
  updateProgress();
}

/* ── Duplicate Row ─────────────────────────────────────────── */
function duplicateRow(id) {
  const tr = itemsBody.querySelector(`tr[data-row-id="${id}"]`);
  if (!tr) return;
  addRow({
    desc: tr.querySelector('.item-desc').value,
    hsn:  tr.querySelector('.item-hsn').value,
    qty:  tr.querySelector('.item-qty').value,
    rate: tr.querySelector('.item-rate').value,
    gst:  tr.querySelector('.item-gst').value,
  });
}

/* ── Remove Row ────────────────────────────────────────────── */
function removeRow(id) {
  const rows = itemsBody.querySelectorAll('tr');
  if (rows.length <= 1) { showToast('At least one item required.'); return; }
  const tr = itemsBody.querySelector(`tr[data-row-id="${id}"]`);
  if (tr) tr.remove();
  scheduleSave();
  updateProgress();
}

/* ── Helpers ───────────────────────────────────────────────── */
const fmt = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (v) => parseFloat(v) || 0;

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}

function getField(id) {
  return (document.getElementById(id) || {}).value?.trim() || '';
}

function getTxnType() {
  return document.querySelector('input[name="txn-type"]:checked')?.value || 'intra';
}

/* ── Collect Line Items ────────────────────────────────────── */
function collectItems() {
  const rows = itemsBody.querySelectorAll('tr');
  const items = [];

  rows.forEach(tr => {
    const desc = tr.querySelector('.item-desc')?.value.trim() || '';
    const hsn  = tr.querySelector('.item-hsn')?.value.trim() || '';
    const qty  = num(tr.querySelector('.item-qty')?.value);
    const rate = num(tr.querySelector('.item-rate')?.value);
    const gst  = num(tr.querySelector('.item-gst')?.value);

    items.push({ desc: desc || 'Unnamed item', hsn, qty, rate, gst });
  });

  return items;
}

/* ── Validate ──────────────────────────────────────────────── */
function validate(items) {
  let firstInvalid = null;
  itemsBody.querySelectorAll('tr').forEach((tr, i) => {
    const item = items[i];
    const rateInput = tr.querySelector('.item-rate');
    const qtyInput  = tr.querySelector('.item-qty');
    if (item.rate <= 0) { flagInvalid(rateInput); firstInvalid = firstInvalid || rateInput; }
    if (item.qty  <= 0) { flagInvalid(qtyInput);  firstInvalid = firstInvalid || qtyInput; }
  });
  if (firstInvalid) {
    showToast('Enter a valid quantity and rate for every item.', 'error');
    firstInvalid.focus();
    return false;
  }
  return true;
}

function flagInvalid(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 450);
}

/* ── Calculate ─────────────────────────────────────────────── */
function calculate() {
  const items  = collectItems();
  if (!validate(items)) return;

  const isIntra     = getTxnType() === 'intra';
  const discountVal = num(document.getElementById('discount-val').value);
  const discountTyp = document.getElementById('discount-type').value;
  const roundOff    = document.getElementById('round-off').checked;

  // Per-item calculations
  const computed = items.map(item => {
    const taxable = item.qty * item.rate;
    const gstAmt  = taxable * (item.gst / 100);
    const half    = gstAmt / 2;
    return {
      ...item,
      taxable,
      cgst: isIntra ? half : 0,
      sgst: isIntra ? half : 0,
      igst: isIntra ? 0    : gstAmt,
      gstAmt,
      total: taxable + gstAmt,
    };
  });

  // Subtotals (before discount)
  let subTaxable = computed.reduce((s, i) => s + i.taxable, 0);
  let subCgst    = computed.reduce((s, i) => s + i.cgst,    0);
  let subSgst    = computed.reduce((s, i) => s + i.sgst,    0);
  let subIgst    = computed.reduce((s, i) => s + i.igst,    0);

  // Discount
  let discountAmt = 0;
  if (discountVal > 0) {
    discountAmt = discountTyp === 'percent'
      ? (subTaxable * discountVal / 100)
      : Math.min(discountVal, subTaxable);
  }

  // Recompute tax after discount
  const discountedTaxable = subTaxable - discountAmt;
  const ratio = subTaxable > 0 ? discountedTaxable / subTaxable : 1;

  const finalCgst  = subCgst  * ratio;
  const finalSgst  = subSgst  * ratio;
  const finalIgst  = subIgst  * ratio;
  const finalGst   = (finalCgst + finalSgst + finalIgst);
  let grandTotal   = discountedTaxable + finalGst;
  let roundAdj     = 0;
  if (roundOff) {
    const rounded = Math.round(grandTotal);
    roundAdj = rounded - grandTotal;
    grandTotal = rounded;
  }

  lastComputed = { computed, isIntra, subTaxable, discountAmt, finalCgst, finalSgst, finalIgst, finalGst, grandTotal, roundAdj };

  // Render
  renderBreakdown(computed, isIntra, discountedTaxable, finalCgst, finalSgst, finalIgst, grandTotal);
  renderTotals(subTaxable, discountAmt, finalCgst, finalSgst, finalIgst, finalGst, grandTotal, isIntra, roundAdj);
  renderInvoice(computed, isIntra, subTaxable, discountAmt, finalCgst, finalSgst, finalIgst, grandTotal, roundAdj);

  summaryEmpty.hidden   = true;
  summaryContent.hidden = false;

  celebrateCalculate();
  nextInvoiceNumber(true); // advance counter for next session

  // Scroll to output on mobile
  if (window.innerWidth < 860) {
    document.getElementById('output-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* ── Success feedback ──────────────────────────────────────── */
function celebrateCalculate() {
  btnCalculate.classList.add('success');
  setTimeout(() => btnCalculate.classList.remove('success'), 1400);
  fireConfetti();
  showToast('Invoice calculated successfully!', 'success');
}

/* ── Render Breakdown Table ────────────────────────────────── */
function renderBreakdown(computed, isIntra, totTaxable, totCgst, totSgst, totIgst, grandTotal) {
  // Toggle columns
  const cgstCols = document.querySelectorAll('.col-cgst');
  const sgstCols = document.querySelectorAll('.col-sgst');
  const igstCols = document.querySelectorAll('.col-igst');

  cgstCols.forEach(el => el.classList.toggle('hide-col', !isIntra));
  sgstCols.forEach(el => el.classList.toggle('hide-col', !isIntra));
  igstCols.forEach(el => el.classList.toggle('hide-col',  isIntra));

  document.getElementById('breakdown-badge').textContent = isIntra ? 'Intra-state' : 'Inter-state';

  // Body
  breakdownBody.innerHTML = computed.map(item => `
    <tr>
      <td title="${item.desc}">${item.desc}</td>
      <td>${fmt(item.taxable)}</td>
      ${isIntra
        ? `<td class="col-cgst">${fmt(item.cgst)}<br/><small style="color:var(--ink-faint)">${item.gst/2}%</small></td>
           <td class="col-sgst">${fmt(item.sgst)}<br/><small style="color:var(--ink-faint)">${item.gst/2}%</small></td>
           <td class="col-igst hide-col"></td>`
        : `<td class="col-cgst hide-col"></td>
           <td class="col-sgst hide-col"></td>
           <td class="col-igst">${fmt(item.igst)}<br/><small style="color:var(--ink-faint)">${item.gst}%</small></td>`
      }
      <td>${fmt(item.total)}</td>
    </tr>
  `).join('');

  // Footer
  breakdownFoot.innerHTML = `
    <tr>
      <td><strong>Total</strong></td>
      <td><strong>${fmt(totTaxable)}</strong></td>
      ${isIntra
        ? `<td class="col-cgst"><strong>${fmt(totCgst)}</strong></td>
           <td class="col-sgst"><strong>${fmt(totSgst)}</strong></td>
           <td class="col-igst hide-col"></td>`
        : `<td class="col-cgst hide-col"></td>
           <td class="col-sgst hide-col"></td>
           <td class="col-igst"><strong>${fmt(totIgst)}</strong></td>`
      }
      <td><strong>${fmt(grandTotal)}</strong></td>
    </tr>
  `;
}

/* ── Render Totals Block ───────────────────────────────────── */
function renderTotals(subTaxable, discount, cgst, sgst, igst, totalGst, grand, isIntra, roundAdj) {
  const rows = [
    { label: 'Subtotal (taxable)',  value: subTaxable },
    discount > 0 ? { label: 'Discount',  value: -discount, neg: true } : null,
    isIntra ? { label: 'CGST',  value: cgst } : null,
    isIntra ? { label: 'SGST',  value: sgst } : null,
    !isIntra ? { label: 'IGST', value: igst } : null,
    { label: 'Total GST',  value: totalGst },
    (roundAdj && Math.abs(roundAdj) > 0.001) ? { label: 'Round Off', value: roundAdj, neg: roundAdj < 0 } : null,
    { label: 'Grand Total',  value: grand, grand: true },
  ].filter(Boolean);

  totalsBlock.innerHTML = rows.map(r => `
    <div class="total-row${r.grand ? ' grand' : ''}">
      <span class="total-label">${r.label}</span>
      <span class="total-value counting" style="${r.neg ? 'color:var(--red)' : ''}">
        ${r.neg ? '−' : ''}${fmt(Math.abs(r.value))}
      </span>
    </div>
  `).join('');
}

/* ── Render Invoice Preview ────────────────────────────────── */
function renderInvoice(computed, isIntra, subTaxable, discount, cgst, sgst, igst, grand, roundAdj) {
  const bizName    = getField('biz-name')    || 'Your Business';
  const bizGstin   = getField('biz-gstin')   || '—';
  const bizAddr    = getField('biz-address') || '—';
  const clientName = getField('client-name') || 'Client';
  const clientGst  = getField('client-gstin');
  const invDate    = document.getElementById('invoice-date').value;
  const invNo      = getField('invoice-no')  || 'INV-001';
  const notes      = getField('invoice-notes');
  const bankName   = getField('bank-name');
  const bankAcc    = getField('bank-acc');
  const bankIfsc   = getField('bank-ifsc');
  const bankUpi    = getField('bank-upi');

  const formattedDate = invDate
    ? new Date(invDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const itemRows = computed.map(item => `
    <tr>
      <td>${item.desc}${item.hsn ? `<br/><small style="color:var(--ink-faint)">HSN/SAC: ${item.hsn}</small>` : ''}</td>
      <td style="text-align:right">${item.qty}</td>
      <td style="text-align:right">${fmt(item.rate)}</td>
      <td style="text-align:right">${item.gst}%</td>
      <td style="text-align:right">${fmt(item.gstAmt)}</td>
      <td style="text-align:right">${fmt(item.total)}</td>
    </tr>
  `).join('');

  const taxLines = isIntra
    ? `<tr><td colspan="5" style="text-align:right">CGST</td><td style="text-align:right">${fmt(cgst)}</td></tr>
       <tr><td colspan="5" style="text-align:right">SGST</td><td style="text-align:right">${fmt(sgst)}</td></tr>`
    : `<tr><td colspan="5" style="text-align:right">IGST</td><td style="text-align:right">${fmt(igst)}</td></tr>`;

  const discRow = discount > 0
    ? `<tr><td colspan="5" style="text-align:right;color:var(--red)">Discount</td><td style="text-align:right;color:var(--red)">−${fmt(discount)}</td></tr>`
    : '';

  const roundRow = (roundAdj && Math.abs(roundAdj) > 0.001)
    ? `<tr><td colspan="5" style="text-align:right">Round Off</td><td style="text-align:right">${roundAdj < 0 ? '−' : ''}${fmt(Math.abs(roundAdj))}</td></tr>`
    : '';

  const bankBlock = (bankName || bankAcc || bankIfsc || bankUpi)
    ? `<div style="margin-top:14px;padding:12px 14px;background:var(--paper);border-radius:8px;font-size:11.5px;color:var(--ink-soft)">
        <div style="font-weight:700;color:var(--saffron);font-size:10px;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">Payment Details</div>
        ${bankName ? `Bank: ${bankName}<br/>` : ''}
        ${bankAcc ? `A/C No.: ${bankAcc}<br/>` : ''}
        ${bankIfsc ? `IFSC: ${bankIfsc}<br/>` : ''}
        ${bankUpi ? `UPI: ${bankUpi}` : ''}
       </div>`
    : '';

  const notesBlock = notes
    ? `<div style="margin-top:12px;font-size:11.5px;color:var(--ink-soft)"><strong>Notes:</strong> ${notes}</div>`
    : '';

  const logoBlock = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="logo" style="height:44px;max-width:140px;object-fit:contain;margin-bottom:8px" />`
    : '';

  invoicePreview.innerHTML = `
    <div class="inv-head">
      <div>
        ${logoBlock}
        <div class="inv-biz-name">${bizName}</div>
        <div style="color:var(--ink-soft);font-size:12px;margin-top:2px">${bizAddr}</div>
        <div class="inv-gstin">GSTIN: ${bizGstin}</div>
      </div>
      <div class="inv-meta">
        <div class="inv-label">Tax Invoice</div>
        <div class="inv-invoice-no">${invNo}</div>
        <div style="color:var(--ink-soft);font-size:12px;margin-top:4px">Date: ${formattedDate}</div>
        <div style="font-size:12px;margin-top:2px;color:var(--ink-soft)">${isIntra ? 'Intra-state' : 'Inter-state'}</div>
      </div>
    </div>

    <div class="inv-parties">
      <div>
        <div class="inv-party-label">Billed From</div>
        <div class="inv-party-name">${bizName}</div>
        <div class="inv-gstin">${bizGstin}</div>
      </div>
      <div>
        <div class="inv-party-label">Billed To</div>
        <div class="inv-party-name">${clientName}</div>
        ${clientGst ? `<div class="inv-gstin">${clientGst}</div>` : ''}
      </div>
    </div>

    <table class="inv-table">
      <thead>
        <tr>
          <th style="text-align:left">Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>GST%</th>
          <th>GST Amt</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="text-align:right">Subtotal</td>
          <td style="text-align:right">${fmt(subTaxable)}</td>
        </tr>
        ${discRow}
        ${taxLines}
        ${roundRow}
        <tr>
          <td colspan="5" style="text-align:right;font-size:15px">Grand Total</td>
          <td style="text-align:right;font-size:15px;color:var(--accent)">${fmt(grand)}</td>
        </tr>
      </tfoot>
    </table>

    ${bankBlock}
    ${notesBlock}

    <div class="inv-footer-note">
      This is a computer-generated invoice. Made with KarNivesh GST Calculator.
    </div>
  `;
}

/* ── Print / Save PDF ──────────────────────────────────────── */
function printInvoice() {
  if (!lastComputed) { showToast('Calculate GST first.', 'error'); return; }
  window.print();
}

/* ── Copy Summary ──────────────────────────────────────────── */
function copySummary() {
  const rows = document.querySelectorAll('.total-row');
  if (!rows.length) { showToast('Nothing to copy yet.'); return; }

  let text = 'GST Summary\n' + '─'.repeat(30) + '\n';
  rows.forEach(row => {
    const label = row.querySelector('.total-label')?.textContent.trim() || '';
    const value = row.querySelector('.total-value')?.textContent.trim() || '';
    text += `${label.padEnd(22)} ${value}\n`;
  });

  navigator.clipboard.writeText(text)
    .then(() => showToast('Summary copied to clipboard!', 'success'))
    .catch(() => showToast('Copy failed — try selecting manually.', 'error'));
}

/* ── Export CSV ────────────────────────────────────────────── */
function exportCsv() {
  if (!lastComputed) { showToast('Calculate GST first.', 'error'); return; }
  const { computed, isIntra } = lastComputed;
  const headers = ['Description', 'HSN/SAC', 'Qty', 'Rate', 'GST%', isIntra ? 'CGST' : 'IGST(1)', isIntra ? 'SGST' : '', 'Total'];
  const rows = computed.map(i => [
    i.desc, i.hsn, i.qty, i.rate.toFixed(2), i.gst,
    isIntra ? i.cgst.toFixed(2) : i.igst.toFixed(2),
    isIntra ? i.sgst.toFixed(2) : '',
    i.total.toFixed(2)
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${getField('invoice-no') || 'invoice'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('CSV exported!', 'success');
}

/* ── Autosave Draft ────────────────────────────────────────── */
function scheduleSave() {
  if (draftStatus) { draftStatus.textContent = 'Saving…'; draftStatus.classList.add('saving'); }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 600);
}

function saveDraft() {
  try {
    const items = [];
    itemsBody.querySelectorAll('tr').forEach(tr => {
      items.push({
        desc: tr.querySelector('.item-desc')?.value || '',
        hsn:  tr.querySelector('.item-hsn')?.value || '',
        qty:  tr.querySelector('.item-qty')?.value || '',
        rate: tr.querySelector('.item-rate')?.value || '',
        gst:  tr.querySelector('.item-gst')?.value || '18',
      });
    });

    const draft = {
      bizName: getField('biz-name'), bizGstin: getField('biz-gstin'), bizAddress: getField('biz-address'),
      clientName: getField('client-name'), clientGstin: getField('client-gstin'),
      invoiceDate: getField('invoice-date'), invoiceNo: getField('invoice-no'),
      txnType: getTxnType(), discountVal: getField('discount-val'), discountType: getField('discount-type'),
      roundOff: document.getElementById('round-off')?.checked,
      bankName: getField('bank-name'), bankAcc: getField('bank-acc'), bankIfsc: getField('bank-ifsc'), bankUpi: getField('bank-upi'),
      notes: getField('invoice-notes'),
      logo: logoDataUrl,
      items,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    if (draftStatus) { draftStatus.textContent = 'All changes saved'; draftStatus.classList.remove('saving'); }
  } catch (e) {
    if (draftStatus) draftStatus.textContent = 'Save failed';
  }
}

function restoreDraft() {
  let raw;
  try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return false; }
  if (!raw) return false;
  let d;
  try { d = JSON.parse(raw); } catch (e) { return false; }
  if (!d) return false;

  setVal('biz-name', d.bizName); setVal('biz-gstin', d.bizGstin); setVal('biz-address', d.bizAddress);
  setVal('client-name', d.clientName); setVal('client-gstin', d.clientGstin);
  setVal('invoice-date', d.invoiceDate); setVal('invoice-no', d.invoiceNo);
  setVal('discount-val', d.discountVal); setVal('discount-type', d.discountType);
  setVal('bank-name', d.bankName); setVal('bank-acc', d.bankAcc); setVal('bank-ifsc', d.bankIfsc); setVal('bank-upi', d.bankUpi);
  setVal('invoice-notes', d.notes);
  if (typeof d.roundOff === 'boolean') document.getElementById('round-off').checked = d.roundOff;

  if (d.txnType === 'inter') {
    document.querySelector('input[name="txn-type"][value="inter"]').checked = true;
  }

  if (d.logo) {
    logoDataUrl = d.logo;
    logoImg.src = logoDataUrl;
    logoImg.hidden = false;
    logoPlaceholder.hidden = true;
    btnRemoveLogo.hidden = false;
  }

  if (Array.isArray(d.items) && d.items.length) {
    d.items.forEach(it => addRow(it));
  } else {
    return false;
  }
  return true;
}

function setVal(id, val) {
  if (val === undefined || val === null || val === '') return;
  const el = document.getElementById(id);
  if (el) el.value = val;
}

/* ── Clear Form ────────────────────────────────────────────── */
function clearForm() {
  if (!confirm('Clear all entered data? This cannot be undone.')) return;
  localStorage.removeItem(DRAFT_KEY);
  document.querySelectorAll('input[type="text"], input[type="number"], input[type="date"], textarea').forEach(el => el.value = '');
  document.getElementById('discount-type').value = 'flat';
  document.getElementById('round-off').checked = true;
  document.querySelector('input[name="txn-type"][value="intra"]').checked = true;
  itemsBody.innerHTML = '';
  removeLogo();
  document.getElementById('invoice-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('invoice-no').value = nextInvoiceNumber(false);
  addRow(); addRow();
  summaryEmpty.hidden = false;
  summaryContent.hidden = true;
  lastComputed = null;
  showToast('Form cleared.');
  updateProgress();
}

/* ── Progress Bar ──────────────────────────────────────────── */
function updateProgress() {
  if (!progressFill) return;
  const fields = ['biz-name', 'biz-gstin', 'client-name', 'invoice-date', 'invoice-no'];
  let filled = fields.filter(id => getField(id)).length;
  const items = collectItems();
  const validItems = items.filter(i => i.rate > 0 && i.qty > 0).length;
  if (validItems > 0) filled++;
  const pct = Math.min(100, Math.round((filled / (fields.length + 1)) * 100));
  progressFill.style.width = pct + '%';
}

/* ── Confetti ──────────────────────────────────────────────── */
function fireConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#FF8C00', '#2D1B69', '#5B4BB0', '#059669', '#FFAD45'];
  const pieces = Array.from({ length: 70 }, () => ({
    x: canvas.width / 2 + (Math.random() - 0.5) * 200,
    y: canvas.height * 0.25,
    vx: (Math.random() - 0.5) * 9,
    vy: Math.random() * -7 - 3,
    size: Math.random() * 6 + 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    vrot: (Math.random() - 0.5) * 14,
    life: 0,
  }));

  let frame = 0;
  function tick() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.vy += 0.22;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vrot;
      p.life++;
      if (p.y < canvas.height + 20) alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, 1 - p.life / 90);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    });
    if (alive && frame < 100) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  requestAnimationFrame(tick);
}

/* ── Toast ─────────────────────────────────────────────────── */
let toastTimer = null;

function showToast(msg, type) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.className = 'toast show' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

/* ── Start ─────────────────────────────────────────────────── */
init();