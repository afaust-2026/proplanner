// api/ai.js — Server-side proxy for Anthropic API with rate limiting
// Rate limit: 10 requests per minute per IP via Upstash Redis

const RATE_LIMIT = 10;        // max requests
const WINDOW_SECONDS = 60;    // per 60 seconds

async function isRateLimited(ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const key = `ratelimit:ai:${ip}`;

  // Increment the counter for this IP
  const incrRes = await fetch(`${url}/incr/${key}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const incrData = await incrRes.json();
  const count = incrData.result;

  // On first request, set the expiry window
  if (count === 1) {
    await fetch(`${url}/expire/${key}/${WINDOW_SECONDS}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  return count > RATE_LIMIT;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Get client IP
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    "unknown";

  // Check rate limit
  try {
    const limited = await isRateLimited(ip);
    if (limited) {
      return res.status(429).json({
        error: "Too many requests. Please wait a moment before trying again.",
      });
    }
  } catch (err) {
    // If Redis is down, fail open (don't block legitimate users)
    console.error("Rate limit check failed:", err.message);
  }

  // Check API key
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Anthropic API key not configured on server." });
  }

  // Forward request to Anthropic
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
