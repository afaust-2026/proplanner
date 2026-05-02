// api/push/unsubscribe.js
// Convenience wrapper: re-routes to subscribe.js's DELETE handler.
// Lets clients also call /api/push/unsubscribe?endpoint=... as a GET for testing.
import subscribeHandler from './subscribe.js';

export default async function handler(req, res) {
  // Force DELETE method semantics
  const fakeReq = Object.assign({}, req, { method: 'DELETE' });
  // Promote ?endpoint=... querystring into the body if needed
  if (!req.body || (typeof req.body === 'object' && !req.body.endpoint)) {
    if (req.query && req.query.endpoint) {
      fakeReq.body = { endpoint: req.query.endpoint };
    }
  }
  return subscribeHandler(fakeReq, res);
}
