// ==============================
// KONFIGURASI
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzuhc_5prdNNQR8__9Ztl1p06gLPqnJXPy9eALH6_qkBeRiFTijirO3NiTqYAZ7Zolr/exec",
};

// ==============================
// STATE
// ==============================
let allInduk = []; // [{ nomorInduk, idCustomer, tanggal, jam, createdAt, jumlahBarang }]
let filteredInduk = [];
let allCustomers = []; // untuk lookup nama & no HP by idCustomer

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
              <button class="btn-icon btn-wa" data-id="${induk.nomorInduk}" title="Laporan WA"><i class="fab fa-whatsapp"></i></button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-view").forEach((b) => b.addEventListener("click", () => openIndukDetail(b.dataset.id)));
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
  } catch (err) {
    showStatus(`Gagal memuat detail: ${err.message}`, false, 7000);
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
    lines.push(`Cokim : ${waFieldValue(item.cokimTerima, false)}`);
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
    lines.push(`Rate yang di pakai : ${waPercentValue(item.rateTerima)}`);
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
