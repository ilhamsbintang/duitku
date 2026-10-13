# Duitku

Catatan keuangan pribadi untuk iPhone sebagai **PWA** (Progressive Web App). Offline, tanpa server, tanpa akun, tanpa biaya. Semua data disimpan di penyimpanan lokal HP.

## Struktur

```
duitku/
  index.html            app shell
  app.css               design token + UI
  app.js                seluruh logika (tanpa framework, tanpa build step)
  sw.js                 service worker, cache app shell
  manifest.webmanifest  metadata PWA
  icons/                ikon app (180/192/512 + maskable)
```

## Cara pasang di iPhone

1. Serve folder ini lewat HTTPS (lihat *Deploy*).
2. Buka URL-nya di **Safari** iPhone.
3. Tap tombol **Bagikan** → **Add to Home Screen** → **Add**.
4. Buka dari ikon di home screen. Setelah itu app jalan penuh offline.

Penting: harus dibuka via **HTTPS** (atau localhost) — service worker dan install PWA tidak jalan di HTTP biasa. Harus pakai **Safari**, bukan Chrome iOS.

## Fitur

- Catat cepat masuk/keluar: jumlah, kategori, sub-kategori, akun, keterangan, tanggal
- Kategori & sub-kategori mengikuti workbook `Laporan_Keuangan_Sep-Okt_2026.xlsx`
  (Pinjaman/Kartu kredit, Makanan & minuman/Pacaran, Kesehatan & olahraga/Olahraga…)
- Akun: Superbank, Mandiri, Mayapada, ShopeePay, Cash, myBCA, Flazz (bisa ditambah/hapus)
- Ringkasan bulan: total masuk, keluar, sisa + rincian pengeluaran per kategori
- Navigasi bulan (tap nama bulan → pilih bulan/tahun)
- Ubah & hapus transaksi (tap barisnya)
- Tema auto/terang/gelap
- Export **JSON** (backup penuh, bisa di-import ulang) dan **CSV** (`;`-separated, siap dibuka di Excel)
- Offline penuh via service worker, headless installable

## Data & privasi

- Disimpan di `localStorage`, key `duitku.v1`. Tidak ada request jaringan selain memuat file app itu sendiri.
- **Data hilang kalau** situs dihapus dari home screen / Safari storage dibersihkan. Karena itu export JSON rutin wajib — app menampilkan peringatan di Pengaturan kalau backup terakhir > 14 hari.
- Ganti HP: export JSON dari HP lama → import di HP baru (Import JSON menggantikan seluruh data, dengan konfirmasi).

## Deploy (static hosting, butuh HTTPS)

Semua file statis, jadi bisa ditaruh di layanan apa pun:

- **GitHub Pages** — push folder ini ke repo, Settings → Pages → branch `main` / root.
- **Cloudflare Pages / Netlify** — drag & drop foldernya.
- **Server sendiri** — `python3 -m http.server 8080` (cuma untuk tes di localhost; iPhone butuh HTTPS, pakai reverse proxy + sertifikat, atau tunnel).

## Development

```bash
cd duitku
python3 -m http.server 8080      # http://localhost:8080
```

Naikkan versi cache di `sw.js` (`CACHE = 'duitku-shell-vN'`) setiap kali file app diubah, supaya HP tidak memakai shell lama.

## Model data

```json
{
  "version": 1,
  "settings": { "theme": "auto", "lastBackup": "2026-10-13T...", "lastCat": {"out":"Makanan & minuman","in":"Pemasukan"}, "lastAcc": "Superbank" },
  "accounts": ["Superbank", "Cash"],
  "cats": { "out": [{ "name": "Transportasi", "subs": ["Bensin", "Biaya parkir"] }], "in": [] },
  "tx": [{ "id": "abc123", "date": "2026-10-13", "type": "out", "amount": 29600,
           "category": "Transportasi", "subcategory": "Bensin", "account": "Superbank",
           "note": "Pertalite", "createdAt": 1760000000000 }]
}
```
