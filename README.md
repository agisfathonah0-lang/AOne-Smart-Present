# 🏫 AOne: Sistem Manajemen Sekolah (Offline-First)

![AOne Header](https://img.shields.io/badge/Status-Development-orange?style=for-the-badge)
![React Native](https://img.shields.io/badge/React_Native-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-07405E?style=for-the-badge&logo=sqlite&logoColor=white)

**AOne** adalah solusi manajemen informasi sekolah dan sistem absensi cerdas berbasis **Offline-First**. Dirancang khusus untuk institusi pendidikan (seperti Pondok Pesantren) yang memerlukan kehandalan data tinggi meski dalam kondisi jaringan internet yang tidak stabil.

---

## ✨ Fitur Utama

* **⚡ Arsitektur Offline-First**: Data disimpan di lokal menggunakan SQLite untuk akses secepat kilat tanpa ketergantungan internet.
* **🔄 Sinkronisasi Cerdas**: 
    * *Push Master*: Setor data santri ke Cloud dengan mekanisme *Conflict Resolution* (Upsert).
    * *Push Attendance*: Sinkronisasi log absensi offline ke server pusat.
    * *Pull Master*: Tarik data terbaru dari Cloud ke perangkat lokal.
* **💎 UI Glassmorphism**: Antarmuka modern, transparan, dan premium yang memberikan pengalaman pengguna kelas atas.
* **🖼️ Profil & Logo Sync**: Integrasi Supabase Storage untuk manajemen aset digital sekolah secara terpusat.
* **🚨 Custom Animated Alerts**: Sistem notifikasi interaktif menggunakan Lottie Animations untuk feedback yang lebih manusiawi.

---

## 🛠️ Tech Stack

| Komponen | Teknologi |
| :--- | :--- |
| **Frontend** | React Native (Expo) |
| **Local Database** | `expo-sqlite` |
| **Cloud Database** | Supabase (Postgres) |
| **Aset Cloud** | Supabase Storage |
| **Animasi** | Lottie Files |
| **Ikon** | Lucide React Native |
| **Penyimpanan** | AsyncStorage (App Config) |

---

## 📂 Struktur Proyek

```text
├── src/
│   ├── components/       # Komponen UI Reusable (CustomAlert, GlassmorphicBox)
│   ├── database/         # Konfigurasi SQLite & Supabase Client
│   ├── services/         # SyncService.js (Logika Sinkronisasi Cloud-Lokal)
│   ├── screens/          # Layanan Utama (Dashboard, Siswa, Pengaturan)
│   ├── theme/            # Global Colors & Desain Konsisten
│   └── assets/           # Lottie Animations & Gambar