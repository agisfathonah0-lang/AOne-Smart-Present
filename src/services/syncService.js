import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import db from '../database/sqlite';
import { supabase } from '../database/supabase';

/**
 * SyncService: Jembatan antara SQLite Lokal dan Cloud Supabase
 */
export const SyncService = {
  
  /**
   * Helper: Memastikan kolom 'synced' ada di SQLite HP.
   */
  ensureColumns: async () => {
    try {
      await db.execAsync(`ALTER TABLE students ADD COLUMN synced INTEGER DEFAULT 1;`);
    } catch (e) { /* Kolom sudah ada */ }

    try {
      await db.execAsync(`ALTER TABLE attendance_logs ADD COLUMN synced INTEGER DEFAULT 0;`);
    } catch (e) { /* Kolom sudah ada */ }
  },

  /**
   * Cek Koneksi Internet
   */
  checkConnection: async () => {
    const state = await NetInfo.fetch();
    return state.isConnected && state.isInternetReachable;
  },

  /**
   * 1. UPLOAD ABSENSI: Kirim log absen dari HP ke Cloud
   */
  uploadAttendance: async () => {
    await SyncService.ensureColumns();
    const isOnline = await SyncService.checkConnection();
    if (!isOnline) return { success: false, message: 'Mode Offline' };

    try {
      const unsyncedData = await db.getAllAsync(
        'SELECT * FROM attendance_logs WHERE synced = 0 LIMIT 100'
      );

      if (unsyncedData.length === 0) return { success: true, count: 0, message: 'Data sudah sinkron' };

      const payload = unsyncedData.map(item => ({
        student_nis: item.nis || item.student_nis, // Menyesuaikan nama kolom
        timestamp: item.timestamp || item.created_at,
        status: (item.status || 'masuk').toLowerCase().trim(),
        method: item.method || 'QR',
        device_id: 'GURU_HP_MAIN' 
      }));

      const { data, error } = await supabase.from('attendance_logs').insert(payload).select();
      if (error) throw error;

      if (data) {
        const ids = unsyncedData.map(item => item.id).join(',');
        await db.execAsync(`UPDATE attendance_logs SET synced = 1 WHERE id IN (${ids})`);
      }

      return { success: true, count: unsyncedData.length };
    } catch (error) {
      console.error('Sync Upload Error:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 2. PULL MASTER DATA (Termasuk Profil & Jadwal Waktu)
   */
// Di dalam SyncService.js
pullMasterData : async () =>{
  try {
    // --- 1. TARIK DATA SISWA ---
    
    const { data: students, error: studentError } = await supabase
      .from('students')
      .select('*');

    if (studentError) throw studentError;

    for (const s of students) {
      await db.runAsync(
        `INSERT OR REPLACE INTO students (nis, nisn, name, class, room, address, gender, qr_code_data) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.nis, s.nisn, s.name, s.class, s.room, s.address, s.gender, s.qr_code_data]
      );
    }

    // --- 2. TARIK RIWAYAT ABSENSI ---
    const { data: logs, error: logError } = await supabase
      .from('attendance_logs')
      .select('*');

    if (logError) throw logError;

    if (logs && logs.length > 0) {
      for (const log of logs) {
        // Cek dulu apakah log ini sudah ada di lokal berdasarkan NIS dan Timestamp 
        // agar tidak double saat ditekan tombol "Update" berkali-kali
        await db.runAsync(
          `INSERT INTO attendance_logs (nis, status, session, timestamp, synced) 
           VALUES (?, ?, ?, ?, 1)`, 
          [log.nis, log.status, log.session, log.timestamp]
        );
      }
    }

    return { success: true };
  } catch (e) {
    console.error("Pull Error:", e.message);
    return { success: false, message: e.message };
  }
},

  /**
   * 3. PUSH MASTER DATA: Kirim santri baru ke Cloud
   */
  pushMasterData: async () => {
    await SyncService.ensureColumns();
    const isOnline = await SyncService.checkConnection();
    if (!isOnline) return { success: false, message: 'Offline' };

    try {
      const localStudents = await db.getAllAsync('SELECT * FROM students WHERE synced = 0');
      if (localStudents.length === 0) return { success: true, count: 0, message: 'Tidak ada santri baru' };

      const payload = localStudents.map(s => ({
        nis: s.nis,
        name: s.name,
        class: s.class,
        room: s.room,
        nisn: s.nisn
      }));

      const { error } = await supabase.from('students').upsert(payload, { onConflict: 'nis' });
      if (error) throw error;

      await db.execAsync('UPDATE students SET synced = 1 WHERE synced = 0');
      return { success: true, count: localStudents.length };
    } catch (error) {
      console.error('Push Master Error:', error.message);
      return { success: false, error: error.message };
    }
  },

  /**
   * 4. PULL & SYNC PROFILE (Nama, Logo, Waktu)
   */
pullSchoolProfile: async () => {
  try {
    // 1. Ambil data dari Supabase
    const { data, error } = await supabase
      .from('school_profile')
      .select('*')
      .eq('id', 1)
      .single();

    if (error) throw error;

    if (data) {
      // 2. SIMPAN KE SQLITE (Local Database)
      // Kita gunakan INSERT OR REPLACE atau UPDATE agar data di id=1 diperbarui
      await db.runAsync(
        `UPDATE school_profile SET 
          school_name = ?, 
          school_logo= ?,
          last_updated = ? 
         WHERE id = 1`,
        [
          data.school_name, 
          data.school_logo,
          data.last_update,
        ]
      );

      // 3. SIMPAN KE ASYNCSTORAGE (Untuk UI/Settings State)
      const currentSettings = await AsyncStorage.getItem('@app_settings');
      const parsed = currentSettings ? JSON.parse(currentSettings) : {};
      
      const newSettings = {
        ...parsed,
        school_name: data.school_name,
        school_logo: data.school_logo,
        is_holiday_mode: data.is_holiday_mode,
        checkin_time: data.checkin_time || '07:00',
        checkout_time: data.checkout_time || '14:00'
      };

      await AsyncStorage.setItem('@app_settings', JSON.stringify(newSettings));
      
      console.log(data.school_name);
      return newSettings;
    }
  } catch (error) {
    console.error('Pull Profile Error:', error.message);
    
    return null;
  }
},

  /**
   * 5. UPLOAD LOGO TO STORAGE
   */
uploadLogo: async (uri) => {
  try {
    // 1. Ekstrak informasi file
    const fileExt = uri.split('.').pop();
    const fileName = `logo_${Date.now()}.${fileExt}`;
    const type = `image/${fileExt === 'png' ? 'png' : 'jpeg'}`;

    // 2. Bungkus dalam FormData (Standar Android untuk kirim file)
    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      name: fileName,
      type: type,
    });

    // 3. Upload menggunakan API Storage Supabase
    // Note: Kita kirim formData langsung ke bucket 'logos'
    const { data, error } = await supabase.storage
      .from('logos')
      .upload(fileName, formData, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    // 4. Ambil Public URL
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName);
    
    return { success: true, url: urlData.publicUrl };
  } catch (e) {
    // Jika masih Network Request Failed, cek dua hal di bawah kode ini
    console.error("Storage Error:", e.message);
    return { success: false, message: e.message };
  }
},
  /**
   * 6. MAINTENANCE: EXPORT DATABASE
   */
  exportDatabase: async () => {
  try {
    const dbName = "aone_database.db";
    const originalUri = `${FileSystem.documentDirectory}SQLite/${dbName}`;
    const temporaryUri = `${FileSystem.cacheDirectory}${dbName}`; // Pindah ke cache biar bisa diakses luar

    // Copy file dari folder sistem ke folder cache
    await FileSystem.copyAsync({
      from: originalUri,
      to: temporaryUri
    });

    // Share dari lokasi cache
    await Sharing.shareAsync(temporaryUri, {
      UTI: 'public.database', // Untuk iOS
      mimeType: 'application/octet-stream',
    });

    return { success: true };
  } catch (e) {
    return { success: false, message: "Gagal ekspor: " + e.message };
  }
},
  /**
   * 7. BACKGROUND SYNC
   */
  startBackgroundSync: () => {
    setInterval(async () => {
      await SyncService.uploadAttendance();
    }, 60000); // 1 Menit
    
    setInterval(async () => {
      await SyncService.pullMasterData();
    }, 600000); // 10 Menit
  }
};