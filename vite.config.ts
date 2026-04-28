import { defineConfig } from 'vite';

const ALLOWED = new Set(['/companies','/vat_declarations','/tax_declarations','/general_ledger','/vat_account_mapping','/fiscal_years']);

export default defineConfig({
  server: {
    port: 5173
  },
  plugins: [{
    name: 'pennylane-proxy',
    configureServer(server) {
      server.middlewares.use('/api/pennylane', async (req, res) => {
        try {
          if (!req.url) throw new Error('Invalid URL');
          const u = new URL(req.url, 'http://localhost');
          const endpoint = u.pathname;
          if (!ALLOWED.has(endpoint)) {
            res.statusCode = 403; res.end(JSON.stringify({ error: 'endpoint_not_allowed' })); return;
          }

          const companyId = u.searchParams.get('company_id');
          const d1 = u.searchParams.get('period_start');
          const d2 = u.searchParams.get('period_end');
          if (companyId && !/^[A-Za-z0-9_-]{1,64}$/.test(companyId)) {
            res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_company_id' })); return;
          }
          for (const d of [d1, d2]) {
            if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
              res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_date' })); return;
            }
          }

          const base = process.env.PENNYLANE_API_BASE_URL;
          const key = process.env.PENNYLANE_API_KEY;
          if (!base || !key) {
            res.statusCode = 500; res.end(JSON.stringify({ error: 'proxy_not_configured' })); return;
          }
          const target = new URL(endpoint, base.endsWith('/') ? base : base + '/');
          u.searchParams.forEach((v, k) => target.searchParams.set(k, v));
          target.searchParams.set('limit', Math.min(Number(target.searchParams.get('limit') || '1000'), 5000).toString());

          const response = await fetch(target.toString(), {
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
          });
          const txt = await response.text();
          res.statusCode = response.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(txt);
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'proxy_error' }));
        }
      });
    }
  }]
});
