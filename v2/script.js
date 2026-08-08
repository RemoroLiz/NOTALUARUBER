// ==============================
// KONFIGURASI
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbx7ERUoDAwin5MTPzh4ZtJD_c_oNP2ddEdj4YlyHwWoiKI2czxt1GhIi9Z14bDTXj_y/exec",
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
let allCustomers = []; // [{ idCustomer, nama, foto1, foto2, foto3 }]

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
    const customerId = document.getElementById("filterCustomer").value;

    const result = await apiGet({ action: "list", search, dateFilter, status, customerId });
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
// CUSTOMER (BARU)
// ==============================
async function loadCustomers() {
  try {
    const result = await apiGet({ action: "customerlist" });
    allCustomers = result.data || [];

    const select = document.getElementById("filterCustomer");
    if (select) {
      const currentValue = select.value;
      select.innerHTML =
        '<option value="">Semua Customer</option>' +
        allCustomers
          .map((c) => `<option value="${c.idCustomer}">${c.nama} (${c.idCustomer})</option>`)
          .join("");
      select.value = currentValue;
    }
  } catch (err) {
    console.error("Gagal memuat daftar customer:", err);
  }
}

function findCustomerById(idCustomer) {
  return allCustomers.find((c) => String(c.idCustomer) === String(idCustomer));
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
      const customer = row.idCustomer ? findCustomerById(row.idCustomer) : null;
      const customerCell = customer
        ? `<span class="customer-tag"><i class="fas fa-user"></i> ${customer.nama} <span class="cust-id-tag">${customer.idCustomer}</span></span>`
        : row.idCustomer
          ? `<span class="customer-tag"><i class="fas fa-user"></i> ${row.idCustomer}</span>`
          : "-";
      return `
        <tr>
          <td>${start + idx + 1}</td>
          <td><strong>${row.id}</strong></td>
          <td>${customerCell}</td>
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
              <button class="btn-icon btn-pdf" data-id="${row.id}" title="Cetak PDF"><i class="fas fa-file-pdf"></i></button>
              <button class="btn-icon btn-delete" data-id="${row.id}" title="Hapus"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => showDetail(b.dataset.id)));
  tableBody.querySelectorAll(".btn-edit").forEach((b) => b.addEventListener("click", () => openEditModal(b.dataset.id)));
  tableBody.querySelectorAll(".btn-print").forEach((b) => b.addEventListener("click", () => reprintById(b.dataset.id)));
  tableBody.querySelectorAll(".btn-pdf").forEach((b) => b.addEventListener("click", () => generatePdf(b.dataset.id)));
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

  const customer = data.idCustomer ? findCustomerById(data.idCustomer) : null;

  const fields = [
    ["fa-id-card", "ID Transaksi", data.id],
    ["fa-user", "Customer", customer ? `${customer.nama} (${customer.idCustomer})` : data.idCustomer || "-"],
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

  if (customer) {
    const customerPhotos = [customer.foto1, customer.foto2, customer.foto3].filter(Boolean);
    if (customerPhotos.length) {
      html += `
        <div class="detail-item full-width">
          <div class="detail-label"><i class="fas fa-portrait"></i> Foto Customer (${customerPhotos.length})</div>
          <div class="detail-images">
            ${customerPhotos.map((url) => `<img src="${getDriveThumbnailUrl(url)}" alt="foto customer" onclick="window.open('${url}','_blank')" />`).join("")}
          </div>
        </div>`;
    }
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
// CETAK ULANG - SATU DOKUMEN (customer + toko digabung)
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
  // Satu kolom (bukan 2 kolom) - layout 2 kolom memaksa font sangat
  // kecil sehingga mudah terpotong/tidak terbaca di printer thermal.
  const fields = [
    ["Jenis", v.jenisBarang || "-"],
    ["Cokim", v.cokimTerima || "-"],
    ["Surat", v.surat || "-"],
    ["Sales", v.kodeSales || "-"],
    ["Toko", v.namaToko || "-"],
    ["Kadar Fisik", v.kadarFisik || "-"],
    ["Kadar Mesin", v.kadarMesin || "-"],
    ["% Mesin", v.presentaseMesin ? `${v.presentaseMesin}%` : "-"],
    ["Berat Surat", v.beratSurat ? `${v.beratSurat} g` : "-"],
    ["Berat Fisik", v.beratFisik ? `${v.beratFisik} g` : "-"],
    ["Susut", v.susut ? `${v.susut} g` : "-"],
    ["Berat Terima", v.beratTerima ? `${v.beratTerima} g` : "-"],
    ["Kondisi", v.kondisiPerhiasan || "-"],
    ["Model", v.model || "-"],
    ["Rate", v.rateTerima || "-"],
    ["Harga/gram", formatRupiah(v.hargaPerGram)],
  ];

  const rows = fields
    .map(
      ([label, value]) => `<div class="tr-row"><span class="k">${label}</span><span class="v">${value}</span></div>`,
    )
    .join("");

  return `
    <div class="thermal-receipt">
      <div class="tr-title">LAPORAN NOTA LUAR UBER</div>
      <div class="tr-sub">${id}</div>
      <hr />
      ${rows}
      <hr />
      <div class="tr-total"><span>HARGA TERIMA</span><span>${formatRupiah(v.hargaTerima)}</span></div>
    </div>`;
}

/**
 * Satu dokumen print berisi struk customer + laporan toko sekaligus
 * (dipisah jarak beberapa cm).
 */
function buildCombinedReceipt(id, v) {
  return `
    ${buildCustomerReceipt(id, v)}
    <div class="tr-gap"><span>&#9986; gunting di sini &#9986;</span></div>
    ${buildStoreReceipt(id, v)}
  `;
}

/**
 * CSS struk thermal untuk printer POS-58 (kertas roll 58mm).
 * "size: 58mm auto" - tinggi halaman mengikuti panjang konten,
 * bukan angka tetap - menghindari halaman kosong berlebih maupun
 * konten yang terpotong.
 */
const THERMAL_PRINT_STYLE = `
  @page { size: 58mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 58mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .thermal-receipt { width: 58mm; padding: 2mm 2.5mm; page-break-after: avoid; page-break-inside: avoid; }
  .thermal-receipt .tr-title { text-align: center; font-size: 10.5pt; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 1.2mm; }
  .thermal-receipt .tr-sub { text-align: center; font-size: 8pt; margin-bottom: 1.8mm; }
  .thermal-receipt hr { border: none; border-top: 0.4mm dashed #000; margin: 1.2mm 0; }
  .thermal-receipt .tr-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: 8.5pt; line-height: 1.55; }
  .thermal-receipt .tr-row .k { white-space: nowrap; }
  .thermal-receipt .tr-row .v { font-weight: 700; text-align: right; word-break: break-word; }
  .thermal-receipt .tr-total { font-size: 9.5pt; font-weight: 700; display: flex; justify-content: space-between; margin-top: 1.5mm; }
  .thermal-receipt .tr-footer { text-align: center; font-size: 7.5pt; margin-top: 1.8mm; }
  .tr-gap { height: 12mm; display: flex; align-items: center; justify-content: center; page-break-inside: avoid; }
  .tr-gap span { font-size: 7pt; letter-spacing: 1px; color: #444; border-top: 0.3mm dashed #999; border-bottom: 0.3mm dashed #999; padding: 1.5mm 0; width: 100%; text-align: center; }
`;

/**
 * Mencetak lewat IFRAME TERSEMBUNYI berisi HANYA HTML struk (bukan
 * lagi menumpang di halaman CRUD lalu menyembunyikan sisanya pakai
 * @media print). Ini menghilangkan sepenuhnya kemungkinan halaman
 * Data Management ikut tercetak/terlihat dobel, di browser & driver
 * printer manapun.
 */
function printThermalDocument(bodyHtml) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="UTF-8" /><title>Struk</title><style>${THERMAL_PRINT_STYLE}</style></head><body>${bodyHtml}</body></html>`,
    );
    doc.close();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 500);
      resolve();
    };

    const triggerPrint = () => {
      if (done) return;
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error("Gagal mencetak struk:", err);
      }
      finish();
    };

    iframe.onload = () => setTimeout(triggerPrint, 100);
    setTimeout(triggerPrint, 500);
  });
}

async function printReceipt(id, v) {
  await printThermalDocument(buildCombinedReceipt(id, v));
}

async function reprintById(id) {
  const data = findById(id);
  if (!data) return;
  await printReceipt(id, data);
  try {
    await apiPost({ action: "markPrinted", id });
    await loadData();
  } catch (err) {
    console.error("Gagal menandai status cetak:", err);
  }
}

// ==============================
// CETAK PDF (BARU)
// ==============================
/**
 * Menentukan ukuran gambar (lebar x tinggi, mm) supaya pas di
 * dalam area halaman tanpa mengubah rasio aspek gambar aslinya.
 */
function fitImageToArea(imgWidth, imgHeight, maxWidth, maxHeight) {
  const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
  return { width: imgWidth * ratio, height: imgHeight * ratio };
}

function getImageNaturalSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Gagal membaca ukuran gambar"));
    img.src = dataUrl;
  });
}

async function generatePdf(id) {
  const data = findById(id);
  if (!data) {
    showStatus("Data tidak ditemukan untuk dicetak PDF.", false);
    return;
  }

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Mengambil data & gambar dari server...");

  try {
    const result = await apiGet({ action: "getimages", id });
    const images = result.images || [];
    const customerPhotos = result.customerPhotos || [];
    const customer = data.idCustomer ? findCustomerById(data.idCustomer) : null;

    updateLoadingMessage("Menyusun file PDF...");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

    // ------- HALAMAN 1: COVER (ID NOTLU + hari & tanggal) -------
    const tanggalObj = data.timestamp ? new Date(data.timestamp) : new Date();
    const hariTanggal = isNaN(tanggalObj)
      ? "-"
      : tanggalObj.toLocaleDateString("id-ID", {
          weekday: "long",
          day: "2-digit",
          month: "long",
          year: "numeric",
        });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LAPORAN TRANSAKSI EMAS UBER", pageWidth / 2, 40, { align: "center" });

    doc.setDrawColor(212, 175, 55); // gold
    doc.setLineWidth(0.8);
    doc.line(30, 46, pageWidth - 30, 46);

    doc.setFontSize(22);
    doc.text(String(data.id || id), pageWidth / 2, 70, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(13);
    doc.text(hariTanggal, pageWidth / 2, 82, { align: "center" });

    if (customer) {
      doc.setFontSize(11);
      doc.text(`Customer: ${customer.nama} (${customer.idCustomer})`, pageWidth / 2, 92, {
        align: "center",
      });
    }

    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Halaman berikutnya: detail transaksi, detail customer, dan ${images.length} lampiran foto`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center", maxWidth: pageWidth - margin * 2 },
    );
    doc.setTextColor(0, 0, 0);

    // ------- HELPER: render daftar label-value dengan wrap otomatis -------
    const labelWidth = 52;
    function drawSectionTitle(title, y) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(title, margin, y);
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(0.6);
      doc.line(margin, y + 2.5, pageWidth - margin, y + 2.5);
      return y + 10;
    }

    function drawFieldRows(fields, startY) {
      let y = startY;
      doc.setFontSize(10);
      fields.forEach(([label, value]) => {
        const text = value === undefined || value === null || value === "" ? "-" : String(value);
        const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - labelWidth);
        const rowHeight = 6 * Math.max(1, lines.length);

        if (y + rowHeight > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }

        doc.setFont("helvetica", "bold");
        doc.text(String(label), margin, y);
        doc.setFont("helvetica", "normal");
        doc.text(lines, margin + labelWidth, y);
        y += rowHeight;
      });
      return y;
    }

    // ------- HALAMAN 2: DETAIL TRANSAKSI (lengkap) -------
    doc.addPage();
    let y = drawSectionTitle("DETAIL TRANSAKSI", margin);

    const transaksiFields = [
      ["ID Transaksi", data.id],
      ["Tanggal & Waktu", formatDate(data.timestamp)],
      ["Kode Sales", data.kodeSales],
      ["Cokim Terima", data.cokimTerima],
      ["Jenis Barang", data.jenisBarang],
      ["Surat", data.surat],
      ["Nama Toko", data.namaToko],
      ["Kadar Fisik", data.kadarFisik],
      ["Presentase Mesin", data.presentaseMesin !== "" && data.presentaseMesin != null ? `${data.presentaseMesin}%` : "-"],
      ["Kadar Mesin", data.kadarMesin],
      ["Kode Pabrik", data.kodePabrik],
      ["Berat Surat", data.beratSurat !== "" && data.beratSurat != null ? `${data.beratSurat} g` : "-"],
      ["Berat Fisik", data.beratFisik !== "" && data.beratFisik != null ? `${data.beratFisik} g` : "-"],
      ["Susut", data.susut !== "" && data.susut != null ? `${data.susut} g` : "-"],
      ["Berat Terima", data.beratTerima !== "" && data.beratTerima != null ? `${data.beratTerima} g` : "-"],
      ["Kondisi Perhiasan", data.kondisiPerhiasan],
      ["Model", data.model],
      ["Rate Terima", data.rateTerima],
      ["Harga/gram", formatRupiah(data.hargaPerGram)],
      ["Harga Terima", formatRupiah(data.hargaTerima)],
      ["Status Cetak", data.statusCetak],
    ];

    y = drawFieldRows(transaksiFields, y);

    // ------- HALAMAN BERIKUTNYA: DETAIL CUSTOMER + FOTO CUSTOMER -------
    doc.addPage();
    y = drawSectionTitle("DETAIL CUSTOMER", margin);

    if (customer) {
      y = drawFieldRows(
        [
          ["ID Customer", customer.idCustomer],
          ["Nama Customer", customer.nama],
          ["Jumlah Foto", customerPhotos.length],
        ],
        y,
      );

      if (customerPhotos.length) {
        y += 4;
        if (y > pageHeight - margin - 60) {
          doc.addPage();
          y = margin;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Foto Customer", margin, y);
        y += 6;

        const thumbBox = 58; // mm, area maksimum per foto (persegi)
        const gap = 6;
        let x = margin;

        for (let i = 0; i < customerPhotos.length; i++) {
          const img = customerPhotos[i];
          const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;

          if (x + thumbBox > pageWidth - margin) {
            x = margin;
            y += thumbBox + gap;
          }
          if (y + thumbBox > pageHeight - margin) {
            doc.addPage();
            y = margin;
            x = margin;
          }

          try {
            const natural = await getImageNaturalSize(dataUrl);
            const fitted = fitImageToArea(natural.width, natural.height, thumbBox, thumbBox);
            const offsetX = x + (thumbBox - fitted.width) / 2;
            const offsetY = y + (thumbBox - fitted.height) / 2;
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            doc.rect(x, y, thumbBox, thumbBox);
            doc.addImage(dataUrl, "JPEG", offsetX, offsetY, fitted.width, fitted.height);
          } catch (imgErr) {
            console.error("Gagal menempel foto customer ke PDF:", imgErr);
          }

          x += thumbBox + gap;
        }
        y += thumbBox + 8;
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text("Tidak ada foto customer tersimpan.", margin, y);
        y += 8;
      }
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("Transaksi ini tidak terhubung dengan data customer manapun.", margin, y);
    }

    // ------- HALAMAN BERIKUTNYA: 1 FOTO ITEM TRANSAKSI PER HALAMAN -------
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2 - 14; // sisakan ruang untuk label atas

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;

      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`${data.id || id} - Foto Barang ${i + 1} / ${images.length}`, pageWidth / 2, margin, {
        align: "center",
      });

      try {
        const natural = await getImageNaturalSize(dataUrl);
        const fitted = fitImageToArea(natural.width, natural.height, maxWidth, maxHeight);
        const x = (pageWidth - fitted.width) / 2;
        const yImg = margin + 8 + (maxHeight - fitted.height) / 2;
        doc.addImage(dataUrl, "JPEG", x, yImg, fitted.width, fitted.height);
      } catch (imgErr) {
        console.error("Gagal menempel gambar ke PDF:", imgErr);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.text("Gagal memuat gambar ini.", pageWidth / 2, margin + 30, { align: "center" });
      }
    }

    doc.save(`${data.id || id}.pdf`);
    showStatus(`PDF untuk ${data.id || id} berhasil dibuat.`, true);
  } catch (err) {
    console.error(err);
    showStatus(`Gagal membuat PDF: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
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
document.getElementById("filterCustomer").addEventListener("change", loadData);

document.getElementById("resetFilter").addEventListener("click", () => {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterDate").value = "";
  document.getElementById("filterStatus").value = "";
  document.getElementById("filterCustomer").value = "";
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
document.getElementById("pdfFromDetail").addEventListener("click", () => {
  if (currentDetailId) generatePdf(currentDetailId);
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
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  await loadCustomers();
  loadData();
});
