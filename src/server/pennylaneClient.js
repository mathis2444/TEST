const DEFAULT_TIMEOUT_MS = 15000;
const MAX_PAGES = 50;

const ALLOWED_ENDPOINTS = new Set(['/vat_declarations', '/tax_declarations', '/general_ledger', '/fiscal_years']);

export class PennylaneApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function getEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function withTimeout(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timer };
}

async function request(endpoint, query, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!ALLOWED_ENDPOINTS.has(endpoint)) throw new Error(`Endpoint not allowed: ${endpoint}`);

  const base = getEnv('PENNYLANE_API_BASE_URL');
  const key = getEnv('PENNYLANE_API_KEY');
  const url = new URL(endpoint, base.endsWith('/') ? base : `${base}/`);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && String(v) !== '') url.searchParams.set(k, String(v));
  });

  const { controller, timer } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    const text = await res.text();
    if (!res.ok) throw new PennylaneApiError('Pennylane API request failed', res.status, text);
    return text ? JSON.parse(text) : [];
  } catch (error) {
    if (error?.name === 'AbortError') throw new PennylaneApiError('Pennylane API timeout', 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPaged(endpoint, params) {
  const out = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const payload = await request(endpoint, { ...params, page, limit: 500 });
    const chunk = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
    console.info(`[pennylane] endpoint=${endpoint} page=${page} count=${chunk.length}`);
    out.push(...chunk);
    if (chunk.length < 500) break;
  }
  return out;
}

export async function fetchVatDeclarations(params) {
  return fetchPaged('/vat_declarations', params);
}

export async function fetchTaxDeclarations(params) {
  return fetchPaged('/tax_declarations', params);
}

export async function fetchGeneralLedger(params) {
  return fetchPaged('/general_ledger', params);
}

export async function fetchFiscalYears(params) {
  return request('/fiscal_years', params);
}
