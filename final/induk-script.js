// ==============================
// KONFIGURASI
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzuhc_5prdNNQR8__9Ztl1p06gLPqnJXPy9eALH6_qkBeRiFTijirO3NiTqYAZ7Zolr/exec",
  MAX_IMAGE_DIMENSION: 1280, // px, sisi terpanjang setelah kompresi
  IMAGE_QUALITY: 0.7, // kualitas JPEG hasil kompresi
};

// ==============================
// STATE
// ==============================
let allInduk = []; // [{ nomorInduk, idCustomer, tanggal, jam, createdAt, jumlahBarang }]
let filteredInduk = [];
let allCustomers = []; // untuk lookup nama & no HP by idCustomer

// Dokumen induk (BARU) - foto MOU/KTP/Foto Customer yang baru dipilih
// tapi BELUM disimpan ke server, untuk induk yang sedang dibuka di
// modal detail. Direset setiap kali modal detail dibuka/ditutup.
let pendingIndukDocFiles = { mou: null, ktp: null, fotoCustomer: null };
const INDUK_DOC_LABELS = { mou: "Foto MOU", ktp: "Foto KTP", fotoCustomer: "Foto Customer" };

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
  return `Rp ${num.toLocaleString("id-ID")}`;
}

/**
 * Format angka biasa (bukan mata uang) dengan separator ribuan
 * bertitik ala Indonesia - dipakai untuk Cokim & Rate supaya jelas
 * terbaca di laporan WhatsApp maupun PDF.
 */
function formatNumberID(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("id-ID");
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

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

/**
 * Sama seperti compressImage di script.js/crud-script.js/
 * customer-script.js - dipakai supaya foto dokumen induk (MOU/KTP/
 * Foto Customer) juga dikompres sebelum dikirim ke server.
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

        resolve({ dataUrl, base64, mimeType: "image/jpeg" });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==============================
// MUAT & RENDER DATA
// ==============================
async function loadInduk() {
  const loadingEl = document.getElementById("loadingData");
  const noDataEl = document.getElementById("noDataMessage");
  const tableBody = document.getElementById("tableBody");

  loadingEl.classList.add("show");
  noDataEl.classList.remove("show");
  tableBody.innerHTML = "";

  try {
    const [indukResult, customerResult] = await Promise.all([
      apiGet({ action: "induklist" }),
      apiGet({ action: "customerlist" }),
    ]);
    allInduk = indukResult.data || [];
    allCustomers = customerResult.data || [];
    applyFilter();
    document.getElementById("connectionText").textContent = "Terhubung ke Spreadsheet";
  } catch (err) {
    showStatus(`Gagal memuat data induk transaksi: ${err.message}`, false, 7000);
    document.getElementById("connectionText").textContent = "Mode Offline";
  } finally {
    loadingEl.classList.remove("show");
  }
}

function findCustomerById(idCustomer) {
  return allCustomers.find((c) => String(c.idCustomer) === String(idCustomer));
}

function applyFilter() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();

  filteredInduk = !q
    ? allInduk.slice()
    : allInduk.filter((induk) => {
        const customer = findCustomerById(induk.idCustomer);
        return (
          String(induk.nomorInduk).toLowerCase().includes(q) ||
          (customer && String(customer.nama).toLowerCase().includes(q)) ||
          (customer && String(customer.noHp || "").toLowerCase().includes(q))
        );
      });

  // allInduk sudah diurutkan dari backend (paling baru dibuat di
  // atas) - filter di atas hanya menyaring, urutan relatif tetap
  // terjaga, tidak perlu di-sort ulang di sini.
  renderTable();
}

function renderTable() {
  const tableBody = document.getElementById("tableBody");
  const noDataEl = document.getElementById("noDataMessage");

  document.getElementById("totalRecords").textContent = `Total: ${filteredInduk.length} induk transaksi`;

  if (!filteredInduk.length) {
    tableBody.innerHTML = "";
    noDataEl.classList.add("show");
    return;
  }
  noDataEl.classList.remove("show");

  tableBody.innerHTML = filteredInduk
    .map((induk, idx) => {
      const customer = findCustomerById(induk.idCustomer);
      const customerCell = customer
        ? `<span class="customer-tag"><i class="fas fa-user"></i> ${customer.nama} <span class="cust-id-tag">${customer.noHp || induk.idCustomer}</span></span>`
        : induk.idCustomer || "-";

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${induk.nomorInduk}</strong></td>
          <td>${customerCell}</td>
          <td>${formatDate(induk.timestamp)}</td>
          <td><span class="badge badge-success">${induk.jumlahBarang || 0} barang</span></td>
          <td>
            <div class="action-buttons">
              <button class="btn-icon btn-view" data-id="${induk.nomorInduk}" title="Detail"><i class="fas fa-eye"></i></button>
              <button class="btn-icon btn-pdf" data-id="${induk.nomorInduk}" title="Download PDF Laporan"><i class="fas fa-file-pdf"></i></button>
              <button class="btn-icon btn-wa" data-id="${induk.nomorInduk}" title="Laporan WA"><i class="fab fa-whatsapp"></i></button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => openIndukDetail(b.dataset.id)));
  tableBody.querySelectorAll(".btn-pdf").forEach((b) => b.addEventListener("click", () => generateIndukPdf(b.dataset.id)));
  tableBody.querySelectorAll(".btn-wa").forEach((b) => b.addEventListener("click", () => generateWhatsappReport(b.dataset.id)));
}

// ==============================
// DETAIL INDUK
// ==============================
async function openIndukDetail(nomorInduk) {
  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Memuat detail induk transaksi...");

  try {
    const result = await apiGet({ action: "indukgetbyid", id: nomorInduk });
    const customer = result.customer;

    document.getElementById("indukDetailLabel").textContent = nomorInduk;

    const items = (result.items || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let html = `
      <div class="detail-grid">
        <div class="detail-item">
          <div class="detail-label"><i class="fas fa-receipt"></i> Nomor Induk</div>
          <div class="detail-value">${result.induk.nomorInduk}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fas fa-calendar"></i> Dibuat</div>
          <div class="detail-value">${formatDate(result.induk.timestamp)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fas fa-user"></i> Customer</div>
          <div class="detail-value">${customer ? `${customer.nama} (${customer.idCustomer})` : "-"}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label"><i class="fas fa-phone"></i> No HP</div>
          <div class="detail-value">${customer ? customer.noHp || "-" : "-"}</div>
        </div>
      </div>
      <div class="induk-detail-items">
        <div class="induk-items-title"><i class="fas fa-box"></i> Barang (${items.length})</div>
        ${
          items.length
            ? items
                .map(
                  (item) => `
              <div class="induk-item-row">
                <div>
                  <strong>${item.id}</strong>
                  <span class="chip-jenis">- ${item.jenisBarang || "-"}</span>
                </div>
                <div>${formatRupiah(item.hargaTerima)}</div>
                <div><span class="badge ${item.statusCetak === "SUDAH CETAK" ? "badge-success" : "badge-warning"}">${item.statusCetak || "BELUM CETAK"}</span></div>
              </div>`,
                )
                .join("")
            : '<p class="edit-image-hint">Belum ada barang tersimpan di induk ini.</p>'
        }
      </div>`;

    document.getElementById("indukDetailContent").innerHTML = html;
    document.getElementById("indukDetailModal").classList.add("show");
    document.getElementById("indukDetailModal").dataset.nomorInduk = nomorInduk;

    // Reset pilihan foto dokumen yang belum disimpan (BARU), lalu
    // tampilkan foto yang sudah tersimpan (kalau ada) di masing-masing
    // slot MOU / KTP / Foto Customer.
    pendingIndukDocFiles = { mou: null, ktp: null, fotoCustomer: null };
    renderIndukDocPreviews(result.induk);
  } catch (err) {
    showStatus(`Gagal memuat detail: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
}

// ==============================
// DOKUMEN INDUK (BARU) - upload/ganti foto MOU, foto KTP, dan foto
// customer saat transaksi. Minimal 3 foto per Nomor Induk (satu per
// jenis dokumen). Upload baru MENGGANTI foto lama pada slot yang sama.
// ==============================
const INDUK_DOC_COLUMN_KEY = { mou: "fotoMou", ktp: "fotoKtp", fotoCustomer: "fotoCustomerTransaksi" };

/**
 * Menampilkan foto yang SUDAH TERSIMPAN di server untuk ketiga slot
 * dokumen induk. Dipanggil setiap kali modal detail dibuka supaya
 * selalu menampilkan kondisi terbaru dari server (bukan sisa render
 * sebelumnya).
 */
function renderIndukDocPreviews(induk) {
  Object.keys(INDUK_DOC_COLUMN_KEY).forEach((docType) => {
    const url = induk ? induk[INDUK_DOC_COLUMN_KEY[docType]] : "";
    const previewEl = document.getElementById(`indukDocPreview-${docType}`);
    const slotEl = document.getElementById(`indukDocSlot-${docType}`);
    const statusEl = document.getElementById(`indukDocStatus-${docType}`);
    if (!previewEl || !slotEl || !statusEl) return;

    statusEl.textContent = "";
    statusEl.classList.remove("pending");

    if (url) {
      const thumb = getDriveThumbnailUrl(url);
      previewEl.innerHTML = `<a href="${url}" target="_blank" rel="noopener"><img src="${thumb}" alt="${INDUK_DOC_LABELS[docType]}" /></a>`;
      slotEl.classList.add("has-photo");
    } else {
      previewEl.innerHTML = '<span class="induk-doc-preview-empty">Belum ada foto</span>';
      slotEl.classList.remove("has-photo");
    }
  });
}

/**
 * Dipanggil saat user memilih file baru di salah satu slot dokumen -
 * langsung dikompres dan ditampilkan sebagai preview LOKAL (belum
 * dikirim ke server sampai tombol "Simpan Dokumen Induk" ditekan),
 * supaya user bisa mengganti beberapa slot sekaligus dalam satu kali
 * simpan.
 */
async function handleIndukDocFileSelect(docType, file) {
  if (!file) return;
  const statusEl = document.getElementById(`indukDocStatus-${docType}`);
  const previewEl = document.getElementById(`indukDocPreview-${docType}`);
  const slotEl = document.getElementById(`indukDocSlot-${docType}`);

  try {
    statusEl.textContent = "Memproses foto...";
    const compressed = await compressImage(file);
    pendingIndukDocFiles[docType] = compressed;
    previewEl.innerHTML = `<img src="${compressed.dataUrl}" alt="${INDUK_DOC_LABELS[docType]} (baru)" />`;
    slotEl.classList.add("has-photo");
    statusEl.textContent = "Foto baru dipilih, klik Simpan untuk mengunggah.";
    statusEl.classList.add("pending");
  } catch (err) {
    showStatus(`Gagal memproses foto ${INDUK_DOC_LABELS[docType]}: ${err.message}`, false, 7000);
  }
}

/**
 * Mengunggah SEMUA foto dokumen yang baru dipilih (bisa 1, 2, atau 3
 * sekaligus) dalam satu panggilan ke backend.
 */
async function saveIndukDocs() {
  const nomorInduk = document.getElementById("indukDetailModal").dataset.nomorInduk;
  if (!nomorInduk) return;

  const docs = {};
  let hasAny = false;
  Object.keys(pendingIndukDocFiles).forEach((docType) => {
    const file = pendingIndukDocFiles[docType];
    if (file) {
      docs[docType] = { data: file.base64, mimeType: file.mimeType };
      hasAny = true;
    }
  });

  if (!hasAny) {
    showStatus("Pilih minimal satu foto (MOU/KTP/Foto Customer) sebelum menyimpan.", false);
    return;
  }

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Mengunggah dokumen induk...");

  try {
    const result = await apiPost({ action: "indukuploadphotos", nomorInduk, docs });
    pendingIndukDocFiles = { mou: null, ktp: null, fotoCustomer: null };
    renderIndukDocPreviews(result.data);
    showStatus("Dokumen induk berhasil disimpan.", true);
  } catch (err) {
    showStatus(`Gagal menyimpan dokumen induk: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
}

// ==============================
// LAPORAN WHATSAPP (dipindah dari halaman Data Management) -
// berdasarkan Nomor Induk Transaksi, memuat SEMUA barang (NOTLU) di
// bawah induk yang sama dalam satu file .txt siap tempel ke WhatsApp.
// ==============================

/**
 * Field yang HARUS diberi tanda ❌ kalau kosong: Surat, Toko,
 * Kadar Fisik, Kode Pabrik, Berat Surat, Berat Fisik. Field lain di
 * luar daftar ini cukup ditandai "-".
 */
function waFieldValue(value, useCrossWhenEmpty) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return useCrossWhenEmpty ? "❌" : "-";
  }
  return String(value);
}

function waWeightValue(value, useCrossWhenEmpty) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return useCrossWhenEmpty ? "❌" : "-";
  }
  return `${value} g`;
}

function waPercentValue(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  return `${value}%`;
}

function buildWhatsappReportText(induk, customer, items) {
  const SEP = "-------------------------------------------------------------------";
  const lines = [];

  lines.push(`Kode Induk : ${induk.nomorInduk}`);
  lines.push(`Nama Customer : ${customer ? customer.nama : "-"}`);
  lines.push(`No HP : ${customer && customer.noHp ? customer.noHp : "-"}`);
  lines.push("");

  const sortedItems = items.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  sortedItems.forEach((item) => {
    lines.push(SEP);
    lines.push(item.id);
    lines.push("🏎‍🟀TERIMA NOTALUAR UBER💨");
    lines.push("");
    lines.push(`Kode Transaksi : ${item.id}`);
    lines.push(`Waktu & Tanggal : ${formatDate(item.timestamp)}`);
    lines.push("");
    lines.push(SEP);
    lines.push(`Jenis : ${waFieldValue(item.jenisBarang, false)}`);
    lines.push(`Cokim : ${waFieldValue(item.cokimTerima, false) === "-" ? "-" : formatNumberID(item.cokimTerima)}`);
    lines.push(`Surat : ${waFieldValue(item.surat, true)}`);
    lines.push(`Sales : ${waFieldValue(item.kodeSales, false)}`);
    lines.push(`Toko : ${waFieldValue(item.namaToko, true)}`);
    lines.push(`Kadar Fisik : ${waFieldValue(item.kadarFisik, true)}`);
    lines.push(`Kadar Mesin : ${waFieldValue(item.kadarMesin, false)}`);
    lines.push(`% Mesin : ${waPercentValue(item.presentaseMesin)}`);
    lines.push(`Kode Pabrik : ${waFieldValue(item.kodePabrik, true)}`);
    lines.push(`% Potong : ${waPercentValue(item.presentasePotong)}`);
    lines.push(`Kadar Potong : ${waFieldValue(item.kadarPotong, false)}`);
    lines.push(`Berat Surat : ${waWeightValue(item.beratSurat, true)}`);
    lines.push(`Berat Fisik : ${waWeightValue(item.beratFisik, true)}`);
    lines.push(`Susut : ${waWeightValue(item.susut, false)}`);
    lines.push(`Berat Terima : ${waWeightValue(item.beratTerima, false)}`);
    lines.push(`Kondisi : ${waFieldValue(item.kondisiPerhiasan, false)}`);
    lines.push(`Model : ${waFieldValue(item.model, false)}`);
    lines.push(`Rate yang di pakai : ${item.rateTerima ? `${formatNumberID(item.rateTerima)}%` : "-"}`);
    lines.push(`Harga/gram : ${formatRupiah(item.hargaPerGram)}`);
    lines.push(`HARGA TERIMA : ${formatRupiah(item.hargaTerima)}`);
    lines.push("Sudah di uji, potong, amplas dan");
    lines.push("gosok");
    lines.push("");
    lines.push("🏎‍🟀 Izin Proses Terima kasih 💨");
  });

  lines.push(SEP);

  return lines.join("\n");
}

async function generateWhatsappReport(nomorInduk) {
  if (!nomorInduk) {
    showStatus("Nomor induk tidak valid.", false);
    return;
  }

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Menyusun laporan WhatsApp...");

  try {
    const result = await apiGet({ action: "indukgetbyid", id: nomorInduk });
    const txt = buildWhatsappReportText(result.induk, result.customer, result.items);
    showWaReportModal(nomorInduk, txt);
  } catch (err) {
    console.error(err);
    showStatus(`Gagal menyusun laporan WA: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
}

function showWaReportModal(nomorInduk, txt) {
  document.getElementById("waReportIndukLabel").textContent = nomorInduk;
  const textarea = document.getElementById("waReportTextarea");
  textarea.value = txt;
  textarea.dataset.nomorInduk = nomorInduk;
  document.getElementById("waReportModal").classList.add("show");
}

// ==============================
// DOWNLOAD PDF LAPORAN INDUK (BARU) - mencakup SEMUA barang di
// bawah satu Nomor Induk Transaksi (bukan hanya 1 barang seperti PDF
// di halaman Data Management), termasuk foto tiap barang, foto
// customer, dan dokumen induk (MOU/KTP/Foto Customer saat transaksi).
// ==============================
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

/**
 * Menambahkan garis credit kecil "Dibuat oleh Kevin Uber" di bagian
 * bawah SETIAP halaman PDF - dipanggil sekali di akhir, tepat sebelum
 * doc.save(), supaya jumlah halaman final sudah pasti.
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

async function addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, titleText) {
  doc.addPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(titleText, pageWidth / 2, margin, { align: "center" });

  const maxWidth = pageWidth - margin * 2;
  const maxHeight = pageHeight - margin * 2 - 14;

  try {
    const natural = await getImageNaturalSize(dataUrl);
    const fitted = fitImageToArea(natural.width, natural.height, maxWidth, maxHeight);
    const x = (pageWidth - fitted.width) / 2;
    const y = margin + 8 + (maxHeight - fitted.height) / 2;
    doc.addImage(dataUrl, "JPEG", x, y, fitted.width, fitted.height);
  } catch (imgErr) {
    console.error("Gagal menempel gambar ke PDF laporan induk:", imgErr);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("Gagal memuat gambar ini.", pageWidth / 2, margin + 30, { align: "center" });
  }
}

async function generateIndukPdf(nomorInduk) {
  if (!nomorInduk) {
    showStatus("Nomor induk tidak valid.", false);
    return;
  }

  if (!window.jspdf) {
    showStatus("Library PDF gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.", false, 7000);
    return;
  }

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Mengambil seluruh data & gambar induk transaksi...");

  try {
    const result = await apiGet({ action: "indukgetallimages", id: nomorInduk });
    const induk = result.induk || {};
    const customer = result.customer;
    const customerPhotos = result.customerPhotos || [];
    const items = (result.items || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const itemImagesMap = {};
    (result.itemImages || []).forEach((entry) => {
      itemImagesMap[entry.id] = entry.images || [];
    });
    const indukDocs = result.indukDocs || {};

    updateLoadingMessage("Menyusun file PDF...");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const labelWidth = 52;

    // ------- HALAMAN 1: COVER -------
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("LAPORAN INDUK TRANSAKSI UBER EMAS", pageWidth / 2, 40, { align: "center" });

    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.8);
    doc.line(30, 46, pageWidth - 30, 46);

    doc.setFontSize(20);
    doc.text(String(induk.nomorInduk || nomorInduk), pageWidth / 2, 68, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(formatDate(induk.timestamp), pageWidth / 2, 80, { align: "center" });

    if (customer) {
      doc.setFontSize(11);
      doc.text(`Customer: ${customer.nama} (${customer.idCustomer})`, pageWidth / 2, 90, { align: "center" });
      doc.text(`No HP: ${customer.noHp || "-"}`, pageWidth / 2, 97, { align: "center" });
    }

    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${items.length} barang (NOTLU) tercakup dalam induk ini`,
      pageWidth / 2,
      pageHeight - 20,
      { align: "center", maxWidth: pageWidth - margin * 2 },
    );
    doc.setTextColor(0, 0, 0);

    // ------- HELPER: render daftar label-value -------
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

    // ------- HALAMAN 2: DETAIL CUSTOMER -------
    doc.addPage();
    let y = drawSectionTitle("DETAIL CUSTOMER", margin);
    if (customer) {
      y = drawFieldRows(
        [
          ["ID Customer", customer.idCustomer],
          ["Nama Customer", customer.nama],
          ["No HP", customer.noHp],
        ],
        y,
      );
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("Induk ini tidak terhubung dengan data customer manapun.", margin, y);
      y += 8;
    }

    // ------- HALAMAN 2 (lanjutan): RINGKASAN SEMUA BARANG -------
    y += 4;
    y = drawSectionTitle("RINGKASAN BARANG", y);
    if (items.length) {
      items.forEach((item, idx) => {
        y = drawFieldRows(
          [
            [`${idx + 1}. ${item.id}`, `${item.jenisBarang || "-"} - ${formatRupiah(item.hargaTerima)} - ${item.statusCetak || "BELUM CETAK"}`],
          ],
          y,
        );
      });
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("Belum ada barang tersimpan di induk ini.", margin, y);
    }

    // ------- HALAMAN BERIKUTNYA: DETAIL LENGKAP TIAP BARANG -------
    items.forEach((item) => {
      doc.addPage();
      let iy = drawSectionTitle(`DETAIL BARANG - ${item.id}`, margin);
      const fields = [
        ["ID Transaksi", item.id],
        ["Tanggal & Waktu", formatDate(item.timestamp)],
        ["Kode Sales", item.kodeSales],
        ["Cokim Terima", formatNumberID(item.cokimTerima)],
        ["Jenis Barang", item.jenisBarang],
        ["Surat", item.surat],
        ["Nama Toko", item.namaToko],
        ["Kadar Fisik", item.kadarFisik],
        ["Presentase Mesin", item.presentaseMesin !== "" && item.presentaseMesin != null ? `${item.presentaseMesin}%` : "-"],
        ["Kadar Mesin", item.kadarMesin],
        ["Presentase Potong", item.presentasePotong !== "" && item.presentasePotong != null ? `${item.presentasePotong}%` : "-"],
        ["Kadar Potong", item.kadarPotong],
        ["Kode Pabrik", item.kodePabrik],
        ["Berat Surat", item.beratSurat !== "" && item.beratSurat != null ? `${item.beratSurat} g` : "-"],
        ["Berat Fisik", item.beratFisik !== "" && item.beratFisik != null ? `${item.beratFisik} g` : "-"],
        ["Susut", item.susut !== "" && item.susut != null ? `${item.susut} g` : "-"],
        ["Berat Terima", item.beratTerima !== "" && item.beratTerima != null ? `${item.beratTerima} g` : "-"],
        ["Kondisi Perhiasan", item.kondisiPerhiasan],
        ["Model", item.model],
        ["Rate Terima", formatNumberID(item.rateTerima)],
        ["Harga/gram", formatRupiah(item.hargaPerGram)],
        ["Harga Terima", formatRupiah(item.hargaTerima)],
        ["Status Cetak", item.statusCetak],
      ];
      drawFieldRows(fields, iy);
    });

    // ------- FOTO CUSTOMER -------
    for (let i = 0; i < customerPhotos.length; i++) {
      const img = customerPhotos[i];
      const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
      await addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, `Foto Customer ${i + 1} / ${customerPhotos.length}`);
    }

    // ------- DOKUMEN INDUK: MOU / KTP / FOTO CUSTOMER SAAT TRANSAKSI -------
    for (const docType of ["mou", "ktp", "fotoCustomer"]) {
      const img = indukDocs[docType];
      if (!img) continue;
      const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
      await addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, INDUK_DOC_LABELS[docType]);
    }

    // ------- FOTO TIAP BARANG -------
    for (const item of items) {
      const images = itemImagesMap[item.id] || [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
        await addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, `${item.id} - Foto Barang ${i + 1} / ${images.length}`);
      }
    }

    stampPdfCredit(doc, pageWidth, pageHeight);
    doc.save(`Laporan-${induk.nomorInduk || nomorInduk}.pdf`);
    showStatus(`PDF laporan induk ${induk.nomorInduk || nomorInduk} berhasil dibuat.`, true);
  } catch (err) {
    console.error(err);
    showStatus(`Gagal membuat PDF laporan induk: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
}

// ==============================
// EVENTS
// ==============================
document.getElementById("searchInput").addEventListener("input", applyFilter);
document.getElementById("resetFilter").addEventListener("click", () => {
  document.getElementById("searchInput").value = "";
  applyFilter();
});

document.getElementById("closeIndukDetailModal").addEventListener("click", () => {
  document.getElementById("indukDetailModal").classList.remove("show");
});
document.getElementById("indukDetailModal").addEventListener("click", (e) => {
  if (e.target.id === "indukDetailModal") e.currentTarget.classList.remove("show");
});
document.getElementById("waFromIndukDetail").addEventListener("click", () => {
  const nomorInduk = document.getElementById("indukDetailModal").dataset.nomorInduk;
  if (nomorInduk) generateWhatsappReport(nomorInduk);
});
document.getElementById("pdfFromIndukDetail").addEventListener("click", () => {
  const nomorInduk = document.getElementById("indukDetailModal").dataset.nomorInduk;
  if (nomorInduk) generateIndukPdf(nomorInduk);
});

["mou", "ktp", "fotoCustomer"].forEach((docType) => {
  document.getElementById(`indukDocInput-${docType}`).addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleIndukDocFileSelect(docType, file);
    e.target.value = "";
  });
});
document.getElementById("saveIndukDocs").addEventListener("click", saveIndukDocs);

document.getElementById("closeWaReportModal").addEventListener("click", () => {
  document.getElementById("waReportModal").classList.remove("show");
});
document.getElementById("waReportModal").addEventListener("click", (e) => {
  if (e.target.id === "waReportModal") e.currentTarget.classList.remove("show");
});
document.getElementById("downloadWaReport").addEventListener("click", () => {
  const textarea = document.getElementById("waReportTextarea");
  const nomorInduk = textarea.dataset.nomorInduk || "laporan";
  const blob = new Blob([textarea.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Laporan-WA-${nomorInduk}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
document.getElementById("copyWaReport").addEventListener("click", async () => {
  const textarea = document.getElementById("waReportTextarea");
  try {
    await navigator.clipboard.writeText(textarea.value);
    showStatus("Teks laporan berhasil disalin ke clipboard.", true, 3000);
  } catch (err) {
    textarea.removeAttribute("readonly");
    textarea.select();
    document.execCommand("copy");
    textarea.setAttribute("readonly", "readonly");
    showStatus("Teks laporan berhasil disalin ke clipboard.", true, 3000);
  }
});

// ==============================
// INIT
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  loadInduk();
});
