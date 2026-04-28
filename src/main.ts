import './styles.css';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { aliases, normalizeColumns, validateInputSchema } from './core/normalizeColumns';
import { computeVatReconciliation } from './core/computeVatReconciliation';
import { buildCabinetConclusion } from './core/buildCabinetConclusion';
import { exportWorkbook } from './core/exportWorkbook';
import type { Adjustment, RegimeTva } from './types';

const app = document.getElementById('app')!;
app.innerHTML = `
<div class="card"><h2>TVA Reconciliation Framework</h2><div id="status" class="status">Prêt</div></div>
<div class="card">
  <div class="row">
    <button id="modeCsv">Mode CSV</button>
    <button id="modeApi">Mode API</button>
  </div>
  <div id="csvBox" class="grid">
    <div><label>vat_declarations.csv</label><input id="vatFile" type="file" /></div>
    <div><label>tax_declarations.csv</label><input id="taxFile" type="file" /></div>
    <div><label>general_ledger.csv</label><input id="glFile" type="file" /></div>
    <div><label>mapping.csv</label><input id="mapFile" type="file" /></div>
  </div>
  <div id="apiBox" class="grid" style="display:none">
    <div><label>Endpoint companies</label><input id="epCompanies" value="/companies"/></div>
    <div><label>Endpoint vat</label><input id="epVat" value="/vat_declarations"/></div>
    <div><label>Endpoint tax</label><input id="epTax" value="/tax_declarations"/></div>
    <div><label>Endpoint gl</label><input id="epGl" value="/general_ledger"/></div>
  </div>
  <div class="grid">
    <div><label>Société</label><input id="companyId" value="C1"/></div>
    <div><label>Période début</label><input id="ps" value="2026-01-01"/></div>
    <div><label>Période fin</label><input id="pe" value="2026-01-31"/></div>
    <div><label>Ouverture exercice</label><input id="fs" value="2026-01-01"/></div>
    <div><label>Régime TVA</label><select id="regime"><option>debits</option><option>encaissements</option><option>mixte</option><option>marge</option></select></div>
    <div><label>Seuil</label><input id="threshold" value="5"/></div>
    <div><label>Auteur correction</label><input id="author" value="collaborateur"/></div>
  </div>
  <div class="row"><button id="syncApi">Synchroniser API</button><button id="run">Calculer</button><button id="export">Exporter Excel</button></div>
</div>
<div class="card"><h3>Schema</h3><pre id="schema"></pre></div>
<div class="card"><h3>Conclusion du cadrage TVA</h3><div id="conclusion"></div></div>
<div class="card"><h3>Summary</h3><pre id="summary"></pre></div>
<div class="card"><h3>Par catégorie</h3><div id="byCategory" class="tbl"></div></div>
<div class="card"><h3>Par compte 445</h3><div id="byAccount" class="tbl"></div></div>
<div class="card"><h3>Controls</h3><div id="controls" class="tbl"></div></div>
<div class="card"><h3>Anomalies & Corrections</h3><div class="row"><input id="action" placeholder="EXCLUDE_LINE|SIGN_INVERT|REMAP_COLLECTEE|REMAP_DED_ABS|REMAP_DED_IMMO"/><input id="comment" placeholder="commentaire"/></div><div id="anomalies" class="tbl"></div></div>
`;

const state: { mode:'csv'|'api'; vat:any[]; tax:any[]; gl:any[]; mapping:any[]; result:any; adjustments: Adjustment[] } = { mode:'csv', vat:[], tax:[], gl:[], mapping:[], result:null, adjustments:[] };

const $ = (id:string) => document.getElementById(id) as HTMLInputElement;
const status = (m:string) => (document.getElementById('status')!.textContent = m);

async function parseFile(file?: File): Promise<any[]> {
  if (!file) return [];
  return new Promise((resolve, reject) => Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: reject }));
}

function table(rows:any[]): HTMLElement {
  if (!rows.length) { const d = document.createElement('div'); d.textContent = 'Aucune donnée'; return d; }
  const root = document.createElement('table');
  const cols = Object.keys(rows[0]);
  const trh = document.createElement('tr');
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  const thead = document.createElement('thead'); thead.appendChild(trh); root.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => { const td = document.createElement('td'); td.textContent = String(r[c] ?? ''); tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  root.appendChild(tbody);
  return root;
}

async function fetchPaged(endpoint: string, params: Record<string,string>) {
  const all:any[] = [];
  for (let page=1; page<=20; page++) {
    const u = new URL('/api/pennylane'+endpoint, window.location.origin);
    Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, v));
    u.searchParams.set('page', String(page));
    u.searchParams.set('limit', '500');
    const r = await fetch(u.toString());
    if (!r.ok) throw new Error(`API ${endpoint} ${r.status}`);
    const j = await r.json();
    const chunk = Array.isArray(j) ? j : (Array.isArray(j.data) ? j.data : []);
    all.push(...chunk);
    if (chunk.length < 500) break;
  }
  return all;
}


function formatAmount(v: number) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
}

function renderConclusion() {
  const root = document.getElementById('conclusion')!;
  root.innerHTML = '';
  if (!state.result?.summary) {
    root.textContent = 'Aucun calcul disponible.';
    return;
  }

  const threshold = Number($('threshold').value);
  const c = buildCabinetConclusion(state.result.summary, threshold, state.result.controls ?? []);

  const fields = [
    { k: 'Société', v: c.company },
    { k: 'Période', v: c.period },
    { k: 'Régime TVA', v: c.regime },
    { k: 'TVA déclarée', v: formatAmount(c.declaredVat) },
    { k: 'TVA théorique grand livre', v: formatAmount(c.theoreticalVat) },
    { k: 'Écart', v: formatAmount(c.gap) },
    { k: 'Seuil', v: formatAmount(c.threshold) },
    { k: 'Statut final', v: c.finalStatus },
    { k: 'Contrôles bloquants', v: c.blockingControls.length ? c.blockingControls.join(', ') : 'Aucun' }
  ];

  const dl = document.createElement('dl');
  dl.className = 'conclusion-grid';
  for (const f of fields) {
    const dt = document.createElement('dt');
    dt.textContent = f.k;
    const dd = document.createElement('dd');
    dd.textContent = String(f.v);
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  const p = document.createElement('p');
  p.className = 'conclusion-message';
  p.textContent = c.message;

  root.appendChild(dl);
  root.appendChild(p);

  if (c.regimeAlert) {
    const warn = document.createElement('p');
    warn.className = 'conclusion-alert';
    warn.textContent = c.regimeAlert;
    root.appendChild(warn);
  }
}

function renderAnomaliesWithWorkflow(anomalies:any[]) {
  const container = document.getElementById('anomalies')!;
  container.innerHTML = '';
  if (!anomalies.length) { container.textContent = 'Aucune anomalie'; return; }
  const rows = anomalies.map((a) => {
    const existing = state.adjustments.find((x) => x.lineId === a.id);
    return {
      id: a.id,
      anomaly_code: a.anomaly_code,
      account_number: a.account_number,
      amount: a.net_amount,
      status: existing?.status ?? '-',
      action: existing?.action ?? '-'
    };
  });
  container.appendChild(table(rows));
}

function recalc() {
  const keysVat = normalizeColumns(state.vat[0] ?? {}, aliases);
  const keysGl = normalizeColumns(state.gl[0] ?? {}, aliases);
  const schema = validateInputSchema(state.gl, ['company', 'date', 'account', 'debit', 'credit']);
  document.getElementById('schema')!.textContent = JSON.stringify(schema, null, 2);

  state.result = computeVatReconciliation({
    companyId: $('companyId').value,
    vatDeclarations: state.vat,
    taxDeclarations: state.tax,
    generalLedger: state.gl,
    mapping: state.mapping,
    selectedPeriodStart: $('ps').value,
    selectedPeriodEnd: $('pe').value,
    fiscalYearStart: $('fs').value,
    regimeTva: $('regime').value as RegimeTva,
    threshold: Number($('threshold').value),
    keysVat,
    keysGl,
    adjustments: state.adjustments
  });

  renderConclusion();
  document.getElementById('summary')!.textContent = JSON.stringify(state.result.summary, null, 2);
  const controls = document.getElementById('controls')!; controls.innerHTML = ''; controls.appendChild(table(state.result.controls));
  const byCategory = document.getElementById('byCategory')!; byCategory.innerHTML = ''; byCategory.appendChild(table([...state.result.categoryTotals.entries()].map(([vat_category, amount]:any)=>({vat_category, amount}))));
  const byAccount = document.getElementById('byAccount')!; byAccount.innerHTML = ''; byAccount.appendChild(table(state.result.accountTotals));
  renderAnomaliesWithWorkflow(state.result.anomalies);
}

(document.getElementById('modeCsv') as HTMLButtonElement).onclick = () => { state.mode='csv'; (document.getElementById('csvBox') as HTMLElement).style.display='grid'; (document.getElementById('apiBox') as HTMLElement).style.display='none'; };
(document.getElementById('modeApi') as HTMLButtonElement).onclick = () => { state.mode='api'; (document.getElementById('csvBox') as HTMLElement).style.display='none'; (document.getElementById('apiBox') as HTMLElement).style.display='grid'; };

(document.getElementById('syncApi') as HTMLButtonElement).onclick = async () => {
  if (state.mode !== 'api') return;
  try {
    const c = $('companyId').value;
    state.vat = await fetchPaged($('epVat').value, { company_id: c, period_start: $('fs').value, period_end: $('pe').value });
    state.tax = await fetchPaged($('epTax').value, { company_id: c, period_start: $('fs').value, period_end: $('pe').value });
    state.gl = await fetchPaged($('epGl').value, { company_id: c, period_start: $('fs').value, period_end: $('pe').value });
    status(`API sync ok: vat ${state.vat.length}, tax ${state.tax.length}, gl ${state.gl.length}`);
  } catch (e) {
    status(String(e));
  }
};

(document.getElementById('run') as HTMLButtonElement).onclick = async () => {
  if (state.mode === 'csv') {
    state.vat = await parseFile(($('vatFile') as any).files?.[0]);
    state.tax = await parseFile(($('taxFile') as any).files?.[0]);
    state.gl = await parseFile(($('glFile') as any).files?.[0]);
    state.mapping = await parseFile(($('mapFile') as any).files?.[0]);
  }
  recalc();
  status('Calcul terminé');
};

(document.getElementById('anomalies') as HTMLElement).onclick = (ev) => {
  const target = ev.target as HTMLElement;
  if (!target || target.tagName !== 'TD') return;
};

(document.getElementById('export') as HTMLButtonElement).onclick = () => {
  if (!state.result) return;
  const wb = exportWorkbook({
    summary: state.result.summary,
    controls: state.result.controls,
    source: state.mode === 'api' ? 'API' : 'CSV',
    limitations: ['POC', 'CASH_BASIS_SCOPE_NOT_HANDLED', 'VAT_MARGIN_SCOPE_NOT_HANDLED'],
    mapping: state.mapping,
    rawVat: state.vat,
    rawTax: state.tax,
    rawGl: state.gl,
    anomalies: state.result.anomalies,
    lines: state.result.lines,
    adjustments: state.adjustments,
    byCategory: [...state.result.categoryTotals.entries()].map(([vat_category, amount]:any)=>({vat_category, amount})),
    byAccount: state.result.accountTotals,
    declarationsRetained: state.result.declarationsRetained,
    declarationsExcluded: state.result.declarationsExcluded,
    ytd: { declared_amount_ytd: state.result.declarationAmountYtd, vat_theoretical_ytd: state.result.vatTheoreticalYtd, cadrage_gap_ytd: state.result.cadrageGapYtd }
  });
  XLSX.writeFile(wb, `cadrage_tva_${state.result.summary.company_id}_${state.result.summary.period_end}.xlsx`);
};

// Minimal workflow helpers via console for now
(window as any).proposeAdjustment = (lineId: string) => {
  const action = $('action').value as Adjustment['action'];
  const existing = state.adjustments.find((a) => a.lineId === lineId);
  const adj: Adjustment = {
    lineId,
    action,
    status: 'PROPOSED',
    author: $('author').value,
    timestamp: new Date().toISOString(),
    comment: $('comment').value,
    oldImpact: state.result?.summary?.cadrage_gap_adjusted ?? 0,
    newImpact: state.result?.summary?.cadrage_gap_adjusted ?? 0
  };
  if (existing) Object.assign(existing, adj); else state.adjustments.push(adj);
  recalc();
};
(window as any).setAdjustmentStatus = (lineId: string, statusVal: Adjustment['status']) => {
  const adj = state.adjustments.find((a) => a.lineId === lineId);
  if (!adj) return;
  adj.status = statusVal;
  recalc();
};
