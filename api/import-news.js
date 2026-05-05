const SAMPLE_NEWS = [
  {
    title: "AI chips move closer to edge devices",
    content:
      "New generation AI accelerators are making it easier for laptops, phones, and industrial devices to run smaller models locally with lower latency.",
    image_url:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85"
  },
  {
    title: "Cybersecurity teams adopt passkeys faster",
    content:
      "More organizations are replacing password-only login flows with passkeys and phishing-resistant authentication to reduce account takeover risk.",
    image_url:
      "https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?auto=format&fit=crop&w=1600&q=85"
  },
  {
    title: "Mobile networks prepare for on-device AI traffic",
    content:
      "Operators are tuning network infrastructure for more AI-assisted mobile workloads as apps process more context on device and sync selectively.",
    image_url:
      "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1600&q=85"
  }
];

function jsonResponse(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

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
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    console.error("Supabase request failed:", response.status, data || text);
    throw new Error(`Supabase request failed with status ${response.status}.`);
  }

  return data;
}

async function titleExists(title) {
  const encodedTitle = encodeURIComponent(title);
  const rows = await supabaseRequest(
    `posts?select=id,title&title=eq.${encodedTitle}&limit=1`,
    { method: "GET" }
  );

  return Array.isArray(rows) && rows.length > 0;
}

async function insertNewsItem(item) {
  return supabaseRequest("posts", {
    method: "POST",
    body: JSON.stringify([
      {
        title: item.title,
        content: item.content,
        image_url: item.image_url,
        published: true
      }
    ])
  });
}

export default async function handler(req, res) {
  console.log("TechPulse news import started:", new Date().toISOString());

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse(res, 405, { error: "Method not allowed" });
  }

  const results = {
    ok: true,
    inserted: 0,
    skipped: 0
  };

  try {
    for (const item of SAMPLE_NEWS) {
      console.log("Checking duplicate title:", item.title);

      if (await titleExists(item.title)) {
        console.log("Skipped duplicate:", item.title);
        results.skipped += 1;
        continue;
      }

      await insertNewsItem(item);
      console.log("Inserted news:", item.title);
      results.inserted += 1;
    }

    console.log("TechPulse news import finished:", results);
    return jsonResponse(res, 200, results);
  } catch (error) {
    console.error("TechPulse news import failed:", error);
    return jsonResponse(res, 500, {
      ok: false,
      error: "News import failed",
      message: error.message
    });
  }
}
