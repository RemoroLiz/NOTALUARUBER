// ==============================
// KONFIGURASI SISTEM
// ==============================
const CONFIG = {
  SPREADSHEET_URL:
    "https://docs.google.com/spreadsheets/d/1Sad_KJ2PCnrHBFtECE2qOYh45hjEffFMuvlO3MCeC90/edit?usp=sharing",
  WEB_APP_URL:
    "https://script.google.com/macros/s/AKfycbwGe0bZiJ2GCFaNuqDTHjQgJt9bvgsV8kPmQkwMekCzpvBLzAZ2Hk9x7_qpvbLU7bddXQ/exec",
  SITE_URL: "https://notaluaruber.netlify.app/",
  VERSION: "2.0",
};

// ==============================
// VARIABEL GLOBAL
// ==============================
let lastTransactionId = "NOTLU-0000";
let totalTransactions = 0;
let todayTransactions = 0;

// ==============================
// FUNGSI UTAMA
// ==============================

// Fungsi untuk generate ID transaksi
function generateTransactionId() {
  const lastNumber = parseInt(lastTransactionId.split("-")[1]) || 0;
  const newNumber = lastNumber + 1;
  return `NOTLU-${newNumber.toString().padStart(4, "0")}`;
}

// Fungsi untuk menghitung kadar mesin (PERUBAHAN DI SINI)
function calculateKadarMesin() {
  const presentaseMesin =
    parseFloat(document.getElementById("presentaseMesin").value) || 0;
  const kadarMesin = (presentaseMesin / 100) * 24;

  // PERUBAHAN: Menggunakan toFixed(1) untuk satu digit di belakang koma
  document.getElementById("kadarMesin").value = kadarMesin.toFixed(1);
  return kadarMesin;
}

// Fungsi untuk menghitung berat terima
function calculateBeratTerima() {
  const beratSurat =
    parseFloat(document.getElementById("beratSurat").value) || 0;
  const beratFisik =
    parseFloat(document.getElementById("beratFisik").value) || 0;
  const susut = parseFloat(document.getElementById("susut").value) || 0;

  let beratTerima;
  if (beratSurat > 0 && beratSurat < beratFisik) {
    beratTerima = beratSurat - susut;
  } else {
    beratTerima = beratFisik - susut;
  }

  beratTerima = Math.max(beratTerima, 0);
  document.getElementById("beratTerima").value = beratTerima.toFixed(2);
  return beratTerima;
}

// Fungsi untuk menghitung harga per gram
function calculateHargaPerGram() {
  const cokimTerima =
    parseFloat(document.getElementById("cokimTerima").value) || 0;
  const rateTerima =
    parseFloat(document.getElementById("rateTerima").value) || 0;
  const hargaPerGram =
    Math.floor((cokimTerima * (rateTerima / 100)) / 500) * 500;
  document.getElementById("hargaPerGram").value = hargaPerGram;
  return hargaPerGram;
}

// Fungsi untuk menghitung harga terima
function calculateHargaTerima() {
  const hargaPerGram =
    parseFloat(document.getElementById("hargaPerGram").value) || 0;
  const beratTerima =
    parseFloat(document.getElementById("beratTerima").value) || 0;
  const hargaTerima = Math.floor((hargaPerGram * beratTerima) / 500) * 500;
  document.getElementById("hargaTerima").value = hargaTerima;
  return hargaTerima;
}

// Fungsi untuk update preview (PERUBAHAN DI SINI)
function updatePreview() {
  const formData = new FormData(document.getElementById("emasForm"));
  const previewContent = document.getElementById("previewContent");

  let hasData = false;
  for (let value of formData.values()) {
    if (value) {
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

  previewContent.innerHTML = previewHTML;
  document.getElementById("printPreviewBtn").disabled = false;
}

// Fungsi untuk membuat struk thermal (PERUBAHAN DI SINI)
function createThermalReceipt(transactionId, formData) {
  const thermalReceipt = document.getElementById("thermalReceipt");
  const formatRupiah = (value) => {
    if (!value) return "0";
    return parseInt(value).toLocaleString("id-ID");
  };

  // PERUBAHAN: Format kadar mesin menjadi satu digit di belakang koma
  const kadarMesinValue = document.getElementById("kadarMesin").value || "0";
  const formattedKadarMesin = parseFloat(kadarMesinValue).toFixed(1);

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
        <div class="receipt-line"><span>Kadar Mesin:</span><span>${formattedKadarMesin}</span></div>
        <div class="receipt-line"><span>Kode Pabrik:</span><span>${formData.get("kodePabrik") || "-"}</span></div>
        
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

// Fungsi untuk mencetak struk
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

// Fungsi untuk test cetak
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

// Fungsi untuk menyimpan ke spreadsheet (PERUBAHAN DI SINI)
async function saveToSpreadsheet(formData, transactionId) {
  const dataToSend = {
    transactionId: transactionId,
    kodeSales: formData.get("kodeSales"),
    cokimTerima: formData.get("cokimTerima"),
    jenisBarang: formData.get("jenisBarang"),
    surat: formData.get("surat"),
    namaToko: formData.get("namaToko") || "",
    kadarFisik: formData.get("kadarFisik") || 0,
    presentaseMesin: formData.get("presentaseMesin"),
    // PERUBAHAN: Menggunakan parseFloat().toFixed(1) untuk satu digit di belakang koma
    kadarMesin: parseFloat(
      document.getElementById("kadarMesin").value || 0,
    ).toFixed(1),
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
  };

  console.log("Mengirim data:", dataToSend);

  try {
    // Menggunakan mode 'no-cors' untuk menghindari CORS error
    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(dataToSend),
    });

    // Karena mode no-cors, kita tidak bisa membaca response
    // Simpan backup ke localStorage
    saveBackup(dataToSend);

    return {
      success: true,
      message: "Data berhasil dikirim ke spreadsheet",
      transactionId: transactionId,
    };
  } catch (error) {
    console.error("Error:", error);
    saveBackup(dataToSend);
    throw new Error("Gagal mengirim data: " + error.message);
  }
}

// Fungsi untuk menyimpan backup (PERUBAHAN DI SINI)
function saveBackup(data) {
  try {
    const backupKey = `backup_${data.transactionId}_${Date.now()}`;

    // PERUBAHAN: Memastikan kadarMesin disimpan dengan satu digit di belakang koma
    const backupData = {
      ...data,
      backupTime: new Date().toISOString(),
      status: "pending",
    };

    // Jika kadarMesin belum diformat, format menjadi satu digit
    if (backupData.kadarMesin && typeof backupData.kadarMesin === "string") {
      backupData.kadarMesin = parseFloat(backupData.kadarMesin).toFixed(1);
    }

    localStorage.setItem(backupKey, JSON.stringify(backupData));

    const backupList = JSON.parse(localStorage.getItem("backup_list") || "[]");
    backupList.push(backupKey);
    localStorage.setItem("backup_list", JSON.stringify(backupList));

    console.log("Data disimpan sebagai backup:", backupKey);
  } catch (error) {
    console.error("Gagal menyimpan backup:", error);
  }
}

// Fungsi untuk mengambil statistik
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

// Fungsi untuk menampilkan status
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

// Fungsi untuk mereset form dan scroll ke atas form
function resetForm() {
  document.getElementById("emasForm").reset();
  document.getElementById("kadarMesin").value = "";
  document.getElementById("beratTerima").value = "";
  document.getElementById("hargaPerGram").value = "";
  document.getElementById("hargaTerima").value = "";

  document.getElementById("previewContent").innerHTML =
    '<p class="preview-placeholder">Form belum diisi. Data akan muncul di sini setelah diisi.</p>';
  document.getElementById("printPreviewBtn").disabled = true;

  // Scroll ke atas form
  document.querySelector(".form-section").scrollIntoView({
    behavior: "smooth",
  });

  showStatus("Form telah direset. Silakan isi data baru.", true, 3000);
}

// Fungsi untuk menyimpan data (tanpa cetak)
async function saveData() {
  if (!document.getElementById("emasForm").checkValidity()) {
    document.getElementById("emasForm").reportValidity();
    showStatus("Harap lengkapi semua field yang wajib diisi!", false);
    return;
  }

  const beratFisik = parseFloat(document.getElementById("beratFisik").value);
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
    const formData = new FormData(document.getElementById("emasForm"));
    const transactionId = generateTransactionId();

    updateLoadingMessage("Menyimpan data ke spreadsheet...");

    // Simpan ke spreadsheet
    const result = await saveToSpreadsheet(formData, transactionId);

    updateLoadingMessage("Data berhasil disimpan...");

    // Reset form setelah berhasil disimpan
    setTimeout(() => {
      resetForm();
      document.getElementById("loadingOverlay").classList.remove("show");

      // Update statistik
      fetchStatistics();

      showStatus(
        `Data berhasil disimpan dengan ID: <strong>${transactionId}</strong>`,
        true,
        6000,
      );
    }, 1000);
  } catch (error) {
    console.error("Error:", error);
    document.getElementById("loadingOverlay").classList.remove("show");
    showStatus(`Gagal menyimpan data: ${error.message}`, false, 8000);
  }
}

// Fungsi untuk update loading message
function updateLoadingMessage(message) {
  document.getElementById("loadingMessage").textContent = message;
}

// ==============================
// EVENT LISTENERS
// ==============================
document.addEventListener("DOMContentLoaded", function () {
  // Set tahun di footer
  document.getElementById("currentYear").textContent = new Date().getFullYear();

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
    document.getElementById(inputId).addEventListener("input", function () {
      calculateKadarMesin();
      calculateBeratTerima();
      calculateHargaPerGram();
      calculateHargaTerima();
      updatePreview();
    });
  });

  // Event listener untuk input lainnya
  const formInputs = document.querySelectorAll(
    "#emasForm input, #emasForm select",
  );
  formInputs.forEach((input) => {
    if (!calculationInputs.includes(input.id)) {
      input.addEventListener("input", updatePreview);
    }
  });

  // Event listener untuk reset button
  document.getElementById("resetBtn").addEventListener("click", resetForm);

  // Event listener untuk save button
  document.getElementById("saveBtn").addEventListener("click", saveData);

  // Event listener untuk test print button
  document.getElementById("testPrintBtn").addEventListener("click", testPrint);

  // Event listener untuk print preview button
  document
    .getElementById("printPreviewBtn")
    .addEventListener("click", function () {
      const formData = new FormData(document.getElementById("emasForm"));
      const transactionId = generateTransactionId();
      createThermalReceipt(transactionId, formData);
      printThermalReceipt();
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
