// ==============================
// KONFIGURASI
// ==============================
const CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat Code.gs)
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbx24SIxySt-uGMnkhMuS7SySaTFown7uQlRqZQTF0AgCTR9kQkVchRboibvRDDHfXv7/exec",
  MAX_IMAGE_DIMENSION: 1280, // px, sisi terpanjang setelah kompresi
  IMAGE_QUALITY: 0.7, // kualitas JPEG hasil kompresi
  MAX_CUSTOMER_PHOTOS: 3,
};

// ==============================
// STATE
// ==============================
let allCustomers = []; // [{ idCustomer, nama, noHp, foto1, foto2, foto3 }]
let filteredCustomers = [];
let currentEditCustomerId = null;
let selectedEditCustomerImages = []; // foto baru yang akan ditambahkan
let editCustomerRemoveSlots = []; // slot foto lama (1/2/3) yang ditandai untuk dihapus

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

/**
 * Sama seperti compressImage di script.js/crud-script.js - dipakai
 * supaya foto customer yang ditambahkan lewat halaman ini juga
 * dikompres sebelum dikirim.
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
// MUAT & RENDER DATA
// ==============================
async function loadCustomers() {
  const loadingEl = document.getElementById("loadingData");
  const noDataEl = document.getElementById("noDataMessage");
  const tableBody = document.getElementById("tableBody");

  loadingEl.classList.add("show");
  noDataEl.classList.remove("show");
  tableBody.innerHTML = "";

  try {
    const result = await apiGet({ action: "customerlist" });
    allCustomers = result.data || [];
    applyFilter();
    document.getElementById("connectionText").textContent = "Terhubung ke Spreadsheet";
  } catch (err) {
    showStatus(`Gagal memuat data customer: ${err.message}`, false, 7000);
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
  filteredCustomers = !q
    ? allCustomers.slice()
    : allCustomers.filter(
        (c) => String(c.nama).toLowerCase().includes(q) || String(c.noHp || "").toLowerCase().includes(q),
      );
  filteredCustomers.sort((a, b) => String(a.idCustomer).localeCompare(String(b.idCustomer)));
  renderTable();
}

function renderTable() {
  const tableBody = document.getElementById("tableBody");
  const noDataEl = document.getElementById("noDataMessage");

  document.getElementById("totalRecords").textContent = `Total: ${filteredCustomers.length} customer`;

  if (!filteredCustomers.length) {
    tableBody.innerHTML = "";
    noDataEl.classList.add("show");
    return;
  }
  noDataEl.classList.remove("show");

  tableBody.innerHTML = filteredCustomers
    .map((c, idx) => {
      const photos = [c.foto1, c.foto2, c.foto3].filter(Boolean);
      const photoCell = photos.length
        ? photos
            .map(
              (url) =>
                `<img src="${getDriveThumbnailUrl(url)}" alt="foto ${c.nama}" class="customer-table-thumb" onclick="window.open('${url}','_blank')" />`,
            )
            .join("")
        : '<span class="cust-id-tag">Belum ada foto</span>';

      return `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${c.idCustomer}</strong></td>
          <td>${c.nama || "-"}</td>
          <td>${c.noHp || "-"}</td>
          <td><div class="customer-table-photos">${photoCell}</div></td>
          <td>
            <div class="action-buttons">
              <button class="btn-icon btn-edit" data-id="${c.idCustomer}" title="Edit"><i class="fas fa-edit"></i></button>
            </div>
          </td>
        </tr>`;
    })
    .join("");

  tableBody.querySelectorAll(".btn-edit").forEach((b) =>
    b.addEventListener("click", () => openEditCustomerModal(b.dataset.id)),
  );
}

// ==============================
// EDIT CUSTOMER
// ==============================
function openEditCustomerModal(idCustomer) {
  const customer = findCustomerById(idCustomer);
  if (!customer) {
    showStatus("Data customer tidak ditemukan.", false);
    return;
  }

  currentEditCustomerId = idCustomer;
  selectedEditCustomerImages = [];
  editCustomerRemoveSlots = [];

  document.getElementById("editCustomerName").value = customer.nama || "";
  document.getElementById("editCustomerPhone").value = customer.noHp || "";
  document.getElementById("editCustomerIdDisplay").value = customer.idCustomer;

  renderEditCustomerExistingPhotos(customer);
  renderEditCustomerImagePreviews();
  document.getElementById("editCustomerImageUpload").value = "";
  updateEditCustomerSlotInfo();

  document.getElementById("editCustomerModal").classList.add("show");
}

function renderEditCustomerExistingPhotos(customer) {
  const container = document.getElementById("editCustomerExistingPhotos");
  if (!container) return;

  const slots = [1, 2, 3].map((n) => ({ slot: n, url: customer[`foto${n}`] })).filter((s) => s.url);

  if (!slots.length) {
    container.innerHTML = '<p class="edit-image-hint">Belum ada foto tersimpan.</p>';
    return;
  }

  container.innerHTML = slots
    .map(
      (s) => `
      <div class="image-preview-item edit-customer-existing-item" data-slot="${s.slot}">
        <img src="${getDriveThumbnailUrl(s.url)}" alt="foto customer ${s.slot}" />
        <button type="button" class="remove-image remove-existing-customer-photo" data-slot="${s.slot}" title="Hapus foto ini">&times;</button>
      </div>`,
    )
    .join("");

  container.querySelectorAll(".remove-existing-customer-photo").forEach((btn) => {
    btn.addEventListener("click", () => {
      const slot = parseInt(btn.dataset.slot, 10);
      const item = btn.closest(".edit-customer-existing-item");
      if (editCustomerRemoveSlots.includes(slot)) {
        editCustomerRemoveSlots = editCustomerRemoveSlots.filter((s) => s !== slot);
        item.classList.remove("marked-for-removal");
      } else {
        editCustomerRemoveSlots.push(slot);
        item.classList.add("marked-for-removal");
      }
      updateEditCustomerSlotInfo();
    });
  });
}

function updateEditCustomerSlotInfo() {
  const customer = findCustomerById(currentEditCustomerId);
  if (!customer) return;
  const stillExisting = [1, 2, 3].filter(
    (n) => customer[`foto${n}`] && !editCustomerRemoveSlots.includes(n),
  ).length;
  const remaining = Math.max(CONFIG.MAX_CUSTOMER_PHOTOS - stillExisting - selectedEditCustomerImages.length, 0);
  const info = document.getElementById("editCustomerImageSlotInfo");
  if (info) info.textContent = `Sisa ${remaining} slot`;
}

function renderEditCustomerImagePreviews() {
  const container = document.getElementById("editCustomerImagePreviewContainer");
  if (!container) return;

  container.innerHTML = selectedEditCustomerImages
    .map(
      (img, idx) => `
      <div class="image-preview-item">
        <img src="${img.dataUrl}" alt="foto customer baru ${idx + 1}" />
        <span class="image-size-tag">${img.sizeKb} KB</span>
        <button type="button" class="remove-image remove-new-customer-image" data-idx="${idx}" title="Hapus">&times;</button>
      </div>`,
    )
    .join("");

  container.querySelectorAll(".remove-new-customer-image").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedEditCustomerImages.splice(parseInt(btn.dataset.idx, 10), 1);
      renderEditCustomerImagePreviews();
      updateEditCustomerSlotInfo();
    });
  });

  const countLabel = document.getElementById("selectedEditCustomerImageCount");
  if (countLabel) countLabel.textContent = `${selectedEditCustomerImages.length} foto baru dipilih`;
}

async function handleEditCustomerImageSelection(fileList) {
  const customer = findCustomerById(currentEditCustomerId);
  const stillExisting = customer
    ? [1, 2, 3].filter((n) => customer[`foto${n}`] && !editCustomerRemoveSlots.includes(n)).length
    : 0;
  const remainingSlots = CONFIG.MAX_CUSTOMER_PHOTOS - stillExisting - selectedEditCustomerImages.length;
  const files = Array.from(fileList);

  if (remainingSlots <= 0) {
    showStatus(`Slot foto customer sudah penuh (maksimal ${CONFIG.MAX_CUSTOMER_PHOTOS} foto).`, false);
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
      selectedEditCustomerImages.push(compressed);
    } catch (err) {
      showStatus(`Gagal memproses foto ${file.name}: ${err.message}`, false);
    }
  }

  renderEditCustomerImagePreviews();
  updateEditCustomerSlotInfo();
}

async function saveEditCustomer() {
  if (!currentEditCustomerId) return;

  const nama = document.getElementById("editCustomerName").value.trim();
  const noHp = document.getElementById("editCustomerPhone").value.trim();

  if (!nama) {
    showStatus("Nama customer wajib diisi.", false);
    return;
  }
  if (!noHp) {
    showStatus("Nomor HP wajib diisi.", false);
    return;
  }

  // Cegah 2 customer berbeda memakai nomor HP yang sama (No HP
  // adalah kunci utama identifikasi customer).
  const duplicate = allCustomers.find(
    (c) => String(c.noHp || "").trim() === noHp && String(c.idCustomer) !== String(currentEditCustomerId),
  );
  if (duplicate) {
    showStatus(`Nomor HP ini sudah dipakai oleh customer lain: ${duplicate.nama} (${duplicate.idCustomer}).`, false, 7000);
    return;
  }

  const photos = selectedEditCustomerImages.map((img) => ({ data: img.base64, mimeType: img.mimeType }));

  document.getElementById("loadingOverlay").classList.add("show");
  updateLoadingMessage("Menyimpan perubahan customer...");

  try {
    await apiPost({
      action: "customerupdate",
      id: currentEditCustomerId,
      nama,
      noHp,
      removeSlots: editCustomerRemoveSlots,
      photos,
    });

    document.getElementById("editCustomerModal").classList.remove("show");
    showStatus(`Data customer ${currentEditCustomerId} berhasil diperbarui.`, true);

    await loadCustomers();
  } catch (err) {
    showStatus(`Gagal menyimpan perubahan customer: ${err.message}`, false, 7000);
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

document.getElementById("closeEditCustomerModal").addEventListener("click", () => {
  document.getElementById("editCustomerModal").classList.remove("show");
});
document.getElementById("editCustomerModal").addEventListener("click", (e) => {
  if (e.target.id === "editCustomerModal") e.currentTarget.classList.remove("show");
});
document.getElementById("cancelEditCustomer").addEventListener("click", () => {
  document.getElementById("editCustomerModal").classList.remove("show");
});
document.getElementById("saveEditCustomer").addEventListener("click", saveEditCustomer);
document.getElementById("editCustomerImageUpload").addEventListener("change", (e) => {
  handleEditCustomerImageSelection(e.target.files);
  e.target.value = "";
});

// (BARU) Drag & drop foto customer langsung ke area upload
enableDragDrop(document.getElementById("editCustomerImageUpload").closest(".image-upload-container"), (files) => {
  handleEditCustomerImageSelection(files);
});

// ==============================
// INIT
// ==============================
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("currentYear").textContent = new Date().getFullYear();
  await loadCustomers();

  // Kalau datang dari halaman lain lewat link "Edit data customer"
  // (mis. customer.html?edit=CUST-0001), langsung buka modal edit
  // untuk customer tersebut.
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (editId) {
    if (findCustomerById(editId)) {
      openEditCustomerModal(editId);
    } else {
      showStatus(`Customer dengan ID ${editId} tidak ditemukan.`, false, 6000);
    }
  }
});
