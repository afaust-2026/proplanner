// api/push/subscribe.js
// Saves or removes a browser push subscription to Supabase
// POST { subscription, userId } — save subscription
// DELETE { userId } — remove subscription

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { subscription, userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  // DELETE — unsubscribe
  if (req.method === 'DELETE') {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?user_id=eq.${userId}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    });
    return res.status(200).json({ success: true });
  }

  // POST — subscribe
  if (!subscription) {
    return res.status(400).json({ error: 'subscription required' });
  }

  // Upsert the subscription — one per user
  const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      user_id: userId,
      subscription: JSON.stringify(subscription),
      created_at: new Date().toISOString(),
    }),
  });

  if (!upsertRes.ok) {
    const err = await upsertRes.text();
    return res.status(500).json({ error: `Supabase error: ${err}` });
  }

  return res.status(200).json({ success: true });
}
