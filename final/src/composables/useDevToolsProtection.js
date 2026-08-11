/**
 * ============================================================
 * useDevToolsProtection - React Hook (SKENARIO B: Vite + React)
 * ============================================================
 * Versi protect.js (lihat file protect.js untuk versi HTML murni)
 * yang dibungkus jadi React Hook, supaya event listener & interval
 * dipasang lewat useEffect dan DIBERSIHKAN (cleanup) dengan benar
 * saat komponen unmount - tidak membocorkan listener/interval seperti
 * kalau kode yang sama ditaruh sebagai <script> biasa di aplikasi
 * React yang berpindah-pindah halaman (SPA).
 *
 * CARA PAKAI:
 *  1. Simpan file ini di src/hooks/useDevToolsProtection.js
 *  2. Panggil sekali saja di komponen paling atas (mis. App.jsx):
 *
 *       import { useDevToolsProtection } from "./hooks/useDevToolsProtection";
 *
 *       function App() {
 *         useDevToolsProtection();
 *         return <YourRoutesOrLayout />;
 *       }
 *
 *  CATATAN: sama seperti protect.js, ini HANYA penghalang (deterrent)
 *  di sisi browser, bukan keamanan sungguhan - lihat catatan lengkap
 *  di bagian atas file protect.js.
 * ============================================================
 */
import { useEffect } from "react";

export function useDevToolsProtection() {
  useEffect(() => {
    // ---------- 1. Nonaktifkan klik kanan ----------
    const handleContextMenu = (e) => e.preventDefault();
    document.addEventListener("contextmenu", handleContextMenu);

    // ---------- 2. Nonaktifkan shortcut DevTools / View Source ----------
    const handleKeyDown = (e) => {
      const key = (e.key || "").toLowerCase();

      if (e.key === "F12") {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && !e.shiftKey && !e.altKey && key === "u") {
        e.preventDefault();
        return;
      }
      if (e.ctrlKey && e.shiftKey && ["i", "c", "j", "k", "e"].includes(key)) {
        e.preventDefault();
        return;
      }
      if (e.metaKey && e.altKey && ["i", "c", "j"].includes(key)) {
        e.preventDefault();
        return;
      }
      if (e.metaKey && (e.altKey || e.ctrlKey) && key === "u") {
        e.preventDefault();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // ---------- 3. Anti-Debugger Loop + overlay ----------
    let warned = false;
    let overlayEl = null;

    const showOverlay = () => {
      if (warned) return;
      warned = true;
      overlayEl = document.createElement("div");
      overlayEl.id = "__reactProtectOverlay";
      overlayEl.style.cssText =
        "position:fixed;inset:0;z-index:2147483647;background:#0d0d17;color:#fff;" +
        "display:flex;align-items:center;justify-content:center;text-align:center;" +
        "font-family:Arial,Helvetica,sans-serif;padding:24px;";
      overlayEl.innerHTML =
        '<div><h2 style="margin:0 0 8px;">Developer Tools terdeteksi terbuka</h2>' +
        '<p style="margin:0;opacity:.8;">Tutup DevTools untuk melanjutkan.</p></div>';
      document.body.appendChild(overlayEl);
    };

    const hideOverlay = () => {
      warned = false;
      if (overlayEl && overlayEl.parentNode) overlayEl.remove();
      overlayEl = null;
    };

    const tick = () => {
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      const t1 = performance.now();

      if (t1 - t0 > 100) {
        showOverlay();
      } else {
        hideOverlay();
      }

      const widthDiff = window.outerWidth - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      if (widthDiff > 160 || heightDiff > 160) {
        showOverlay();
      }
    };

    const intervalId = setInterval(tick, 50);

    // ---------- Cleanup saat komponen unmount ----------
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
      clearInterval(intervalId);
      hideOverlay();
    };
  }, []);
}
