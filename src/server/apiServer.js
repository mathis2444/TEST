import { createServer } from 'node:http';
import { URL } from 'node:url';
import { fetchFiscalYears, fetchGeneralLedger, fetchTaxDeclarations, fetchVatDeclarations, PennylaneApiError } from './pennylaneClient.js';

const PORT = Number(process.env.API_PORT || 8787);

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    if (!req.url || !req.method || req.method !== 'GET') return sendJson(res, 404, { error: 'not_found' });
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/pennylane/')) return sendJson(res, 404, { error: 'not_found' });

    const endpoint = url.pathname.replace('/api/pennylane', '');
    const params = {
      company_id: url.searchParams.get('company_id') || undefined,
      period_start: url.searchParams.get('period_start') || undefined,
      period_end: url.searchParams.get('period_end') || undefined
    };

    if (endpoint === '/vat_declarations') return sendJson(res, 200, await fetchVatDeclarations(params));
    if (endpoint === '/tax_declarations') return sendJson(res, 200, await fetchTaxDeclarations(params));
    if (endpoint === '/general_ledger') return sendJson(res, 200, await fetchGeneralLedger(params));
    if (endpoint === '/fiscal_years') return sendJson(res, 200, await fetchFiscalYears({ company_id: params.company_id }));

    return sendJson(res, 403, { error: 'endpoint_not_allowed' });
  } catch (e) {
    if (e instanceof PennylaneApiError) {
      console.error('[api] pennylane_error', { status: e.status, body: e.body });
      return sendJson(res, e.status, { error: 'pennylane_api_error', message: e.message, detail: e.body });
    }
    console.error('[api] internal_error', e);
    return sendJson(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, () => {
  console.info(`[api] server running on http://localhost:${PORT}`);
});
