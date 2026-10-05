import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SERVER, resolveServer, serverOrigin, probeServer } from '../src/connection.js';

test('installed app selects online service automatically and ignores old terminal-dependent addresses', () => {
  assert.equal(resolveServer({ desktop: true, saved: 'http://127.0.0.1:5000' }), DEFAULT_SERVER);
  assert.equal(resolveServer({ desktop: true, saved: 'https://192.168.23.58:5173' }), DEFAULT_SERVER);
  assert.equal(resolveServer({ desktop: true, saved: 'https://example.com', mode: 'custom' }), 'https://example.com');
  assert.equal(resolveServer({ desktop: true, saved: 'http://127.0.0.1:15011', mode: 'custom' }), 'http://127.0.0.1:15011');
});
test('web follows its own site for API and signaling, even when a desktop URL was compiled', () => {
  assert.equal(resolveServer({ desktop: false, pageOrigin: 'https://meuapp.example', configured: DEFAULT_SERVER, saved: 'https://old.example' }), 'https://meuapp.example');
  for (const value of ['https://name:secret@example.com', 'http://192.168.1.1', 'https://example.com/api', 'https://example.com?q=1', 'file:///c:/test']) assert.equal(serverOrigin(value), null);
});
test('connection probe distinguishes a usable backend, a legacy backend and an outage without credentials', async () => {
  const fetcher = async (url, options) => { assert.equal(url, DEFAULT_SERVER + '/api/health'); assert.equal(options.credentials, 'omit'); return Response.json({ status: 'ok', authentication: 'sessions-v1' }); };
  assert.equal((await probeServer(DEFAULT_SERVER, { fetcher })).status, 'ready');
  assert.equal((await probeServer(DEFAULT_SERVER, { fetcher: async () => Response.json({ status: 'ok' }) })).status, 'incompatible');
  assert.equal((await probeServer(DEFAULT_SERVER, { fetcher: async () => new Response('unavailable', { status: 503 }) })).status, 'offline');
  assert.equal((await probeServer(DEFAULT_SERVER, { fetcher: async () => { throw Error('offline'); } })).status, 'offline');
});
