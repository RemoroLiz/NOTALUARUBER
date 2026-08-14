// ==============================
// KONFIGURASI SISTEM
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbyVmn3b1HiFMAuhPdtTieNYJVvrj38oNtLFK_uzXPlQKxquGinBKRVMaPDmBCsi4AM-/exec",
  MAX_IMAGES: 10,
  MAX_IMAGE_DIMENSION: 1280, // px, sisi terpanjang setelah kompresi
  IMAGE_QUALITY: 0.7, // kualitas JPEG hasil kompresi
  VERSION: "4.0",
};

// ==============================
// VARIABEL GLOBAL
// ==============================
let selectedImages = []; // [{ dataUrl, base64, mimeType, sizeKb, fileName }]
let currentReceiptData = null;

// --- FITUR NOMOR INDUK TRANSAKSI (BARU) ---
// Satu Nomor Induk = satu kunjungan customer, bisa menaungi banyak
// barang (masing-masing dapat ID NOTLU sendiri).
let currentNomorInduk = null;
let currentCustomerId = null;
let currentCustomerNama = null;
let savedItemsInInduk = []; // [{ id, jenisBarang }]

// ==============================
// UTILITAS UMUM
// ==============================
function showStatus(message, isSuccess = true, duration = 5000) {
  const statusIndicator = document.getElementById("statusIndicator");
  const statusMessage = document.getElementById("statusMessage");

  statusIndicator.className = `status-indicator ${isSuccess ? "status-success" : "status-error"}`;
  statusMessage.innerHTML = `<i class="fas ${isSuccess ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${message}`;
  statusIndicator.style.display = "flex";

  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    statusIndicator.style.display = "none";
  }, duration);
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
 * bertitik ala Indonesia, dipakai untuk field seperti Cokim supaya
 * tetap mudah dibaca kalau nilainya besar - terutama di struk
 * thermal yang fontnya kecil. Nilai non-numerik (kosong, "-", teks)
 * dikembalikan apa adanya.
 */
function formatNumberID(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("id-ID");
}

function floorToStep(value, step) {
  if (!isFinite(value)) return 0;
  return Math.floor(value / step) * step;
}

function setupUppercaseInputs() {
  document.querySelectorAll(".uppercase-input").forEach((el) => {
    el.addEventListener("input", () => {
      const pos = el.selectionStart;
      el.value = el.value.toUpperCase();
      el.setSelectionRange(pos, pos);
    });
  });
}

function setupNumberInputs() {
  document.querySelectorAll('input[type="number"]').forEach((el) => {
    el.addEventListener("wheel", (e) => e.target.blur());
  });
}

// ==============================
// PERHITUNGAN OTOMATIS
// ==============================
function calculateKadarMesin() {
  const presentase = parseFloat(document.getElementById("presentaseMesin").value) || 0;
  const kadar = (presentase / 100) * 24;
  document.getElementById("kadarMesin").value = kadar ? kadar.toFixed(2) : "";
}

function calculateKadarPotong() {
  const presentase = parseFloat(document.getElementById("presentasePotong").value) || 0;
  const kadar = (presentase / 100) * 24;
  document.getElementById("kadarPotong").value = kadar ? kadar.toFixed(2) : "";
}

function calculateBeratTerima() {
  const beratSurat = parseFloat(document.getElementById("beratSurat").value) || 0;
  const beratFisik = parseFloat(document.getElementById("beratFisik").value) || 0;
  const susut = parseFloat(document.getElementById("susut").value) || 0;

  let dasar;
  if (beratSurat > 0 && beratFisik > 0) {
    dasar = Math.min(beratSurat, beratFisik);
  } else if (beratFisik > 0) {
    dasar = beratFisik;
  } else if (beratSurat > 0) {
    dasar = beratSurat;
  } else {
    dasar = 0;
  }

  const hasil = dasar - susut;
  document.getElementById("beratTerima").value = dasar > 0 ? Math.max(hasil, 0).toFixed(2) : "";
}

function calculateHargaPerGram() {
  const cokim = parseFloat(document.getElementById("cokimTerima").value) || 0;
  const rate = parseFloat(document.getElementById("rateTerima").value) || 0;
  const harga = floorToStep(cokim * (rate / 100), 500);
  document.getElementById("hargaPerGram").value = cokim && rate ? harga : "";
}

function calculateHargaTerima() {
  const hargaPerGram = parseFloat(document.getElementById("hargaPerGram").value) || 0;
  const beratTerima = parseFloat(document.getElementById("beratTerima").value) || 0;
  const harga = floorToStep(hargaPerGram * beratTerima, 500);
  document.getElementById("hargaTerima").value = hargaPerGram && beratTerima ? harga : "";
}

function runAllCalculations() {
  calculateKadarMesin();
  calculateKadarPotong();
  calculateBeratTerima();
  calculateHargaPerGram();
  calculateHargaTerima();
  updatePreview();
}

// ==============================
// UPLOAD & KOMPRESI GAMBAR
// ==============================
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

        resolve({
          dataUrl,
          base64,
          mimeType: "image/jpeg",
          sizeKb,
          fileName: file.name,
        });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleImageSelection(fileList) {
  const files = Array.from(fileList);
  const remainingSlots = CONFIG.MAX_IMAGES - selectedImages.length;

  if (remainingSlots <= 0) {
    showStatus(`Maksimal ${CONFIG.MAX_IMAGES} gambar yang dapat diupload!`, false);
    return;
  }

  const toProcess = files.slice(0, remainingSlots);
  if (files.length > remainingSlots) {
    showStatus(
      `Hanya ${remainingSlots} gambar ditambahkan (batas maksimal ${CONFIG.MAX_IMAGES}).`,
      false,
    );
  }

  for (const file of toProcess) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const compressed = await compressImage(file);
      selectedImages.push(compressed);
    } catch (err) {
      showStatus(`Gagal memproses ${file.name}: ${err.message}`, false);
    }
  }

  renderImagePreviews();
}

function renderImagePreviews() {
  const container = document.getElementById("imagePreviewContainer");
  container.innerHTML = selectedImages
    .map(
      (img, idx) => `
      <div class="image-preview-item">
        <img src="${img.dataUrl}" alt="preview ${idx + 1}" />
        <span class="image-size-tag">${img.sizeKb} KB</span>
        <button type="button" class="remove-image" data-idx="${idx}" title="Hapus gambar">&times;</button>
      </div>`,
    )
    .join("");

  container.querySelectorAll(".remove-image").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedImages.splice(parseInt(btn.dataset.idx, 10), 1);
      renderImagePreviews();
    });
  });

  document.getElementById("selectedImageCount").textContent =
    `${selectedImages.length} gambar dipilih`;
  document.getElementById("uploadedFileNames").innerHTML = selectedImages
    .map((img) => `<div><i class="fas fa-file-image"></i> ${img.fileName} (${img.sizeKb} KB)</div>`)
    .join("");
}

/**
 * (BARU) Menambahkan dukungan drag & drop file ke sebuah elemen
 * pembungkus upload. zoneEl diberi class "drag-over" saat file
 * diseret di atasnya (styling ada di style.css) untuk feedback
 * visual. onFiles dipanggil dengan FileList yang di-drop - bentuknya
 * sama seperti event "change" pada <input type="file"> sehingga bisa
 * langsung dioper ke handler yang sudah ada tanpa perlu diubah.
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

// ==============================
// NOMOR INDUK TRANSAKSI (BARU)
// ==============================
/**
 * Langkah 1: mulai transaksi baru. Cari/buat customer berdasarkan
 * No HP (primary key), lalu buat Nomor Induk Transaksi baru yang
 * bisa menaungi banyak barang (ID NOTLU) sekaligus.
 */
async function startTransaction() {
  const noHp = document.getElementById("customerPhoneInput").value.trim();
  const nama = document.getElementById("customerNameInput").value.trim();

  if (!noHp || !nama) {
    showStatus("Nomor HP dan Nama Customer wajib diisi.", false);
    return;
  }

  const btn = document.getElementById("startTransactionBtn");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memproses...';

  try {
    const result = await apiPost({ action: "starttransaction", noHp, nama });

    currentNomorInduk = result.nomorInduk;
    currentCustomerId = result.idCustomer;
    currentCustomerNama = result.nama;
    savedItemsInInduk = [];

    document.getElementById("indukNomorLabel").textContent = result.nomorInduk;
    document.getElementById("indukCustomerLabel").textContent = `${result.nama} (${result.idCustomer})`;
    const badge = document.getElementById("indukCustomerBadge");
    if (result.isNewCustomer) {
      badge.textContent = "CUSTOMER BARU";
      badge.className = "badge badge-warning";
    } else {
      badge.textContent = "CUSTOMER LAMA";
      badge.className = "badge badge-success";
    }

    document.getElementById("customerStepSection").style.display = "none";
    document.getElementById("customerPhoneInput").disabled = true;
    document.getElementById("customerNameInput").disabled = true;
    document.getElementById("indukBanner").classList.add("show");
    document.getElementById("itemFormSection").classList.add("show");
    renderIndukItemsList();

    showStatus(
      `Transaksi dimulai (${result.nomorInduk}). Silakan isi data barang pertama.`,
      true,
    );
  } catch (err) {
    showStatus(`Gagal memulai transaksi: ${err.message}`, false, 7000);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-arrow-right"></i> Mulai Transaksi';
  }
}

/**
 * Kembali ke Langkah 1 - dipakai baik untuk mengganti customer di
 * tengah jalan, maupun otomatis dipanggil setelah transaksi selesai.
 */
function endTransaction() {
  currentNomorInduk = null;
  currentCustomerId = null;
  currentCustomerNama = null;
  savedItemsInInduk = [];

  document.getElementById("customerPhoneInput").value = "";
  document.getElementById("customerNameInput").value = "";
  document.getElementById("customerPhoneInput").disabled = false;
  document.getElementById("customerNameInput").disabled = false;
  document.getElementById("customerStepSection").style.display = "block";
  document.getElementById("indukBanner").classList.remove("show");
  document.getElementById("itemFormSection").classList.remove("show");
  document.getElementById("indukItemsBox").classList.remove("show");
  document.getElementById("indukItemsList").innerHTML = "";
  document.getElementById("indukItemsCount").textContent = "0";
}

function renderIndukItemsList() {
  const box = document.getElementById("indukItemsBox");
  const list = document.getElementById("indukItemsList");
  document.getElementById("indukItemsCount").textContent = savedItemsInInduk.length;

  if (!savedItemsInInduk.length) {
    box.classList.remove("show");
    list.innerHTML = "";
    return;
  }

  box.classList.add("show");
  list.innerHTML = savedItemsInInduk
    .map(
      (item) =>
        `<div class="induk-item-chip"><i class="fas fa-check-circle"></i> ${item.id} <span class="chip-jenis">- ${item.jenisBarang || "-"}</span></div>`,
    )
    .join("");
}

function setupTransactionFlow() {
  document.getElementById("startTransactionBtn").addEventListener("click", startTransaction);
  document.getElementById("changeCustomerBtn").addEventListener("click", () => {
    if (savedItemsInInduk.length) {
      const ok = confirm(
        `Transaksi ${currentNomorInduk} sudah punya ${savedItemsInInduk.length} barang tersimpan. Yakin mau mulai transaksi baru?`,
      );
      if (!ok) return;
    }
    endTransaction();
  });
}

// ==============================
// PREVIEW DATA
// ==============================
function getFormValues() {
  const form = document.getElementById("emasForm");
  const fd = new FormData(form);
  const obj = {};
  fd.forEach((value, key) => (obj[key] = value));
  return obj;
}

function updatePreview() {
  const v = getFormValues();
  const hasAny = Object.values(v).some((val) => val && String(val).trim() !== "");
  const previewContent = document.getElementById("previewContent");
  const printCustomerBtn = document.getElementById("printPreviewCustomerBtn");
  const printStoreBtn = document.getElementById("printPreviewStoreBtn");

  if (!hasAny) {
    previewContent.innerHTML =
      '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
    printCustomerBtn.disabled = true;
    printStoreBtn.disabled = true;
    return;
  }

  const rows = [
    ["Kode Sales", v.kodeSales],
    ["Jenis Barang", v.jenisBarang],
    ["Nama Toko", v.namaToko],
    ["Kadar Fisik", v.kadarFisik],
    ["Presentase Mesin", v.presentaseMesin ? v.presentaseMesin + "%" : ""],
    ["Kadar Mesin", v.kadarMesin],
    ["Presentase Potong", v.presentasePotong ? v.presentasePotong + "%" : ""],
    ["Kadar Potong", v.kadarPotong],
    ["Berat Terima", v.beratTerima ? v.beratTerima + " g" : ""],
    ["Rate Terima", v.rateTerima],
    ["Harga Per Gram", v.hargaPerGram ? formatRupiah(v.hargaPerGram) : ""],
    ["Harga Terima", v.hargaTerima ? formatRupiah(v.hargaTerima) : ""],
  ].filter(([, val]) => val);

  previewContent.innerHTML = rows
    .map(([label, val]) => `<div class="preview-row"><span class="label">${label}</span><span class="value">${val}</span></div>`)
    .join("");

  const requiredOk = document.getElementById("emasForm").checkValidity();
  printCustomerBtn.disabled = !requiredOk;
  printStoreBtn.disabled = !requiredOk;
}

// ==============================
// CETAK THERMAL - 2 SESI
// ==============================
function buildCustomerReceipt(id, v) {
  return `
    <div class="thermal-receipt">
      <div class="tr-title">TOKO MAS PANTES UBER</div>
      <div class="tr-address">Jl. A.H. Nasution No.219, Pasirjati, Kecamatan Ujung Berung, Bandung</div>
      <div class="tr-sub">${id} &middot; ${new Date().toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}</div>
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
  // Field laporan toko - satu kolom (bukan 2 kolom seperti sebelumnya).
  // Layout 2 kolom terbukti memaksa font sangat kecil sehingga mudah
  // terpotong/tidak terbaca di printer thermal. Kertas roll thermal
  // panjangnya fleksibel (printer memotong mengikuti panjang konten),
  // jadi satu kolom yang lebih panjang ke bawah justru lebih aman.
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
    ["Rate", formatNumberID(v.rateTerima)],
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
      <div class="tr-sub">${id} &middot; ${new Date().toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}</div>
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
 * 57mm (dikonfirmasi dari label kertas: "Paperline 57x30mm").
 *
 * PENTING: lebar KERTAS (57mm) berbeda dengan lebar CETAK yang
 * benar-benar bisa dipakai kepala cetak printer thermal. Hampir
 * semua printer kelas "POS-58"/BM9000 punya kepala cetak selebar
 * ~48mm walau kertasnya 57-58mm (sisanya adalah margin non-cetak di
 * kedua sisi kertas). Sebelumnya lebar konten disamakan dengan
 * lebar kertas penuh (58mm) - itu sebabnya teks selalu terpotong
 * rata di KIRI DAN KANAN (contoh: "adar Fisik", "arga/gram" - huruf
 * pertama & terakhir hilang) karena melebihi kemampuan kepala cetak.
 * Menyempitkan lebar konten ke 48mm menghilangkan pemotongan ini di
 * printer manapun kelas 57-58mm.
 *
 * "size: ... auto" membiarkan tinggi halaman mengikuti panjang
 * konten (bukan angka tetap) - menghindari halaman kosong berlebih
 * (konten pendek) maupun konten terpotong secara vertikal (konten
 * panjang).
 */
const THERMAL_PRINT_STYLE = `
  @page { size: 48mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 48mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .thermal-receipt {
    width: 48mm;
    /* Padding kiri sengaja jauh lebih besar dari kanan (top right
       bottom left). Foto hasil cetak menunjukkan pemotongan SELALU
       terjadi di ujung kiri secara konsisten (2 huruf pertama tiap
       label hilang), sementara sisi kanan & teks center-align aman.
       Ini ciri khas "unprintable margin" bawaan hardware/driver
       printer thermal - area mati di tepi kertas yang TIDAK bisa
       dikontrol lewat @page margin karena berada di luar kendali
       CSS/browser. Solusinya: geser semua konten ke kanan lewat
       padding kiri supaya tidak ada teks yang jatuh di zona mati
       tersebut. Kalau printer Anda ternyata masih memotong sedikit,
       cukup naikkan angka 5mm di baris ini saja. */
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
 * Mencetak lewat IFRAME TERSEMBUNYI yang berisi HANYA HTML struk +
 * CSS-nya sendiri (bukan lagi menumpang di halaman utama lalu
 * menyembunyikan sisanya pakai @media print). Ini sengaja dibuat
 * berdiri sendiri supaya:
 *  - Halaman admin/form TIDAK PERNAH ikut mungkin tercetak/terlihat
 *    dobel, apapun browser atau driver printer yang dipakai (dulu
 *    ini bergantung pada @media print yang tidak konsisten
 *    diterapkan oleh sebagian browser/driver POS, itulah penyebab
 *    "tampilan 2x" dan halaman kosong yang dilaporkan).
 *  - @page 48mm auto berlaku bersih tanpa "diganggu" CSS halaman
 *    utama yang jauh lebih kompleks.
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

    // onload biasanya cukup, tapi beberapa browser/driver POS lambat
    // menghitung layout iframe - beri jeda kecil + fallback timer
    // supaya print tetap terpicu walau event onload tidak konsisten.
    iframe.onload = () => setTimeout(triggerPrint, 100);
    setTimeout(triggerPrint, 500);
  });
}

/**
 * CETAK TERPISAH (BARU) - struk customer dan laporan toko sekarang
 * masing-masing 1 print job SENDIRI (bukan lagi digabung dalam 1
 * dokumen). Ini membuat keduanya bisa dicetak ulang secara
 * independen (mis. struk customer hilang/rusak tapi laporan toko
 * tidak perlu dicetak ulang), dan menghindari pemotongan kertas yang
 * salah tempat di sebagian printer thermal.
 */
async function printCustomerReceipt(id, v) {
  await printThermalDocument(buildCustomerReceipt(id, v));
}

async function printStoreReceipt(id, v) {
  await printThermalDocument(buildStoreReceipt(id, v));
}

/**
 * Mencetak KEDUANYA secara berurutan (dipakai pada alur otomatis
 * setelah simpan data) - tetap 2 print job terpisah, hanya
 * dipanggil berurutan supaya alur "Simpan & Cetak" tidak berubah
 * dari sisi pengguna.
 */
async function printReceipt(id, v) {
  await printCustomerReceipt(id, v);
  await printStoreReceipt(id, v);
}

function testPrintCustomer() {
  const v = getFormValues();
  const hasAny = Object.values(v).some((val) => val && String(val).trim() !== "");
  if (!hasAny) {
    showStatus("Isi form terlebih dahulu sebelum test cetak.", false);
    return;
  }
  printCustomerReceipt("TEST-0000", v);
}

function testPrintStore() {
  const v = getFormValues();
  const hasAny = Object.values(v).some((val) => val && String(val).trim() !== "");
  if (!hasAny) {
    showStatus("Isi form terlebih dahulu sebelum test cetak.", false);
    return;
  }
  printStoreReceipt("TEST-0000", v);
}

// ==============================
// KOMUNIKASI DENGAN BACKEND
// ==============================
async function apiPost(payload) {
  const response = await fetch(CONFIG.WEB_APP_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Terjadi kesalahan pada server");
  return result;
}

async function apiGet(params) {
  const url = new URL(CONFIG.WEB_APP_URL);
  Object.entries(params).forEach(([k, val]) => url.searchParams.set(k, val));
  const response = await fetch(url.toString());
  const result = await response.json();
  if (!result.success) throw new Error(result.error || "Terjadi kesalahan pada server");
  return result;
}

async function saveToBackend(formValues) {
  const images = selectedImages.map((img) => ({ data: img.base64, mimeType: img.mimeType }));
  // IdCustomer otomatis diambil backend dari Nomor Induk Transaksi
  // yang sedang aktif (lihat handleCreate + resolveCustomerId di
  // Code.gs) - tidak perlu dikirim ulang di setiap barang.
  return apiPost({ action: "create", nomorInduk: currentNomorInduk, data: formValues, images });
}

async function fetchStatistics() {
  try {
    const result = await apiGet({ action: "statistics" });
    document.getElementById("totalTransaksi").textContent = result.total;
    document.getElementById("lastId").textContent = result.lastId;
    document.getElementById("todayCount").textContent = result.todayCount;
    return true;
  } catch (err) {
    console.error("Gagal memuat statistik:", err);
    return false;
  }
}

// ==============================
// RESET FORM (BARANG SAJA)
// ==============================
/**
 * Mengosongkan field BARANG saja (bukan Nomor HP/Nama/Nomor Induk) -
 * form tetap siap dipakai untuk barang berikutnya dalam transaksi
 * yang sama. Untuk mengakhiri transaksi & ganti customer, pakai
 * tombol "Transaksi Baru / Ganti Customer" (lihat endTransaction()).
 */
function resetForm() {
  const itemFieldIds = [
    "kodeSales",
    "cokimTerima",
    "jenisBarang",
    "surat",
    "namaToko",
    "kadarFisik",
    "presentaseMesin",
    "kadarMesin",
    "presentasePotong",
    "kadarPotong",
    "kodePabrik",
    "beratSurat",
    "beratFisik",
    "susut",
    "beratTerima",
    "kondisiPerhiasan",
    "model",
    "rateTerima",
    "hargaPerGram",
    "hargaTerima",
  ];
  itemFieldIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  selectedImages = [];
  renderImagePreviews();
  document.getElementById("imageUpload").value = "";

  document.getElementById("previewContent").innerHTML =
    '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
  document.getElementById("printPreviewCustomerBtn").disabled = true;
  document.getElementById("printPreviewStoreBtn").disabled = true;
}

// ==============================
// EVENT LISTENERS
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();

  setupNumberInputs();
  setupUppercaseInputs();
  setupTransactionFlow();

  document.getElementById("imageUpload").addEventListener("change", (e) => {
    handleImageSelection(e.target.files);
    e.target.value = ""; // izinkan memilih file yang sama lagi
  });

  // (BARU) Drag & drop foto langsung ke area upload
  enableDragDrop(document.getElementById("imageUpload").closest(".image-upload-container"), (files) => {
    handleImageSelection(files);
  });

  const calculationInputs = [
    "presentaseMesin",
    "presentasePotong",
    "beratSurat",
    "beratFisik",
    "susut",
    "cokimTerima",
    "rateTerima",
  ];
  calculationInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", () => runAllCalculations());
  });

  document.querySelectorAll("#emasForm input, #emasForm select").forEach((input) => {
    if (!calculationInputs.includes(input.id)) {
      input.addEventListener("input", () => updatePreview());
      input.addEventListener("change", () => updatePreview());
    }
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    resetForm();
    showStatus("Form telah direset. Silakan isi data baru.", true, 3000);
  });

  document.getElementById("testPrintCustomerBtn").addEventListener("click", testPrintCustomer);
  document.getElementById("testPrintStoreBtn").addEventListener("click", testPrintStore);

  document.getElementById("printPreviewCustomerBtn").addEventListener("click", () => {
    if (!currentReceiptData) return;
    printCustomerReceipt(currentReceiptData.id, currentReceiptData.values);
  });
  document.getElementById("printPreviewStoreBtn").addEventListener("click", () => {
    if (!currentReceiptData) return;
    printStoreReceipt(currentReceiptData.id, currentReceiptData.values);
  });

  document.getElementById("emasForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!currentNomorInduk) {
      showStatus("Mulai transaksi dulu (isi Nomor HP & Nama Customer) sebelum menyimpan barang.", false);
      return;
    }

    if (!e.target.checkValidity()) {
      e.target.reportValidity();
      showStatus("Harap lengkapi semua field yang wajib diisi!", false);
      return;
    }

    const beratFisik = parseFloat(document.getElementById("beratFisik").value);
    const susut = parseFloat(document.getElementById("susut").value);
    if (susut >= beratFisik) {
      showStatus("Nilai susut tidak boleh lebih besar atau sama dengan berat fisik!", false);
      return;
    }

    document.getElementById("loadingOverlay").classList.add("show");
    updateLoadingMessage("Mengompres gambar & menyimpan data...");

    try {
      const values = getFormValues();
      const result = await saveToBackend(values);

      currentReceiptData = { id: result.id, values };
      savedItemsInInduk.push({ id: result.id, jenisBarang: values.jenisBarang });
      renderIndukItemsList();

      updateLoadingMessage("Data tersimpan. Menyiapkan cetakan...");
      setTimeout(async () => {
        await printReceipt(result.id, values);

        resetForm();
        document.getElementById("loadingOverlay").classList.remove("show");
        fetchStatistics();
        showStatus(
          `Barang ${result.id} tersimpan di transaksi ${currentNomorInduk}. Silakan isi barang berikutnya, atau klik "Transaksi Baru" kalau sudah selesai.`,
          true,
          7000,
        );
      }, 600);
    } catch (err) {
      console.error(err);
      document.getElementById("loadingOverlay").classList.remove("show");
      showStatus(`Gagal menyimpan data: ${err.message}`, false, 8000);
    }
  });

  fetchStatistics().then((ok) => {
    document.getElementById("connectionText").textContent = ok
      ? "Terhubung ke Spreadsheet"
      : "Mode Offline";
    showStatus(
      ok ? "Sistem siap digunakan. Terhubung ke Google Spreadsheet." : "Tidak dapat terhubung ke spreadsheet.",
      ok,
      4000,
    );
  });

  updatePreview();

  console.log(`FORM CEK EMAS UBER v${CONFIG.VERSION}`);
});
