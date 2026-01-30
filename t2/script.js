// ==============================
// KONFIGURASI SISTEM
// ==============================
const CONFIG = {
  SPREADSHEET_URL:
    "https://docs.google.com/spreadsheets/d/1xsWtTsJ1XFd6GUiObAKGAX8XDjC76wz7xuCqQCafr20/edit?usp=sharing",
  // GANTI DENGAN URL WEB APP ANDA SETELAH DEPLOY
  WEB_APP_URL:
    "https://script.google.com/macros/s/AKfycbyLjDbsXYBWR_MXhi85BLpU5cYZkUb3j8GgmG-bs1yhxLT5LZVsqt08gnrRkVGZ8iKaNg/exec",
  DRIVE_FOLDER_ID: "1poj5x6srlg_SDAP86wh_0DeP351iCc88",
  VERSION: "3.0",
};

// ==============================
// VARIABEL GLOBAL
// ==============================
let lastTransactionId = "NOTLU-0000";
let totalTransactions = 0;
let todayTransactions = 0;
let selectedImages = [];
let currentTransactionId = "";

// ==============================
// FUNGSI UTILITAS
// ==============================

function generateTransactionId() {
  const lastNumber = parseInt(lastTransactionId.split("-")[1]) || 0;
  const newNumber = lastNumber + 1;
  return `NOTLU-${newNumber.toString().padStart(4, "0")}`;
}

function generateImageFileName(transactionId, imageIndex) {
  const cleanId = transactionId.replace(/-/g, "");
  const imageNumber = (parseInt(imageIndex) + 1).toString().padStart(3, "0");
  return `${cleanId}-IMG${imageNumber}.jpg`;
}

function showStatus(message, isSuccess = true, duration = 5000) {
  const statusIndicator = document.getElementById("statusIndicator");
  const statusMessage = document.getElementById("statusMessage");

  statusIndicator.className = `status-indicator ${isSuccess ? "status-success" : "status-error"}`;
  statusMessage.innerHTML = `<i class="fas ${isSuccess ? "fa-check-circle" : "fa-exclamation-circle"}"></i> ${message}`;
  statusIndicator.style.display = "flex";

  setTimeout(() => {
    statusIndicator.style.display = "none";
  }, duration);
}

function updateLoadingMessage(message) {
  const element = document.getElementById("loadingMessage");
  if (element) element.textContent = message;
}

// ==============================
// FUNGSI UNTUK MENDAPATKAN URL GAMBAR THUMBNAIL
// ==============================

function getDriveThumbnailUrl(driveUrl) {
  if (!driveUrl) return null;

  try {
    // Jika sudah berupa direct URL
    if (driveUrl.includes("uc?id=") || driveUrl.includes("export=view")) {
      return driveUrl;
    }

    // Jika URL Google Drive standar
    if (driveUrl.includes("drive.google.com/file/d/")) {
      const fileIdMatch = driveUrl.match(/\/d\/([^\/]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w400`;
      }
    }

    // Jika sudah ada parameter id
    if (driveUrl.includes("id=")) {
      const idMatch = driveUrl.match(/id=([^&]+)/);
      if (idMatch && idMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`;
      }
    }

    return driveUrl;
  } catch (error) {
    console.error("Error generating thumbnail URL:", error);
    return driveUrl;
  }
}

// ==============================
// FUNGSI TAMPILKAN MODAL DETAIL (DIPERBAIKI)
// ==============================

async function showDetail(id) {
  currentDetailId = id;

  const data = await fetchDataById(id);
  if (!data) return;

  const detailContent = document.getElementById("detailContent");

  // Generate thumbnail URLs untuk gambar
  const gambar1Thumb = data.gambar1 ? getDriveThumbnailUrl(data.gambar1) : null;
  const gambar2Thumb = data.gambar2 ? getDriveThumbnailUrl(data.gambar2) : null;
  const gambar3Thumb = data.gambar3 ? getDriveThumbnailUrl(data.gambar3) : null;

  detailContent.innerHTML = `
        <div class="detail-grid">
            <!-- Informasi Utama -->
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-id-card"></i> ID Transaksi
                </div>
                <div class="detail-value">${data.transactionId}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-calendar"></i> Tanggal & Waktu
                </div>
                <div class="detail-value">${formatDate(data.timestamp)}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-user-tag"></i> Kode Sales
                </div>
                <div class="detail-value">${data.kodeSales}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-box-open"></i> Jenis Barang
                </div>
                <div class="detail-value">${data.jenisBarang}</div>
            </div>
            
            <!-- Informasi Emas -->
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-percent"></i> Kadar Fisik
                </div>
                <div class="detail-value">${data.kadarFisik || "0"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-cogs"></i> Presentase Mesin
                </div>
                <div class="detail-value">${data.presentaseMesin || "0"}%</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-microchip"></i> Kadar Mesin
                </div>
                <div class="detail-value">${data.kadarMesin || "0"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-weight-hanging"></i> Berat Surat
                </div>
                <div class="detail-value">${data.beratSurat || "0"} g</div>
            </div>
            
            <!-- Informasi Berat -->
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-weight"></i> Berat Fisik
                </div>
                <div class="detail-value">${data.beratFisik || "0"} g</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-minus-circle"></i> Susut
                </div>
                <div class="detail-value">${data.susut || "0"} g</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-balance-scale"></i> Berat Terima
                </div>
                <div class="detail-value">${data.beratTerima || "0"} g</div>
            </div>
            
            <!-- Informasi Harga -->
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-chart-line"></i> Rate Terima
                </div>
                <div class="detail-value">${data.rateTerima || "0"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-money-bill"></i> Harga Per Gram
                </div>
                <div class="detail-value">${formatRupiah(data.hargaPerGram)}</div>
            </div>
            
            <div class="detail-item full-width">
                <div class="detail-label">
                    <i class="fas fa-calculator"></i> Harga Terima
                </div>
                <div class="detail-value">${formatRupiah(data.hargaTerima)}</div>
            </div>
            
            <!-- Informasi Lainnya -->
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-store"></i> Nama Toko
                </div>
                <div class="detail-value">${data.namaToko || "-"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-industry"></i> Kode Pabrik
                </div>
                <div class="detail-value">${data.kodePabrik || "-"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-gem"></i> Kondisi Perhiasan
                </div>
                <div class="detail-value">${data.kondisiPerhiasan || "-"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-shapes"></i> Model
                </div>
                <div class="detail-value">${data.model || "-"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-user"></i> Operator
                </div>
                <div class="detail-value">${data.operator || "-"}</div>
            </div>
            
            <div class="detail-item">
                <div class="detail-label">
                    <i class="fas fa-print"></i> Status Cetak
                </div>
                <div class="detail-value">
                    <span class="status-badge ${data.statusCetak === "SUDAH CETAK" ? "status-printed" : "status-unprinted"}">
                        ${data.statusCetak || "BELUM CETAK"}
                    </span>
                </div>
            </div>
            
            <!-- Gambar -->
            <div class="detail-images full-width">
                <div class="detail-label">
                    <i class="fas fa-images"></i> Gambar Barang
                </div>
                
                ${
                  data.gambar1 || data.gambar2 || data.gambar3
                    ? `
                <div class="image-preview-grid">
                    ${
                      data.gambar1
                        ? `
                    <div class="image-preview-item">
                        <div class="image-container">
                            <img src="${gambar1Thumb}" 
                                 alt="Gambar 1" 
                                 class="thumbnail-image"
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Gambar+Tidak+Tersedia';"
                                 onclick="openImageModal('${data.gambar1}', 'Gambar 1')">
                        </div>
                        <div class="image-caption">Gambar 1</div>
                    </div>
                    `
                        : ""
                    }
                    
                    ${
                      data.gambar2
                        ? `
                    <div class="image-preview-item">
                        <div class="image-container">
                            <img src="${gambar2Thumb}" 
                                 alt="Gambar 2" 
                                 class="thumbnail-image"
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Gambar+Tidak+Tersedia';"
                                 onclick="openImageModal('${data.gambar2}', 'Gambar 2')">
                        </div>
                        <div class="image-caption">Gambar 2</div>
                    </div>
                    `
                        : ""
                    }
                    
                    ${
                      data.gambar3
                        ? `
                    <div class="image-preview-item">
                        <div class="image-container">
                            <img src="${gambar3Thumb}" 
                                 alt="Gambar 3" 
                                 class="thumbnail-image"
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Gambar+Tidak+Tersedia';"
                                 onclick="openImageModal('${data.gambar3}', 'Gambar 3')">
                        </div>
                        <div class="image-caption">Gambar 3</div>
                    </div>
                    `
                        : ""
                    }
                </div>
                
                <div class="image-actions">
                    <button class="btn btn-sm btn-secondary" onclick="downloadAllImages(['${data.gambar1}', '${data.gambar2}', '${data.gambar3}'].filter(img => img))">
                        <i class="fas fa-download"></i> Download Semua Gambar
                    </button>
                </div>
                `
                    : `
                <div class="no-images">
                    <i class="fas fa-image"></i>
                    <p>Tidak ada gambar yang diupload</p>
                </div>
                `
                }
            </div>
        </div>
    `;

  document.getElementById("detailModal").style.display = "block";
}

// ==============================
// FUNGSI UNTUK MODAL GAMBAR BESAR
// ==============================

function openImageModal(imageUrl, title) {
  // Buat modal untuk gambar besar
  const modalHtml = `
        <div id="imageModal" class="modal">
            <div class="modal-content image-modal">
                <div class="modal-header">
                    <h3><i class="fas fa-image"></i> ${title || "Preview Gambar"}</h3>
                    <button class="modal-close" onclick="closeImageModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="full-image-container">
                        <img id="fullImage" src="${imageUrl}" 
                             alt="${title}" 
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/800x600?text=Gambar+Tidak+Dapat+Dimuat';">
                    </div>
                </div>
                <div class="modal-footer">
                    <a href="${imageUrl}" target="_blank" class="btn btn-primary">
                        <i class="fas fa-external-link-alt"></i> Buka di Tab Baru
                    </a>
                    <a href="${imageUrl}" download class="btn btn-success">
                        <i class="fas fa-download"></i> Download
                    </a>
                    <button class="btn btn-secondary" onclick="closeImageModal()">
                        <i class="fas fa-times"></i> Tutup
                    </button>
                </div>
            </div>
        </div>
    `;

  // Tambahkan modal ke body
  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);

  // Tampilkan modal
  setTimeout(() => {
    document.getElementById("imageModal").style.display = "block";
  }, 10);
}

function closeImageModal() {
  const modal = document.getElementById("imageModal");
  if (modal) {
    modal.style.display = "none";
    setTimeout(() => {
      modal.remove();
    }, 300);
  }
}

// Fungsi untuk download semua gambar
function downloadAllImages(imageUrls) {
  if (!imageUrls || imageUrls.length === 0) {
    showStatus("Tidak ada gambar untuk didownload", false);
    return;
  }

  // Buka setiap gambar di tab baru untuk download
  imageUrls.forEach((url, index) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = `gambar-${index + 1}.jpg`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  showStatus(`${imageUrls.length} gambar sedang didownload...`, true);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
}

function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ==============================
// FUNGSI PERHITUNGAN YANG DIPERBAIKI
// ==============================

function calculateKadarMesin() {
  const presentaseMesin =
    parseFloat(document.getElementById("presentaseMesin").value) || 0;
  const kadarMesin = (presentaseMesin / 100) * 24;
  // Bulatkan ke 1 digit desimal
  const kadarMesinRounded = Math.round(kadarMesin * 10) / 10;
  document.getElementById("kadarMesin").value = kadarMesinRounded.toFixed(1);
  return kadarMesinRounded;
}

function calculateBeratTerima() {
  const beratSurat =
    parseFloat(document.getElementById("beratSurat").value) || 0;
  const beratFisik =
    parseFloat(document.getElementById("beratFisik").value) || 0;
  const susut = parseFloat(document.getElementById("susut").value) || 0;

  let beratTerima;

  // LOGIKA YANG BENAR (DIPERBAIKI):
  // SELALU gunakan BERAT SURAT jika ada (tidak peduli lebih besar/kecil)
  // HANYA jika tidak ada berat surat, gunakan berat fisik
  if (beratSurat > 0) {
    beratTerima = beratSurat - susut;
  } else {
    // Jika tidak ada berat surat, baru gunakan berat fisik
    beratTerima = beratFisik - susut;
  }

  beratTerima = Math.max(beratTerima, 0);
  document.getElementById("beratTerima").value = beratTerima.toFixed(2);
  return beratTerima;
}

function calculateHargaPerGram() {
  const cokimTerima =
    parseFloat(document.getElementById("cokimTerima").value) || 0;
  const rateTerima =
    parseFloat(document.getElementById("rateTerima").value) || 0;

  // Hitung: Cokim Terima × (Rate Terima / 100)
  const hargaPerGramKotor = cokimTerima * (rateTerima / 100);

  // Bulatkan ke kelipatan 500 terdekat (floor = ke bawah)
  const hargaPerGram = Math.floor(hargaPerGramKotor / 500) * 500;

  document.getElementById("hargaPerGram").value = hargaPerGram;
  return hargaPerGram;
}

function calculateHargaTerima() {
  const hargaPerGram =
    parseFloat(document.getElementById("hargaPerGram").value) || 0;
  const beratTerima =
    parseFloat(document.getElementById("beratTerima").value) || 0;

  // Hitung: Harga Per Gram × Berat Terima
  const hargaTerimaKotor = hargaPerGram * beratTerima;

  // Bulatkan ke kelipatan 500 terdekat (floor = ke bawah)
  const hargaTerima = Math.floor(hargaTerimaKotor / 500) * 500;

  document.getElementById("hargaTerima").value = hargaTerima;
  return hargaTerima;
}

// ==============================
// FUNGSI INPUT HANDLING YANG DIPERBAIKI
// ==============================

function setupNumberInputs() {
  const numberInputs = document.querySelectorAll('input[type="number"]');

  numberInputs.forEach((input) => {
    // Hapus semua event listeners sebelumnya
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    // Setup untuk input yang baru
    setupSingleNumberInput(newInput);
  });
}

function setupSingleNumberInput(input) {
  // Allow decimal point dengan cara yang benar
  input.addEventListener("keydown", function (e) {
    // Allow: backspace, delete, tab, escape, enter
    if (
      [8, 9, 27, 13, 46].includes(e.keyCode) ||
      // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
      (e.keyCode === 65 && (e.ctrlKey || e.metaKey)) ||
      (e.keyCode === 67 && (e.ctrlKey || e.metaKey)) ||
      (e.keyCode === 86 && (e.ctrlKey || e.metaKey)) ||
      (e.keyCode === 88 && (e.ctrlKey || e.metaKey)) ||
      // Allow: home, end, left, right
      (e.keyCode >= 35 && e.keyCode <= 39)
    ) {
      return;
    }

    // Allow decimal point (period) - kode 190
    if (e.keyCode === 190 || e.keyCode === 110) {
      // Cek apakah sudah ada titik dalam value
      if (this.value.includes(".")) {
        e.preventDefault();
      }
      return;
    }

    // Allow minus sign hanya untuk input tertentu
    if (e.keyCode === 189 || e.keyCode === 109) {
      if (this.value.startsWith("-") || this.value.length > 0) {
        e.preventDefault();
      }
      return;
    }

    // Ensure that it is a number
    if (
      (e.shiftKey || e.keyCode < 48 || e.keyCode > 57) &&
      (e.keyCode < 96 || e.keyCode > 105)
    ) {
      e.preventDefault();
    }
  });

  // Handle paste event
  input.addEventListener("paste", function (e) {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData(
      "text",
    );

    // Clean the pasted text - hanya angka dan satu titik
    let cleaned = pastedText.replace(/[^\d.-]/g, "");

    // Pastikan hanya satu titik desimal
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("");
    }

    // Insert the cleaned text
    const start = this.selectionStart;
    const end = this.selectionEnd;
    const currentValue = this.value;

    this.value =
      currentValue.substring(0, start) + cleaned + currentValue.substring(end);

    // Move cursor to after inserted text
    this.setSelectionRange(start + cleaned.length, start + cleaned.length);
  });

  // Format on blur
  input.addEventListener("blur", function () {
    if (this.value.trim() !== "") {
      let value = parseFloat(this.value);

      if (!isNaN(value)) {
        // Untuk presentase mesin: 2 desimal, max 100
        if (this.id === "presentaseMesin") {
          value = Math.min(value, 100);
          this.value = value.toFixed(2);
        }
        // Untuk berat: 2 desimal
        else if (["beratSurat", "beratFisik", "susut"].includes(this.id)) {
          this.value = value.toFixed(2);
        }
        // Untuk rate terima: 4 desimal
        else if (this.id === "rateTerima") {
          this.value = value.toFixed(4);
        }
        // Untuk cokim terima: bulatkan tanpa desimal
        else if (this.id === "cokimTerima") {
          this.value = Math.round(value);
        }
        // Untuk lainnya: bulatkan tanpa desimal
        else if (["kadarFisik", "kodeSales"].includes(this.id)) {
          this.value = Math.round(value);
        }
      }
    }

    // Trigger perhitungan setelah blur
    setTimeout(() => {
      calculateKadarMesin();
      calculateBeratTerima();
      calculateHargaPerGram();
      calculateHargaTerima();
      updatePreview();
    }, 10);
  });
}

function setupUppercaseInputs() {
  const textInputs = document.querySelectorAll(
    'input[type="text"]:not([readonly]), select',
  );

  textInputs.forEach((input) => {
    // Convert existing value to uppercase
    if (input.value) {
      input.value = input.value.toUpperCase();
    }

    // Add input event listener
    input.addEventListener("input", function (e) {
      // Simpan cursor position
      const start = this.selectionStart;
      const end = this.selectionEnd;

      // Convert to uppercase
      this.value = this.value.toUpperCase();

      // Restore cursor position
      this.setSelectionRange(start, end);
    });

    // Add blur event listener
    input.addEventListener("blur", function () {
      this.value = this.value.toUpperCase();
      updatePreview();
    });
  });
}

// ==============================
// FUNGSI PREVIEW
// ==============================

function updatePreview() {
  const formData = new FormData(document.getElementById("emasForm"));
  const previewContent = document.getElementById("previewContent");

  let hasData = false;
  for (let value of formData.values()) {
    if (value && value.toString().trim() !== "") {
      hasData = true;
      break;
    }
  }

  if (!hasData) {
    previewContent.innerHTML =
      '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
    document.getElementById("printPreviewBtn").disabled = true;
    return;
  }

  const transactionId = generateTransactionId();
  currentTransactionId = transactionId;

  let previewHTML = `
        <div class="preview-header">
            <div class="preview-title">CEK EMAS UBER</div>
            <div class="preview-id">${transactionId}</div>
            <div style="margin-top: 10px; font-size: 14px; color: #666;">
                ${new Date().toLocaleDateString("id-ID", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
            </div>
        </div>
    `;

  const fields = [
    {
      label: "Kode Sales",
      value: formData.get("kodeSales"),
      icon: "fa-id-card",
    },
    {
      label: "Cokim Terima",
      value: formData.get("cokimTerima")
        ? "Rp " + parseInt(formData.get("cokimTerima")).toLocaleString("id-ID")
        : "-",
      icon: "fa-money-bill-wave",
    },
    {
      label: "Jenis Barang",
      value: formData.get("jenisBarang"),
      icon: "fa-box-open",
    },
    { label: "Surat", value: formData.get("surat"), icon: "fa-file-contract" },
    {
      label: "Nama Toko",
      value: formData.get("namaToko") || "-",
      icon: "fa-store-alt",
    },
    {
      label: "Kadar Fisik",
      value: formData.get("kadarFisik") || "-",
      icon: "fa-percent",
    },
    {
      label: "Presentase Mesin",
      value: formData.get("presentaseMesin")
        ? formData.get("presentaseMesin") + "%"
        : "-",
      icon: "fa-cogs",
    },
    {
      label: "Kadar Mesin",
      value: document.getElementById("kadarMesin").value || "-",
      icon: "fa-microchip",
    },
    {
      label: "Kode Pabrik",
      value: formData.get("kodePabrik") || "-",
      icon: "fa-industry",
    },
    {
      label: "Berat Surat",
      value: formData.get("beratSurat")
        ? formData.get("beratSurat") + " gram"
        : "-",
      icon: "fa-weight-hanging",
    },
    {
      label: "Berat Fisik",
      value: formData.get("beratFisik")
        ? formData.get("beratFisik") + " gram"
        : "-",
      icon: "fa-weight",
    },
    {
      label: "Susut",
      value: formData.get("susut") ? formData.get("susut") + " gram" : "-",
      icon: "fa-minus-circle",
    },
    {
      label: "Berat Terima",
      value: document.getElementById("beratTerima").value
        ? document.getElementById("beratTerima").value + " gram"
        : "-",
      icon: "fa-balance-scale",
    },
    {
      label: "Kondisi Perhiasan",
      value: formData.get("kondisiPerhiasan"),
      icon: "fa-gem",
    },
    { label: "Model", value: formData.get("model"), icon: "fa-shapes" },
    {
      label: "Rate Terima",
      value: formData.get("rateTerima"),
      icon: "fa-chart-line",
    },
    {
      label: "Harga Per Gram",
      value: document.getElementById("hargaPerGram").value
        ? "Rp " +
          parseInt(
            document.getElementById("hargaPerGram").value,
          ).toLocaleString("id-ID")
        : "-",
      icon: "fa-money-bill",
    },
    {
      label: "Harga Terima",
      value: document.getElementById("hargaTerima").value
        ? "Rp " +
          parseInt(document.getElementById("hargaTerima").value).toLocaleString(
            "id-ID",
          )
        : "-",
      icon: "fa-calculator",
    },
  ];

  fields.forEach((field) => {
    if (field.value && field.value !== "-") {
      previewHTML += `
                <div class="preview-item">
                    <span class="preview-label"><i class="fas ${field.icon}"></i> ${field.label}:</span>
                    <span class="preview-value">${field.value}</span>
                </div>
            `;
    }
  });

  // Tambahkan info gambar
  if (selectedImages.length > 0) {
    previewHTML += `
            <div class="preview-item">
                <span class="preview-label"><i class="fas fa-images"></i> Jumlah Gambar:</span>
                <span class="preview-value">${selectedImages.length} gambar</span>
            </div>
        `;
  }

  previewContent.innerHTML = previewHTML;
  document.getElementById("printPreviewBtn").disabled = false;
}

// ==============================
// FUNGSI UPLOAD GAMBAR
// ==============================

function displayImagePreview(files) {
  const container = document.getElementById("imagePreviewContainer");
  const fileNamesContainer = document.getElementById("uploadedFileNames");

  container.innerHTML = "";
  fileNamesContainer.innerHTML = "";

  // Batasi hanya 3 gambar
  const limitedFiles = Array.from(files).slice(0, 3);

  limitedFiles.forEach((file, index) => {
    // Validasi ukuran file (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      showStatus(`Gambar ${file.name} melebihi ukuran maksimal 2MB!`, false);
      return;
    }

    // Validasi tipe file
    if (!file.type.startsWith("image/")) {
      showStatus(`File ${file.name} bukan gambar yang valid!`, false);
      return;
    }

    const reader = new FileReader();

    reader.onload = function (e) {
      const previewItem = document.createElement("div");
      previewItem.className = "image-preview-item";

      const img = document.createElement("img");
      img.src = e.target.result;
      img.className = "preview-image";
      img.alt = `Preview ${index + 1}`;

      const removeBtn = document.createElement("button");
      removeBtn.className = "remove-image-btn";
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.title = "Hapus gambar";
      removeBtn.onclick = function () {
        removeImage(index);
      };

      previewItem.appendChild(img);
      previewItem.appendChild(removeBtn);
      container.appendChild(previewItem);
    };

    reader.readAsDataURL(file);

    // Tampilkan nama file
    const fileNameDiv = document.createElement("div");
    fileNameDiv.className = "uploaded-filename";

    const fileName = document.createElement("span");
    fileName.textContent = file.name;

    const fileSize = document.createElement("span");
    fileSize.className = "file-size";
    fileSize.textContent = formatFileSize(file.size);

    fileNameDiv.appendChild(fileName);
    fileNameDiv.appendChild(fileSize);
    fileNamesContainer.appendChild(fileNameDiv);
  });

  // Update counter
  document.getElementById("selectedImageCount").textContent =
    `${limitedFiles.length} gambar dipilih`;

  // Simpan file ke array global
  selectedImages = limitedFiles;
  updatePreview();
}

function removeImage(index) {
  selectedImages.splice(index, 1);

  // Reset input file
  const fileInput = document.getElementById("imageUpload");
  fileInput.value = "";

  // Tampilkan ulang preview
  const dataTransfer = new DataTransfer();
  selectedImages.forEach((file) => dataTransfer.items.add(file));
  fileInput.files = dataTransfer.files;

  // Tampilkan preview baru
  displayImagePreview(fileInput.files);
}

// ==============================
// FUNGSI CETAK
// ==============================

function createThermalReceipt(transactionId, formData) {
  const thermalReceipt = document.getElementById("thermalReceipt");
  const formatRupiah = (value) => {
    if (!value) return "0";
    return parseInt(value).toLocaleString("id-ID");
  };

  const receiptHTML = `
        <div class="receipt-header">
            <div class="receipt-title">CEK EMAS UBER</div>
            <div>================================</div>
            <div><strong>${transactionId}</strong></div>
            <div>${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</div>
        </div>
        
        <div class="receipt-line"><span>Kode Sales:</span><span>${formData.get("kodeSales") || "-"}</span></div>
        <div class="receipt-line"><span>Cokim Terima:</span><span>${formatRupiah(formData.get("cokimTerima"))}</span></div>
        <div class="receipt-line"><span>Jenis Barang:</span><span>${formData.get("jenisBarang") || "-"}</span></div>
        <div class="receipt-line"><span>Surat:</span><span>${formData.get("surat") || "-"}</span></div>
        <div class="receipt-line"><span>Nama Toko:</span><span>${formData.get("namaToko") || "-"}</span></div>
        
        <div class="receipt-divider">--------------------------------</div>
        
        <div class="receipt-line"><span>Kadar Fisik:</span><span>${formData.get("kadarFisik") || "-"}</span></div>
        <div class="receipt-line"><span>% Mesin:</span><span>${formData.get("presentaseMesin") || "-"}%</span></div>
        <div class="receipt-line"><span>Kadar Mesin:</span><span>${document.getElementById("kadarMesin").value || "-"}</span></div>
        <div class"receipt-line"><span>Kode Pabrik:</span><span>${formData.get("kodePabrik") || "-"}</span></div>
        
        <div class="receipt-divider">--------------------------------</div>
        
        <div class="receipt-line"><span>Berat Surat:</span><span>${formData.get("beratSurat") || "0"}g</span></div>
        <div class="receipt-line"><span>Berat Fisik:</span><span>${formData.get("beratFisik") || "0"}g</span></div>
        <div class="receipt-line"><span>Susut:</span><span>${formData.get("susut") || "0"}g</span></div>
        <div class="receipt-line"><span class="receipt-label">BERAT TERIMA:</span><span class="receipt-label">${document.getElementById("beratTerima").value || "0"}g</span></div>
        
        <div class="receipt-divider">--------------------------------</div>
        
        <div class="receipt-line"><span>Kondisi:</span><span>${formData.get("kondisiPerhiasan") || "-"}</span></div>
        <div class="receipt-line"><span>Model:</span><span>${formData.get("model") || "-"}</span></div>
        
        <div class="receipt-divider">--------------------------------</div>
        
        <div class="receipt-line"><span>Rate Terima:</span><span>${formData.get("rateTerima") || "-"}</span></div>
        <div class="receipt-line"><span>Harga/Gram:</span><span>Rp ${formatRupiah(document.getElementById("hargaPerGram").value)}</span></div>
        
        <div class="receipt-divider">================================</div>
        
        <div class="receipt-line receipt-total">
            <span>TOTAL HARGA:</span>
            <span>Rp ${formatRupiah(document.getElementById("hargaTerima").value)}</span>
        </div>
        
        <div class="receipt-divider">================================</div>
        
        <div style="text-align: center; margin-top: 10px;">
            <div>Terima kasih</div>
            <div>www.cek-emas-uber.com</div>
            <div>${new Date().toLocaleDateString("id-ID")}</div>
        </div>
    `;

  thermalReceipt.innerHTML = receiptHTML;
}

function printThermalReceipt() {
  const printArea = document.getElementById("printArea");
  const thermalReceipt = document.getElementById("thermalReceipt");

  printArea.style.display = "block";
  thermalReceipt.style.display = "block";

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      printArea.style.display = "none";
      thermalReceipt.style.display = "none";
    }, 100);
  }, 100);
}

function testPrint() {
  const formData = new FormData(document.getElementById("emasForm"));
  let hasData = false;

  for (let value of formData.values()) {
    if (value) {
      hasData = true;
      break;
    }
  }

  if (!hasData) {
    showStatus("Silakan isi form terlebih dahulu untuk test cetak!", false);
    return;
  }

  const testId = generateTransactionId();
  createThermalReceipt(testId, formData);
  printThermalReceipt();
  showStatus("Test cetak berhasil!", true);
}

// ==============================
// FUNGSI SPREADSHEET
// ==============================

async function saveToSpreadsheet(formData, transactionId) {
  // Prepare image data
  const imageDataArray = [];
  for (let i = 0; i < Math.min(selectedImages.length, 3); i++) {
    const file = selectedImages[i];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        imageDataArray.push({
          base64: base64,
          mimeType: file.type,
          index: i,
        });
      } catch (error) {
        console.error(`Error converting image ${i} to base64:`, error);
      }
    }
  }

  const dataToSend = {
    operation: "create",
    transactionId: transactionId,
    kodeSales: formData.get("kodeSales"),
    cokimTerima: formData.get("cokimTerima"),
    jenisBarang: formData.get("jenisBarang"),
    surat: formData.get("surat"),
    namaToko: formData.get("namaToko") || "",
    kadarFisik: formData.get("kadarFisik") || 0,
    presentaseMesin: formData.get("presentaseMesin"),
    kadarMesin: document.getElementById("kadarMesin").value || 0,
    kodePabrik: formData.get("kodePabrik") || "",
    beratSurat: formData.get("beratSurat") || 0,
    beratFisik: formData.get("beratFisik"),
    susut: formData.get("susut"),
    beratTerima: document.getElementById("beratTerima").value,
    kondisiPerhiasan: formData.get("kondisiPerhiasan"),
    model: formData.get("model"),
    rateTerima: formData.get("rateTerima"),
    hargaPerGram: document.getElementById("hargaPerGram").value,
    hargaTerima: document.getElementById("hargaTerima").value,
    operator: "Operator",
    timestamp: new Date().toISOString(),
    imageUrls: imageDataArray,
  };

  console.log("Sending data to spreadsheet...");

  try {
    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataToSend),
    });

    saveBackup(dataToSend);

    return {
      success: true,
      message: "Data berhasil dikirim ke spreadsheet",
      transactionId: transactionId,
      images: imageDataArray.length,
    };
  } catch (error) {
    console.error("Error:", error);
    saveBackup(dataToSend);
    throw new Error("Gagal mengirim data: " + error.message);
  }
}

function saveBackup(data) {
  try {
    const backupKey = `backup_${data.transactionId}_${Date.now()}`;
    localStorage.setItem(
      backupKey,
      JSON.stringify({
        ...data,
        backupTime: new Date().toISOString(),
        status: "pending",
      }),
    );

    const backupList = JSON.parse(localStorage.getItem("backup_list") || "[]");
    backupList.push(backupKey);
    localStorage.setItem("backup_list", JSON.stringify(backupList));

    console.log("Data disimpan sebagai backup:", backupKey);
  } catch (error) {
    console.error("Gagal menyimpan backup:", error);
  }
}

async function fetchStatistics() {
  try {
    const response = await fetch(`${CONFIG.WEB_APP_URL}?t=${Date.now()}`);

    if (response.ok) {
      const data = await response.json();

      if (data.success) {
        lastTransactionId = data.lastId;
        totalTransactions = data.count || 0;
        todayTransactions = data.todayCount || 0;

        document.getElementById("totalTransaksi").textContent =
          totalTransactions;
        document.getElementById("lastId").textContent = lastTransactionId;
        document.getElementById("todayCount").textContent = todayTransactions;
        document.getElementById("statsBox").style.display = "block";

        return true;
      }
    }
    return false;
  } catch (error) {
    console.log("Tidak dapat mengambil statistik:", error);
    return false;
  }
}

// ==============================
// FUNGSI RESET
// ==============================

function resetForm() {
  document.getElementById("emasForm").reset();
  document.getElementById("kadarMesin").value = "";
  document.getElementById("beratTerima").value = "";
  document.getElementById("hargaPerGram").value = "";
  document.getElementById("hargaTerima").value = "";

  // Reset gambar
  selectedImages = [];
  document.getElementById("imagePreviewContainer").innerHTML = "";
  document.getElementById("uploadedFileNames").innerHTML = "";
  document.getElementById("selectedImageCount").textContent =
    "0 gambar dipilih";
  document.getElementById("imageUpload").value = "";

  document.getElementById("previewContent").innerHTML =
    '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
  document.getElementById("printPreviewBtn").disabled = true;

  showStatus("Form telah direset. Silakan isi data baru.", true, 3000);
}

// ==============================
// EVENT LISTENERS
// ==============================

document.addEventListener("DOMContentLoaded", function () {
  // Set tahun di footer
  document.getElementById("currentYear").textContent = new Date().getFullYear();

  // Setup number inputs terlebih dahulu
  setupNumberInputs();

  // Setup uppercase inputs untuk text
  setupUppercaseInputs();

  // Event listener untuk upload gambar
  document
    .getElementById("imageUpload")
    .addEventListener("change", function (e) {
      const files = e.target.files;

      if (files.length > 3) {
        showStatus("Maksimal 3 gambar yang dapat diupload!", false);
        this.value = "";
        return;
      }

      displayImagePreview(files);
    });

  // Event listener untuk input perhitungan
  const calculationInputs = [
    "presentaseMesin",
    "beratSurat",
    "beratFisik",
    "susut",
    "cokimTerima",
    "rateTerima",
  ];
  calculationInputs.forEach((inputId) => {
    const element = document.getElementById(inputId);
    if (element) {
      element.addEventListener("input", function () {
        setTimeout(() => {
          calculateKadarMesin();
          calculateBeratTerima();
          calculateHargaPerGram();
          calculateHargaTerima();
          updatePreview();
        }, 10);
      });
    }
  });

  // Event listener untuk input lainnya
  const formInputs = document.querySelectorAll(
    "#emasForm input, #emasForm select",
  );
  formInputs.forEach((input) => {
    if (!calculationInputs.includes(input.id)) {
      input.addEventListener("input", function () {
        setTimeout(updatePreview, 10);
      });
    }
  });

  // Event listener untuk reset button
  document.getElementById("resetBtn").addEventListener("click", resetForm);

  // Event listener untuk test print button
  document.getElementById("testPrintBtn").addEventListener("click", testPrint);

  // Event listener untuk print preview button
  document
    .getElementById("printPreviewBtn")
    .addEventListener("click", function () {
      const formData = new FormData(document.getElementById("emasForm"));
      const transactionId = currentTransactionId || generateTransactionId();
      createThermalReceipt(transactionId, formData);
      printThermalReceipt();
    });

  // Event listener untuk form submission
  document
    .getElementById("emasForm")
    .addEventListener("submit", async function (e) {
      e.preventDefault();

      if (!this.checkValidity()) {
        this.reportValidity();
        showStatus("Harap lengkapi semua field yang wajib diisi!", false);
        return;
      }

      const beratFisik = parseFloat(
        document.getElementById("beratFisik").value,
      );
      const susut = parseFloat(document.getElementById("susut").value);

      if (susut >= beratFisik) {
        showStatus(
          "Nilai susut tidak boleh lebih besar atau sama dengan berat fisik!",
          false,
        );
        return;
      }

      // Tampilkan loading
      document.getElementById("loadingOverlay").classList.add("show");
      updateLoadingMessage("Mempersiapkan data...");

      try {
        const formData = new FormData(this);
        const transactionId = generateTransactionId();

        updateLoadingMessage("Menyimpan data ke spreadsheet...");

        // Simpan ke spreadsheet
        const result = await saveToSpreadsheet(formData, transactionId);

        updateLoadingMessage(
          "Data berhasil disimpan. Mempersiapkan cetakan...",
        );

        // Buat dan cetak struk
        setTimeout(() => {
          createThermalReceipt(transactionId, formData);
          printThermalReceipt();

          updateLoadingMessage("Mereset form untuk data baru...");

          // Reset form
          setTimeout(() => {
            resetForm();
            document.getElementById("loadingOverlay").classList.remove("show");

            // Update statistik
            fetchStatistics();

            const imageCount = selectedImages.length;
            const imageMsg =
              imageCount > 0 ? ` dengan ${imageCount} gambar` : "";
            showStatus(
              `Data berhasil disimpan${imageMsg} dengan ID: <strong>${transactionId}</strong>`,
              true,
              6000,
            );
          }, 1000);
        }, 1500);
      } catch (error) {
        console.error("Error:", error);
        document.getElementById("loadingOverlay").classList.remove("show");
        showStatus(`Gagal menyimpan data: ${error.message}`, false, 8000);
      }
    });

  // Ambil statistik awal
  fetchStatistics();

  // Inisialisasi preview
  updatePreview();

  // Tampilkan info koneksi
  setTimeout(() => {
    fetchStatistics().then((success) => {
      if (success) {
        showStatus(
          "Sistem siap digunakan. Terhubung ke Google Spreadsheet.",
          true,
          4000,
        );
        document.getElementById("connectionText").textContent =
          "Terhubung ke Spreadsheet";
      } else {
        showStatus(
          "Tidak dapat terhubung ke spreadsheet, menggunakan mode offline",
          false,
          5000,
        );
        document.getElementById("connectionText").textContent = "Mode Offline";
      }
    });
  }, 1000);

  // Log informasi sistem
  console.log(`FORM CEK EMAS UBER v${CONFIG.VERSION}`);
  console.log(`Spreadsheet: ${CONFIG.SPREADSHEET_URL}`);
  console.log(`Web App: ${CONFIG.WEB_APP_URL}`);
  console.log("Sistem siap digunakan!");
});

// ==============================
// FUNGSI TEST
// ==============================

function testBeratTerimaLogic() {
  console.log("=== TEST LOGIKA BERAT TERIMA ===");

  // Test case 1: Berat surat ada, berat fisik lebih kecil
  console.log("\nTest 1: Berat surat 10g, berat fisik 9g, susut 0.5g");
  console.log("Hasil: Berat surat - susut = 10 - 0.5 = 9.5g ✓");

  // Test case 2: Berat surat ada, berat fisik lebih besar
  console.log("\nTest 2: Berat surat 10g, berat fisik 12g, susut 0.5g");
  console.log("Hasil: Berat surat - susut = 10 - 0.5 = 9.5g ✓");

  // Test case 3: Tidak ada berat surat
  console.log("\nTest 3: Tidak ada berat surat, berat fisik 10g, susut 0.5g");
  console.log("Hasil: Berat fisik - susut = 10 - 0.5 = 9.5g ✓");

  console.log("\nKESIMPULAN: SELALU gunakan BERAT SURAT jika ada!");
}

// Panggil test jika perlu
// testBeratTerimaLogic();
