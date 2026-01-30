// ==============================
// KONFIGURASI SISTEM CRUD
// ==============================
const CONFIG = {
  SPREADSHEET_URL:
    "https://docs.google.com/spreadsheets/d/1xsWtTsJ1XFd6GUiObAKGAX8XDjC76wz7xuCqQCafr20/edit?usp=sharing",
  WEB_APP_URL:
    "https://script.google.com/macros/s/AKfycbyLjDbsXYBWR_MXhi85BLpU5cYZkUb3j8GgmG-bs1yhxLT5LZVsqt08gnrRkVGZ8iKaNg/exec",
  ITEMS_PER_PAGE: 15,
  VERSION: "2.1",
};

// ==============================
// VARIABEL GLOBAL
// ==============================
let allData = [];
let filteredData = [];
let currentPage = 1;
let currentEditId = null;
let currentDetailId = null;

// ==============================
// FUNGSI UTILITAS
// ==============================

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

// Fungsi untuk update loading message
function updateLoadingMessage(message) {
  const element = document.getElementById("loadingMessage");
  if (element) element.textContent = message;
}

// Fungsi untuk menampilkan loading overlay
function showLoading(message = "Memproses...") {
  updateLoadingMessage(message);
  document.getElementById("loadingOverlay").classList.add("show");
}

function hideLoading() {
  document.getElementById("loadingOverlay").classList.remove("show");
}

// Format tanggal Indonesia
function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// Format Rupiah
function formatRupiah(amount) {
  if (!amount) return "Rp 0";
  return "Rp " + parseInt(amount).toLocaleString("id-ID");
}

// ==============================
// FUNGSI UNTUK GAMBAR
// ==============================

// Fungsi untuk mendapatkan thumbnail URL dari Google Drive
function getDriveThumbnailUrl(driveUrl) {
  if (!driveUrl) return null;

  try {
    // Jika sudah berupa direct URL dengan view
    if (driveUrl.includes("uc?export=view")) {
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

// Fungsi untuk mendapatkan URL download dari Google Drive
function getDriveDownloadUrl(driveUrl) {
  if (!driveUrl) return null;

  try {
    // Jika URL Google Drive standar
    if (driveUrl.includes("drive.google.com/file/d/")) {
      const fileIdMatch = driveUrl.match(/\/d\/([^\/]+)/);
      if (fileIdMatch && fileIdMatch[1]) {
        return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
      }
    }

    // Jika sudah ada parameter id
    if (driveUrl.includes("id=")) {
      const idMatch = driveUrl.match(/id=([^&]+)/);
      if (idMatch && idMatch[1]) {
        return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
      }
    }

    return driveUrl;
  } catch (error) {
    console.error("Error generating download URL:", error);
    return driveUrl;
  }
}

// ==============================
// FUNGSI CRUD OPERATIONS
// ==============================

// Ambil semua data dari spreadsheet
async function fetchAllData() {
  try {
    showLoading("Memuat data dari spreadsheet...");

    const response = await fetch(
      `${CONFIG.WEB_APP_URL}?operation=get_all&t=${Date.now()}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success) {
      allData = data.data || [];
      filteredData = [...allData];

      // Urutkan berdasarkan tanggal terbaru
      filteredData.sort((a, b) => {
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

      showStatus(`Berhasil memuat ${allData.length} data`, true, 3000);
      updatePagination();
      renderTable();
    } else {
      throw new Error(data.message || "Gagal memuat data");
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    showStatus("Gagal memuat data: " + error.message, false, 5000);
    allData = [];
    filteredData = [];
    updatePagination();
    renderTable();
  } finally {
    hideLoading();
    document.getElementById("loadingData").style.display = "none";
  }
}

// Ambil data detail berdasarkan ID
async function fetchDataById(id) {
  try {
    showLoading("Memuat detail data...");

    const response = await fetch(
      `${CONFIG.WEB_APP_URL}?operation=get_by_id&id=${id}&t=${Date.now()}`,
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.success && data.data) {
      return data.data;
    } else {
      throw new Error(data.message || "Data tidak ditemukan");
    }
  } catch (error) {
    console.error("Error fetching detail:", error);
    showStatus("Gagal memuat detail: " + error.message, false, 3000);
    return null;
  } finally {
    hideLoading();
  }
}

// Update data
async function updateData(data) {
  try {
    showLoading("Menyimpan perubahan...");

    const response = await fetch(CONFIG.WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operation: "update",
        ...data,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      showStatus("Data berhasil diperbarui", true, 3000);

      // Refresh data
      await fetchAllData();

      // Tutup modal edit
      closeEditModal();

      return true;
    } else {
      throw new Error(result.message || "Gagal memperbarui data");
    }
  } catch (error) {
    console.error("Error updating data:", error);
    showStatus("Gagal memperbarui: " + error.message, false, 5000);
    return false;
  } finally {
    hideLoading();
  }
}

// Hapus data
async function deleteData(id) {
  try {
    const result = await Swal.fire({
      title: "Apakah Anda yakin?",
      text: "Data yang dihapus tidak dapat dikembalikan!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Ya, hapus!",
      cancelButtonText: "Batal",
      reverseButtons: true,
    });

    if (result.isConfirmed) {
      showLoading("Menghapus data...");

      const response = await fetch(CONFIG.WEB_APP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          operation: "delete",
          transactionId: id,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        showStatus("Data berhasil dihapus", true, 3000);

        // Refresh data
        await fetchAllData();

        Swal.fire("Terhapus!", "Data telah berhasil dihapus.", "success");
      } else {
        throw new Error(data.message || "Gagal menghapus data");
      }
    }
  } catch (error) {
    console.error("Error deleting data:", error);
    showStatus("Gagal menghapus: " + error.message, false, 5000);
    Swal.fire("Error!", "Gagal menghapus data: " + error.message, "error");
  } finally {
    hideLoading();
  }
}

// ==============================
// FUNGSI RENDER TABLE
// ==============================

// Render tabel dengan data
function renderTable() {
  const tableBody = document.getElementById("tableBody");
  const noDataMessage = document.getElementById("noDataMessage");

  if (!tableBody) return;

  // Clear existing rows
  tableBody.innerHTML = "";

  if (filteredData.length === 0) {
    tableBody.style.display = "none";
    noDataMessage.style.display = "block";
    return;
  }

  tableBody.style.display = "table-row-group";
  noDataMessage.style.display = "none";

  // Calculate start and end index for current page
  const startIndex = (currentPage - 1) * CONFIG.ITEMS_PER_PAGE;
  const endIndex = Math.min(
    startIndex + CONFIG.ITEMS_PER_PAGE,
    filteredData.length,
  );
  const currentData = filteredData.slice(startIndex, endIndex);

  // Render rows
  currentData.forEach((item, index) => {
    const rowNumber = startIndex + index + 1;
    const row = document.createElement("tr");

    row.innerHTML = `
            <td>${rowNumber}</td>
            <td>
                <strong>${item.transactionId || "-"}</strong>
            </td>
            <td>${formatDate(item.timestamp)}</td>
            <td>${item.kodeSales || "-"}</td>
            <td>${item.jenisBarang || "-"}</td>
            <td>${item.kadarMesin || "0"}</td>
            <td>${item.beratTerima || "0"} g</td>
            <td>${formatRupiah(item.hargaTerima)}</td>
            <td>
                <span class="status-badge ${item.statusCetak === "SUDAH CETAK" ? "status-printed" : "status-unprinted"}">
                    ${item.statusCetak || "BELUM CETAK"}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-info btn-sm" onclick="showDetail('${item.transactionId}')" title="Lihat Detail">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="reprintData('${item.transactionId}')" title="Cetak Ulang">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="btn btn-primary btn-sm" onclick="editData('${item.transactionId}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deleteData('${item.transactionId}')" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

    tableBody.appendChild(row);
  });

  // Update pagination info
  updatePaginationInfo();
}

// Update informasi pagination
function updatePaginationInfo() {
  const currentPageElement = document.getElementById("currentPage");
  const totalRecordsElement = document.getElementById("totalRecords");
  const prevButton = document.getElementById("prevPage");
  const nextButton = document.getElementById("nextPage");

  if (!currentPageElement || !totalRecordsElement) return;

  const totalPages = Math.ceil(filteredData.length / CONFIG.ITEMS_PER_PAGE);

  currentPageElement.textContent = `Halaman ${currentPage} dari ${totalPages}`;
  totalRecordsElement.textContent = `Total: ${filteredData.length} data`;

  // Enable/disable pagination buttons
  if (prevButton) {
    prevButton.disabled = currentPage <= 1;
  }

  if (nextButton) {
    nextButton.disabled = currentPage >= totalPages;
  }
}

// Update pagination
function updatePagination() {
  const totalPages = Math.ceil(filteredData.length / CONFIG.ITEMS_PER_PAGE);

  // Reset to page 1 if current page doesn't exist
  if (currentPage > totalPages && totalPages > 0) {
    currentPage = 1;
  }

  // Update pagination controls
  updatePaginationInfo();
}

// ==============================
// FUNGSI FILTER & SEARCH
// ==============================

// Filter data berdasarkan kriteria
function filterData() {
  const searchTerm = document.getElementById("searchInput").value.toLowerCase();
  const filterDate = document.getElementById("filterDate").value;
  const filterStatus = document.getElementById("filterStatus").value;

  filteredData = allData.filter((item) => {
    // Filter search term
    if (searchTerm) {
      const searchFields = [
        item.transactionId,
        item.kodeSales,
        item.jenisBarang,
        item.namaToko,
        item.kodePabrik,
      ]
        .join(" ")
        .toLowerCase();

      if (!searchFields.includes(searchTerm)) {
        return false;
      }
    }

    // Filter date
    if (filterDate && item.timestamp) {
      const itemDate = new Date(item.timestamp);
      const today = new Date();
      const startOfWeek = new Date(today);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      startOfWeek.setDate(today.getDate() - today.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      switch (filterDate) {
        case "today":
          if (itemDate.toDateString() !== today.toDateString()) {
            return false;
          }
          break;
        case "week":
          if (itemDate < startOfWeek) {
            return false;
          }
          break;
        case "month":
          if (itemDate < startOfMonth) {
            return false;
          }
          break;
      }
    }

    // Filter status
    if (filterStatus) {
      if (
        filterStatus === "SUDAH CETAK" &&
        item.statusCetak !== "SUDAH CETAK"
      ) {
        return false;
      }
      if (
        filterStatus === "BELUM CETAK" &&
        item.statusCetak === "SUDAH CETAK"
      ) {
        return false;
      }
    }

    return true;
  });

  // Reset ke halaman 1
  currentPage = 1;

  // Update tampilan
  updatePagination();
  renderTable();
}

// Reset semua filter
function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterDate").value = "";
  document.getElementById("filterStatus").value = "";

  filteredData = [...allData];
  currentPage = 1;

  updatePagination();
  renderTable();
}

// ==============================
// FUNGSI MODAL DETAIL (DENGAN PREVIEW GAMBAR)
// ==============================

// Tampilkan modal detail
async function showDetail(id) {
  currentDetailId = id;

  const data = await fetchDataById(id);
  if (!data) return;

  const detailContent = document.getElementById("detailContent");

  // Generate thumbnail URLs untuk gambar
  const gambar1Thumb = data.gambar1 ? getDriveThumbnailUrl(data.gambar1) : null;
  const gambar2Thumb = data.gambar2 ? getDriveThumbnailUrl(data.gambar2) : null;
  const gambar3Thumb = data.gambar3 ? getDriveThumbnailUrl(data.gambar3) : null;

  // Generate download URLs
  const gambar1Download = data.gambar1
    ? getDriveDownloadUrl(data.gambar1)
    : null;
  const gambar2Download = data.gambar2
    ? getDriveDownloadUrl(data.gambar2)
    : null;
  const gambar3Download = data.gambar3
    ? getDriveDownloadUrl(data.gambar3)
    : null;

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
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Gambar+Tidak+Dapat+Dimuat';"
                                 onclick="openImageModal('${data.gambar1}', 'Gambar 1 - ${data.transactionId}')">
                        </div>
                        <div class="image-caption">Gambar 1</div>
                        <div class="image-actions-small">
                            <a href="${data.gambar1}" target="_blank" class="btn-link" title="Buka di tab baru">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                            <a href="${gambar1Download}" download class="btn-link" title="Download">
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
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
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Gambar+Tidak+Dapat+Dimuat';"
                                 onclick="openImageModal('${data.gambar2}', 'Gambar 2 - ${data.transactionId}')">
                        </div>
                        <div class="image-caption">Gambar 2</div>
                        <div class="image-actions-small">
                            <a href="${data.gambar2}" target="_blank" class="btn-link" title="Buka di tab baru">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                            <a href="${gambar2Download}" download class="btn-link" title="Download">
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
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
                                 onerror="this.onerror=null; this.src='https://via.placeholder.com/400x300?text=Gambar+Tidak+Dapat+Dimuat';"
                                 onclick="openImageModal('${data.gambar3}', 'Gambar 3 - ${data.transactionId}')">
                        </div>
                        <div class="image-caption">Gambar 3</div>
                        <div class="image-actions-small">
                            <a href="${data.gambar3}" target="_blank" class="btn-link" title="Buka di tab baru">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                            <a href="${gambar3Download}" download class="btn-link" title="Download">
                                <i class="fas fa-download"></i>
                            </a>
                        </div>
                    </div>
                    `
                        : ""
                    }
                </div>
                
                <div class="image-actions">
                    <button class="btn btn-secondary" onclick="downloadAllImages([${data.gambar1 ? `'${gambar1Download}'` : ""}${data.gambar2 ? `,'${gambar2Download}'` : ""}${data.gambar3 ? `,'${gambar3Download}'` : ""}].filter(Boolean))">
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

// Tutup modal detail
function closeDetailModal() {
  document.getElementById("detailModal").style.display = "none";
  currentDetailId = null;
}

// Edit data
async function editData(id) {
  currentEditId = id;

  const data = await fetchDataById(id);
  if (!data) return;

  const editForm = document.getElementById("editForm");

  editForm.innerHTML = `
        <div class="edit-form-grid">
            <!-- Informasi Utama -->
            <div class="form-group">
                <label for="editTransactionId">ID Transaksi</label>
                <input type="text" id="editTransactionId" value="${data.transactionId}" readonly>
            </div>
            
            <div class="form-group">
                <label for="editKodeSales">Kode Sales *</label>
                <input type="text" id="editKodeSales" value="${data.kodeSales}" required>
            </div>
            
            <div class="form-group">
                <label for="editCokimTerima">Cokim Terima *</label>
                <input type="number" id="editCokimTerima" value="${data.cokimTerima}" required>
            </div>
            
            <div class="form-group">
                <label for="editJenisBarang">Jenis Barang *</label>
                <input type="text" id="editJenisBarang" value="${data.jenisBarang}" required>
            </div>
            
            <div class="form-group">
                <label for="editSurat">Surat *</label>
                <select id="editSurat" required>
                    <option value="ADA" ${data.surat === "ADA" ? "selected" : ""}>ADA</option>
                    <option value="TIDAK ADA" ${data.surat === "TIDAK ADA" ? "selected" : ""}>TIDAK ADA</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="editNamaToko">Nama Toko</label>
                <input type="text" id="editNamaToko" value="${data.namaToko || ""}">
            </div>
            
            <!-- Informasi Kadar -->
            <div class="form-group">
                <label for="editKadarFisik">Kadar Fisik</label>
                <input type="number" id="editKadarFisik" value="${data.kadarFisik || ""}">
            </div>
            
            <div class="form-group">
                <label for="editPresentaseMesin">Presentase Mesin (%) *</label>
                <input type="number" id="editPresentaseMesin" value="${data.presentaseMesin || ""}" required step="0.01">
            </div>
            
            <div class="form-group">
                <label for="editKadarMesin">Kadar Mesin</label>
                <input type="number" id="editKadarMesin" value="${data.kadarMesin || ""}" readonly>
            </div>
            
            <div class="form-group">
                <label for="editKodePabrik">Kode Pabrik</label>
                <input type="text" id="editKodePabrik" value="${data.kodePabrik || ""}">
            </div>
            
            <!-- Informasi Berat -->
            <div class="form-group">
                <label for="editBeratSurat">Berat Surat (g)</label>
                <input type="number" id="editBeratSurat" value="${data.beratSurat || ""}" step="0.01">
            </div>
            
            <div class="form-group">
                <label for="editBeratFisik">Berat Fisik (g) *</label>
                <input type="number" id="editBeratFisik" value="${data.beratFisik || ""}" required step="0.01">
            </div>
            
            <div class="form-group">
                <label for="editSusut">Susut (g) *</label>
                <input type="number" id="editSusut" value="${data.susut || ""}" required step="0.01">
            </div>
            
            <div class="form-group">
                <label for="editBeratTerima">Berat Terima (g)</label>
                <input type="number" id="editBeratTerima" value="${data.beratTerima || ""}" readonly step="0.01">
            </div>
            
            <!-- Informasi Lainnya -->
            <div class="form-group">
                <label for="editKondisiPerhiasan">Kondisi Perhiasan *</label>
                <select id="editKondisiPerhiasan" required>
                    <option value="NORMAL" ${data.kondisiPerhiasan === "NORMAL" ? "selected" : ""}>NORMAL</option>
                    <option value="RUSAK" ${data.kondisiPerhiasan === "RUSAK" ? "selected" : ""}>RUSAK</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="editModel">Model *</label>
                <select id="editModel" required>
                    <option value="POLOS" ${data.model === "POLOS" ? "selected" : ""}>POLOS</option>
                    <option value="BATU" ${data.model === "BATU" ? "selected" : ""}>BATU</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="editRateTerima">Rate Terima *</label>
                <input type="number" id="editRateTerima" value="${data.rateTerima || ""}" required step="0.0001">
            </div>
            
            <div class="form-group">
                <label for="editHargaPerGram">Harga Per Gram (Rp)</label>
                <input type="number" id="editHargaPerGram" value="${data.hargaPerGram || ""}" readonly>
            </div>
            
            <div class="form-group full-width">
                <label for="editHargaTerima">Harga Terima (Rp)</label>
                <input type="number" id="editHargaTerima" value="${data.hargaTerima || ""}" readonly>
            </div>
            
            <div class="form-group">
                <label for="editOperator">Operator</label>
                <input type="text" id="editOperator" value="${data.operator || "Operator"}">
            </div>
            
            <div class="form-group">
                <label for="editStatusCetak">Status Cetak</label>
                <select id="editStatusCetak">
                    <option value="SUDAH CETAK" ${data.statusCetak === "SUDAH CETAK" ? "selected" : ""}>SUDAH CETAK</option>
                    <option value="BELUM CETAK" ${!data.statusCetak || data.statusCetak === "BELUM CETAK" ? "selected" : ""}>BELUM CETAK</option>
                </select>
            </div>
            
            <div class="form-group full-width">
                <label for="editKeterangan">Keterangan</label>
                <textarea id="editKeterangan" rows="3">${data.keterangan || ""}</textarea>
            </div>
        </div>
    `;

  document.getElementById("editModal").style.display = "block";
}

// Tutup modal edit
function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  currentEditId = null;
}

// Simpan perubahan data
async function saveEdit() {
  const editForm = document.getElementById("editForm");

  if (!editForm.checkValidity()) {
    editForm.reportValidity();
    return;
  }

  // Hitung ulang kadar mesin, berat terima, harga
  const presentaseMesin =
    parseFloat(document.getElementById("editPresentaseMesin").value) || 0;
  const kadarMesin = (presentaseMesin / 100) * 24;
  document.getElementById("editKadarMesin").value = kadarMesin.toFixed(2);

  const beratSurat =
    parseFloat(document.getElementById("editBeratSurat").value) || 0;
  const beratFisik =
    parseFloat(document.getElementById("editBeratFisik").value) || 0;
  const susut = parseFloat(document.getElementById("editSusut").value) || 0;

  let beratTerima;
  if (beratSurat > 0 && beratSurat < beratFisik) {
    beratTerima = beratSurat - susut;
  } else {
    beratTerima = beratFisik - susut;
  }

  beratTerima = Math.max(beratTerima, 0);
  document.getElementById("editBeratTerima").value = beratTerima.toFixed(2);

  const cokimTerima =
    parseFloat(document.getElementById("editCokimTerima").value) || 0;
  const rateTerima =
    parseFloat(document.getElementById("editRateTerima").value) || 0;
  const hargaPerGram =
    Math.floor((cokimTerima * (rateTerima / 100)) / 500) * 500;
  document.getElementById("editHargaPerGram").value = hargaPerGram;

  const hargaTerima = Math.floor((hargaPerGram * beratTerima) / 500) * 500;
  document.getElementById("editHargaTerima").value = hargaTerima;

  // Validasi susut
  if (susut >= beratFisik) {
    showStatus(
      "Nilai susut tidak boleh lebih besar atau sama dengan berat fisik!",
      false,
    );
    return;
  }

  const updatedData = {
    transactionId: currentEditId,
    kodeSales: document.getElementById("editKodeSales").value,
    cokimTerima: cokimTerima,
    jenisBarang: document.getElementById("editJenisBarang").value,
    surat: document.getElementById("editSurat").value,
    namaToko: document.getElementById("editNamaToko").value,
    kadarFisik:
      parseFloat(document.getElementById("editKadarFisik").value) || 0,
    presentaseMesin: presentaseMesin,
    kadarMesin: kadarMesin,
    kodePabrik: document.getElementById("editKodePabrik").value,
    beratSurat: beratSurat,
    beratFisik: beratFisik,
    susut: susut,
    beratTerima: beratTerima,
    kondisiPerhiasan: document.getElementById("editKondisiPerhiasan").value,
    model: document.getElementById("editModel").value,
    rateTerima: rateTerima,
    hargaPerGram: hargaPerGram,
    hargaTerima: hargaTerima,
    operator: document.getElementById("editOperator").value,
    statusCetak: document.getElementById("editStatusCetak").value,
    keterangan: document.getElementById("editKeterangan").value,
    timestamp: new Date().toISOString(),
  };

  const success = await updateData(updatedData);

  if (success) {
    closeEditModal();
  }
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

  // Tampilkan konfirmasi
  Swal.fire({
    title: "Download Gambar",
    text: `Anda akan mendownload ${imageUrls.length} gambar. Lanjutkan?`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Ya, Download",
    cancelButtonText: "Batal",
  }).then((result) => {
    if (result.isConfirmed) {
      // Buka setiap gambar di tab baru untuk download
      imageUrls.forEach((url, index) => {
        setTimeout(() => {
          const a = document.createElement("a");
          a.href = url;
          a.download = `gambar-${index + 1}.jpg`;
          a.target = "_blank";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, index * 500); // Delay untuk menghindari block browser
      });

      showStatus(`${imageUrls.length} gambar sedang didownload...`, true, 5000);
    }
  });
}

// ==============================
// FUNGSI CETAK ULANG
// ==============================

async function reprintData(id) {
  try {
    const data = await fetchDataById(id);
    if (!data) return;

    // Buat struk cetak dari data yang ada
    createThermalReceiptForPrint(data);

    showStatus("Struk siap dicetak", true, 3000);
  } catch (error) {
    console.error("Error reprinting:", error);
    showStatus("Gagal mempersiapkan cetakan: " + error.message, false);
  }
}

// Fungsi untuk membuat struk cetak
function createThermalReceiptForPrint(data) {
  const printArea = document.createElement("div");
  printArea.id = "printArea";
  printArea.style.display = "none";

  const formatRupiah = (value) => {
    if (!value) return "0";
    return parseInt(value).toLocaleString("id-ID");
  };

  const receiptHTML = `
        <div class="thermal-receipt">
            <div class="receipt-header">
                <div class="receipt-title">CEK EMAS UBER</div>
                <div>================================</div>
                <div><strong>${data.transactionId}</strong></div>
                <div>CETAK ULANG - ${new Date().toLocaleDateString("id-ID")}</div>
            </div>
            
            <div class="receipt-line"><span>Kode Sales:</span><span>${data.kodeSales || "-"}</span></div>
            <div class="receipt-line"><span>Cokim Terima:</span><span>${formatRupiah(data.cokimTerima)}</span></div>
            <div class="receipt-line"><span>Jenis Barang:</span><span>${data.jenisBarang || "-"}</span></div>
            <div class="receipt-line"><span>Surat:</span><span>${data.surat || "-"}</span></div>
            <div class="receipt-line"><span>Nama Toko:</span><span>${data.namaToko || "-"}</span></div>
            
            <div class="receipt-divider">--------------------------------</div>
            
            <div class="receipt-line"><span>Kadar Fisik:</span><span>${data.kadarFisik || "-"}</span></div>
            <div class="receipt-line"><span>% Mesin:</span><span>${data.presentaseMesin || "-"}%</span></div>
            <div class="receipt-line"><span>Kadar Mesin:</span><span>${data.kadarMesin || "-"}</span></div>
            <div class="receipt-line"><span>Kode Pabrik:</span><span>${data.kodePabrik || "-"}</span></div>
            
            <div class="receipt-divider">--------------------------------</div>
            
            <div class="receipt-line"><span>Berat Surat:</span><span>${data.beratSurat || "0"}g</span></div>
            <div class="receipt-line"><span>Berat Fisik:</span><span>${data.beratFisik || "0"}g</span></div>
            <div class="receipt-line"><span>Susut:</span><span>${data.susut || "0"}g</span></div>
            <div class="receipt-line"><span class="receipt-label">BERAT TERIMA:</span><span class="receipt-label">${data.beratTerima || "0"}g</span></div>
            
            <div class="receipt-divider">--------------------------------</div>
            
            <div class="receipt-line"><span>Kondisi:</span><span>${data.kondisiPerhiasan || "-"}</span></div>
            <div class="receipt-line"><span>Model:</span><span>${data.model || "-"}</span></div>
            
            <div class="receipt-divider">--------------------------------</div>
            
            <div class="receipt-line"><span>Rate Terima:</span><span>${data.rateTerima || "-"}</span></div>
            <div class="receipt-line"><span>Harga/Gram:</span><span>Rp ${formatRupiah(data.hargaPerGram)}</span></div>
            
            <div class="receipt-divider">================================</div>
            
            <div class="receipt-line receipt-total">
                <span>TOTAL HARGA:</span>
                <span>Rp ${formatRupiah(data.hargaTerima)}</span>
            </div>
            
            <div class="receipt-divider">================================</div>
            
            <div style="text-align: center; margin-top: 10px;">
                <div>*** CETAK ULANG ***</div>
                <div>www.cek-emas-uber.com</div>
                <div>${new Date().toLocaleDateString("id-ID")}</div>
            </div>
        </div>
    `;

  printArea.innerHTML = receiptHTML;
  document.body.appendChild(printArea);

  // Panggil fungsi print
  setTimeout(() => {
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
            <html>
                <head>
                    <title>Cetak Ulang - ${data.transactionId}</title>
                    <style>
                        body { font-family: "Courier New", Courier, monospace; font-size: 12px; }
                        .thermal-receipt { width: 80mm; margin: 0 auto; padding: 5px; line-height: 1; }
                        .receipt-header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
                        .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 3px; }
                        .receipt-line { display: flex; justify-content: space-between; margin-bottom: 2px; }
                        .receipt-divider { border-top: 1px dashed #000; margin: 5px 0; }
                        .receipt-total { font-weight: bold; font-size: 14px; }
                        @media print {
                            body { margin: 0; padding: 0; }
                        }
                    </style>
                </head>
                <body>
                    ${receiptHTML}
                    <script>
                        window.onload = function() {
                            window.print();
                            setTimeout(function() {
                                window.close();
                            }, 1000);
                        };
                    <\/script>
                </body>
            </html>
        `);
    printWindow.document.close();
  }, 500);
}

// ==============================
// EVENT LISTENERS
// ==============================

document.addEventListener("DOMContentLoaded", function () {
  // Set tahun di footer
  document.getElementById("currentYear").textContent = new Date().getFullYear();

  // Setup event listeners
  setupEventListeners();

  // Load initial data
  fetchAllData();

  // Tampilkan info koneksi
  setTimeout(() => {
    showStatus("Sistem CRUD siap digunakan", true, 4000);
  }, 1000);
});

function setupEventListeners() {
  // Pagination buttons
  document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  });

  document.getElementById("nextPage")?.addEventListener("click", () => {
    const totalPages = Math.ceil(filteredData.length / CONFIG.ITEMS_PER_PAGE);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  });

  // Search and filter
  document.getElementById("searchInput")?.addEventListener("input", filterData);
  document.getElementById("filterDate")?.addEventListener("change", filterData);
  document
    .getElementById("filterStatus")
    ?.addEventListener("change", filterData);
  document
    .getElementById("resetFilter")
    ?.addEventListener("click", resetFilters);

  // Modal close buttons
  document
    .getElementById("closeDetailModal")
    ?.addEventListener("click", closeDetailModal);
  document
    .getElementById("closeEditModal")
    ?.addEventListener("click", closeEditModal);
  document
    .getElementById("cancelEdit")
    ?.addEventListener("click", closeEditModal);

  // Modal actions
  document.getElementById("printFromDetail")?.addEventListener("click", () => {
    if (currentDetailId) {
      reprintData(currentDetailId);
      closeDetailModal();
    }
  });

  document.getElementById("editFromDetail")?.addEventListener("click", () => {
    if (currentDetailId) {
      closeDetailModal();
      setTimeout(() => editData(currentDetailId), 300);
    }
  });

  // Save edit
  document.getElementById("saveEdit")?.addEventListener("click", saveEdit);

  // Close modal when clicking outside
  window.addEventListener("click", (event) => {
    const detailModal = document.getElementById("detailModal");
    const editModal = document.getElementById("editModal");
    const imageModal = document.getElementById("imageModal");

    if (event.target === detailModal) {
      closeDetailModal();
    }

    if (event.target === editModal) {
      closeEditModal();
    }

    if (event.target === imageModal) {
      closeImageModal();
    }
  });

  // Event listener untuk tombol escape
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDetailModal();
      closeEditModal();
      closeImageModal();
    }
  });

  // Real-time calculations for edit form
  document.addEventListener("input", function (e) {
    if (e.target.id === "editPresentaseMesin") {
      const presentaseMesin = parseFloat(e.target.value) || 0;
      const kadarMesin = (presentaseMesin / 100) * 24;
      document.getElementById("editKadarMesin").value = kadarMesin.toFixed(2);
      calculateEditHarga();
    }

    if (
      e.target.id === "editBeratSurat" ||
      e.target.id === "editBeratFisik" ||
      e.target.id === "editSusut"
    ) {
      calculateEditBeratTerima();
    }

    if (e.target.id === "editCokimTerima" || e.target.id === "editRateTerima") {
      calculateEditHarga();
    }
  });
}

// Fungsi perhitungan untuk form edit
function calculateEditBeratTerima() {
  const beratSurat =
    parseFloat(document.getElementById("editBeratSurat")?.value) || 0;
  const beratFisik =
    parseFloat(document.getElementById("editBeratFisik")?.value) || 0;
  const susut = parseFloat(document.getElementById("editSusut")?.value) || 0;

  let beratTerima;
  if (beratSurat > 0 && beratSurat < beratFisik) {
    beratTerima = beratSurat - susut;
  } else {
    beratTerima = beratFisik - susut;
  }

  beratTerima = Math.max(beratTerima, 0);

  const beratTerimaInput = document.getElementById("editBeratTerima");
  if (beratTerimaInput) {
    beratTerimaInput.value = beratTerima.toFixed(2);
  }

  calculateEditHarga();
}

function calculateEditHarga() {
  const cokimTerima =
    parseFloat(document.getElementById("editCokimTerima")?.value) || 0;
  const rateTerima =
    parseFloat(document.getElementById("editRateTerima")?.value) || 0;
  const beratTerima =
    parseFloat(document.getElementById("editBeratTerima")?.value) || 0;

  const hargaPerGram =
    Math.floor((cokimTerima * (rateTerima / 100)) / 500) * 500;
  const hargaTerima = Math.floor((hargaPerGram * beratTerima) / 500) * 500;

  const hargaPerGramInput = document.getElementById("editHargaPerGram");
  const hargaTerimaInput = document.getElementById("editHargaTerima");

  if (hargaPerGramInput) {
    hargaPerGramInput.value = hargaPerGram;
  }

  if (hargaTerimaInput) {
    hargaTerimaInput.value = hargaTerima;
  }
}

// ==============================
// LOG SISTEM
// ==============================
console.log(`CRUD DATA EMAS UBER v${CONFIG.VERSION}`);
console.log(`Spreadsheet: ${CONFIG.SPREADSHEET_URL}`);
console.log(`Web App: ${CONFIG.WEB_APP_URL}`);
console.log("Sistem CRUD siap digunakan!");
