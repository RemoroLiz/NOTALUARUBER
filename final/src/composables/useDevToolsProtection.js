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

    // ---------- 3. Anti-Debugger Loop - DINONAKTIFKAN (BARU) ----------
    // Dihapus karena heuristik ukuran jendela (outerWidth/outerHeight
    // vs innerWidth/innerHeight) tidak reliable di browser mobile,
    // terutama Safari iPhone - salah deteksi "DevTools terbuka" hanya
    // karena address bar muncul/hilang, mode PWA, atau rotasi layar.
    // Lihat catatan lengkap di protect.js (versi HTML murni).

    // ---------- Cleanup saat komponen unmount ----------
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
