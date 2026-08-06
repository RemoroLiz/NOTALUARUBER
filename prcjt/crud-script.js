// ==============================
// KONFIGURASI
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbx3iZvmD3NXgZMCgEOqAeL6i9ixoS5QimI_gBqAOIyvCZ8bGMjgjlVoDN779GspaVKI/exec",
  PAGE_SIZE: 15,
  MAX_IMAGES: 5,
};

// ==============================
// STATE
// ==============================
let allData = [];
let filteredData = [];
let currentPage = 1;
let currentDetailId = null;
let currentEditId = null;

// ==============================
// UTILITAS
// ==============================
function showStatus(message, isSuccess = true, duration = 5000) {
  const statusIndicator = document.getElementById("statusIndicator");
  const statusMessage = document.getElementById("statusMessage");
  statusIndicator.className = `status-indicator ${isSuccess ? "status-success" : "status-error"}`;
  statusMessage.innerHTML = `<i class="fas ${isSuccess ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${message}`;
  statusIndicator.style.display = "flex";
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => (statusIndicator.style.display = "none"), duration);
}

function updateLoadingMessage(message) {
  const el = document.getElementById("loadingMessage");
  if (el) el.textContent = message;
}

function formatRupiah(value) {
  const num = parseFloat(value) || 0;
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getDriveThumbnailUrl(driveUrl) {
  if (!driveUrl) return null;
  try {
    const idMatch = driveUrl.match(/id=([^&]+)/) || driveUrl.match(/\/d\/([^/]+)/);
    if (idMatch && idMatch[1]) {
      return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`;
    }
    return driveUrl;
  } catch (e) {
    return driveUrl;
  }
}

// ==============================
// API
// ==============================
async function apiGet(params) {
  const url = new URL(CONFIG.WEB_APP_URL);
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Gagal mengambil data");
  return json;
}

async function apiPost(payload) {
  const res = await fetch(CONFIG.WEB_APP_URL, { method: "POST", body: JSON.stringify(payload) });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Gagal memproses data");
  return json;
}

// ==============================
// MUAT DATA
// ==============================
async function loadData() {
  const loadingEl = document.getElementById("loadingData");
  const noDataEl = document.getElementById("noDataMessage");
  const tableBody = document.getElementById("tableBody");

  loadingEl.classList.add("show");
  noDataEl.classList.remove("show");
  tableBody.innerHTML = "";

  try {
    const search = document.getElementById("searchInput").value.trim();
    const dateFilter = document.getElementById("filterDate").value;
    const status = document.getElementById("filterStatus").value;

    const result = await apiGet({ action: "list", search, dateFilter, status });
    allData = result.data || [];
    filteredData = allData;
    currentPage = 1;
    renderTable();
    document.getElementById("connectionText").textContent = "Terhubung ke Spreadsheet";
  } catch (err) {
    console.error(err);
    showStatus(`Gagal memuat data: ${err.message}`, false, 6000);
    document.getElementById("connectionText").textContent = "Mode Offline";
  } finally {
    loadingEl.classList.remove("show");
  }
}

// ==============================
// RENDER TABEL & PAGINASI
// ==============================
function renderTable() {
  const tableBody = document.getElementById("tableBody");
  const noDataEl = document.getElementById("noDataMessage");
  const totalPages = Math.max(1, Math.ceil(filteredData.length / CONFIG.PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);

  document.getElementById("totalRecords").textContent = `Total: ${filteredData.length} data`;
  document.getElementById("currentPage").textContent = `Halaman ${currentPage} / ${totalPages}`;
  document.getElementById("prevPage").disabled = currentPage <= 1;
  document.getElementById("nextPage").disabled = currentPage >= totalPages;

  if (!filteredData.length) {
    tableBody.innerHTML = "";
    noDataEl.classList.add("show");
    return;
  }
  noDataEl.classList.remove("show");

  const start = (currentPage - 1) * CONFIG.PAGE_SIZE;
  const pageRows = filteredData.slice(start, start + CONFIG.PAGE_SIZE);

  tableBody.innerHTML = pageRows
    .map((row, idx) => {
      const badgeClass = row.statusCetak === "SUDAH CETAK" ? "badge-success" : "badge-warning";
      return `
        <tr>
          <td>${start + idx + 1}</td>
          <td><strong>${row.id}</strong></td>
          <td>${formatDate(row.timestamp)}</td>
          <td>${row.kodeSales || "-"}</td>
          <td>${row.jenisBarang || "-"}</td>
          <td>${row.kadarMesin || "-"}</td>
          <td>${row.beratTerima || "-"} g</td>
          <td>${formatRupiah(row.hargaTerima)}</td>
          <td><span class="badge ${badgeClass}">${row.statusCetak || "BELUM CETAK"}</span></td>
          <td>
            <div class="action-buttons">
              <button class="btn-icon btn-view" data-id="${row.id}" title="Detail"><i class="fas fa-eye"></i></button>
              <button class="btn-icon btn-edit" data-id="${row.id}" title="Edit"><i class="fas fa-edit"></i></button>
              <button class="btn-icon btn-print" data-id="${row.id}" title="Cetak Ulang"><i class="fas fa-print"></i></button>
              <button class="btn-icon btn-delete" data-id="${row.id}" title="Hapus"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => showDetail(b.dataset.id)));
  tableBody.querySelectorAll(".btn-edit").forEach((b) => b.addEventListener("click", () => openEditModal(b.dataset.id)));
  tableBody.querySelectorAll(".btn-print").forEach((b) => b.addEventListener("click", () => reprintById(b.dataset.id)));
  tableBody.querySelectorAll(".btn-delete").forEach((b) => b.addEventListener("click", () => deleteRecord(b.dataset.id)));
}

function findById(id) {
  return allData.find((r) => String(r.id) === String(id));
}

// ==============================
// MODAL DETAIL
// ==============================
function showDetail(id) {
  const data = findById(id);
  if (!data) return;
  currentDetailId = id;

  const fields = [
    ["fa-id-card", "ID Transaksi", data.id],
    ["fa-calendar", "Tanggal & Waktu", formatDate(data.timestamp)],
    ["fa-user-tag", "Kode Sales", data.kodeSales],
    ["fa-box-open", "Jenis Barang", data.jenisBarang],
    ["fa-file-contract", "Surat", data.surat],
    ["fa-store", "Nama Toko", data.namaToko || "-"],
    ["fa-percent", "Kadar Fisik", data.kadarFisik || "0"],
    ["fa-cogs", "Presentase Mesin", (data.presentaseMesin || "0") + "%"],
    ["fa-microchip", "Kadar Mesin", data.kadarMesin || "0"],
    ["fa-industry", "Kode Pabrik", data.kodePabrik || "-"],
    ["fa-weight-hanging", "Berat Surat", (data.beratSurat || "0") + " g"],
    ["fa-weight", "Berat Fisik", (data.beratFisik || "0") + " g"],
    ["fa-minus-circle", "Susut", (data.susut || "0") + " g"],
    ["fa-balance-scale", "Berat Terima", (data.beratTerima || "0") + " g"],
    ["fa-gem", "Kondisi Perhiasan", data.kondisiPerhiasan || "-"],
    ["fa-shapes", "Model", data.model || "-"],
    ["fa-chart-line", "Rate Terima", data.rateTerima || "0"],
    ["fa-money-bill", "Harga Per Gram", formatRupiah(data.hargaPerGram)],
  ];

  let html = fields
    .map(
      ([icon, label, val]) => `
      <div class="detail-item">
        <div class="detail-label"><i class="fas ${icon}"></i> ${label}</div>
        <div class="detail-value">${val}</div>
      </div>`,
    )
    .join("");

  html += `
    <div class="detail-item full-width">
      <div class="detail-label"><i class="fas fa-calculator"></i> Harga Terima</div>
      <div class="detail-value">${formatRupiah(data.hargaTerima)}</div>
    </div>`;

  const images = [1, 2, 3, 4, 5].map((n) => data[`gambar${n}`]).filter(Boolean);
  if (images.length) {
    html += `
      <div class="detail-item full-width">
        <div class="detail-label"><i class="fas fa-images"></i> Foto (${images.length})</div>
        <div class="detail-images">
          ${images.map((url) => `<img src="${getDriveThumbnailUrl(url)}" alt="foto" onclick="window.open('${url}','_blank')" />`).join("")}
        </div>
      </div>`;
  }

  document.getElementById("detailContent").innerHTML = html;
  document.getElementById("detailModal").classList.add("show");
}

// ==============================
// MODAL EDIT
// ==============================
const EDIT_FIELDS = [
  { key: "kodeSales", label: "Kode Sales", type: "number" },
  { key: "cokimTerima", label: "Cokim Terima", type: "number" },
  { key: "jenisBarang", label: "Jenis Barang", type: "text" },
  { key: "surat", label: "Surat", type: "select", options: ["ADA", "TIDAK ADA"] },
  { key: "namaToko", label: "Nama Toko", type: "text" },
  { key: "kadarFisik", label: "Kadar Fisik", type: "number" },
  { key: "presentaseMesin", label: "Presentase Mesin (%)", type: "number" },
  { key: "kodePabrik", label: "Kode Pabrik", type: "text" },
  { key: "beratSurat", label: "Berat Surat (g)", type: "number" },
  { key: "beratFisik", label: "Berat Fisik (g)", type: "number" },
  { key: "susut", label: "Susut (g)", type: "number" },
  { key: "kondisiPerhiasan", label: "Kondisi Perhiasan", type: "select", options: ["NORMAL", "RUSAK"] },
  { key: "model", label: "Model", type: "select", options: ["POLOS", "BATU"] },
  { key: "rateTerima", label: "Rate Terima (%)", type: "number" },
];

function openEditModal(id) {
  const data = findById(id);
  if (!data) return;
  currentEditId = id;

  const form = document.getElementById("editForm");
  form.innerHTML = EDIT_FIELDS.map((f) => {
    const value = data[f.key] ?? "";
    if (f.type === "select") {
      return `
        <div class="form-group">
          <label for="edit_${f.key}">${f.label}</label>
          <div class="input-with-icon">
            <i class="fas fa-pen"></i>
            <select id="edit_${f.key}" name="${f.key}">
              ${f.options.map((o) => `<option value="${o}" ${o === value ? "selected" : ""}>${o}</option>`).join("")}
            </select>
          </div>
        </div>`;
    }
    return `
      <div class="form-group">
        <label for="edit_${f.key}">${f.label}</label>
        <div class="input-with-icon">
          <i class="fas fa-pen"></i>
          <input type="${f.type}" id="edit_${f.key}" name="${f.key}" value="${value}" step="any" />
        </div>
      </div>`;
  }).join("");

  document.getElementById("editModal").classList.add("show");
}

function recalcForEdit(values) {
  const presentase = parseFloat(values.presentaseMesin) || 0;
  values.kadarMesin = presentase ? ((presentase / 100) * 24).toFixed(2) : "";

  const beratSurat = parseFloat(values.beratSurat) || 0;
  const beratFisik = parseFloat(values.beratFisik) || 0;
  const susut = parseFloat(values.susut) || 0;
  let dasar = 0;
  if (beratSurat > 0 && beratFisik > 0) dasar = Math.min(beratSurat, beratFisik);
  else if (beratFisik > 0) dasar = beratFisik;
  else if (beratSurat > 0) dasar = beratSurat;
  values.beratTerima = dasar > 0 ? Math.max(dasar - susut, 0).toFixed(2) : "";

  const cokim = parseFloat(values.cokimTerima) || 0;
  const rate = parseFloat(values.rateTerima) || 0;
  values.hargaPerGram = cokim && rate ? Math.floor((cokim * (rate / 100)) / 500) * 500 : "";

  const hargaPerGram = parseFloat(values.hargaPerGram) || 0;
  const beratTerima = parseFloat(values.beratTerima) || 0;
  values.hargaTerima = hargaPerGram && beratTerima ? Math.floor((hargaPerGram * beratTerima) / 500) * 500 : "";

  return values;
}

async function saveEdit() {
  if (!currentEditId) return;
  const form = document.getElementById("editForm");
  const fd = new FormData(form);
  let values = {};
  fd.forEach((v, k) => (values[k] = v));
  values = recalcForEdit(values);

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Menyimpan perubahan...");

  try {
    await apiPost({ action: "update", id: currentEditId, data: values });
    document.getElementById("editModal").classList.remove("show");
    showStatus(`Data ${currentEditId} berhasil diperbarui.`, true);
    await loadData();
  } catch (err) {
    showStatus(`Gagal menyimpan perubahan: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
}

// ==============================
// HAPUS DATA
// ==============================
async function deleteRecord(id) {
  const confirmed = window.confirm(`Yakin ingin menghapus data ${id}? Gambar terkait juga akan dihapus dari Drive.`);
  if (!confirmed) return;

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Menghapus data...");

  try {
    await apiPost({ action: "delete", id });
    showStatus(`Data ${id} berhasil dihapus.`, true);
    await loadData();
  } catch (err) {
    showStatus(`Gagal menghapus data: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
}

// ==============================
// CETAK ULANG - 2 SESI THERMAL
// ==============================
function buildCustomerReceipt(id, v) {
  return `
    <div class="thermal-receipt">
      <div class="tr-title">TOKO EMAS UBER</div>
      <div class="tr-sub">${id} &middot; ${formatDate(v.timestamp)}</div>
      <hr />
      <div class="tr-row"><span class="k">Kadar Fisik</span><span class="v">${v.kadarFisik || "-"}</span></div>
      <div class="tr-row"><span class="k">Kadar Mesin</span><span class="v">${v.kadarMesin || "-"}</span></div>
      <div class="tr-row"><span class="k">% Mesin</span><span class="v">${v.presentaseMesin || "-"}%</span></div>
      <div class="tr-row"><span class="k">Berat Terima</span><span class="v">${v.beratTerima || "-"} g</span></div>
      <div class="tr-row"><span class="k">Harga/gram</span><span class="v">${formatRupiah(v.hargaPerGram)}</span></div>
      <hr />
      <div class="tr-total"><span>TOTAL</span><span>${formatRupiah(v.hargaTerima)}</span></div>
      <div class="tr-footer">Terima kasih</div>
    </div>`;
}

function buildStoreReceipt(id, v) {
  return `
    <div class="thermal-receipt">
      <div class="tr-title">LAPORAN TOKO</div>
      <div class="tr-sub">${id}</div>
      <hr />
      <div class="tr-row"><span class="k">Jenis</span><span class="v">${v.jenisBarang || "-"}</span></div>
      <div class="tr-row"><span class="k">Cokim</span><span class="v">${v.cokimTerima || "-"}</span></div>
      <div class="tr-row"><span class="k">Surat</span><span class="v">${v.surat || "-"}</span></div>
      <div class="tr-row"><span class="k">Sales</span><span class="v">${v.kodeSales || "-"}</span></div>
      <div class="tr-row"><span class="k">Toko</span><span class="v">${v.namaToko || "-"}</span></div>
      <div class="tr-row"><span class="k">Kadar Fisik</span><span class="v">${v.kadarFisik || "-"}</span></div>
      <div class="tr-row"><span class="k">Kadar Mesin</span><span class="v">${v.kadarMesin || "-"}</span></div>
      <div class="tr-row"><span class="k">% Mesin</span><span class="v">${v.presentaseMesin || "-"}%</span></div>
      <div class="tr-row"><span class="k">Berat Surat</span><span class="v">${v.beratSurat || "-"} g</span></div>
      <div class="tr-row"><span class="k">Berat Fisik</span><span class="v">${v.beratFisik || "-"} g</span></div>
      <div class="tr-row"><span class="k">Susut</span><span class="v">${v.susut || "-"} g</span></div>
      <div class="tr-row"><span class="k">Berat Terima</span><span class="v">${v.beratTerima || "-"} g</span></div>
      <div class="tr-row"><span class="k">Kondisi</span><span class="v">${v.kondisiPerhiasan || "-"}</span></div>
      <div class="tr-row"><span class="k">Model</span><span class="v">${v.model || "-"}</span></div>
      <div class="tr-row"><span class="k">Rate</span><span class="v">${v.rateTerima || "-"}</span></div>
      <div class="tr-row"><span class="k">Harga/gram</span><span class="v">${formatRupiah(v.hargaPerGram)}</span></div>
      <hr />
      <div class="tr-total"><span>HARGA TERIMA</span><span>${formatRupiah(v.hargaTerima)}</span></div>
    </div>`;
}

function printReceipt(session, id, v) {
  const printArea = document.getElementById("printArea");
  printArea.innerHTML = session === "customer" ? buildCustomerReceipt(id, v) : buildStoreReceipt(id, v);
  window.print();
}

async function reprintById(id) {
  const data = findById(id);
  if (!data) return;
  printReceipt("customer", id, data);
  setTimeout(async () => {
    printReceipt("store", id, data);
    try {
      await apiPost({ action: "markPrinted", id });
      await loadData();
    } catch (err) {
      console.error("Gagal menandai status cetak:", err);
    }
  }, 700);
}

// ==============================
// FILTER, SEARCH, PAGINASI - EVENTS
// ==============================
let searchDebounce;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadData, 400);
});

document.getElementById("filterDate").addEventListener("change", loadData);
document.getElementById("filterStatus").addEventListener("change", loadData);

document.getElementById("resetFilter").addEventListener("click", () => {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterDate").value = "";
  document.getElementById("filterStatus").value = "";
  loadData();
});

document.getElementById("prevPage").addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    renderTable();
  }
});

document.getElementById("nextPage").addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(filteredData.length / CONFIG.PAGE_SIZE));
  if (currentPage < totalPages) {
    currentPage++;
    renderTable();
  }
});

// ==============================
// MODAL EVENTS
// ==============================
document.getElementById("closeDetailModal").addEventListener("click", () => {
  document.getElementById("detailModal").classList.remove("show");
});
document.getElementById("detailModal").addEventListener("click", (e) => {
  if (e.target.id === "detailModal") e.currentTarget.classList.remove("show");
});

document.getElementById("closeEditModal").addEventListener("click", () => {
  document.getElementById("editModal").classList.remove("show");
});
document.getElementById("editModal").addEventListener("click", (e) => {
  if (e.target.id === "editModal") e.currentTarget.classList.remove("show");
});
document.getElementById("cancelEdit").addEventListener("click", () => {
  document.getElementById("editModal").classList.remove("show");
});
document.getElementById("saveEdit").addEventListener("click", saveEdit);

document.getElementById("printFromDetail").addEventListener("click", () => {
  if (currentDetailId) reprintById(currentDetailId);
});
document.getElementById("editFromDetail").addEventListener("click", () => {
  if (currentDetailId) {
    document.getElementById("detailModal").classList.remove("show");
    openEditModal(currentDetailId);
  }
});

// ==============================
// INIT
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  loadData();
});
