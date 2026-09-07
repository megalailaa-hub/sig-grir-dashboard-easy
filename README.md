# SIG GRIR Dashboard — Easy Deploy

Versi paling mudah: tidak memakai Supabase, tidak memakai environment variables, dan tidak membutuhkan alias `@/`.

## Deploy
1. Upload folder project ini ke GitHub, atau gunakan Vercel untuk import repository.
2. Framework: Next.js.
3. Root Directory: folder yang berisi `package.json` ini.
4. Build Command: `next build`.
5. Output: otomatis static export.

## Cara pakai
Upload Excel yang memiliki sheet `Data Source`. Snapshot disimpan di browser melalui localStorage. Pilih periode di dropdown untuk melihat snapshot sebelumnya.

Catatan: penyimpanan ini bersifat per-browser/per-device. Untuk database bersama antar-user/perangkat, tahap berikutnya dapat diganti ke Supabase tanpa mengubah tampilan dashboard.
