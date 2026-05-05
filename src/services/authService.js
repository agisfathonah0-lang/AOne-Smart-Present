import * as Notifications from 'expo-notifications';
import { db } from '../database/sqlite';
import { supabase } from '../database/supabase';

export const AuthService = {

  // ── Ambil & simpan Expo Push Token ──────────────────────────
  updatePushToken: async (userId, log) => {
    try {
      log("Mengambil Expo Push Token...");

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        log("Izin notifikasi ditolak.");
        return;
      }

      const token = (await Notifications.getExpoPushTokenAsync({
        projectId: 'cf8436d8-c49a-461a-9470-6ec0043c10d9'
      })).data;

      log("Token didapat. Menyimpan ke server...");

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          expo_push_token: token,
          last_online: new Date().toISOString()
        });

      if (error) throw error;
      log("Push Token berhasil sinkron.");
    } catch (err) {
      log("Gagal sinkron token: " + err.message);
    }
  },

  // ── Simpan sesi ke SQLite ────────────────────────────────────
  saveSession: async (id, email, role, fullName, classes) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO user_session 
        (id, email, role, full_name, classes, last_login) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        email,
        role,
        fullName,
        JSON.stringify(classes), // simpan sebagai JSON string, contoh: '["1A"]'
        new Date().toISOString()
      ]
    );
  },

  // ── Ambil sesi aktif dari SQLite ─────────────────────────────
  getSession: async () => {
    const session = await db.getFirstAsync('SELECT * FROM user_session LIMIT 1');
    if (!session) return null;
    return {
      ...session,
      classes: session.classes ? JSON.parse(session.classes) : [],
    };
  },

  // ── Hapus sesi (logout) ──────────────────────────────────────
  clearSession: async () => {
    await db.runAsync('DELETE FROM user_session');
    await supabase.auth.signOut();
  },

  // ── Login utama ──────────────────────────────────────────────
  login: async (email, password, onLog) => {
    const log = (msg) => {
      console.log(msg);
      if (onLog) onLog(msg);
    };

    log("--- Memulai Proses Login ---");

    try {
      // ── 1. CEK OFFLINE (user_session lokal) ──
      log("Mengecek sesi lokal...");
      const localSession = await db.getFirstAsync(
        'SELECT * FROM user_session WHERE email = ? LIMIT 1',
        [email]
      );

      if (localSession) {
        // Verifikasi password lewat tabel staff lokal
        const localStaff = await db.getFirstAsync(
          'SELECT * FROM staff WHERE username = ? AND password = ?',
          [email, password]
        );

        if (localStaff) {
          log("Login offline berhasil.");
          return {
            success: true,
            source: 'offline',
            user: {
              id: localSession.id,
              email: localSession.email,
              role: localSession.role,
              full_name: localSession.full_name,
              classes: localSession.classes ? JSON.parse(localSession.classes) : [],
            }
          };
        } else {
          log("Password salah (offline).");
          return { success: false, error: 'Email atau password salah.' };
        }
      }

      // ── 2. CEK ONLINE (Supabase Auth) ──
      log("Sesi lokal tidak ada. Mencoba login online...");

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Koneksi lambat. Pastikan internet aktif.')), 10000)
      );

      const supabaseLogin = supabase.auth.signInWithPassword({ email, password });
      const { data, error } = await Promise.race([supabaseLogin, timeout]);

      if (error) {
        log("Error server: " + error.message);
        if (error.message.includes('fetch')) {
          throw new Error('Belum pernah login di HP ini. Aktifkan internet untuk login pertama kali.');
        }
        throw error;
      }

      if (!data.user) throw new Error('Login gagal. Coba lagi.');

      log("Login online berhasil. Mengambil data profil...");

      // ── 3. AMBIL ROLE & NAMA DARI TABEL users ──
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role, full_name, is_active')
        .eq('id', data.user.id)
        .single();

      if (userError) throw new Error('Gagal mengambil data user: ' + userError.message);
      if (!userData) throw new Error('Data user tidak ditemukan.');
      if (!userData.is_active) throw new Error('Akun Anda telah dinonaktifkan. Hubungi admin.');

      log(`Role: ${userData.role}. Mengambil kelas diampu...`);

      // ── 4. AMBIL KELAS DIAMPU (khusus guru) ──
      let classes = [];
      if (userData.role === 'guru') {
        const { data: kelasData } = await supabase
          .from('guru_kelas')
          .select('class')
          .eq('guru_id', data.user.id);

        classes = kelasData?.map(k => k.class) || [];
        log(`Kelas diampu: ${classes.join(', ')}`);
      }

      // ── 5. SIMPAN KE LOKAL ──
      log("Menyimpan data ke lokal...");

      // Simpan ke staff untuk verifikasi password offline
      await db.runAsync(
        'INSERT OR REPLACE INTO staff (username, name, role, password) VALUES (?, ?, ?, ?)',
        [email, userData.full_name, userData.role, password]
      );

      // Simpan sesi lengkap
      await AuthService.saveSession(
        data.user.id,
        email,
        userData.role,
        userData.full_name,
        classes
      );

      // ── 6. UPDATE PUSH TOKEN ──
      await AuthService.updatePushToken(data.user.id, log);

      log("Login selesai!");

      return {
        success: true,
        source: 'online',
        user: {
          id: data.user.id,
          email,
          role: userData.role,
          full_name: userData.full_name,
          classes,
        }
      };

    } catch (error) {
      log("Proses terhenti: " + error.message);
      return { success: false, error: error.message };
    }
  },
};