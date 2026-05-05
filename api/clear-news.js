const ENGLISH_WORDS = new Set([
  "the", "and", "with", "for", "from", "says", "after", "before", "new", "update", "report",
  "startup", "company", "game", "tech", "technology", "launch", "announces", "reveals", "could",
  "will", "is", "are", "was", "were", "has", "have", "this", "that", "you", "your", "as", "by",
  "on", "in", "to", "of", "at", "it", "its", "about", "over", "more", "first", "latest"
]);

const TURKISH_WORDS = new Set([
  "ve", "ile", "için", "bir", "son", "yeni", "gün", "sonra", "önce", "türkiye", "haber",
  "açıklandı", "geldi", "oldu", "var", "yok", "bu", "şu", "göre", "teknoloji", "yapay",
  "zeka", "oyun", "donanım", "girişim", "siber", "güvenlik", "mobil", "yerli", "kullanıcı",
  "şirket", "uygulama", "model", "cihaz", "pazar", "gelişme", "duyurdu", "başladı",
  "özellik", "özellikleri", "çıktı", "tanıttı", "artık", "daha", "olarak", "olan"
]);

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/g;
const LETTERS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]/g;
const WORDS = /[a-zA-ZçğıöşüÇĞİÖŞÜ]+/g;

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Add it in Vercel Project Settings > Environment Variables for Production, then redeploy.`
    );
  }
  return value;
}

function getSecretFromRequest(req) {
  if (req.query?.secret) return req.query.secret;

  try {
    const url = new URL(req.url, "https://localhost");
    return url.searchParams.get("secret");
  } catch {
    return null;
  }
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  return normalizeText(value)
    .toLocaleLowerCase("tr-TR")
    .match(WORDS) || [];
}

function isTurkishNews(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description || article.content || article.excerpt);
  if (!title || title.length < 8) return false;

  const text = normalizeText(`${title} ${description}`);
  const tokens = tokenize(text);
  const letters = text.match(LETTERS) || [];
  const turkishChars = text.match(TURKISH_CHARS) || [];
  const englishHits = tokens.filter((token) => token !== "ai" && ENGLISH_WORDS.has(token)).length;
  const turkishHits = tokens.filter((token) => TURKISH_WORDS.has(token)).length;
  const englishRatio = tokens.length ? englishHits / tokens.length : 0;
  const turkishRatio = tokens.length ? turkishHits / tokens.length : 0;
  const turkishCharRatio = letters.length ? turkishChars.length / letters.length : 0;

  if (tokens.length < 4) return false;
  if (englishHits >= 4 && englishHits > turkishHits) return false;
  if (englishRatio >= 0.24 && turkishRatio < 0.14 && turkishCharRatio < 0.012) return false;
  if (turkishHits >= 2 || turkishCharRatio >= 0.018) return true;
  if (turkishHits >= 1 && englishHits <= 1 && tokens.length <= 10) return true;
  return false;
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || `Supabase failed with status ${response.status}`);
  }

  return payload;
}

async function countStoredPosts() {
  const rows = await supabaseRequest("posts?select=id", { method: "GET" });
  return Array.isArray(rows) ? rows.length : 0;
}

async function deletePostsByIds(ids) {
  if (!ids.length) return [];
  const encodedIds = ids.map((id) => encodeURIComponent(String(id))).join(",");
  return supabaseRequest(`posts?id=in.(${encodedIds})`, { method: "DELETE" });
}

export default async function handler(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const expectedSecret = requiredEnv("IMPORT_SECRET");
    const requestSecret = getSecretFromRequest(req);

    if (!requestSecret || requestSecret !== expectedSecret) {
      return sendJson(res, 401, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const rows = await supabaseRequest("posts?select=id,title,content", { method: "GET" });
    const allPosts = Array.isArray(rows) ? rows : [];
    const englishPosts = allPosts.filter((post) => !isTurkishNews(post));
    const deleted = await deletePostsByIds(englishPosts.map((post) => post.id));
    const totalStored = await countStoredPosts();

    return sendJson(res, 200, {
      ok: true,
      fetched: allPosts.length,
      deleted: Array.isArray(deleted) ? deleted.length : englishPosts.length,
      skippedEnglish: englishPosts.length,
      totalStored,
      sampleTitles: englishPosts.slice(0, 5).map((post) => post.title)
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Clear failed"
    });
  }
}
