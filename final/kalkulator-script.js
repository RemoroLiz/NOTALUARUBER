// ==============================
// KALKULATOR HARGA EMAS (BARU)
// ==============================
// Halaman ini SENGAJA berdiri sendiri, tidak memanggil backend/
// spreadsheet apapun - murni simulasi cepat di sisi browser. Hasil
// perhitungan TIDAK disimpan kemanapun; setiap refresh/reset akan
// menghapus hasil sebelumnya.

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

/**
 * Membulatkan value ke BAWAH ke kelipatan step terdekat (mis. floorToStep(123456, 500) -> 123000).
 * Pola sama dengan yang dipakai di form input utama (script.js) supaya
 * hasil kalkulator selalu konsisten dengan hasil transaksi sungguhan.
 */
function floorToStep(value, step) {
  if (!isFinite(value)) return 0;
  return Math.floor(value / step) * step;
}

function formatRupiah(value) {
  const num = parseFloat(value) || 0;
  return "Rp " + Math.round(num).toLocaleString("id-ID");
}

/**
 * Format angka biasa (bukan mata uang) dengan separator ribuan
 * bertitik ala Indonesia - dipakai untuk Cokim & Rate supaya jelas
 * terbaca, termasuk saat dicetak di struk thermal.
 */
function formatNumberID(value) {
  if (value === undefined || value === null || String(value).trim() === "") return "-";
  const num = Number(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString("id-ID");
}

// ==============================
// STATE & PERHITUNGAN
// ==============================
let lastResult = null; // { cokim, rate, berat, hargaPerGram, total }

function getInputs() {
  const cokim = parseFloat(document.getElementById("calcCokim").value);
  const rate = parseFloat(document.getElementById("calcRate").value);
  const berat = parseFloat(document.getElementById("calcBerat").value);
  return { cokim, rate, berat };
}

function calculate() {
  const { cokim, rate, berat } = getInputs();
  const printBtn = document.getElementById("calcPrintBtn");

  const cokimOk = !isNaN(cokim) && cokim > 0;
  const rateOk = !isNaN(rate) && rate > 0;
  const beratOk = !isNaN(berat) && berat > 0;

  document.getElementById("calcOutCokim").textContent = cokimOk ? formatNumberID(cokim) : "-";
  document.getElementById("calcOutRate").textContent = rateOk ? `${formatNumberID(rate)}%` : "-";
  document.getElementById("calcOutBerat").textContent = beratOk ? `${berat} g` : "-";

  if (!cokimOk || !rateOk) {
    document.getElementById("calcOutHargaGram").textContent = "Rp 0";
    document.getElementById("calcOutTotal").textContent = "Rp 0";
    printBtn.disabled = true;
    lastResult = null;
    return;
  }

  // Harga/gram = floor(cokim x rate%) ke kelipatan 500
  const hargaPerGram = floorToStep(cokim * (rate / 100), 500);
  document.getElementById("calcOutHargaGram").textContent = formatRupiah(hargaPerGram);

  if (!beratOk) {
    document.getElementById("calcOutTotal").textContent = "Rp 0";
    printBtn.disabled = true;
    lastResult = null;
    return;
  }

  // Total = floor(berat x harga/gram) ke kelipatan 500
  const total = floorToStep(berat * hargaPerGram, 500);
  document.getElementById("calcOutTotal").textContent = formatRupiah(total);

  lastResult = { cokim, rate, berat, hargaPerGram, total };
  printBtn.disabled = false;
}

function resetCalculator() {
  document.getElementById("calcCokim").value = "";
  document.getElementById("calcRate").value = "";
  document.getElementById("calcBerat").value = "";
  calculate();
  showStatus("Kalkulator direset.", true, 2500);
}

// ==============================
// CETAK THERMAL (BARU)
// ==============================
const THERMAL_PRINT_STYLE = `
  @page { size: 48mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 48mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .thermal-receipt {
    width: 48mm;
    /* Padding kiri sengaja lebih besar - lihat catatan di script.js
       soal area mati (unprintable margin) di ujung kiri printer
       thermal. */
    padding: 1.5mm 2mm 1.5mm 5mm;
    page-break-after: avoid;
    page-break-inside: avoid;
  }
  .thermal-receipt .tr-title { text-align: center; font-size: 10pt; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 1.2mm; }
  .thermal-receipt .tr-sub { text-align: center; font-size: 7.5pt; margin-bottom: 1.8mm; color: #333; }
  .thermal-receipt hr { border: none; border-top: 0.4mm dashed #000; margin: 1.2mm 0; }
  .thermal-receipt .tr-row { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: 8.5pt; line-height: 1.6; }
  .thermal-receipt .tr-row .k { white-space: nowrap; }
  .thermal-receipt .tr-row .v { font-weight: 700; text-align: right; word-break: break-word; }
  .thermal-receipt .tr-total { font-size: 9.5pt; font-weight: 700; display: flex; justify-content: space-between; margin-top: 1.8mm; }
  .thermal-receipt .tr-footer { text-align: center; font-size: 7pt; margin-top: 2mm; color: #333; }
  .thermal-receipt .tr-credit { text-align: center; font-size: 6pt; color: #888; margin-top: 1.5mm; }
`;

function buildCalcReceipt(result) {
  const now = new Date();
  const tanggalJam = now.toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

  return `
    <div class="thermal-receipt">
      <div class="tr-title">SIMULASI HARGA EMAS</div>
      <div class="tr-sub">${tanggalJam} &middot; BUKAN NOTA TRANSAKSI</div>
      <hr />
      <div class="tr-row"><span class="k">Cokim</span><span class="v">${formatNumberID(result.cokim)}</span></div>
      <div class="tr-row"><span class="k">Rate</span><span class="v">${formatNumberID(result.rate)}%</span></div>
      <div class="tr-row"><span class="k">Berat</span><span class="v">${result.berat} g</span></div>
      <hr />
      <div class="tr-row"><span class="k">Harga/gram</span><span class="v">${formatRupiah(result.hargaPerGram)}</span></div>
      <div class="tr-total"><span>TOTAL HARGA</span><span>${formatRupiah(result.total)}</span></div>
      <div class="tr-footer">Estimasi harga, bisa berubah saat transaksi berlangsung</div>
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
      `<!doctype html><html><head><meta charset="UTF-8" /><title>Simulasi Harga</title><style>${THERMAL_PRINT_STYLE}</style></head><body>${bodyHtml}</body></html>`,
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
        console.error("Gagal mencetak simulasi:", err);
      }
      finish();
    };

    iframe.onload = () => setTimeout(triggerPrint, 100);
    setTimeout(triggerPrint, 500);
  });
}

async function printCalcReceipt() {
  if (!lastResult) {
    showStatus("Isi Cokim, Rate, dan Berat terlebih dahulu.", false);
    return;
  }
  await printThermalDocument(buildCalcReceipt(lastResult));
}

// ==============================
// EVENTS
// ==============================
["calcCokim", "calcRate", "calcBerat"].forEach((id) => {
  document.getElementById(id).addEventListener("input", calculate);
});
document.getElementById("calcResetBtn").addEventListener("click", resetCalculator);
document.getElementById("calcPrintBtn").addEventListener("click", printCalcReceipt);

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  calculate();
});
