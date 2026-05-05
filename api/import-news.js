const MAX_NEWS_PER_RUN = 24;
const NEWS_API_ENDPOINT = "https://newsapi.org/v2/everything";

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
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
  return String(value || "").trim();
}

function normalizeArticle(article) {
  const title = normalizeText(article.title);
  const description = normalizeText(article.description);
  const content = normalizeText(article.content);
  const url = normalizeText(article.url);
  const source = normalizeText(article.source?.name);

  return {
    title,
    content: [description, content, source ? `Source: ${source}` : "", url ? `URL: ${url}` : ""]
      .filter(Boolean)
      .join("\n\n"),
    image_url: normalizeText(article.urlToImage),
    source_url: url,
    published: true
  };
}

async function fetchNews(newsApiKey) {
  const params = new URLSearchParams({
    q: "technology OR artificial intelligence OR cybersecurity OR mobile OR hardware",
    language: "en",
    sortBy: "publishedAt",
    pageSize: String(MAX_NEWS_PER_RUN),
    apiKey: newsApiKey
  });

  const response = await fetch(`${NEWS_API_ENDPOINT}?${params.toString()}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("News API error:", response.status, payload);
    throw new Error(payload?.message || `News API failed with status ${response.status}`);
  }

  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  return articles
    .map(normalizeArticle)
    .filter((article) => article.title && article.content)
    .slice(0, MAX_NEWS_PER_RUN);
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
    const error = new Error(payload?.message || `Supabase failed with status ${response.status}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function titleExists(title) {
  const rows = await supabaseRequest(
    `posts?select=id&title=eq.${encodeURIComponent(title)}&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function sourceUrlExists(sourceUrl) {
  if (!sourceUrl) return false;

  const rows = await supabaseRequest(
    `posts?select=id&source_url=eq.${encodeURIComponent(sourceUrl)}&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function sourceUrlExistsInContent(sourceUrl) {
  if (!sourceUrl) return false;

  const rows = await supabaseRequest(
    `posts?select=id&content=ilike.*${encodeURIComponent(sourceUrl)}*&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function insertPost(article, includeSourceUrl) {
  const post = {
    title: article.title,
    content: article.content,
    image_url: article.image_url,
    published: true
  };

  if (includeSourceUrl && article.source_url) {
    post.source_url = article.source_url;
  }

  return supabaseRequest("posts", {
    method: "POST",
    body: JSON.stringify([post])
  });
}

function isMissingSourceUrlColumn(error) {
  const message = `${error?.message || ""} ${JSON.stringify(error?.payload || {})}`;
  return message.includes("source_url") && (message.includes("schema cache") || message.includes("column"));
}

export default async function handler(req, res) {
  console.log("TechPulse import-news started:", new Date().toISOString());

  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const expectedSecret = requiredEnv("IMPORT_SECRET");
    const requestSecret = getSecretFromRequest(req);

    if (!requestSecret || requestSecret !== expectedSecret) {
      console.warn("Unauthorized import-news request.");
      return sendJson(res, 401, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const newsApiKey = requiredEnv("NEWS_API_KEY");
    const articles = await fetchNews(newsApiKey);
    let inserted = 0;
    let duplicates = 0;
    let includeSourceUrl = true;

    console.log(`Fetched ${articles.length} articles.`);

    for (const article of articles) {
      const duplicateByTitle = await titleExists(article.title);
      let duplicateByUrl = false;

      if (includeSourceUrl && article.source_url) {
        try {
          duplicateByUrl = await sourceUrlExists(article.source_url);
        } catch (error) {
          if (!isMissingSourceUrlColumn(error)) throw error;
          includeSourceUrl = false;
          console.warn("posts.source_url column not found. Continuing with title duplicate checks.");
          duplicateByUrl = await sourceUrlExistsInContent(article.source_url);
        }
      }

      if (duplicateByTitle || duplicateByUrl) {
        duplicates += 1;
        console.log("Duplicate skipped:", article.title);
        continue;
      }

      try {
        await insertPost(article, includeSourceUrl);
      } catch (error) {
        if (!includeSourceUrl || !isMissingSourceUrlColumn(error)) throw error;
        includeSourceUrl = false;
        console.warn("Retrying insert without source_url:", article.title);
        await insertPost(article, false);
      }

      inserted += 1;
      console.log("Inserted:", article.title);
    }

    return sendJson(res, 200, {
      ok: true,
      fetched: articles.length,
      inserted,
      duplicates
    });
  } catch (error) {
    console.error("TechPulse import-news failed:", error);
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Import failed"
    });
  }
}
