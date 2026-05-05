const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85";
const TURKISH_SIGNAL_PATTERN = /[\u00e7\u011f\u0131\u00f6\u015f\u00fc\u00c7\u011e\u0130\u00d6\u015e\u00dc]|\b(ve|ile|i\u00e7in|bir|son|yeni|g\u00fcn|sonra|\u00f6nce|t\u00fcrkiye|ankara|istanbul|izmir|haber|a\u00e7\u0131kland\u0131|geldi|oldu|var|yok|en|bu|\u015fu|g\u00f6re|karar|ba\u015fkan|bakan|d\u00fcnya|ekonomi|spor|teknoloji|sa\u011fl\u0131k|magazin|g\u00fcndem)\b/i;
const ENGLISH_SIGNAL_PATTERN = /\b(the|and|with|after|before|from|over|under|into|about|this|that|will|could|would|says|said|new|latest|breaking|report|update|source|news)\b/i;

let adminNews = [];
let adminSearchTerm = "";

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function stripHTML(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function shortContent(value, length = 120) {
  const text = stripHTML(value);
  return text.length > length ? `${text.slice(0, length).trim()}...` : text;
}

function isLikelyTurkishArticle(article) {
  const title = String(article.title || "").toLocaleLowerCase("tr-TR");
  const content = String(article.content || "").toLocaleLowerCase("tr-TR");
  const haystack = `${title} ${content}`;
  if (!title.trim()) return false;
  if (TURKISH_SIGNAL_PATTERN.test(haystack)) return true;
  return !ENGLISH_SIGNAL_PATTERN.test(title);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function setAdminMessage(message, type = "info") {
  const messageBox = document.querySelector("[data-admin-message]");
  if (!messageBox) return;
  messageBox.textContent = message;
  messageBox.dataset.state = type;
}

function getFormPayload() {
  return {
    title: $("titleInput").value.trim(),
    content: $("contentInput").value.trim(),
    image_url: $("imageInput").value.trim(),
    published: $("publishedInput").checked
  };
}

function clearForm() {
  $("editingId").value = "";
  $("newsForm").reset();
  $("formTitle").textContent = "Yeni haber";
  $("saveBtn").textContent = "Haberi Kaydet";
  $("cancelEditBtn").classList.add("is-hidden");
  setAdminMessage("");
  renderPreview();
}

function renderPreview() {
  const item = getFormPayload();
  $("previewCard").innerHTML = `
    <img src="${escapeHTML(item.image_url || FALLBACK_IMAGE)}" alt="${escapeHTML(item.title || "Haber görseli")}" />
    <div class="card-body">
      <div class="meta-line"><span>${item.published ? "Yayında" : "Taslak"}</span><span>Önizleme</span></div>
      <h3>${escapeHTML(item.title || "Haber başlığı")}</h3>
      <p>${escapeHTML(shortContent(item.content || "İçerik özeti burada görünecek."))}</p>
      <div class="card-footer"><span>Supabase</span><span class="read-button">Önizleme</span></div>
    </div>
  `;
}

function renderStats() {
  const publishedCount = adminNews.filter((item) => item.published).length;
  $("statNews").textContent = adminNews.length.toLocaleString("tr-TR");
  $("statPublished").textContent = publishedCount.toLocaleString("tr-TR");
  $("statDrafts").textContent = (adminNews.length - publishedCount).toLocaleString("tr-TR");
  $("statLatest").textContent = adminNews[0] ? formatDate(adminNews[0].created_at) : "-";
}

function visibleNews() {
  const term = adminSearchTerm.toLocaleLowerCase("tr-TR").trim();
  return adminNews.filter((item) => {
    const haystack = `${item.title || ""} ${item.content || ""}`.toLocaleLowerCase("tr-TR");
    return !term || haystack.includes(term);
  });
}

function renderAdminTable() {
  const list = document.querySelector("[data-admin-news-list]");
  if (!list) return;

  const rows = visibleNews();
  if (!rows.length) {
    list.innerHTML = `<div class="empty-state">Kayıtlı haber bulunamadı.</div>`;
    return;
  }

  list.innerHTML = `
    <div class="table-head"><span>Görsel</span><span>Başlık</span><span>Durum</span><span>Tarih</span><span>İşlem</span></div>
    ${rows.map((item) => `
      <article class="table-row admin-news-item" data-id="${escapeHTML(item.id)}">
        <img class="table-thumb" src="${escapeHTML(item.image_url || FALLBACK_IMAGE)}" alt="${escapeHTML(item.title || "Haber görseli")}" />
        <div class="table-title"><b>${escapeHTML(item.title || "Başlıksız Haber")}</b><span>${escapeHTML(shortContent(item.content, 92))}</span></div>
        <small>${item.published ? "Yayında" : "Taslak"}</small>
        <small>${formatDate(item.created_at)}</small>
        <div class="table-actions">
          <button class="table-action" type="button" data-edit-id="${escapeHTML(item.id)}">Düzenle</button>
          <button class="table-action danger" type="button" data-delete-id="${escapeHTML(item.id)}">Sil</button>
        </div>
      </article>
    `).join("")}
  `;
}

function renderAdmin() {
  renderStats();
  renderAdminTable();
  renderPreview();
}

async function loadAdminNews() {
  const list = document.querySelector("[data-admin-news-list]");
  if (!list) return;

  list.innerHTML = `<div class="empty-state">Haberler yükleniyor...</div>`;

  if (!window.supabaseClient) {
    console.error("Supabase client is not initialized.");
    return;
  }

  const { data, error } = await window.supabaseClient
    .from("posts")
    .select("id,title,content,image_url,published,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    list.innerHTML = `<div class="empty-state is-error">Haberler yüklenemedi. Publishable key ve Supabase RLS izinlerini kontrol edin.</div>`;
    return;
  }

  adminNews = Array.isArray(data) ? data : [];
  renderAdmin();
}

async function createNews(event) {
  event.preventDefault();

  const news = getFormPayload();
  if (!news.title || !news.content) {
    setAdminMessage("Başlık ve içerik zorunludur.", "error");
    return;
  }

  const editingId = $("editingId").value;
  $("saveBtn").disabled = true;
  setAdminMessage(editingId ? "Haber güncelleniyor..." : "Haber ekleniyor...");

  if (!window.supabaseClient) {
    console.error("Supabase client is not initialized.");
    $("saveBtn").disabled = false;
    return;
  }

  const request = editingId
    ? window.supabaseClient.from("posts").update(news).eq("id", editingId)
    : window.supabaseClient.from("posts").insert([news]);

  const { error } = await request;
  $("saveBtn").disabled = false;

  if (error) {
    console.error(error);
    setAdminMessage(editingId ? "Haber güncellenirken hata oluştu." : "Haber eklenirken hata oluştu.", "error");
    return;
  }

  setAdminMessage(editingId ? "Haber güncellendi." : "Haber eklendi.", "success");
  clearForm();
  await loadAdminNews();
}

function editNews(id) {
  const selected = adminNews.find((item) => String(item.id) === String(id));
  if (!selected) return;

  $("editingId").value = selected.id;
  $("titleInput").value = selected.title || "";
  $("contentInput").value = selected.content || "";
  $("imageInput").value = selected.image_url || "";
  $("publishedInput").checked = Boolean(selected.published);
  $("formTitle").textContent = "Haberi düzenle";
  $("saveBtn").textContent = "Haberi Güncelle";
  $("cancelEditBtn").classList.remove("is-hidden");
  setAdminMessage("");
  renderPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteNews(id) {
  const selected = adminNews.find((item) => String(item.id) === String(id));
  const ok = confirm(`"${selected?.title || "Bu haber"}" silinsin mi?`);
  if (!ok) return;

  if (!window.supabaseClient) {
    console.error("Supabase client is not initialized.");
    return;
  }

  const { error } = await window.supabaseClient
    .from("posts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error(error);
    setAdminMessage("Haber silinemedi.", "error");
    return;
  }

  if ($("editingId").value === String(id)) clearForm();
  setAdminMessage("Haber silindi.", "success");
  await loadAdminNews();
}

async function cleanForeignNews() {
  if (!window.supabaseClient) {
    setAdminMessage("Supabase bağlantısı hazır değil.", "error");
    return;
  }

  const foreignItems = adminNews.filter((item) => !isLikelyTurkishArticle(item));
  if (!foreignItems.length) {
    setAdminMessage("Temizlenecek yabancı haber bulunamadı.", "success");
    return;
  }

  const ok = confirm(`${foreignItems.length} yabancı haber silinsin mi? Türkçe görünen haberler korunacak.`);
  if (!ok) return;

  setAdminMessage("Yabancı haberler temizleniyor...");
  const ids = foreignItems.map((item) => item.id);
  const { error } = await window.supabaseClient
    .from("posts")
    .delete()
    .in("id", ids);

  if (error) {
    setAdminMessage("Yabancı haberler silinemedi.", "error");
    return;
  }

  setAdminMessage(`${ids.length} yabancı haber temizlendi.`, "success");
  await loadAdminNews();
}

function bindOptionalButton(id, handler) {
  const button = $(id);
  if (button) button.addEventListener("click", handler);
}

function bindAdminEvents() {
  const form = document.querySelector("[data-news-form]");
  if (form) form.addEventListener("submit", createNews);

  $("clearFormBtn").addEventListener("click", clearForm);
  $("cancelEditBtn").addEventListener("click", clearForm);
  bindOptionalButton("cleanForeignBtn", cleanForeignNews);
  $("adminSearch").addEventListener("input", (event) => {
    adminSearchTerm = event.target.value;
    renderAdminTable();
  });

  ["titleInput", "contentInput", "imageInput", "publishedInput"].forEach((id) => {
    $(id).addEventListener("input", renderPreview);
    $(id).addEventListener("change", renderPreview);
  });

  document.body.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit-id]");
    if (editButton) {
      editNews(editButton.dataset.editId);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-id]");
    if (deleteButton) {
      deleteNews(deleteButton.dataset.deleteId);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  clearForm();
  bindAdminEvents();
  loadAdminNews();
});
