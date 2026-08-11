# Ringkasan Perubahan - UBER EMAS

## 1. Bug Fix: Tanggal salah di halaman Data Management

**Penyebab:** `formatDate()` di frontend memanggil
`toLocaleString("id-ID", {...})` tanpa `timeZone` eksplisit, sehingga
tanggal/jam ditampilkan sesuai timezone perangkat pengunjung
(browser/OS), bukan selalu WIB. Transaksi larut malam bisa tampil
mundur/maju satu hari tergantung timezone laptop/HP yang membuka
halaman.

**Perbaikan:** ditambahkan `timeZone: "Asia/Jakarta"` di semua
pemanggilan `toLocaleString` / `toLocaleDateString`:
- `crud-script.js` (2 lokasi: tabel & cover PDF)
- `induk-script.js`
- `script.js` (2 lokasi: struk cetak)
- `kalkulator-script.js` (struk simulasi)

Ini murni perbaikan frontend, **tidak perlu migrasi ulang di Apps
Script**. Kalau Anda sebelumnya sudah pernah menjalankan
`migrateFixTanggalJamFormat()` / `cekFormatTanggalJam()` di Code.gs,
itu tetap valid dan tidak konflik dengan perbaikan ini - keduanya
menangani dua penyebab bug tanggal yang berbeda (backend: data
tersimpan salah karena auto-convert Sheets; frontend: data benar tapi
salah ditampilkan karena timezone browser).

## 2. Bug Fix: Urutan tabel tidak dari ID NOTLU terbaru

**Penyebab:** `handleList()` di Code.gs mengurutkan berdasarkan
`UpdatedAt` (waktu terakhir diedit) - akibatnya, mengedit data LAMA
membuatnya meloncat ke atas tabel seolah baru diinput, padahal ID
NOTLU-nya lama.

**Perbaikan:** diganti jadi mengurutkan berdasarkan **nomor urut ID
NOTLU** (bagian angka di akhir ID, mis. `NOTLU-0042` -> `42`),
descending. Urutan ini stabil - tidak berubah walau data diedit,
dan tidak terpengaruh masalah tanggal apapun. Perbaikan yang sama
juga diterapkan ke `handleIndukList()` (halaman Data Induk),
diurutkan dari Nomor Induk terbaru.

**PENTING - perlu tindakan manual:** perubahan ini ada di
`gas/Code.gs`. Buka Apps Script editor Anda (script.google.com),
timpa isi `Code.gs` dengan file yang saya berikan (atau cari fungsi
`handleList`, `handleIndukList`, dan tambahkan fungsi `idSortValue`
baru seperti di file ini), lalu **Deploy > Manage deployments > Edit
(pensil) > Deploy** ulang supaya perubahan aktif di Web App yang
sedang dipakai. Tidak perlu menjalankan migrasi apapun - ini cuma
mengubah logika sorting saat membaca data, bukan struktur data.

## 3. Fitur baru: Drag & Drop upload foto

Ditambahkan ke semua titik upload:
- Form Input utama (`index.html` / `script.js`)
- Modal Edit Transaksi (`crud.html` / `crud-script.js`)
- Modal Edit Customer (`customer.html` / `customer-script.js`)
- 3 slot Dokumen Induk: MOU, KTP, Foto Customer (`induk.html` /
  `induk-script.js`)

Cukup seret file gambar dari File Explorer/Finder langsung ke kotak
area upload (kotak akan menyala kuning saat file diseret di
atasnya). Tombol "Pilih Foto/Gambar" tetap berfungsi seperti biasa.

## 4. Proteksi Browser (Skenario A - HTML/CSS/JS murni)

File baru: **`protect.js`** - sudah dipasang otomatis sebagai script
paling atas di `<head>` kelima halaman HTML (index, crud, induk,
customer, kalkulator). Berisi:
- Blokir klik kanan (context menu)
- Blokir F12
- Blokir Ctrl+U (view source)
- Blokir Ctrl+Shift+I/C/J (DevTools Windows/Linux) + Ctrl+Shift+K/E
  (Firefox console/network)
- Blokir Cmd+Option+I/C/J (DevTools macOS)
- **Anti-Debugger Loop**: memanggil `debugger;` setiap 50ms - kalau
  DevTools sedang dibuka (lewat cara apapun, termasuk menu
  browser), baris ini membuat tab terasa "membeku" sampai DevTools
  ditutup. Kalau DevTools tertutup, baris ini tidak berpengaruh sama
  sekali ke performa halaman.
- Deteksi tambahan berbasis ukuran jendela (menangkap DevTools yang
  di-dock ke sisi/bawah browser)

⚠️ **Ini bukan keamanan sungguhan** - hanya penghalang untuk
pengunjung awam. Siapapun yang cukup niat tetap bisa melewatinya
(matikan JS, browser lain, proxy, dst). Jangan taruh data rahasia
sungguhan (API key, dsb) hanya mengandalkan ini.

## 5. Panduan Skenario B (Vite + React/Vue) - lihat folder `docs/`

- `docs/useDevToolsProtection.js` - React Hook versi lifecycle-safe
  dari protect.js (pasang di `App.jsx`, tinggal
  `useDevToolsProtection()`)
- `docs/useDevToolsProtection.vue-composable.js` - versi Vue 3
  Composable (pasang di `App.vue` dengan `<script setup>`)
- `docs/vite.config.example.js` - contoh konfigurasi
  `vite-plugin-javascript-obfuscator` dengan setting paling agresif,
  lengkap dengan catatan trade-off performa & keterbatasannya

Instalasi plugin obfuscator:
```
npm install --save-dev vite-plugin-javascript-obfuscator
```

## 6. Tips Opsional: Nonaktifkan Seleksi Teks

Ditambahkan sebagai blok **komentar (tidak aktif)** di akhir
`style.css` dan `protect.js` - baca instruksi di dalamnya kalau ingin
mengaktifkan. Sengaja tidak diaktifkan otomatis karena akan mengubah
UX situs secara signifikan, dan **wajib mengecualikan `<textarea>` /
`<input>`** supaya fitur "Salin ke Clipboard" di Laporan WA
(induk.html) tidak rusak - sudah saya siapkan pengecualiannya di
kode yang di-comment tersebut.

## Checklist yang perlu Anda lakukan setelah menerima file ini

1. **Upload ulang** semua file `.html`, `.js`, `.css`, dan
   `protect.js` (baru) ke hosting Anda - GANTI file lama.
2. **Update Code.gs** di Apps Script editor dengan `gas/Code.gs`,
   lalu **Deploy ulang** (Manage deployments > Edit > Deploy) - kalau
   dilewati, bug urutan ID NOTLU tidak akan hilang karena Web App
   lama masih dipakai.
3. Refresh halaman & test: tanggal tampil benar, urutan tabel dari ID
   NOTLU terbaru, upload foto lewat drag & drop, dan klik-kanan/F12
   sudah terblokir.
