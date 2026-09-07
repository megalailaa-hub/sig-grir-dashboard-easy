# SIG GRIR Dashboard Easy v1.1

Perbaikan utama:
- Membaca sheet `Data Source` dengan validasi.
- Menggunakan `Amount in local currency` sebagai nominal utama.
- Menampilkan nominal sebagai nilai absolut agar cocok untuk dashboard GRIR.
- Periode dibaca dari kolom `period` terlebih dahulu; contoh `2026-08-01` menjadi `08.2026`.
- Snapshot disimpan di IndexedDB, bukan localStorage, sehingga 42 ribu+ baris tidak mentok batas localStorage.
- Tetap berupa static Next.js export sehingga mudah di-deploy ke Vercel.
- Next.js diperbarui ke 15.5.24 dan React 19.1.7.

## Deploy
Upload isi folder ini ke root repository GitHub, lalu Vercel akan build otomatis.

Catatan: IndexedDB bersifat per-browser/per-device. Untuk penyimpanan terpusat lintas komputer, tambahkan database/server di tahap berikutnya.
