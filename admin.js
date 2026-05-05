const STORAGE_KEY = "techpulse.news.v1";
const LEGACY_KEY = "tech_news_db";
const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1600&q=85";
const DEFAULT_CATEGORIES = ["Yapay Zeka", "Siber Güvenlik", "Donanım", "Mobil", "Oyun", "Blockchain", "Yazılım", "Uzay"];

let newsList = [];
let adminSearchTerm = "";

const $ = (id) => document.getElementById(id);

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function stripHTML(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function htmlToText(value) {
  return stripHTML(value).replace(/\.\s+/g, ".\n\n");
}

function toTagArray(tags) {
  if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
  return String(tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
}

function createNewsId() {
  return `news-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeNews(item, index = 0) {
  return {
    id: String(item.id || createNewsId()),
    title: String(item.title || "Başlıksız haber").trim(),
    excerpt: String(item.excerpt || stripHTML(item.content).slice(0, 150) || "Kısa açıklama eklenmedi.").trim(),
    content: String(item.content || item.excerpt || "Bu haber için tam içerik henüz girilmedi.").includes("<") ? htmlToText(item.content || item.excerpt) : String(item.content || item.excerpt || "Bu haber için tam içerik henüz girilmedi.").trim(),
    category: String(item.category || "Genel").trim(),
    image: String(item.image || FALLBACK_IMAGE).trim(),
    date: String(item.date || new Date().toISOString().slice(0, 10)),
    readTime: Math.max(1, Number(item.readTime || 3)),
    views: Math.max(0, Number(item.views || 0)),
    featured: Boolean(item.featured || index === 0),
    tags: toTagArray(item.tags)
  };
}

function normalizeNewsList(list) {
  const seen = new Set();
  return list.map((item, index) => {
    const normalized = normalizeNews(item, index);
    let id = normalized.id;
    let suffix = 1;
    while (seen.has(id)) id = `${normalized.id}-${suffix++}`;
    seen.add(id);
    return { ...normalized, id };
  });
}

function saveNews(list = newsList) {
  newsList = normalizeNewsList(list);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newsList));
  localStorage.removeItem(LEGACY_KEY);
  return newsList;
}

async function loadNews() {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
  if (stored) {
    try {
      const parsedNews = JSON.parse(stored);
      if (Array.isArray(parsedNews) && parsedNews.length >= 24) return saveNews(parsedNews);
    } catch (error) {
      console.warn("Kayıtlı haber verisi okunamadı.", error);
    }
  }

  try {
    const response = await fetch("data/news.json", { cache: "no-store" });
    if (response.ok) return saveNews(await response.json());
  } catch (error) {
    console.warn("data/news.json okunamadı. Admin panel boş veriyle açılıyor.", error);
  }

  return saveNews([]);
}

function formatDateInput(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

function getCategories() {
  return [...new Set([...DEFAULT_CATEGORIES, ...newsList.map((item) => item.category).filter(Boolean)])];
}

function renderCategoryOptions(selected = "") {
  $("categoryInput").innerHTML = getCategories().map((category) => `
    <option value="${escapeHTML(category)}" ${category === selected ? "selected" : ""}>${escapeHTML(category)}</option>
  `).join("");
}

function getFormData() {
  return {
    title: $("titleInput").value.trim(),
    excerpt: $("excerptInput").value.trim(),
    content: $("contentInput").value.trim(),
    category: $("categoryInput").value,
    image: $("imageInput").value.trim() || FALLBACK_IMAGE,
    date: $("dateInput").value || new Date().toISOString().slice(0, 10),
    readTime: Math.max(1, Number($("readTimeInput").value || 3)),
    views: Math.max(0, Number($("viewsInput").value || 0)),
    featured: $("featuredInput").checked,
    tags: toTagArray($("tagsInput").value)
  };
}

function clearForm() {
  $("editingId").value = "";
  $("newsForm").reset();
  $("dateInput").value = new Date().toISOString().slice(0, 10);
  $("readTimeInput").value = 4;
  $("viewsInput").value = 0;
  $("formTitle").textContent = "Yeni haber";
  $("saveBtn").textContent = "Haberi Kaydet";
  $("cancelEditBtn").classList.add("is-hidden");
  renderCategoryOptions();
  renderPreview();
}

function renderStats() {
  $("statNews").textContent = newsList.length.toLocaleString("tr-TR");
  $("statCategories").textContent = new Set(newsList.map((item) => item.category)).size.toLocaleString("tr-TR");
  $("statTags").textContent = new Set(newsList.flatMap((item) => item.tags)).size.toLocaleString("tr-TR");
  $("statViews").textContent = newsList.reduce((sum, item) => sum + item.views, 0).toLocaleString("tr-TR");
}

function renderPreview() {
  const item = normalizeNews({ id: "preview", ...getFormData() });
  $("previewCard").innerHTML = `
    <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" />
    <div class="card-body">
      <div class="meta-line"><span>${escapeHTML(item.category)}</span><span>${formatDate(item.date)}</span><span>${item.readTime} dk</span></div>
      <h3>${escapeHTML(item.title || "Haber başlığı")}</h3>
      <p>${escapeHTML(item.excerpt || "Kısa açıklama burada görünecek.")}</p>
      <div class="card-footer"><span>${item.views.toLocaleString("tr-TR")} görüntülenme</span><button class="read-button" type="button">Önizleme</button></div>
    </div>
  `;
}

function getVisibleNews() {
  const term = adminSearchTerm.toLowerCase().trim();
  return newsList.filter((item) => {
    const haystack = `${item.title} ${item.excerpt} ${item.content} ${item.category} ${item.tags.join(" ")}`.toLowerCase();
    return !term || haystack.includes(term);
  });
}

function renderTable() {
  const list = getVisibleNews();
  if (!list.length) {
    $("newsTable").innerHTML = `<div class="empty-state">Kayıtlı haber bulunamadı.</div>`;
    return;
  }

  $("newsTable").innerHTML = `
    <div class="table-head"><span>Görsel</span><span>Başlık</span><span>Kategori</span><span>Okunma</span><span>İşlem</span></div>
    ${list.map((item) => `
      <article class="table-row" data-id="${escapeHTML(item.id)}">
        <img class="table-thumb" src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" />
        <div class="table-title"><b>${escapeHTML(item.title)}</b><span>${escapeHTML(item.featured ? "Öne çıkan · " : "")}${formatDate(item.date)} · ${escapeHTML(item.tags.join(", "))}</span></div>
        <small>${escapeHTML(item.category)}</small>
        <small>${item.views.toLocaleString("tr-TR")}</small>
        <div class="table-actions">
          <button class="table-action" type="button" data-edit="${escapeHTML(item.id)}">Düzenle</button>
          <button class="table-action featured" type="button" data-feature="${escapeHTML(item.id)}">Öne Çıkar</button>
          <button class="table-action danger" type="button" data-delete="${escapeHTML(item.id)}">Sil</button>
        </div>
      </article>
    `).join("")}
  `;
}

function renderAll() {
  renderCategoryOptions($("categoryInput").value);
  renderStats();
  renderPreview();
  renderTable();
}

function editNews(id) {
  const selectedNews = newsList.find((item) => String(item.id) === String(id));
  if (!selectedNews) return;

  $("editingId").value = selectedNews.id;
  $("titleInput").value = selectedNews.title;
  $("excerptInput").value = selectedNews.excerpt;
  $("contentInput").value = selectedNews.content;
  renderCategoryOptions(selectedNews.category);
  $("imageInput").value = selectedNews.image;
  $("dateInput").value = formatDateInput(selectedNews.date);
  $("readTimeInput").value = selectedNews.readTime;
  $("viewsInput").value = selectedNews.views;
  $("featuredInput").checked = selectedNews.featured;
  $("tagsInput").value = selectedNews.tags.join(", ");
  $("formTitle").textContent = "Haberi düzenle";
  $("saveBtn").textContent = "Haberi Güncelle";
  $("cancelEditBtn").classList.remove("is-hidden");
  renderPreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteNews(id) {
  const selectedNews = newsList.find((item) => String(item.id) === String(id));
  if (!selectedNews) return;
  if (!confirm(`"${selectedNews.title}" silinsin mi?`)) return;

  newsList = newsList.filter((item) => String(item.id) !== String(id));
  saveNews(newsList);
  console.log("Haber silindi", id);
  if ($("editingId").value === id) clearForm();
  renderAll();
}

function featureNews(id) {
  newsList = newsList.map((item) => ({ ...item, featured: String(item.id) === String(id) }));
  saveNews(newsList);
  console.log("Haber öne çıkarıldı", id);
  renderAll();
}

function handleSubmit(event) {
  event.preventDefault();
  const data = getFormData();
  if (!data.title || !data.excerpt || !data.content) {
    alert("Başlık, kısa açıklama ve tam içerik zorunludur.");
    return;
  }

  const editingId = $("editingId").value;
  if (data.featured) {
    newsList = newsList.map((item) => ({ ...item, featured: false }));
  }

  if (editingId) {
    newsList = newsList.map((item) => String(item.id) === String(editingId) ? { ...item, ...data, id: item.id } : item);
    console.log("Haber düzenlendi", editingId);
    if (data.featured) console.log("Haber öne çıkarıldı", editingId);
  } else {
    const newItem = { id: createNewsId(), ...data };
    newsList = [newItem, ...newsList];
    console.log("Haber eklendi", newItem.id);
    if (data.featured) console.log("Haber öne çıkarıldı", newItem.id);
  }

  saveNews(newsList);
  clearForm();
  renderAll();
}

async function resetDemoData() {
  if (!confirm("Demo veri data/news.json içeriğiyle yenilensin mi? Mevcut localStorage haberleri değişir.")) return;
  try {
    const response = await fetch("data/news.json", { cache: "no-store" });
    if (!response.ok) throw new Error("data/news.json okunamadı");
    saveNews(await response.json());
    console.log("Haber düzenlendi", "demo veri yenilendi");
    clearForm();
    renderAll();
  } catch (error) {
    alert("Demo veri yenilenemedi. Sayfayı yerel bir sunucu üzerinden açmayı deneyin.");
    console.warn(error);
  }
}

function bindEvents() {
  $("newsForm").addEventListener("submit", handleSubmit);
  $("clearFormBtn").addEventListener("click", clearForm);
  $("cancelEditBtn").addEventListener("click", clearForm);
  $("resetDemoBtn").addEventListener("click", resetDemoData);
  $("adminSearch").addEventListener("input", (event) => {
    adminSearchTerm = event.target.value;
    renderTable();
  });

  ["titleInput", "excerptInput", "contentInput", "categoryInput", "imageInput", "dateInput", "readTimeInput", "viewsInput", "featuredInput", "tagsInput"].forEach((id) => {
    $(id).addEventListener("input", renderPreview);
    $(id).addEventListener("change", renderPreview);
  });

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      editNews(editButton.dataset.edit);
      return;
    }

    const deleteButton = event.target.closest("[data-delete]");
    if (deleteButton) {
      deleteNews(deleteButton.dataset.delete);
      return;
    }

    const featureButton = event.target.closest("[data-feature]");
    if (featureButton) {
      featureNews(featureButton.dataset.feature);
    }
  });
}

async function initAdmin() {
  newsList = await loadNews();
  renderCategoryOptions();
  clearForm();
  renderAll();
  bindEvents();
}

window.saveNews = saveNews;
window.loadNews = loadNews;

initAdmin();

