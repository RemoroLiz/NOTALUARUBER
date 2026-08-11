/**
 * ============================================================
 *  PROTECT.JS - Proteksi Dasar Browser (Anti Klik Kanan / DevTools)
 * ============================================================
 *  SKENARIO A: HTML + CSS + JS murni (atau PHP biasa).
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
  // 3. ANTI-DEBUGGER LOOP - membekukan tab jika DevTools terbuka
  //    LEWAT MENU BROWSER (bukan cuma lewat shortcut, yang sudah
  //    diblokir di langkah 2 di atas). Menu "..." atau menu
  //    "Developer Tools" browser tidak bisa dicegat lewat event
  //    keyboard, jadi dipakai trik berbeda:
  //
  //    Setiap sekian milidetik, kode memanggil `debugger;`. Statement
  //    ini TIDAK berpengaruh apa-apa selama DevTools TERTUTUP (browser
  //    mengabaikannya). Tapi begitu DevTools DIBUKA, `debugger;`
  //    membuat eksekusi berhenti (pause) di titik itu - karena
  //    dipanggil berulang setiap 50ms, halaman jadi terasa "membeku"
  //    / tidak responsif selama DevTools dibiarkan terbuka. Begitu
  //    DevTools ditutup lagi, halaman otomatis normal kembali.
  // ------------------------------------------------------------
  let devToolsWarned = false;

  function showDevToolsOverlay() {
    if (devToolsWarned) return;
    devToolsWarned = true;
    const overlay = document.createElement("div");
    overlay.id = "__protectOverlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:2147483647;background:#0d0d17;color:#fff;" +
      "display:flex;align-items:center;justify-content:center;text-align:center;" +
      "font-family:Arial,Helvetica,sans-serif;padding:24px;";
    overlay.innerHTML =
      '<div><h2 style="margin:0 0 8px;">Developer Tools terdeteksi terbuka</h2>' +
      '<p style="margin:0;opacity:.8;">Tutup DevTools untuk melanjutkan menggunakan halaman ini.</p></div>';
    document.body.appendChild(overlay);
  }

  function hideDevToolsOverlay() {
    devToolsWarned = false;
    const overlay = document.getElementById("__protectOverlay");
    if (overlay) overlay.remove();
  }

  function antiDebuggerLoop() {
    const t0 = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const t1 = performance.now();

    // Jika DevTools TERTUTUP, baris "debugger;" di atas praktis tidak
    // memakan waktu (delta sangat kecil). Jika DevTools TERBUKA
    // (dengan panel Sources aktif), baris itu membuat eksekusi pause
    // sampai pengguna melanjutkan/menutup DevTools, sehingga delta
    // waktunya jauh lebih besar - itu tanda DevTools sedang dibuka.
    if (t1 - t0 > 100) {
      showDevToolsOverlay();
    } else {
      hideDevToolsOverlay();
    }
  }

  // Deteksi tambahan berbasis ukuran jendela - menangkap kasus DevTools
  // di-dock (menempel) di sisi/bawah browser, yang membuat selisih
  // antara ukuran jendela luar (outerWidth/Height) dan area konten
  // (innerWidth/Height) melebar drastis.
  function checkWindowSizeThreshold() {
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    if (widthDiff > threshold || heightDiff > threshold) {
      showDevToolsOverlay();
    }
  }

  setInterval(function () {
    antiDebuggerLoop();
    checkWindowSizeThreshold();
  }, 50);

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
