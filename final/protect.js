/**
 * ============================================================
 *  PROTECT.JS - Proteksi Dasar Browser (Anti Klik Kanan / Shortcut DevTools)
 * ============================================================
 *  SKENARIO A: HTML + CSS + JS murni (atau PHP biasa).
 *
 *  (BARU) Fitur "Anti-Debugger Loop" (pembeku tab otomatis saat
 *  DevTools terdeteksi terbuka) SUDAH DINONAKTIFKAN - lihat catatan
 *  di bagian 3 di bawah untuk alasannya (salah deteksi & sangat
 *  mengganggu di iPhone/Safari mobile). Proteksi klik-kanan &
 *  blokir shortcut keyboard (F12, Ctrl+U, dst) tetap aktif seperti
 *  biasa, aman dipakai di HP maupun desktop.
 *
 *  CARA PASANG:
 *  Taruh file ini SEBARIS DENGAN style.css (folder yang sama), lalu
 *  tempel SATU baris berikut sebagai SCRIPT PALING ATAS di dalam
 *  <head> ... </head> pada SETIAP file HTML (index.html, crud.html,
 *  induk.html, customer.html, kalkulator.html) - taruh SEBELUM tag
 *  <link rel="stylesheet" ...> supaya proteksi aktif secepat mungkin
 *  saat halaman mulai dimuat:
 *
 *      <script src="protect.js"></script>
 *
 *  Contoh potongan <head> setelah dipasang:
 *
 *      <head>
 *        <meta charset="UTF-8" />
 *        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
 *        <script src="protect.js"></script>              <-- TAMBAHKAN INI
 *        <title>...</title>
 *        <link rel="stylesheet" href="https://cdnjs.../font-awesome..." />
 *        <link rel="stylesheet" href="style.css" />
 *        ...
 *      </head>
 *
 *  PENTING - INI BUKAN KEAMANAN SUNGGUHAN, HANYA "PENGHALANG" (DETERRENT):
 *  Semua proteksi di file ini berjalan di BROWSER PENGUNJUNG, artinya
 *  siapapun yang cukup niat SELALU bisa melewatinya (mis. mematikan
 *  JavaScript, memakai browser lain, memakai proxy/DevTools eksternal,
 *  mode "Reader", curl/network inspector, dst). Tujuannya HANYA untuk
 *  menghalangi pengunjung awam iseng klik kanan / buka Inspect Element,
 *  BUKAN untuk menyembunyikan data rahasia. Jangan pernah menaruh
 *  kredensial, kunci API, atau logika bisnis sensitif hanya
 *  mengandalkan proteksi ini - data yang benar-benar rahasia (mis. ID
 *  Spreadsheet, URL Web App) harus tetap dianggap bisa dilihat siapa
 *  saja yang membuka tab Network, apapun proteksi di sisi client.
 * ============================================================
 */
(function () {
  "use strict";

  // ------------------------------------------------------------
  // 1. NONAKTIFKAN KLIK KANAN (context menu / "Inspect", "View Page
  //    Source", "Save As", dsb yang muncul lewat klik kanan browser)
  // ------------------------------------------------------------
  document.addEventListener("contextmenu", function (e) {
    e.preventDefault();
  });

  // ------------------------------------------------------------
  // 2. NONAKTIFKAN SHORTCUT KEYBOARD UMUM UNTUK MEMBUKA DEVTOOLS /
  //    VIEW SOURCE, baik di Windows/Linux maupun macOS.
  // ------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    const key = (e.key || "").toLowerCase();

    // F12 - DevTools (Windows/Linux/Chrome OS)
    if (e.key === "F12" || e.keyCode === 123) {
      e.preventDefault();
      return false;
    }

    // Ctrl+U - View Page Source
    if (e.ctrlKey && !e.shiftKey && !e.altKey && key === "u") {
      e.preventDefault();
      return false;
    }

    // Ctrl+Shift+I / C / J - Inspect / Pilih Elemen / Console (Windows/Linux)
    if (e.ctrlKey && e.shiftKey && ["i", "c", "j"].includes(key)) {
      e.preventDefault();
      return false;
    }

    // Ctrl+Shift+K (Console di Firefox) & Ctrl+Shift+E (Network di Firefox)
    if (e.ctrlKey && e.shiftKey && ["k", "e"].includes(key)) {
      e.preventDefault();
      return false;
    }

    // Cmd+Option(Alt)+I / C / J - Inspect / Pilih Elemen / Console (macOS)
    if (e.metaKey && e.altKey && ["i", "c", "j"].includes(key)) {
      e.preventDefault();
      return false;
    }

    // Cmd+Option+U (macOS Safari - View Source) & Cmd+U jaga-jaga
    if (e.metaKey && (e.altKey || e.ctrlKey) && key === "u") {
      e.preventDefault();
      return false;
    }
  });

  // ------------------------------------------------------------
  // 3. ANTI-DEBUGGER LOOP - DINONAKTIFKAN (BARU)
  // ------------------------------------------------------------
  // Fitur ini SEBELUMNYA membekukan tab kalau DevTools terdeteksi
  // terbuka, salah satunya lewat heuristik ukuran jendela
  // (window.outerWidth/outerHeight dibanding innerWidth/innerHeight).
  //
  // MASALAH: heuristik ukuran jendela ini TIDAK RELIABLE di browser
  // mobile, terutama Safari di iPhone - selisih outer/inner size di
  // sana bisa melebar drastis hanya karena address bar muncul/
  // hilang saat scroll, mode "Add to Home Screen" (PWA), rotasi
  // layar, dst - SEMUA itu SALAH TERDETEKSI sebagai "DevTools
  // terbuka" padahal iPhone bahkan tidak punya DevTools yang bisa
  // diakses dengan cara itu. Akibatnya overlay "Developer Tools
  // terdeteksi terbuka" malah muncul untuk pengunjung biasa yang
  // memakai HP secara normal - sangat mengganggu.
  //
  // Makanya seluruh bagian ini (anti-debugger loop + deteksi ukuran
  // jendela + overlay pemblokir) DIMATIKAN. Proteksi klik-kanan
  // (bagian 1) dan blokir shortcut keyboard DevTools (bagian 2) di
  // atas TETAP AKTIF seperti biasa - keduanya aman dipakai di HP
  // karena tidak bergantung pada heuristik ukuran layar yang rawan
  // salah deteksi ini.
  //
  // Kalau di kemudian hari ingin proteksi anti-DevTools yang lebih
  // agresif lagi khusus untuk pengunjung DESKTOP saja (tidak
  // menyentuh mobile sama sekali), beri tahu saya - bisa dibuatkan
  // versi yang hanya aktif setelah memastikan perangkatnya benar-benar
  // desktop, bukan sekadar mengandalkan ukuran jendela.

  // ------------------------------------------------------------
  // 4. (OPSIONAL) NONAKTIFKAN DRAG GAMBAR KELUAR HALAMAN - supaya
  //    foto barang/customer tidak mudah di-drag langsung ke desktop.
  //    Tidak memengaruhi drag & drop UPLOAD foto (itu event terpisah
  //    pada elemen upload, bukan pada <img> yang sudah tampil).
  // ------------------------------------------------------------
  document.addEventListener(
    "dragstart",
    function (e) {
      if (e.target && e.target.tagName === "IMG") {
        e.preventDefault();
      }
    },
    true,
  );
})();

/**
 * ============================================================
 * (OPSIONAL, TIDAK AKTIF SECARA DEFAULT) - CEGAH SELEKSI TEKS VIA JS
 * ============================================================
 * Pelengkap untuk CSS ".no-select-zone" di style.css (lihat komentar
 * di sana). Sengaja dibiarkan NONAKTIF (di-comment) di sini juga -
 * hapus tanda komentar di baris "document.addEventListener" di bawah
 * kalau ingin mengaktifkannya.
 *
 * CATATAN PENTING: kode ini SENGAJA tidak memblokir seleksi pada
 * <textarea> dan <input>, supaya form input & fitur "Salin ke
 * Clipboard" di Laporan WA (induk.html) tetap berfungsi normal.
 *
document.addEventListener("selectstart", function (e) {
  const tag = e.target && e.target.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") return;
  e.preventDefault();
});
*/
