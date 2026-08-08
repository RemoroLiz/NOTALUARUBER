// ==============================
// KONFIGURASI SISTEM
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbw1vBvut6FwYvOMB0s1Tr5OdjJwV0ThJLkNHB1PP-dleOGj_dhh5lQdIBpOPdnWC4JT/exec",
  MAX_IMAGES: 5,
  MAX_IMAGE_DIMENSION: 1280, // px, sisi terpanjang setelah kompresi
  IMAGE_QUALITY: 0.7, // kualitas JPEG hasil kompresi
  VERSION: "4.0",
};

// ==============================
// VARIABEL GLOBAL
// ==============================
let selectedImages = []; // [{ dataUrl, base64, mimeType, sizeKb, fileName }]
let currentReceiptData = null;

// --- FITUR CUSTOMER (BARU) ---
let selectedCustomerImages = []; // foto customer, maks 3, format sama seperti selectedImages
const MAX_CUSTOMER_PHOTOS = 3;
let customerSearchDebounce;
let suppressCustomerSearch = false; // true sesaat setelah klik saran, supaya tidak trigger search ulang

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

// ==============================
// FITUR CUSTOMER (BARU)
// ==============================
function renderCustomerImagePreviews() {
  const container = document.getElementById("customerImagePreviewContainer");
  container.innerHTML = selectedCustomerImages
    .map(
      (img, idx) => `
      <div class="image-preview-item">
        <img src="${img.dataUrl}" alt="foto customer ${idx + 1}" />
        <span class="image-size-tag">${img.sizeKb} KB</span>
        <button type="button" class="remove-customer-image" data-idx="${idx}" title="Hapus foto">&times;</button>
      </div>`,
    )
    .join("");

  container.querySelectorAll(".remove-customer-image").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedCustomerImages.splice(parseInt(btn.dataset.idx, 10), 1);
      renderCustomerImagePreviews();
    });
  });

  document.getElementById("selectedCustomerImageCount").textContent =
    `${selectedCustomerImages.length} foto dipilih`;
}

async function handleCustomerImageSelection(fileList) {
  const files = Array.from(fileList);
  const remainingSlots = MAX_CUSTOMER_PHOTOS - selectedCustomerImages.length;

  if (remainingSlots <= 0) {
    showStatus(`Maksimal ${MAX_CUSTOMER_PHOTOS} foto customer yang dapat diupload!`, false);
    return;
  }

  const toProcess = files.slice(0, remainingSlots);
  if (files.length > remainingSlots) {
    showStatus(
      `Hanya ${remainingSlots} foto ditambahkan (batas maksimal ${MAX_CUSTOMER_PHOTOS}).`,
      false,
    );
  }

  for (const file of toProcess) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const compressed = await compressImage(file);
      selectedCustomerImages.push(compressed);
    } catch (err) {
      showStatus(`Gagal memproses foto ${file.name}: ${err.message}`, false);
    }
  }

  renderCustomerImagePreviews();
}

function setCustomerStatus(mode, extraText) {
  const el = document.getElementById("customerStatus");
  const photoSection = document.getElementById("customerPhotoSection");
  if (!el || !photoSection) return;

  if (mode === "existing") {
    el.innerHTML = `<i class="fas fa-check-circle"></i> Customer terdaftar (ID: <strong>${extraText}</strong>). Foto lama tetap dipakai.`;
    el.className = "customer-status existing";
    photoSection.style.display = "none";
  } else if (mode === "new") {
    el.innerHTML = `<i class="fas fa-user-plus"></i> Nama belum terdaftar - customer baru akan dibuat saat data disimpan.`;
    el.className = "customer-status new";
    photoSection.style.display = "block";
  } else {
    el.innerHTML = "";
    el.className = "customer-status";
    photoSection.style.display = "block";
  }
}

function clearCustomerSelection() {
  const idField = document.getElementById("customerId");
  const idDisplay = document.getElementById("customerIdDisplay");
  if (idField) idField.value = "";
  if (idDisplay) idDisplay.value = "";
}

function renderCustomerSuggestions(list) {
  const box = document.getElementById("customerSuggestions");
  if (!box) return;

  if (!list || !list.length) {
    box.innerHTML = "";
    box.classList.remove("show");
    return;
  }

  box.innerHTML = list
    .map(
      (c) => `
      <div class="customer-suggestion-item" data-id="${c.idCustomer}" data-nama="${c.nama}">
        <span><i class="fas fa-user"></i> ${c.nama}</span>
        <span class="cust-id-tag">${c.idCustomer}</span>
      </div>`,
    )
    .join("");
  box.classList.add("show");

  box.querySelectorAll(".customer-suggestion-item").forEach((item) => {
    item.addEventListener("click", () => {
      suppressCustomerSearch = true;
      document.getElementById("customerNameInput").value = item.dataset.nama;
      document.getElementById("customerId").value = item.dataset.id;
      document.getElementById("customerIdDisplay").value = item.dataset.id;
      renderCustomerSuggestions([]);

      // Foto customer lama tidak perlu diupload ulang
      selectedCustomerImages = [];
      renderCustomerImagePreviews();
      setCustomerStatus("existing", item.dataset.id);
    });
  });
}

async function searchCustomers(query) {
  try {
    const result = await apiGet({ action: "customersearch", q: query });
    renderCustomerSuggestions(result.data || []);
  } catch (err) {
    console.error("Gagal mencari customer:", err);
  }
}

function resetCustomerSection() {
  const nameInput = document.getElementById("customerNameInput");
  if (nameInput) nameInput.value = "";
  clearCustomerSelection();
  renderCustomerSuggestions([]);
  selectedCustomerImages = [];
  renderCustomerImagePreviews();
  const fileInput = document.getElementById("customerImageUpload");
  if (fileInput) fileInput.value = "";
  setCustomerStatus("idle");
}

function setupCustomerSection() {
  const nameInput = document.getElementById("customerNameInput");
  const fileInput = document.getElementById("customerImageUpload");
  if (!nameInput || !fileInput) return;

  nameInput.addEventListener("input", () => {
    if (suppressCustomerSearch) {
      suppressCustomerSearch = false;
      return;
    }

    clearCustomerSelection();
    const value = nameInput.value.trim();

    if (!value) {
      renderCustomerSuggestions([]);
      setCustomerStatus("idle");
      return;
    }

    setCustomerStatus("new");
    clearTimeout(customerSearchDebounce);
    customerSearchDebounce = setTimeout(() => searchCustomers(value), 350);
  });

  document.addEventListener("click", (e) => {
    const wrap = document.querySelector(".customer-search-wrap");
    if (wrap && !wrap.contains(e.target)) {
      renderCustomerSuggestions([]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    handleCustomerImageSelection(e.target.files);
    e.target.value = "";
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
  const printBtn = document.getElementById("printPreviewBtn");

  if (!hasAny) {
    previewContent.innerHTML =
      '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
    printBtn.disabled = true;
    return;
  }

  const rows = [
    ["Kode Sales", v.kodeSales],
    ["Jenis Barang", v.jenisBarang],
    ["Nama Toko", v.namaToko],
    ["Kadar Fisik", v.kadarFisik],
    ["Presentase Mesin", v.presentaseMesin ? v.presentaseMesin + "%" : ""],
    ["Kadar Mesin", v.kadarMesin],
    ["Berat Terima", v.beratTerima ? v.beratTerima + " g" : ""],
    ["Rate Terima", v.rateTerima],
    ["Harga Per Gram", v.hargaPerGram ? formatRupiah(v.hargaPerGram) : ""],
    ["Harga Terima", v.hargaTerima ? formatRupiah(v.hargaTerima) : ""],
  ].filter(([, val]) => val);

  previewContent.innerHTML = rows
    .map(([label, val]) => `<div class="preview-row"><span class="label">${label}</span><span class="value">${val}</span></div>`)
    .join("");

  const requiredOk = document.getElementById("emasForm").checkValidity();
  printBtn.disabled = !requiredOk;
}

// ==============================
// CETAK THERMAL - 2 SESI
// ==============================
function buildCustomerReceipt(id, v) {
  return `
    <div class="thermal-receipt">
      <div class="tr-title">TOKO EMAS UBER</div>
      <div class="tr-sub">${id} &middot; ${new Date().toLocaleString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
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
 * Menggabungkan struk customer + laporan toko jadi SATU dokumen
 * print (dipisahkan jarak beberapa cm + garis putus "gunting di
 * sini"), supaya hanya 1x panggilan print / 1 print job.
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
 * "size: 58mm auto" membiarkan tinggi halaman mengikuti panjang
 * konten (bukan angka tetap) - ini kunci menghindari 2 masalah
 * sekaligus: halaman kosong berlebih (kalau konten pendek) dan
 * konten terpotong (kalau konten panjang).
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
 * Mencetak lewat IFRAME TERSEMBUNYI yang berisi HANYA HTML struk +
 * CSS-nya sendiri (bukan lagi menumpang di halaman utama lalu
 * menyembunyikan sisanya pakai @media print). Ini sengaja dibuat
 * berdiri sendiri supaya:
 *  - Halaman admin/form TIDAK PERNAH ikut mungkin tercetak/terlihat
 *    dobel, apapun browser atau driver printer yang dipakai (dulu
 *    ini bergantung pada @media print yang tidak konsisten
 *    diterapkan oleh sebagian browser/driver POS, itulah penyebab
 *    "tampilan 2x" dan halaman kosong yang dilaporkan).
 *  - @page 58mm auto berlaku bersih tanpa "diganggu" CSS halaman
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

async function printReceipt(id, v) {
  await printThermalDocument(buildCombinedReceipt(id, v));
}

function testPrint() {
  const v = getFormValues();
  const hasAny = Object.values(v).some((val) => val && String(val).trim() !== "");
  if (!hasAny) {
    showStatus("Isi form terlebih dahulu sebelum test cetak.", false);
    return;
  }
  printReceipt("TEST-0000", v);
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
  const payload = { action: "create", data: formValues, images };

  // Jika tidak ada customerId (customer lama tidak dipilih dari daftar saran),
  // kirim nama + foto customer baru supaya backend membuatkan record baru.
  if (!formValues.customerId) {
    const customerName = document.getElementById("customerNameInput").value.trim();
    if (customerName) {
      payload.customerName = customerName;
      payload.customerPhotos = selectedCustomerImages.map((img) => ({
        data: img.base64,
        mimeType: img.mimeType,
      }));
    }
  }

  return apiPost(payload);
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
// RESET FORM
// ==============================
function resetForm() {
  document.getElementById("emasForm").reset();
  ["kadarMesin", "beratTerima", "hargaPerGram", "hargaTerima"].forEach((id) => {
    document.getElementById(id).value = "";
  });

  selectedImages = [];
  renderImagePreviews();
  document.getElementById("imageUpload").value = "";

  resetCustomerSection();

  document.getElementById("previewContent").innerHTML =
    '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
  document.getElementById("printPreviewBtn").disabled = true;
}

// ==============================
// EVENT LISTENERS
// ==============================
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();

  setupNumberInputs();
  setupUppercaseInputs();
  setupCustomerSection();

  document.getElementById("imageUpload").addEventListener("change", (e) => {
    handleImageSelection(e.target.files);
    e.target.value = ""; // izinkan memilih file yang sama lagi
  });

  const calculationInputs = ["presentaseMesin", "beratSurat", "beratFisik", "susut", "cokimTerima", "rateTerima"];
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

  document.getElementById("testPrintBtn").addEventListener("click", testPrint);

  document.getElementById("printPreviewBtn").addEventListener("click", () => {
    if (!currentReceiptData) return;
    printReceipt(currentReceiptData.id, currentReceiptData.values);
  });

  document.getElementById("emasForm").addEventListener("submit", async (e) => {
    e.preventDefault();

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

      updateLoadingMessage("Data tersimpan. Menyiapkan cetakan...");
      setTimeout(async () => {
        await printReceipt(result.id, values);

        resetForm();
        document.getElementById("loadingOverlay").classList.remove("show");
        fetchStatistics();
        showStatus(
          `Data berhasil disimpan dengan ID: <strong>${result.id}</strong>`,
          true,
          6000,
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
