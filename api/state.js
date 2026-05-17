import { kv } from '@vercel/kv';

const KEY = 'family-groceries:v1';
const LIST_PASSWORD = process.env.LIST_PASSWORD || '';
const HAS_KV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
const DAY_MS = 24 * 60 * 60 * 1000;

function emptyState() {
  return {
    items: [],
    history: [],
    version: 1
  };
}

function daysAgoFor(entry, idx) {
  if (Number.isFinite(entry.ts)) return Math.max(0, Math.round((Date.now() - entry.ts) / DAY_MS));
  if (Number.isFinite(entry.daysAgo)) return entry.daysAgo;
  return idx * 3;
}

function normalizeForRead(state) {
  const safe = state && typeof state === 'object' ? state : emptyState();
  const items = Array.isArray(safe.items) ? safe.items : [];
  const history = Array.isArray(safe.history) ? safe.history : [];
  return {
    items,
    history: history.map((entry, idx) => ({ ...entry, daysAgo: daysAgoFor(entry, idx) })),
    version: Number.isFinite(safe.version) ? safe.version : 1
  };
}

function getMemoryState() {
  return globalThis.__familyGroceriesState || null;
}

function setMemoryState(state) {
  globalThis.__familyGroceriesState = state;
}

async function readStoredState() {
  if (!HAS_KV) return getMemoryState();
  return kv.get(KEY);
}

async function writeStoredState(state) {
  if (!HAS_KV) {
    setMemoryState(state);
    return;
  }
  await kv.set(KEY, state);
}

async function ensureState() {
  let state = await readStoredState();
  if (!state) {
    state = emptyState();
    await writeStoredState(state);
  }
  return normalizeForRead(state);
}

function authorized(req) {
  if (!LIST_PASSWORD) return true;
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const queryKey = req.query?.key || new URL(req.url || '/', 'http://localhost').searchParams.get('key') || '';
  return bearer === LIST_PASSWORD || queryKey === LIST_PASSWORD;
}

async function parseBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!authorized(req)) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await ensureState());
    }

    if (req.method === 'POST') {
      const current = await ensureState();
      const body = await parseBody(req);
      const baseVersion = body.baseVersion;

      if (baseVersion !== undefined && Number(baseVersion) !== current.version) {
        return res.status(409).json(current);
      }

      const next = {
        items: Array.isArray(body.items) ? body.items : current.items,
        history: Array.isArray(body.history) ? body.history : current.history,
        version: current.version + 1
      };

      await writeStoredState(next);
      return res.status(200).json({ ok: true, version: next.version });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (error) {
    return res.status(500).json({ error: 'state_error', detail: error.message });
  }
}
