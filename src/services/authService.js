import { db } from '../database/sqlite';
import { supabase } from '../database/supabase';

export const AuthService = {
  // Tambahkan parameter onLog di sini
  login: async (username, password, onLog) => {
    // Fungsi pembantu agar tidak perlu cek if(onLog) berulang kali
    const log = (msg) => {
      console.log(msg);
      if (onLog) onLog(msg);
    };

    log("--- Memulai Proses Login ---");

    try {
      // 1. CEK LOCAL DB
      log("Mencari di database lokal...");
      const localUser = await db.getFirstAsync(
        'SELECT * FROM staff WHERE username = ? AND password = ?',
        [username, password]
      );

      if (localUser) {
        log("User ditemukan di lokal. Membuat sesi...");
        await db.runAsync(
          'INSERT OR REPLACE INTO user_session (id, email, last_login) VALUES (?, ?, ?)',
          [localUser.id, localUser.username, new Date().toISOString()]
        );
        return { success: true, source: 'local' };
      }

      // 2. JIKA TIDAK ADA DI LOKAL -> CEK ONLINE
      log("Data lokal tidak ada. Mengecek server (Online)...");

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Koneksi lambat (Timeout). Pastikan Anda online.')), 10000)
      );

      const supabaseLogin = supabase.auth.signInWithPassword({
        email: username,
        password: password,
      });

      // Balapan antara login vs timeout
      const { data, error } = await Promise.race([supabaseLogin, timeout]);

      if (error) {
        log("Error dari server: " + error.message);
        if (error.message.includes('fetch')) {
          throw new Error('User belum terdaftar di HP ini. Silakan aktifkan internet untuk login pertama kali.');
        }
        throw error;
      }

      if (data.user) {
        log("User ditemukan di Server. Menyimpan data ke HP...");

        // Simpan data staff ke SQLite (Pastikan ID juga disimpan agar sinkron)
        // Saya tambahkan ID agar primary key TEXT yang kita buat tadi terisi
        await db.runAsync(
          'INSERT OR REPLACE INTO staff (username, password) VALUES ( ?, ?)',
          [
            data.user.email,
            password
          ]
        );
        
        log("Data berhasil disinkronkan ke lokal.");

        // Simpan ke sesi aktif
        log("Membuat sesi aplikasi...");
        await db.runAsync(
          'INSERT OR REPLACE INTO user_session (id, email, last_login) VALUES (?, ?, ?)',
          [data.user.id, data.user.email, new Date().toISOString()]
        );

        log("Login Online Berhasil!");
        return { success: true, source: 'online' };
      }

    } catch (error) {
      log("Proses terhenti: " + error.message);
      // Alert tetap ada sebagai backup jika UI tidak menampilkan log dengan jelas
      // Alert.alert('Info Login', error.message); 
      return { success: false, error: error.message };
    }
  },
};