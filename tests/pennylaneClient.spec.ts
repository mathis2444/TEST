import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGeneralLedger, fetchVatDeclarations, PennylaneApiError } from '../src/server/pennylaneClient.js';

describe('pennylaneClient service layer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PENNYLANE_API_BASE_URL;
    delete process.env.PENNYLANE_API_KEY;
  });

  it('handles pagination until last page', async () => {
    process.env.PENNYLANE_API_BASE_URL = 'https://api.example.com';
    process.env.PENNYLANE_API_KEY = 'test-key';

    const page1 = Array.from({ length: 500 }, (_, i) => ({ id: `a${i}` }));
    const page2 = [{ id: 'last' }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: page1 }) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify({ data: page2 }) });

    vi.stubGlobal('fetch', fetchMock as any);

    const rows = await fetchVatDeclarations({ company_id: 'C1', period_start: '2026-01-01', period_end: '2026-01-31' });
    expect(rows).toHaveLength(501);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns clean PennylaneApiError on HTTP error', async () => {
    process.env.PENNYLANE_API_BASE_URL = 'https://api.example.com';
    process.env.PENNYLANE_API_KEY = 'test-key';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => '{"error":"rate_limit"}' }) as any);

    await expect(fetchGeneralLedger({ company_id: 'C1' })).rejects.toBeInstanceOf(PennylaneApiError);
  });

  it('fails fast when environment variables are missing', async () => {
    vi.stubGlobal('fetch', vi.fn() as any);
    await expect(fetchVatDeclarations({ company_id: 'C1' })).rejects.toThrow('Missing environment variable');
  });

  it('converts abort errors to timeout API error', async () => {
    process.env.PENNYLANE_API_BASE_URL = 'https://api.example.com';
    process.env.PENNYLANE_API_KEY = 'test-key';

    const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError) as any);

    await expect(fetchVatDeclarations({ company_id: 'C1' })).rejects.toMatchObject({ status: 504 });
  });
});
