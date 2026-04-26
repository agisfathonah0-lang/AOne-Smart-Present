import * as SQLite from 'expo-sqlite';

/**
 * Menggunakan Nama DB Baru (v2) untuk memaksa pembaharuan kolom nisn, room, address
 */
export const db = SQLite.openDatabaseSync('AOneSmartPresent_v7.db');

export const initDatabase = async () => {
  try {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      
      CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nis TEXT UNIQUE NOT NULL,
        nisn TEXT,           
        name TEXT NOT NULL,
        class TEXT,
        room TEXT,           
        address TEXT,        
        gender TEXT,
        qr_code_data TEXT,
        synced INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        name TEXT,
        role TEXT, -- admin / guru
        password TEXT
      );

      CREATE TABLE IF NOT EXISTS attendance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nis TEXT NOT NULL,
        status TEXT NOT NULL, -- hadir, izin, sakit, alfa
        session TEXT, -- masuk, pulang
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        FOREIGN KEY (nis) REFERENCES students (nis) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS school_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        school_name TEXT DEFAULT 'YAYASAN MUHAMMAD AL MUMTAZ',
        school_logo TEXT,
        academic_year TEXT DEFAULT '2025/2026',
        time_in_start TIME DEFAULT '06:00',
        time_in_end TIME DEFAULT '07:30',
        time_out_start TIME DEFAULT '13:00',
        is_holiday_mode INTEGER DEFAULT 0
     
      );
      CREATE TABLE IF NOT EXISTS school_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      school_name TEXT,
      school_logo TEXT,
      last_updated DATETIME
    
      );
   

    CREATE TABLE IF NOT EXISTS user_session (
      id TEXT PRIMARY KEY,
      email TEXT,
      role TEXT,
      last_login DATETIME
    );
      
      INSERT OR IGNORE INTO school_settings (id) VALUES (1);
    `);
    
    console.log("SQLite Engine: OK. Database v2 Ready.");
  } catch (error) {
    console.error("SQLite Init Error:", error);
  }
};

/**
 * LocalDB - Controller Lengkap
 */
export const LocalDB = {
  // --- CRUD SISWA ---
  addStudent: async ({ nis, nisn, name, className, room, address, gender }) => {
    return await db.runAsync(
      'INSERT INTO students (nis, nisn, name, class, room, address, gender) VALUES (?, ?, ?, ?, ?, ?, ?)', 
      [nis, nisn, name, className || '-', room || '-', address || '-', gender || 'L']
    );
  },
getSchoolProfile: async () => {
  try {
    // Tambahkan kolom waktu ke dalam query SELECT
    const result = await db?.getFirstAsync(
      'SELECT school_name, school_logo, time_in_start, time_in_end FROM school_settings WHERE id = 1'
    );

    // Gunakan optional chaining (?.) untuk menghindari NullPointerException
    return { 
      school_name: result?.school_name || 'Yayasan Muhammad Al Mumtaz', 
      school_logo: result?.school_logo || null,
      time_in_start: result?.time_in_start || '07:00', // Fallback jam masuk
      time_in_end: result?.time_in_end || '16:00'      // Fallback jam pulang
    };
  } catch (error) {
    console.log("Detail Error SQLite:", JSON.stringify(error));
    // Kembalikan objek default agar pemanggil fungsi tidak error saat akses properti
    return { 
      school_name: 'Error Koneksi DB', 
      school_logo: null,
      time_in_start: '07:00',
      time_in_end: '16:00'
    };
  }
},
validateTimeWindow: (currentTime, targetTime, windowMinutes = 15) => {
  try {
    if (!targetTime) return true; // Jika jam tidak diatur, anggap bebas

    // Memecah "HH:mm" menjadi angka
    const [currH, currM] = currentTime.split(':').map(Number);
    const [tarH, tarM] = targetTime.split(':').map(Number);

    // Konversi ke total menit untuk perbandingan mudah
    const currentTotal = currH * 60 + currM;
    const targetTotal = tarH * 60 + tarM;

    const diff = Math.abs(currentTotal - targetTotal);
    return diff <= windowMinutes; // Mengembalikan true jika masuk rentang 15 menit
  } catch (e) {
    return false;
  }
},
getStaff: async () => {
  try {
    // Pakai try catch block yang sangat ketat
    const result = await db?.getFirstAsync(
      'SELECT username FROM staff WHERE id = 1'
    );
    return { 
      // school_name: result.school_name || 'Ponpes Miftahul Ulum', 
      username: result.username ,
    };
  } catch (error) {
    // Log error secara detail untuk debugging
    console.log("Detail Error SQLite:", JSON.stringify(error));
    return { username: 'Error Koneksi DB'};
  }
},
// --- FUNGSI GRAFIK (Versi Modern) ---
  getWeeklyAttendance: async () => {
    try {
      // 1. Gunakan nama tabel yang benar: attendance_logs
      // 2. Gunakan kolom yang benar: timestamp (bukan created_at)
      const query = `
        SELECT 
          date(timestamp, 'localtime') as tanggal, 
          COUNT(*) as total 
        FROM attendance_logs 
        WHERE status = 'hadir' OR status = 'Hadir'
        GROUP BY tanggal 
        ORDER BY tanggal DESC 
        LIMIT 7
      `;

      // 3. Gunakan db.getAllAsync (Tanpa transaction callback yang ribet)
      const allRows = await db.getAllAsync(query);
      
      // Ambil angka totalnya saja
      let data = allRows.map(item => item.total);

      // Balik urutan agar hari terlama di kiri, hari terbaru di kanan
      data.reverse();

      // Jika data kurang dari 7 hari (karena sekolah baru mulai absen), isi dengan 0
      while (data.length < 7) {
        data.unshift(0);
      }
      
      return data;
    } catch (error) {
      console.error("Gagal ambil data mingguan:", error);
      return [0, 0, 0, 0, 0, 0, 0]; // Return default agar chart tidak crash
    }
  },
  updateStudent: async (oldNis, data) => {
    return await db.runAsync(
      'UPDATE students SET nis = ?, nisn = ?, name = ?, class = ?, room = ?, address = ? WHERE nis = ?',
      [data.nis, data.nisn, data.name, data.class, data.room, data.address, oldNis]
    );
  },

  getAllStudents: () => 
    db.getAllAsync('SELECT * FROM students ORDER BY name ASC'),

  getStudentByNis: (nis) =>
    db.getFirstAsync('SELECT * FROM students WHERE nis = ?', [nis]),
  
  deleteStudent: (nis) => 
    db.runAsync('DELETE FROM students WHERE nis = ?', [nis]),

  searchStudents: (query) =>
    db.getAllAsync('SELECT * FROM students WHERE name LIKE ? OR nis LIKE ?', [`%${query}%`, `%${query}%`]),

  // --- LOG ABSENSI ---
  saveAttendance: (nis, status, session) => 
    db.runAsync(
      'INSERT INTO attendance_logs (nis, status, session) VALUES (?, ?, ?)', 
      [nis, status, session]
    ),

  // FUNGSI BARU: Cek apakah sudah absen hari ini di sesi tertentu
  checkAlreadyAbsent: async (nis, session) => {
    const result = await db.getFirstAsync(
      `SELECT id FROM attendance_logs 
       WHERE nis = ? AND session = ? AND date(timestamp, 'localtime') = date('now', 'localtime')`,
      [nis, session]
    );
    return !!result; // Mengembalikan true jika ditemukan, false jika tidak
  },

  getAttendanceHistory: (limit = 50) =>
    db.getAllAsync('SELECT * FROM attendance_logs ORDER BY timestamp DESC LIMIT ?', [limit]),

  getDailyStats: () => 
    db.getAllAsync(`
      SELECT status, COUNT(*) as total 
      FROM attendance_logs 
      WHERE date(timestamp, 'localtime') = date('now', 'localtime') 
      GROUP BY status
    `),

  // --- REPORTING ---
  getAttendanceReport: (filterType, value) => {
    // filterType: 'class', 'month', 'week'
    let query = 'SELECT a.*, s.name, s.class FROM attendance_logs a JOIN students s ON a.nis = s.nis ';
    let params = [];

    if (filterType === 'class') {
      query += 'WHERE s.class = ? ';
      params.push(value);
    } else if (filterType === 'month') {
      query += "WHERE strftime('%m', a.timestamp) = ? ";
      params.push(value);
    }
    
    query += 'ORDER BY a.timestamp DESC';
    return db.getAllAsync(query, params);
  },

  // --- PENGATURAN SEKOLAH ---
  getSettings: () => 
    db.getFirstAsync('SELECT * FROM school_settings WHERE id = 1'),
  
  updateSettings: (schoolName, academicYear, timeIn, timeOut) => 
    db.runAsync(
      'UPDATE school_settings SET school_name = ?, academic_year = ?, time_in_end = ?, time_out_start = ?,  WHERE id = 1',
      [schoolName, academicYear, timeIn, timeOut]
    ),

  // --- STAFF / USER ---
  addStaff: (username, name, role, password) =>
    db.runAsync('INSERT INTO staff (username, name, role, password) VALUES (?, ?, ?, ?)', [username, name, role, password]),

  loginStaff: (username, password) =>
    db.getFirstAsync('SELECT * FROM staff WHERE username = ? AND password = ?', [username, password])
};

export default db;