import './styles.css';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { aliases, normalizeColumns, validateInputSchema } from './core/normalizeColumns';
import { computeVatReconciliation } from './core/computeVatReconciliation';
import { buildCabinetConclusion } from './core/buildCabinetConclusion';
import { exportWorkbook } from './core/exportWorkbook';
import { buildPortfolioSummary } from './core/buildPortfolioSummary';
import type { Adjustment, RegimeTva } from './types';

const app = document.getElementById('app')!;
app.innerHTML = `
<div class="card"><h2>TVA Reconciliation Framework</h2><div id="status" class="status">Prêt</div><div class="row"><button id="goDashboard">Dashboard</button><button id="goDetail">Détail dossier</button></div></div>
<div class="card" id="dashboardCard"><h3>Dashboard Portefeuille</h3><div id="portfolioTable" class="tbl"></div></div>
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

<div class="card"><h3>Mapping TVA</h3>
  <div class="grid">
    <div><label>company_id</label><input id="mapCompanyId" value="__DEFAULT__" /></div>
    <div><label>account_prefix</label><input id="mapAccountPrefix" placeholder="4457" /></div>
    <div><label>vat_category</label><input id="mapVatCategory" placeholder="COLLECTEE" /></div>
    <div><label>direction</label><select id="mapDirection"><option>NET</option><option>DEBIT</option><option>CREDIT</option></select></div>
    <div><label>sign_factor</label><input id="mapSignFactor" value="1" /></div>
    <div><label>priority</label><input id="mapPriority" value="100" /></div>
    <div><label>is_active</label><select id="mapIsActive"><option>true</option><option>false</option></select></div>
    <div style="align-self:end"><button id="addMapping">Ajouter mapping</button></div>
  </div>
  <div id="mappingTable" class="tbl"></div>
</div>
<div class="card"><h3>Comptes 445 non mappés (grand livre)</h3><div id="unmapped445" class="tbl"></div></div>
<div class="card"><h3>Anomalies & Revue</h3><div id="anomalies" class="tbl"></div></div>
`;

const state: { mode:'csv'|'api'; vat:any[]; tax:any[]; gl:any[]; mapping:any[]; result:any; adjustments: Adjustment[]; portfolio:any[] } = { mode:'csv', vat:[], tax:[], gl:[], mapping:[], result:null, adjustments:[], portfolio:[] };

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
    if (!r.ok) {
      let detail = '';
      try {
        const err = await r.json();
        detail = err?.message || err?.error || '';
      } catch {}
      throw new Error(`API ${endpoint} ${r.status}${detail ? ` - ${detail}` : ''}`);
    }
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


function renderMappingTable() {
  const container = document.getElementById('mappingTable')!;
  container.innerHTML = '';
  if (!state.mapping.length) { container.textContent = 'Aucun mapping'; return; }

  const cols = ['company_id','account_prefix','vat_category','direction','sign_factor','priority','is_active'];
  const tableEl = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  [...cols, 'actions'].forEach((c) => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  thead.appendChild(trh);
  tableEl.appendChild(thead);
  const tbody = document.createElement('tbody');

  state.mapping.forEach((m:any, idx:number) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => { const td = document.createElement('td'); td.textContent = String(m[c] ?? ''); tr.appendChild(td); });
    const tdAction = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = String(m.is_active).toLowerCase() === 'false' ? 'Désactivé' : 'Désactiver';
    btn.disabled = String(m.is_active).toLowerCase() === 'false';
    btn.dataset.mapIndex = String(idx);
    btn.className = 'btn-small';
    tdAction.appendChild(btn);
    tr.appendChild(tdAction);
    tbody.appendChild(tr);
  });

  tableEl.appendChild(tbody);
  container.appendChild(tableEl);
}

function renderUnmapped445() {
  const container = document.getElementById('unmapped445')!;
  container.innerHTML = '';
  if (!state.result?.lines) { container.textContent = 'Aucun calcul disponible.'; return; }

  const unique = new Map<string, { account_number: string; occurrences: number }>();
  for (const line of state.result.lines.filter((l:any) => l.vat_category === 'UNMAPPED')) {
    const current = unique.get(line.account_number) ?? { account_number: line.account_number, occurrences: 0 };
    current.occurrences += 1;
    unique.set(line.account_number, current);
  }
  const rows = [...unique.values()];
  if (!rows.length) { container.textContent = 'Aucun compte 445 non mappé.'; return; }
  container.appendChild(table(rows));
}

function renderAnomaliesWithWorkflow(anomalies:any[]) {
  const container = document.getElementById('anomalies')!;
  container.innerHTML = '';
  if (!anomalies.length) { container.textContent = 'Aucune anomalie'; return; }

  const tableEl = document.createElement('table');
  const cols = ['id', 'anomaly_code', 'account_number', 'amount', 'statut', 'action_proposee', 'commentaire', 'auteur', 'date_revue'];
  const trh = document.createElement('tr');
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  const thead = document.createElement('thead'); thead.appendChild(trh); tableEl.appendChild(thead);
  const tbody = document.createElement('tbody');

  anomalies.forEach((a) => {
    const existing = state.adjustments.find((x) => x.lineId === a.id);
    const tr = document.createElement('tr');
    tr.dataset.lineId = a.id;
    tr.innerHTML = `
      <td>${a.id}</td>
      <td>${a.anomaly_code}</td>
      <td>${a.account_number}</td>
      <td>${a.net_amount}</td>
      <td>
        <select data-field="status">
          ${['A_TRAITER', 'JUSTIFIEE', 'CORRECTION_PROPOSEE', 'VALIDEE', 'REJETEE', 'NON_SIGNIFICATIVE'].map((st) => `<option ${((existing?.status ?? 'A_TRAITER') === st) ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </td>
      <td>
        <select data-field="action">
          ${['EXCLUDE_LINE', 'SIGN_INVERT', 'REMAP_COLLECTEE', 'REMAP_DED_ABS', 'REMAP_DED_IMMO'].map((ac) => `<option ${((existing?.action ?? 'EXCLUDE_LINE') === ac) ? 'selected' : ''}>${ac}</option>`).join('')}
        </select>
      </td>
      <td><input data-field="comment" value="${existing?.comment ?? ''}" placeholder="Commentaire" /></td>
      <td><input data-field="author" value="${existing?.author ?? $('author').value}" placeholder="Auteur" /></td>
      <td><input data-field="reviewDate" type="date" value="${existing?.reviewDate ?? ''}" /></td>
      <td><button class="btn-small" data-action="save">Enregistrer</button></td>
    `;
    tbody.appendChild(tr);
  });

  tableEl.appendChild(tbody);
  container.appendChild(tableEl);
}


const mockPortfolioSource = [
  {
    company_id: 'C1',
    company_name: 'Cabinet Alpha',
    period_start: '2026-01-01',
    period_end: '2026-01-31',
    summary: { declaration_amount: 12000, vat_theoretical_period: 11950, cadrage_gap_adjusted: 50, reconciliation_confidence_score: 'A_CONTROLER' },
    controls: [{ level: 'BLOCKING' }, { level: 'WARNING' }],
    anomalies: [{ id: 'A1' }, { id: 'A2' }],
    adjustments: [{ lineId: 'A1', action: 'EXCLUDE_LINE', status: 'VALIDEE', author: 'chef', timestamp: '', comment: 'ok', oldImpact: 0, newImpact: 0 }]
  },
  {
    company_id: 'C2',
    company_name: 'Cabinet Beta',
    period_start: '2026-02-01',
    period_end: '2026-02-28',
    summary: { declaration_amount: 8000, vat_theoretical_period: 8000, cadrage_gap_adjusted: 0, reconciliation_confidence_score: 'FIABLE' },
    controls: [],
    anomalies: [],
    adjustments: []
  }
];

function renderPortfolioDashboard() {
  const root = document.getElementById('portfolioTable')!;
  state.portfolio = buildPortfolioSummary(mockPortfolioSource as any);
  const rows = state.portfolio.map((r) => ({ ...r, open: 'Ouvrir' }));
  if (!rows.length) { root.textContent = 'Aucune donnée portefeuille.'; return; }

  const t = document.createElement('table');
  const cols = ['company_id', 'company_name', 'period', 'declaration_amount', 'vat_theoretical_period', 'gap', 'status', 'blocking_controls', 'untreated_anomalies', 'open'];
  const trh = document.createElement('tr');
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  const thead = document.createElement('thead'); thead.appendChild(trh); t.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.dataset.companyId = r.company_id;
    cols.forEach((c) => {
      const td = document.createElement('td');
      td.textContent = String((r as any)[c] ?? '');
      if (c === 'open') {
        const b = document.createElement('button');
        b.textContent = 'Ouvrir';
        b.className = 'btn-small';
        b.dataset.openCompanyId = r.company_id;
        td.textContent = '';
        td.appendChild(b);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  t.appendChild(tbody);
  root.innerHTML = '';
  root.appendChild(t);
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
  renderMappingTable();
renderPortfolioDashboard();
  document.getElementById('summary')!.textContent = JSON.stringify(state.result.summary, null, 2);
  const controls = document.getElementById('controls')!; controls.innerHTML = ''; controls.appendChild(table(state.result.controls));
  const byCategory = document.getElementById('byCategory')!; byCategory.innerHTML = ''; byCategory.appendChild(table([...state.result.categoryTotals.entries()].map(([vat_category, amount]:any)=>({vat_category, amount}))));
  const byAccount = document.getElementById('byAccount')!; byAccount.innerHTML = ''; byAccount.appendChild(table(state.result.accountTotals));
  renderAnomaliesWithWorkflow(state.result.anomalies);
  renderUnmapped445();
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


(document.getElementById('addMapping') as HTMLButtonElement).onclick = () => {
  state.mapping.push({
    company_id: $('mapCompanyId').value || '__DEFAULT__',
    account_prefix: $('mapAccountPrefix').value.trim(),
    vat_category: $('mapVatCategory').value.trim(),
    direction: $('mapDirection').value.toUpperCase(),
    sign_factor: Number($('mapSignFactor').value || '1'),
    priority: Number($('mapPriority').value || '100'),
    is_active: $('mapIsActive').value
  });
  renderMappingTable();
renderPortfolioDashboard();
  if (state.result) recalc();
};

(document.getElementById('mappingTable') as HTMLElement).onclick = (ev) => {
  const target = ev.target as HTMLElement;
  if (!target || target.tagName !== 'BUTTON') return;
  const idx = Number((target as HTMLButtonElement).dataset.mapIndex);
  if (!Number.isFinite(idx) || !state.mapping[idx]) return;
  state.mapping[idx].is_active = 'false';
  renderMappingTable();
renderPortfolioDashboard();
  if (state.result) recalc();
};

(document.getElementById('anomalies') as HTMLElement).onclick = (ev) => {
  const target = ev.target as HTMLElement;
  if (!target || target.getAttribute('data-action') !== 'save') return;
  const tr = target.closest('tr') as HTMLTableRowElement | null;
  if (!tr) return;

  const lineId = tr.dataset.lineId!;
  const statusVal = (tr.querySelector('[data-field="status"]') as HTMLSelectElement).value as Adjustment['status'];
  const actionVal = (tr.querySelector('[data-field="action"]') as HTMLSelectElement).value as Adjustment['action'];
  const commentVal = (tr.querySelector('[data-field="comment"]') as HTMLInputElement).value.trim();
  const authorVal = (tr.querySelector('[data-field="author"]') as HTMLInputElement).value.trim() || $('author').value;
  const reviewDateVal = (tr.querySelector('[data-field="reviewDate"]') as HTMLInputElement).value;

  if ((statusVal === 'JUSTIFIEE' || statusVal === 'VALIDEE') && !commentVal) {
    status('Commentaire obligatoire pour les statuts JUSTIFIEE et VALIDEE.');
    return;
  }

  const existing = state.adjustments.find((a) => a.lineId === lineId);
  const adj: Adjustment = {
    lineId,
    action: actionVal,
    status: statusVal,
    author: authorVal,
    timestamp: new Date().toISOString(),
    reviewDate: reviewDateVal,
    comment: commentVal,
    oldImpact: state.result?.summary?.cadrage_gap_adjusted ?? 0,
    newImpact: state.result?.summary?.cadrage_gap_adjusted ?? 0
  };
  if (existing) Object.assign(existing, adj); else state.adjustments.push(adj);
  recalc();
  status(`Revue enregistrée pour ${lineId}`);
};


(document.getElementById('portfolioTable') as HTMLElement).onclick = (ev) => {
  const target = ev.target as HTMLElement;
  const companyId = (target as HTMLButtonElement)?.dataset?.openCompanyId;
  if (!companyId) return;
  const row = mockPortfolioSource.find((r) => r.company_id === companyId);
  if (!row) return;
  $('companyId').value = row.company_id;
  $('ps').value = row.period_start;
  $('pe').value = row.period_end;
  document.getElementById('summary')!.textContent = JSON.stringify(row.summary, null, 2);
  status(`Dossier ${row.company_id} ouvert depuis le dashboard (données mockées).`);
  document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth' });
};

(document.getElementById('goDashboard') as HTMLButtonElement).onclick = () => {
  document.getElementById('dashboardCard')?.scrollIntoView({ behavior: 'smooth' });
};

(document.getElementById('goDetail') as HTMLButtonElement).onclick = () => {
  document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth' });
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
    ytd: { declared_amount_ytd: state.result.declarationAmountYtd, vat_theoretical_ytd: state.result.vatTheoreticalYtd, cadrage_gap_ytd: state.result.cadrageGapYtd },
    threshold: Number($('threshold').value)
  });
  XLSX.writeFile(wb, `cadrage_tva_${state.result.summary.company_id}_${state.result.summary.period_end}.xlsx`);
};

renderMappingTable();
renderPortfolioDashboard();

// Workflow helper kept for debugging
(window as any).setReviewStatus = (lineId: string, statusVal: Adjustment['status'], comment = '') => {
  const adj = state.adjustments.find((a) => a.lineId === lineId);
  if (!adj) return;
  if ((statusVal === 'JUSTIFIEE' || statusVal === 'VALIDEE') && !comment.trim()) return;
  adj.status = statusVal;
  adj.comment = comment || adj.comment;
  recalc();
};
