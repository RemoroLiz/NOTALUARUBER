// ==============================
// KONFIGURASI
// ==============================
// (BARU) WEB_APP_URL & pengaturan umum sekarang berasal dari
// config.js/SHARED_CONFIG - cukup ganti URL Apps Script di SATU
// tempat: config.js.
const CONFIG = Object.assign({}, SHARED_CONFIG, {});

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

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  // timeZone dikunci ke Asia/Jakarta - lihat catatan di crud-script.js
  // formatDate() untuk penjelasan lengkap bug tanggal yang diperbaiki.
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
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
              <button class="btn-icon btn-print-store-induk" data-id="${induk.nomorInduk}" title="Cetak Laporan Toko (semua barang)"><i class="fas fa-print"></i></button>
              <button class="btn-icon btn-delete-induk" data-id="${induk.nomorInduk}" data-jumlah="${induk.jumlahBarang || 0}" title="Hapus Data Induk"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => openIndukDetail(b.dataset.id)));
  tableBody.querySelectorAll(".btn-pdf").forEach((b) => b.addEventListener("click", () => generateIndukPdf(b.dataset.id)));
  tableBody.querySelectorAll(".btn-wa").forEach((b) => b.addEventListener("click", () => generateWhatsappReport(b.dataset.id)));
  tableBody.querySelectorAll(".btn-print-store-induk").forEach((b) =>
    b.addEventListener("click", () => confirmPrintStoreReportForInduk(b.dataset.id)),
  );
  tableBody.querySelectorAll(".btn-delete-induk").forEach((b) =>
    b.addEventListener("click", () => deleteInduk(b.dataset.id, parseInt(b.dataset.jumlah, 10) || 0)),
  );
}

/**
 * Konfirmasi ringan sebelum mencetak banyak struk sekaligus (supaya
 * tidak tidak sengaja memicu belasan dialog print kalau salah klik).
 */
function confirmPrintStoreReportForInduk(nomorInduk) {
  const induk = allInduk.find((i) => String(i.nomorInduk) === String(nomorInduk));
  const jumlahBarang = induk ? induk.jumlahBarang || 0 : 0;
  if (!jumlahBarang) {
    showStatus(`Induk ${nomorInduk} belum punya barang untuk dicetak.`, false);
    return;
  }
  const confirmed = window.confirm(
    `Cetak laporan toko untuk ${jumlahBarang} barang di induk ${nomorInduk}?\n\nDialog print browser akan muncul berurutan sebanyak ${jumlahBarang} kali (satu per barang).`,
  );
  if (!confirmed) return;
  printStoreReportForInduk(nomorInduk);
}

/**
 * (BARU) Hapus satu Nomor Induk Transaksi beserta SEMUA barang (ID
 * NOTLU) di bawahnya dan file terkait (foto barang, dokumen MOU/KTP/
 * Foto Customer) - PERMANEN, tidak bisa dibatalkan. Selalu meminta
 * konfirmasi eksplisit dulu lewat window.confirm() sebelum memanggil
 * server, sesuai permintaan.
 */
async function deleteInduk(nomorInduk, jumlahBarang) {
  const confirmed = window.confirm(
    `Apakah Anda yakin ingin menghapus data induk ${nomorInduk} dengan total transaksi ${jumlahBarang}?\n\n` +
      `Semua barang (ID NOTLU) beserta foto & dokumennya akan IKUT TERHAPUS PERMANEN dari server dan Drive, dan TIDAK BISA dikembalikan.`,
  );
  if (!confirmed) return;

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage(`Menghapus data induk ${nomorInduk} beserta transaksi & filenya...`);
  try {
    await apiPost({ action: "indukdelete", id: nomorInduk });
    document.getElementById("indukDetailModal").classList.remove("show");
    showStatus(`Data induk ${nomorInduk} beserta ${jumlahBarang} transaksinya berhasil dihapus.`, true);
    await loadInduk();
  } catch (err) {
    showStatus(`Gagal menghapus data induk: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
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
        ${
          items.length
            ? `<div class="induk-item-row induk-grand-total-row">
                <div><strong>GRAND TOTAL</strong></div>
                <div><strong>${formatRupiah(items.reduce((sum, item) => sum + (parseFloat(item.hargaTerima) || 0), 0))}</strong></div>
                <div></div>
              </div>`
            : ""
        }
      </div>`;

    document.getElementById("indukDetailContent").innerHTML = html;
    document.getElementById("indukDetailModal").classList.add("show");
    document.getElementById("indukDetailModal").dataset.nomorInduk = nomorInduk;
    document.getElementById("indukDetailModal").dataset.itemCount = items.length;

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
// (BARU) CETAK LAPORAN TOKO - BATCH SEKALIGUS PER NOMOR INDUK
// ==============================
// Sebelumnya, mencetak laporan toko untuk beberapa barang dalam satu
// Nomor Induk harus dilakukan SATU PER SATU dari halaman Data
// Management. Fitur ini mencetak SEMUA barang di bawah satu Nomor
// Induk sekaligus, berurutan, langsung dari halaman Data Induk.

/**
 * CSS & fungsi cetak struk thermal - sama persis dengan yang dipakai
 * di crud-script.js (lihat catatan lengkap di sana soal padding kiri
 * untuk kompensasi unprintable margin printer thermal). Diduplikasi
 * di sini karena tiap halaman memakai file JS berdiri sendiri.
 */
const THERMAL_PRINT_STYLE = `
  @page { size: 48mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 48mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .thermal-receipt {
    width: 48mm;
    padding: 1.5mm 2mm 1.5mm 5mm;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
  .thermal-receipt .tr-title { text-align: center; font-size: 10.5pt; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 1.2mm; }
  .thermal-receipt .tr-sub { text-align: center; font-size: 8pt; margin-bottom: 1.8mm; }
  .thermal-receipt hr { border: none; border-top: 0.4mm dashed #000; margin: 1.2mm 0; }
  .thermal-receipt .tr-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: 8.5pt; line-height: 1.55; }
  .thermal-receipt .tr-row .k { white-space: nowrap; }
  .thermal-receipt .tr-row .v { font-weight: 700; text-align: right; word-break: break-word; }
  .thermal-receipt .tr-total { font-size: 9.5pt; font-weight: 700; display: flex; justify-content: space-between; margin-top: 1.5mm; }
  .thermal-receipt .tr-footer { text-align: center; font-size: 7.5pt; margin-top: 1.8mm; }
  .thermal-receipt .tr-credit { text-align: center; font-size: 6pt; color: #888; margin-top: 1.5mm; }
`;

function buildStoreReceipt(id, v) {
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
      <div class="tr-footer">Sudah di uji, potong, amplas dan gosok</div>
      <div class="tr-credit">by Kevin Uber</div>
    </div>`;
}

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
 * Mencetak laporan toko untuk SEMUA barang di bawah satu Nomor Induk,
 * berurutan satu demi satu (dialog print browser akan muncul
 * berkali-kali sesuai jumlah barang - ini keterbatasan wajar browser,
 * tidak bisa digabung jadi satu dialog print untuk beberapa struk
 * terpisah). Status "SUDAH CETAK" ditandai untuk semua barang di
 * SERVER dulu tanpa refresh tabel di antaranya (supaya proses cetak
 * berturut-turut tidak terhambat/lambat) - tabel Data Induk baru
 * di-refresh SEKALI di akhir setelah semua selesai.
 */
async function printStoreReportForInduk(nomorInduk) {
  if (!nomorInduk) {
    showStatus("Nomor induk tidak valid.", false);
    return;
  }

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Mengambil daftar barang induk...");

  try {
    const result = await apiGet({ action: "indukgetbyid", id: nomorInduk });
    const items = (result.items || []).slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (!items.length) {
      showStatus(`Induk ${nomorInduk} belum punya barang untuk dicetak.`, false);
      return;
    }

    for (let i = 0; i < items.length; i++) {
      updateLoadingMessage(`Mencetak laporan toko ${i + 1} dari ${items.length} (${items[i].id})...`);
      await printThermalDocument(buildStoreReceipt(items[i].id, items[i]));
    }

    updateLoadingMessage("Menandai status cetak...");
    for (const item of items) {
      try {
        await apiPost({ action: "markPrinted", id: item.id });
      } catch (err) {
        console.error(`Gagal menandai status cetak untuk ${item.id}:`, err);
      }
    }

    showStatus(`Laporan toko untuk ${items.length} barang di induk ${nomorInduk} berhasil dicetak.`, true);
    await loadInduk(); // refresh SEKALI saja di akhir, bukan di antara tiap cetak
  } catch (err) {
    console.error(err);
    showStatus(`Gagal mencetak laporan toko: ${err.message}`, false, 7000);
  } finally {
    document.getElementById("loadingOverlay").classList.remove("show");
  }
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

    // ------- HALAMAN 1: DATA INDUK -------
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

    /**
     * (BARU) Tabel ringkasan "Kode Transaksi | Barang | Total" untuk
     * SEMUA barang dalam induk ini, diikuti garis pemisah dan baris
     * GRAND TOTAL - ditampilkan di halaman pertama (cover) laporan
     * PDF, supaya pemilik toko langsung lihat ringkasan tanpa perlu
     * membuka detail tiap barang satu per satu. Detail lengkap tiap
     * barang tetap ada di halaman-halaman berikutnya seperti biasa.
     */
    function drawIndukSummaryTable(itemsForSummary, startY) {
      let y = startY;
      const col1X = margin;
      const col2X = margin + 42;
      const col3XRight = pageWidth - margin;
      const barangColWidth = col3XRight - col2X - 28;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Kode Transaksi", col1X, y);
      doc.text("Barang", col2X, y);
      doc.text("Total", col3XRight, y, { align: "right" });
      y += 2;
      doc.setDrawColor(160, 160, 160);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;

      doc.setFont("helvetica", "normal");
      let grandTotal = 0;

      itemsForSummary.forEach((item) => {
        const total = parseFloat(item.hargaTerima) || 0;
        grandTotal += total;

        if (y + 6 > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }

        const barangLines = doc.splitTextToSize(String(item.jenisBarang || "-"), barangColWidth);
        doc.text(String(item.id || "-"), col1X, y);
        doc.text(barangLines[0] || "-", col2X, y); // ringkas 1 baris - detail lengkap ada di halaman per barang
        doc.text(formatRupiah(total), col3XRight, y, { align: "right" });
        y += 6;
      });

      y += 2;
      if (y + 12 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.5);
      doc.line(margin, y, pageWidth - margin, y);
      y += 7;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("GRAND TOTAL", col2X, y);
      doc.text(formatRupiah(grandTotal), col3XRight, y, { align: "right" });
      y += 8;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      return { finalY: y, grandTotal: grandTotal };
    }

    // ------- RINGKASAN TRANSAKSI + GRAND TOTAL (di halaman cover) -------
    let coverY = customer ? 112 : 95;
    if (items.length) {
      coverY = drawSectionTitle("RINGKASAN TRANSAKSI", coverY);
      drawIndukSummaryTable(items, coverY);
    } else {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.setTextColor(120, 120, 120);
      doc.text("Belum ada barang tersimpan di induk ini.", pageWidth / 2, coverY, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }

    // ------- FOTO INDUK: MOU / KTP / FOTO CUSTOMER SAAT TRANSAKSI -------
    for (const docType of ["mou", "ktp", "fotoCustomer"]) {
      const img = indukDocs[docType];
      if (!img) continue;
      const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
      await addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, `Dokumen Induk - ${INDUK_DOC_LABELS[docType]}`);
    }

    // ------- DETAIL CUSTOMER -------
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
    }

    // ------- FOTO CUSTOMER -------
    for (let i = 0; i < customerPhotos.length; i++) {
      const img = customerPhotos[i];
      const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
      await addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, `Foto Customer ${i + 1} / ${customerPhotos.length}`);
    }

    // ------- DETAIL BARANG N + FOTO BARANG N (berurutan per barang) -------
    for (const item of items) {
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

      const images = itemImagesMap[item.id] || [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const dataUrl = `data:${img.mimeType || "image/jpeg"};base64,${img.data}`;
        await addImagePageToIndukPdf(doc, pageWidth, pageHeight, margin, dataUrl, `${item.id} - Foto Barang ${i + 1} / ${images.length}`);
      }
    }

    if (!items.length) {
      doc.addPage();
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("Belum ada barang tersimpan di induk ini.", margin, margin);
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
document.getElementById("deleteFromIndukDetail").addEventListener("click", () => {
  const modal = document.getElementById("indukDetailModal");
  const nomorInduk = modal.dataset.nomorInduk;
  const jumlahBarang = parseInt(modal.dataset.itemCount, 10) || 0;
  if (nomorInduk) deleteInduk(nomorInduk, jumlahBarang);
});
document.getElementById("printStoreFromIndukDetail").addEventListener("click", () => {
  const modal = document.getElementById("indukDetailModal");
  const nomorInduk = modal.dataset.nomorInduk;
  if (nomorInduk) confirmPrintStoreReportForInduk(nomorInduk);
});

["mou", "ktp", "fotoCustomer"].forEach((docType) => {
  document.getElementById(`indukDocInput-${docType}`).addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleIndukDocFileSelect(docType, file);
    e.target.value = "";
  });

  // (BARU) Ambil foto dokumen induk langsung dari kamera
  document.getElementById(`indukDocInputCamera-${docType}`).addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    handleIndukDocFileSelect(docType, file);
    e.target.value = "";
  });

  // (BARU) Drag & drop foto langsung ke kotak slot dokumen (MOU/KTP/
  // Foto Customer) - hanya file pertama yang dipakai per slot karena
  // tiap slot memang untuk satu foto saja.
  enableDragDrop(document.getElementById(`indukDocSlot-${docType}`), (files) => {
    handleIndukDocFileSelect(docType, files[0]);
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
