import * as Notifications from 'expo-notifications'; // Tambahkan ini
import { db } from '../database/sqlite';
import { supabase } from '../database/supabase';

export const AuthService = {
  // Fungsi baru untuk ambil & simpan token
  updatePushToken: async (userId, log) => {
    try {
      log("Mengambil Expo Push Token...");
      
      // Ambil izin notifikasi
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        log("Izin notifikasi ditolak oleh user.");
        return;
      }

      // Ambil token dari Expo
      const token = (await Notifications.getExpoPushTokenAsync({
        // Ganti dengan Project ID Expo kamu (cek di app.json -> extra.eas.projectId)
        projectId: 'cf8436d8-c49a-461a-9470-6ec0043c10d9' 
      })).data;

      log("Token didapat. Menyimpan ke profil server...");

      // Update tabel 'profiles' di Supabase
      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: userId, 
          expo_push_token: token,
          last_online: new Date().toISOString()
        });

      if (error) throw error;
      log("Push Token berhasil sinkron ke server.");
    } catch (err) {
      log("Gagal sinkron token: " + err.message);
    }
  },

  login: async (username, password, onLog) => {
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
        // Jika login lokal, kita asumsikan token sudah pernah dikirim sebelumnya
        // atau kamu bisa panggil updatePushToken di sini juga jika ada internet
        await db.runAsync(
          'INSERT OR REPLACE INTO user_session (id, email, last_login) VALUES (?, ?, ?)',
          [localUser.id, localUser.username, new Date().toISOString()]
        );
        return { success: true, source: 'local', userId: localUser.id };
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

        await db.runAsync(
          'INSERT OR REPLACE INTO staff (username, password) VALUES ( ?, ?)',
          [data.user.email, password]
        );
        
        log("Data berhasil disinkronkan ke lokal.");

        // SIMPAN TOKEN KE SERVER (Tambahan Baru)
        await AuthService.updatePushToken(data.user.id, log);

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
      return { success: false, error: error.message };
    }
  },
};