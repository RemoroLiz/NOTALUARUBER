// ==============================
// KONFIGURASI SISTEM
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbx3iZvmD3NXgZMCgEOqAeL6i9ixoS5QimI_gBqAOIyvCZ8bGMjgjlVoDN779GspaVKI/exec",
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
  // Daftar field laporan toko. Disusun berpasangan lalu dibagi ke
  // 2 kolom (kolom kiri = separuh pertama, kolom kanan = separuh
  // kedua) supaya struk tidak terlalu panjang ke bawah.
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

  const mid = Math.ceil(fields.length / 2);
  const leftFields = fields.slice(0, mid);
  const rightFields = fields.slice(mid);

  const renderCol = (colFields) =>
    colFields
      .map(
        ([label, value]) => `
        <div class="tr-cell">
          <span class="cell-k">${label}</span>
          <span class="cell-v">${value}</span>
        </div>`,
      )
      .join("");

  return `
    <div class="thermal-receipt">
      <div class="tr-title">LAPORAN TOKO</div>
      <div class="tr-sub">${id}</div>
      <hr />
      <div class="tr-columns">
        <div class="tr-col">${renderCol(leftFields)}</div>
        <div class="tr-col">${renderCol(rightFields)}</div>
      </div>
      <hr />
      <div class="tr-total"><span>HARGA TERIMA</span><span>${formatRupiah(v.hargaTerima)}</span></div>
    </div>`;
}

function printReceipt(session, id, v) {
  const printArea = document.getElementById("printArea");
  printArea.innerHTML = session === "customer" ? buildCustomerReceipt(id, v) : buildStoreReceipt(id, v);
  window.print();
}

/**
 * Mencetak 2 sesi berurutan: struk customer lalu laporan toko.
 * Browser akan menampilkan dua kali dialog cetak (satu per sesi)
 * karena keterbatasan window.print() yang sinkron per panggilan.
 */
function printBothSessions(id, v) {
  printReceipt("customer", id, v);
  setTimeout(() => printReceipt("store", id, v), 700);
}

function testPrint() {
  const v = getFormValues();
  const hasAny = Object.values(v).some((val) => val && String(val).trim() !== "");
  if (!hasAny) {
    showStatus("Isi form terlebih dahulu sebelum test cetak.", false);
    return;
  }
  printBothSessions("TEST-0000", v);
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
  return apiPost({ action: "create", data: formValues, images });
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
    printBothSessions(currentReceiptData.id, currentReceiptData.values);
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
      setTimeout(() => {
        printBothSessions(result.id, values);

        setTimeout(() => {
          resetForm();
          document.getElementById("loadingOverlay").classList.remove("show");
          fetchStatistics();
          showStatus(
            `Data berhasil disimpan dengan ID: <strong>${result.id}</strong>`,
            true,
            6000,
          );
        }, 800);
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
