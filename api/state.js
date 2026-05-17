import { kv } from '@vercel/kv';

const KEY = 'family-groceries:v1';

const SEED = {
  items: [
    { id: 'i1', text: 'חלב 3%',       qty: 2,  by: 'ima',  done: false, pinned: true  },
    { id: 'i2', text: 'לחם פרוס מלא',  qty: 1,  by: 'avi',  done: false, pinned: true  },
    { id: 'i3', text: 'ביצים L',       qty: 12, by: 'avi',  done: true,  pinned: false },
    { id: 'i4', text: 'עגבניות שרי',   qty: 1,  by: 'noa',  done: false, pinned: false },
    { id: 'i5', text: 'יוגורט תות',    qty: 4,  by: 'maya', done: false, pinned: false },
    { id: 'i6', text: 'בננות',         qty: 1,  by: 'yoa',  done: true,  pinned: false },
    { id: 'i7', text: 'אבוקדו',        qty: 3,  by: 'ima',  done: false, pinned: false },
    { id: 'i8', text: 'קוטג׳',        qty: 2,  by: 'avi',  done: false, pinned: false },
  ],
  history: [
    { id: 'h1', label: 'שבת', date: 'אתמול', daysAgo: 1,
      items: [
        { text: 'חלב 3%',       qty: 2, by: 'ima' },
        { text: 'חלה',          qty: 1, by: 'avi' },
        { text: 'יין אדום',      qty: 1, by: 'avi' },
        { text: 'דגים',         qty: 2, by: 'ima' },
        { text: 'עוגת שוקולד',   qty: 1, by: 'maya' },
        { text: 'פירות יער',     qty: 1, by: 'noa' },
      ] },
    { id: 'h2', label: 'אמצע שבוע', date: 'יום שלישי', daysAgo: 4,
      items: [
        { text: 'לחם',          qty: 1, by: 'avi' },
        { text: 'מלפפונים',      qty: 1, by: 'noa' },
        { text: 'גבינה לבנה',    qty: 2, by: 'ima' },
        { text: 'דגני בוקר',     qty: 1, by: 'yoa' },
      ] },
    { id: 'h3', label: 'בית מרקחת', date: 'שבוע שעבר', daysAgo: 8,
      items: [
        { text: 'אקמול',         qty: 1, by: 'ima' },
        { text: 'משחת שיניים',    qty: 2, by: 'avi' },
        { text: 'נייר טואלט',     qty: 1, by: 'avi' },
      ] },
  ],
  version: 1,
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      let state = await kv.get(KEY);
      if (!state) {
        state = SEED;
        await kv.set(KEY, state);
      }
      return res.status(200).json(state);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || !Array.isArray(body.items) || !Array.isArray(body.history)) {
        return res.status(400).json({ error: 'invalid body' });
      }

      const current = (await kv.get(KEY)) || SEED;
      const baseVersion = typeof body.baseVersion === 'number' ? body.baseVersion : null;

      if (baseVersion !== null && baseVersion < (current.version || 0)) {
        return res.status(409).json(current);
      }

      const next = {
        items: body.items,
        history: body.history,
        version: (current.version || 0) + 1,
      };
      await kv.set(KEY, next);
      return res.status(200).json(next);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  } catch (err) {
    return res.status(500).json({ error: 'kv_unavailable', detail: String(err && err.message || err) });
  }
}
