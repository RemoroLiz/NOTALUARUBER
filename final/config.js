/**
 * ============================================================
 *  CONFIG.JS - PENGATURAN BERSAMA (BARU)
 * ============================================================
 *  Dulu setiap halaman (script.js, crud-script.js, induk-script.js,
 *  customer-script.js) punya CONFIG.WEB_APP_URL SENDIRI-SENDIRI -
 *  jadi setiap kali Apps Script di-deploy ulang dan URL "/exec"
 *  berubah, URL itu harus diganti manual di 4 file berbeda, satu
 *  per satu. Gampang lupa satu, lalu ada halaman yang "Mode Offline"
 *  padahal sudah di-deploy.
 *
 *  Sekarang cukup GANTI SATU BARIS DI FILE INI SAJA setiap kali
 *  Apps Script di-deploy ulang - semua halaman otomatis ikut
 *  memakai URL yang baru.
 *
 *  CARA PASANG (SUDAH otomatis terpasang di index.html, crud.html,
 *  induk.html, customer.html - baris ini hanya sebagai referensi
 *  kalau Anda menambah halaman baru di kemudian hari):
 *
 *      <script src="config.js"></script>
 *      <script src="nama-halaman-script.js"></script>
 *
 *  PENTING: tag <script src="config.js"> HARUS ditaruh SEBELUM tag
 *  <script> halaman itu sendiri (mis. sebelum script.js), supaya
 *  SHARED_CONFIG sudah tersedia saat halaman itu dijalankan.
 *
 *  Catatan: kalkulator.html SENGAJA TIDAK memakai file ini - halaman
 *  Kalkulator murni offline di browser, tidak pernah memanggil Apps
 *  Script sama sekali, jadi tidak butuh WEB_APP_URL.
 * ============================================================
 */
const SHARED_CONFIG = {
  // GANTI DENGAN URL WEB APP APPS SCRIPT ANDA SETELAH DEPLOY (lihat
  // Code.gs) - HANYA DI SINI, tidak perlu diganti di file lain lagi.
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbxse8jUOHjUNtdm4GUIU-M6P6fcj0xC-PTPmXel7EYrEvpBi2JiC8u_pHwWzpgdBmf3/exec",

  // Pengaturan lain yang nilainya SAMA di semua halaman - kalau ingin
  // diubah (mis. kualitas kompresi foto), cukup diubah di sini saja.
  MAX_IMAGE_DIMENSION: 1280, // px, sisi terpanjang setelah kompresi
  IMAGE_QUALITY: 0.7, // kualitas JPEG hasil kompresi
};
