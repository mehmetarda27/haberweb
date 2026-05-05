import { ensureAuthorized, runImportNews } from "./import-news.js";

function sendJson(res, statusCode, payload) {
  return res.status(statusCode).json(payload);
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, {
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    if (!ensureAuthorized(req)) {
      return sendJson(res, 401, {
        ok: false,
        error: "Unauthorized"
      });
    }

    const result = await runImportNews();
    return sendJson(res, 200, {
      ok: result.ok,
      fetched: result.fetched,
      inserted: result.inserted,
      duplicates: result.duplicates,
      skippedEnglish: result.skippedEnglish,
      skippedInvalid: result.skippedInvalid,
      totalStored: result.totalStored,
      lastRunAt: new Date().toISOString()
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "Cron import failed",
      lastRunAt: new Date().toISOString()
    });
  }
}
