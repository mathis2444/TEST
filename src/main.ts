import './styles.css';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { aliases, normalizeColumns, validateInputSchema } from './core/normalizeColumns';
import { computeVatReconciliation } from './core/computeVatReconciliation';
import { exportWorkbook } from './core/exportWorkbook';
import type { Adjustment, RegimeTva } from './types';

const app = document.getElementById('app')!;
app.innerHTML = `
<div class="card"><h2>TVA Reconciliation Framework</h2><div id="status" class="status">Prêt</div></div>
<div class="card">
  <div class="grid">
    <div><label>vat_declarations.csv</label><input id="vatFile" type="file" /></div>
    <div><label>tax_declarations.csv</label><input id="taxFile" type="file" /></div>
    <div><label>general_ledger.csv</label><input id="glFile" type="file" /></div>
    <div><label>mapping.csv</label><input id="mapFile" type="file" /></div>
    <div><label>Société</label><input id="companyId" value="C1"/></div>
    <div><label>Période début</label><input id="ps" value="2026-01-01"/></div>
    <div><label>Période fin</label><input id="pe" value="2026-01-31"/></div>
    <div><label>Ouverture exercice</label><input id="fs" value="2026-01-01"/></div>
    <div><label>Régime TVA</label><select id="regime"><option>debits</option><option>encaissements</option><option>mixte</option><option>marge</option></select></div>
    <div><label>Seuil</label><input id="threshold" value="5"/></div>
  </div>
  <div class="row"><button id="run">Calculer</button><button id="export">Exporter Excel</button></div>
</div>
<div class="card"><h3>Schema</h3><pre id="schema"></pre></div>
<div class="card"><h3>Summary</h3><pre id="summary"></pre></div>
<div class="card"><h3>Controls</h3><div id="controls" class="tbl"></div></div>
<div class="card"><h3>Anomalies</h3><div id="anomalies" class="tbl"></div></div>
`;

const state: { vat:any[]; tax:any[]; gl:any[]; mapping:any[]; result:any; adjustments: Adjustment[] } = { vat:[], tax:[], gl:[], mapping:[], result:null, adjustments:[] };

const $ = (id:string) => document.getElementById(id) as HTMLInputElement;
const status = (m:string) => (document.getElementById('status')!.textContent = m);

function parseFile(file?: File): Promise<any[]> {
  if (!file) return Promise.resolve([]);
  return new Promise((resolve, reject) => Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => resolve(r.data), error: reject }));
}

function table(rows:any[]): HTMLElement {
  const root = document.createElement('table');
  if (!rows.length) { const p = document.createElement('div'); p.textContent = 'Aucune donnée'; return p; }
  const cols = Object.keys(rows[0]);
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  cols.forEach((c) => { const th = document.createElement('th'); th.textContent = c; trh.appendChild(th); });
  thead.appendChild(trh); root.appendChild(thead);
  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const tr = document.createElement('tr');
    cols.forEach((c) => { const td = document.createElement('td'); td.textContent = String(r[c] ?? ''); tr.appendChild(td); });
    tbody.appendChild(tr);
  });
  root.appendChild(tbody);
  return root;
}

(document.getElementById('run') as HTMLButtonElement).onclick = async () => {
  state.vat = await parseFile(($('vatFile') as any).files?.[0]);
  state.tax = await parseFile(($('taxFile') as any).files?.[0]);
  state.gl = await parseFile(($('glFile') as any).files?.[0]);
  state.mapping = await parseFile(($('mapFile') as any).files?.[0]);

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

  document.getElementById('summary')!.textContent = JSON.stringify(state.result.summary, null, 2);
  const c = document.getElementById('controls')!; c.innerHTML = ''; c.appendChild(table(state.result.controls));
  const a = document.getElementById('anomalies')!; a.innerHTML = ''; a.appendChild(table(state.result.anomalies));
  status('Calcul terminé');
};

(document.getElementById('export') as HTMLButtonElement).onclick = () => {
  if (!state.result) return;
  const wb = exportWorkbook({
    summary: state.result.summary,
    controls: state.result.controls,
    source: 'CSV',
    limitations: ['POC', 'CASH_BASIS_SCOPE_NOT_HANDLED', 'VAT_MARGIN_SCOPE_NOT_HANDLED'],
    mapping: state.mapping,
    rawVat: state.vat,
    rawTax: state.tax,
    rawGl: state.gl,
    anomalies: state.result.anomalies,
    lines: state.result.lines,
    adjustments: state.adjustments
  });
  XLSX.writeFile(wb, `cadrage_tva_${state.result.summary.company_id}_${state.result.summary.period_end}.xlsx`);
};
