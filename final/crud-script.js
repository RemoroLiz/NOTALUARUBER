// ==============================
// KONFIGURASI
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyVmn3b1HiFMAuhPdtTieNYJVvrj38oNtLFK_uzXPlQKxquGinBKRVMaPDmBCsi4AM-/exec",
  PAGE_SIZE: 15,
  MAX_IMAGES: 10,
  MAX_IMAGE_DIMENSION: 1280, // px, sisi terpanjang setelah kompresi (BARU - untuk upload gambar tambahan saat edit)
  IMAGE_QUALITY: 0.7, // kualitas JPEG hasil kompresi
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
let selectedEditImages = []; // foto baru yang ditambahkan lewat modal edit (BARU)

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

/**
 * Format angka biasa (BUKAN mata uang) dengan separator ribuan
 * bertitik ala Indonesia - dipakai untuk field seperti Cokim & Rate
 * supaya tetap mudah dibaca di struk thermal yang fontnya kecil.
 */
function formatNumberID(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("id-ID");
}

/**
 * Menambahkan garis credit kecil "Dibuat oleh Kevin Uber" di bagian
 * bawah SETIAP halaman PDF yang sudah dibuat - dipanggil sekali di
 * akhir, tepat sebelum doc.save(), supaya jumlah halaman final sudah
 * pasti (termasuk halaman foto yang ditambahkan belakangan).
 */
function stampPdfCredit(doc, pageWidth, pageHeight) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text("Dibuat oleh Kevin Uber", pageWidth / 2, pageHeight - 6, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d)) return "-";
  // PENTING: timeZone dikunci ke "Asia/Jakarta" secara eksplisit -
  // BUG SEBELUMNYA: tanpa ini, browser memakai timezone perangkat
  // masing-masing (bisa berbeda-beda tiap laptop/HP), sehingga
  // tanggal & jam yang tampil di halaman Data Management bisa maju/
  // mundur satu hari dari tanggal transaksi sebenarnya (terutama
  // transaksi larut malam). Dengan timeZone dikunci, tampilan selalu
  // konsisten sesuai waktu Indonesia (WIB) berapa pun timezone
  // perangkat yang membuka halaman ini.
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

/**
 * (BARU) Menambahkan dukungan drag & drop file ke sebuah elemen
 * pembungkus upload. Lihat catatan lengkap pada fungsi yang sama di
 * script.js - perilakunya identik, hanya diduplikasi di sini karena
 * tiap halaman memakai file JS berdiri sendiri (tanpa modul bersama).
 */
function enableDragDrop(zoneEl, onFiles) {
  if (!zoneEl) return;
  ["dragenter", "dragover"].forEach((evt) => {
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneEl.classList.add("drag-over");
    });
  });
  ["dragleave", "dragend"].forEach((evt) => {
    zoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (evt === "dragleave" && zoneEl.contains(e.relatedTarget)) return;
      zoneEl.classList.remove("drag-over");
    });
  });
  zoneEl.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    zoneEl.classList.remove("drag-over");
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) onFiles(files);
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
            <div class="action-menu-wrap">
              <button class="btn-icon btn-action-toggle" data-id="${row.id}" title="Aksi"><i class="fas fa-bars"></i></button>
              <div class="action-dropdown" data-dropdown-id="${row.id}">
                <button class="action-dropdown-item btn-view" data-id="${row.id}"><i class="fas fa-eye"></i> Detail</button>
                <button class="action-dropdown-item btn-edit" data-id="${row.id}"><i class="fas fa-edit"></i> Edit</button>
                <button class="action-dropdown-item btn-print-customer" data-id="${row.id}"><i class="fas fa-receipt"></i> Cetak Customer</button>
                <button class="action-dropdown-item btn-print-store" data-id="${row.id}"><i class="fas fa-store"></i> Cetak Toko</button>
                <button class="action-dropdown-item btn-pdf" data-id="${row.id}"><i class="fas fa-file-pdf"></i> Cetak PDF</button>
                <button class="action-dropdown-item btn-delete" data-id="${row.id}"><i class="fas fa-trash"></i> Hapus</button>
              </div>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => { closeAllActionDropdowns(); showDetail(b.dataset.id); }));
  tableBody.querySelectorAll(".btn-edit").forEach((b) => b.addEventListener("click", () => { closeAllActionDropdowns(); openEditModal(b.dataset.id); }));
  tableBody.querySelectorAll(".btn-print-customer").forEach((b) => b.addEventListener("click", () => { closeAllActionDropdowns(); reprintCustomerById(b.dataset.id); }));
  tableBody.querySelectorAll(".btn-print-store").forEach((b) => b.addEventListener("click", () => { closeAllActionDropdowns(); reprintStoreById(b.dataset.id); }));
  tableBody.querySelectorAll(".btn-pdf").forEach((b) => b.addEventListener("click", () => { closeAllActionDropdowns(); generatePdf(b.dataset.id); }));
  tableBody.querySelectorAll(".btn-delete").forEach((b) => b.addEventListener("click", () => { closeAllActionDropdowns(); deleteRecord(b.dataset.id); }));

  tableBody.querySelectorAll(".btn-action-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const dropdown = btn.nextElementSibling;
      const wasOpen = dropdown.classList.contains("show");
      closeAllActionDropdowns();
      if (!wasOpen) dropdown.classList.add("show");
    });
  });
}

/**
 * Menu aksi per baris (BARU) - tadinya 5 ikon berjejer di setiap
 * baris membuat tabel melebar ke samping, terutama di layar sempit.
 * Sekarang dipadatkan jadi satu tombol "garis tiga" yang membuka
 * daftar aksi sebagai dropdown, ditutup lagi begitu salah satu aksi
 * diklik atau area lain di halaman diklik.
 */
function closeAllActionDropdowns() {
  document.querySelectorAll(".action-dropdown.show").forEach((d) => d.classList.remove("show"));
}

document.addEventListener("click", () => closeAllActionDropdowns());

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
    [
      "fa-user",
      "Customer",
      customer
        ? `${customer.nama} (${customer.idCustomer}) <button type="button" class="btn-edit-customer-inline" id="btnEditCustomerInline" title="Edit data customer di halaman Data Customer"><i class="fas fa-pen"></i></button>`
        : data.idCustomer || "-",
    ],
    ["fa-calendar", "Tanggal & Waktu", formatDate(data.timestamp)],
    ["fa-user-tag", "Kode Sales", data.kodeSales],
    ["fa-box-open", "Jenis Barang", data.jenisBarang],
    ["fa-file-contract", "Surat", data.surat],
    ["fa-store", "Nama Toko", data.namaToko || "-"],
    ["fa-percent", "Kadar Fisik", data.kadarFisik || "0"],
    ["fa-cogs", "Presentase Mesin", (data.presentaseMesin || "0") + "%"],
    ["fa-microchip", "Kadar Mesin", data.kadarMesin || "0"],
    ["fa-cut", "Presentase Potong", (data.presentasePotong || "0") + "%"],
    ["fa-cut", "Kadar Potong", data.kadarPotong || "0"],
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

  const imageSlots = [];
  for (let i = 1; i <= CONFIG.MAX_IMAGES; i++) imageSlots.push(i);
  const images = imageSlots.map((n) => data[`gambar${n}`]).filter(Boolean);
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

  const editCustomerBtn = document.getElementById("btnEditCustomerInline");
  if (editCustomerBtn && customer) {
    editCustomerBtn.addEventListener("click", () => {
      window.location.href = `customer.html?edit=${encodeURIComponent(customer.idCustomer)}`;
    });
  }
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
  { key: "presentasePotong", label: "Presentase Potong (%)", type: "number" },
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

  // ---- FOTO TAMBAHAN (BARU) ----
  // Hitung berapa slot foto yang masih kosong pada data ini, supaya
  // batas upload jelas (maks. total CONFIG.MAX_IMAGES per transaksi,
  // termasuk foto lama yang sudah ada).
  let existingCount = 0;
  for (let i = 1; i <= CONFIG.MAX_IMAGES; i++) {
    if (data[`gambar${i}`]) existingCount++;
  }
  selectedEditImages = [];
  renderEditImagePreviews();
  document.getElementById("editImageUpload").value = "";
  updateEditImageSlotInfo(existingCount);

  document.getElementById("editModal").classList.add("show");
}

// ==============================
// FOTO TAMBAHAN SAAT EDIT (BARU)
// ==============================
/**
 * Sama seperti compressImage di script.js (Form Input) - dipakai
 * supaya foto yang ditambahkan lewat modal edit juga dikompres
 * sebelum dikirim, bukan hanya foto yang diupload saat input awal.
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Gagal membaca file gambar"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("File bukan gambar yang valid"));
      img.onload = () => {
        let { width, height } = img;
        const maxDim = CONFIG.MAX_IMAGE_DIMENSION;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", CONFIG.IMAGE_QUALITY);
        const base64 = dataUrl.split(",")[1];
        const sizeKb = Math.round((base64.length * 0.75) / 1024);

        resolve({ dataUrl, base64, mimeType: "image/jpeg", sizeKb, fileName: file.name });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateEditImageSlotInfo(existingCount) {
  const remaining = Math.max(CONFIG.MAX_IMAGES - existingCount - selectedEditImages.length, 0);
  const info = document.getElementById("editImageSlotInfo");
  if (info) {
    info.textContent = `${existingCount} foto lama tersimpan, sisa ${remaining} slot`;
  }
}

function renderEditImagePreviews() {
  const container = document.getElementById("editImagePreviewContainer");
  if (!container) return;

  container.innerHTML = selectedEditImages
    .map(
      (img, idx) => `
      <div class="image-preview-item">
        <img src="${img.dataUrl}" alt="foto tambahan ${idx + 1}" />
        <span class="image-size-tag">${img.sizeKb} KB</span>
        <button type="button" class="remove-image remove-edit-image" data-idx="${idx}" title="Hapus">&times;</button>
      </div>`,
    )
    .join("");

  container.querySelectorAll(".remove-edit-image").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEditImages.splice(parseInt(btn.dataset.idx, 10), 1);
      renderEditImagePreviews();
      const data = findById(currentEditId);
      let existingCount = 0;
      if (data) {
        for (let i = 1; i <= CONFIG.MAX_IMAGES; i++) {
          if (data[`gambar${i}`]) existingCount++;
        }
      }
      updateEditImageSlotInfo(existingCount);
    });
  });

  const countLabel = document.getElementById("selectedEditImageCount");
  if (countLabel) countLabel.textContent = `${selectedEditImages.length} foto baru dipilih`;
}

async function handleEditImageSelection(fileList) {
  const data = findById(currentEditId);
  let existingCount = 0;
  if (data) {
    for (let i = 1; i <= CONFIG.MAX_IMAGES; i++) {
      if (data[`gambar${i}`]) existingCount++;
    }
  }

  const remainingSlots = CONFIG.MAX_IMAGES - existingCount - selectedEditImages.length;
  const files = Array.from(fileList);

  if (remainingSlots <= 0) {
    showStatus(`Slot foto sudah penuh (maksimal ${CONFIG.MAX_IMAGES} foto per transaksi).`, false);
    return;
  }

  const toProcess = files.slice(0, remainingSlots);
  if (files.length > remainingSlots) {
    showStatus(`Hanya ${remainingSlots} foto ditambahkan (sisa slot terbatas).`, false);
  }

  for (const file of toProcess) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const compressed = await compressImage(file);
      selectedEditImages.push(compressed);
    } catch (err) {
      showStatus(`Gagal memproses foto ${file.name}: ${err.message}`, false);
    }
  }

  renderEditImagePreviews();
  updateEditImageSlotInfo(existingCount);
}

function recalcForEdit(values) {
  const presentase = parseFloat(values.presentaseMesin) || 0;
  values.kadarMesin = presentase ? ((presentase / 100) * 24).toFixed(2) : "";

  const presentasePotong = parseFloat(values.presentasePotong) || 0;
  values.kadarPotong = presentasePotong ? ((presentasePotong / 100) * 24).toFixed(2) : "";

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

  const images = selectedEditImages.map((img) => ({ data: img.base64, mimeType: img.mimeType }));

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage(images.length ? "Menyimpan perubahan & mengupload foto..." : "Menyimpan perubahan...");

  try {
    await apiPost({ action: "update", id: currentEditId, data: values, images });
    document.getElementById("editModal").classList.remove("show");
    selectedEditImages = [];
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
      <div class="tr-title">TOKO MAS PANTES UBER</div>
      <div class="tr-address">Jl. A.H. Nasution No.219, Pasirjati, Kecamatan Ujung Berung, Bandung</div>
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
  //
  // Field identitas (Jenis, Cokim) dipisah dari field detail berikutnya
  // dengan garis pemisah tersendiri.
  const identityFields = [
    ["Jenis", v.jenisBarang || "-"],
    ["Cokim", formatNumberID(v.cokimTerima)],
  ];

  const detailFields = [
    ["Surat", v.surat || "-"],
    ["Sales", v.kodeSales || "-"],
    ["Toko", v.namaToko || "-"],
    ["Kadar Fisik", v.kadarFisik || "-"],
    ["Kadar Mesin", v.kadarMesin || "-"],
    ["% Mesin", v.presentaseMesin ? `${v.presentaseMesin}%` : "-"],
    ["Kode Pabrik", v.kodePabrik || "-"],
    ["% Potong", v.presentasePotong ? `${v.presentasePotong}%` : "-"],
    ["Kadar Potong", v.kadarPotong || "-"],
    ["Berat Surat", v.beratSurat ? `${v.beratSurat} g` : "-"],
    ["Berat Fisik", v.beratFisik ? `${v.beratFisik} g` : "-"],
    ["Susut", v.susut ? `${v.susut} g` : "-"],
    ["Berat Terima", v.beratTerima ? `${v.beratTerima} g` : "-"],
    ["Kondisi", v.kondisiPerhiasan || "-"],
    ["Model", v.model || "-"],
    ["Rate", v.rateTerima || "-"],
    ["Harga/gram", formatRupiah(v.hargaPerGram)],
  ];

  const renderRows = (arr) =>
    arr
      .map(
        ([label, value]) => `<div class="tr-row"><span class="k">${label}</span><span class="v">${value}</span></div>`,
      )
      .join("");

  return `
    <div class="thermal-receipt">
      <div class="tr-title">LAPORAN NOTA LUAR UBER</div>
      <div class="tr-sub">${id} &middot; ${formatDate(v.timestamp)}</div>
      <hr />
      ${renderRows(identityFields)}
      <hr />
      ${renderRows(detailFields)}
      <hr />
      <div class="tr-total"><span>HARGA TERIMA</span><span>${formatRupiah(v.hargaTerima)}</span></div>
      <div class="tr-footer tr-footer-note">Sudah di uji, potong, amplas dan gosok</div>
      <div class="tr-credit">by Kevin Uber</div>
    </div>`;
}

/**
 * CSS struk thermal untuk printer POS-58 / BM9000 dengan kertas roll
 * 57mm. Lebar KONTEN sengaja dibuat 48mm (bukan 57-58mm penuh) karena
 * kepala cetak printer kelas ini rata-rata hanya ~48mm walau kertas
 * fisiknya 57-58mm - inilah sebab teks selalu terpotong rata di kiri
 * & kanan ("adar Fisik", "arga/gram") ketika konten dibuat selebar
 * kertas penuh. "size: ... auto" membuat tinggi halaman mengikuti
 * panjang konten, bukan angka tetap - menghindari halaman kosong
 * berlebih maupun konten yang terpotong secara vertikal.
 */
const THERMAL_PRINT_STYLE = `
  @page { size: 48mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 48mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .thermal-receipt {
    width: 48mm;
    /* Padding kiri sengaja jauh lebih besar dari kanan (top right
       bottom left) - kompensasi "unprintable margin" bawaan
       hardware/driver printer thermal di tepi kiri kertas, yang
       tidak bisa dikontrol lewat @page margin. Kalau printer masih
       memotong sedikit, cukup naikkan angka 5mm di baris ini saja. */
    padding: 1.5mm 2mm 1.5mm 5mm;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
  .thermal-receipt .tr-title { text-align: center; font-size: 10.5pt; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 1.2mm; }
  .thermal-receipt .tr-address { text-align: center; font-size: 6.3pt; line-height: 1.3; margin-bottom: 1.5mm; color: #333; }
  .thermal-receipt .tr-sub { text-align: center; font-size: 8pt; margin-bottom: 1.8mm; }
  .thermal-receipt hr { border: none; border-top: 0.4mm dashed #000; margin: 1.2mm 0; }
  .thermal-receipt .tr-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: 8.5pt; line-height: 1.55; }
  .thermal-receipt .tr-row .k { white-space: nowrap; }
  .thermal-receipt .tr-row .v { font-weight: 700; text-align: right; word-break: break-word; }
  .thermal-receipt .tr-total { font-size: 9.5pt; font-weight: 700; display: flex; justify-content: space-between; margin-top: 1.5mm; }
  .thermal-receipt .tr-footer { text-align: center; font-size: 7.5pt; margin-top: 1.8mm; }
  .thermal-receipt .tr-credit { text-align: center; font-size: 6pt; color: #888; margin-top: 1.5mm; }
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

/**
 * CETAK TERPISAH (BARU) - struk customer dan laporan toko sekarang
 * masing-masing 1 print job SENDIRI (bukan digabung dalam 1
 * dokumen), supaya keduanya bisa dicetak ulang secara independen.
 */
async function printCustomerReceipt(id, v) {
  await printThermalDocument(buildCustomerReceipt(id, v));
}

async function printStoreReceipt(id, v) {
  await printThermalDocument(buildStoreReceipt(id, v));
}

async function reprintCustomerById(id) {
  const data = findById(id);
  if (!data) return;
  await printCustomerReceipt(id, data);
  try {
    await apiPost({ action: "markPrinted", id });
    await loadData();
  } catch (err) {
    console.error("Gagal menandai status cetak:", err);
  }
}

async function reprintStoreById(id) {
  const data = findById(id);
  if (!data) return;
  await printStoreReceipt(id, data);
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
          timeZone: "Asia/Jakarta",
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
      ["Cokim Terima", formatNumberID(data.cokimTerima)],
      ["Jenis Barang", data.jenisBarang],
      ["Surat", data.surat],
      ["Nama Toko", data.namaToko],
      ["Kadar Fisik", data.kadarFisik],
      ["Presentase Mesin", data.presentaseMesin !== "" && data.presentaseMesin != null ? `${data.presentaseMesin}%` : "-"],
      ["Kadar Mesin", data.kadarMesin],
      ["Presentase Potong", data.presentasePotong !== "" && data.presentasePotong != null ? `${data.presentasePotong}%` : "-"],
      ["Kadar Potong", data.kadarPotong],
      ["Kode Pabrik", data.kodePabrik],
      ["Berat Surat", data.beratSurat !== "" && data.beratSurat != null ? `${data.beratSurat} g` : "-"],
      ["Berat Fisik", data.beratFisik !== "" && data.beratFisik != null ? `${data.beratFisik} g` : "-"],
      ["Susut", data.susut !== "" && data.susut != null ? `${data.susut} g` : "-"],
      ["Berat Terima", data.beratTerima !== "" && data.beratTerima != null ? `${data.beratTerima} g` : "-"],
      ["Kondisi Perhiasan", data.kondisiPerhiasan],
      ["Model", data.model],
      ["Rate Terima", formatNumberID(data.rateTerima)],
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

    stampPdfCredit(doc, pageWidth, pageHeight);
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
  selectedEditImages = [];
});
document.getElementById("editModal").addEventListener("click", (e) => {
  if (e.target.id === "editModal") e.currentTarget.classList.remove("show");
});
document.getElementById("cancelEdit").addEventListener("click", () => {
  document.getElementById("editModal").classList.remove("show");
  selectedEditImages = [];
});
document.getElementById("saveEdit").addEventListener("click", saveEdit);

document.getElementById("editImageUpload").addEventListener("change", (e) => {
  handleEditImageSelection(e.target.files);
  e.target.value = "";
});

// (BARU) Drag & drop foto tambahan langsung ke area upload di modal edit
enableDragDrop(document.getElementById("editImageUpload").closest(".image-upload-container"), (files) => {
  handleEditImageSelection(files);
});

document.getElementById("printCustomerFromDetail").addEventListener("click", () => {
  if (currentDetailId) reprintCustomerById(currentDetailId);
});
document.getElementById("printStoreFromDetail").addEventListener("click", () => {
  if (currentDetailId) reprintStoreById(currentDetailId);
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

// Laporan WA sekarang di halaman Data Induk (induk.html)

// ==============================
// INIT
// ==============================
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  await loadCustomers();
  loadData();
});
