import * as SQLite from 'expo-sqlite';

export const db = SQLite.openDatabaseSync('AOneSmartPresent_v9.db');

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
        role TEXT,
        password TEXT
      );

      CREATE TABLE IF NOT EXISTS user_session (
        id TEXT PRIMARY KEY,
        email TEXT,
        role TEXT,
        full_name TEXT,
        classes TEXT,
        last_login DATETIME
      );

      CREATE TABLE IF NOT EXISTS attendance_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nis TEXT NOT NULL,
        status TEXT NOT NULL,
        session TEXT,
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

      INSERT OR IGNORE INTO school_settings (id) VALUES (1);
      INSERT OR IGNORE INTO school_profile (id) VALUES (1);
    `);

    console.log("SQLite Engine: OK. Database v9 Ready.");
  } catch (error) {
    console.error("SQLite Init Error:", error);
  }
};

export const LocalDB = {

  // ── CRUD SISWA ───────────────────────────────────────────────
  addStudent: async ({ nis, nisn, name, className, room, address, gender }) => {
    return await db.runAsync(
      'INSERT INTO students (nis, nisn, name, class, room, address, gender) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nis, nisn, name, className || '-', room || '-', address || '-', gender || 'L']
    );
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
    db.getAllAsync(
      'SELECT * FROM students WHERE name LIKE ? OR nis LIKE ?',
      [`%${query}%`, `%${query}%`]
    ),

  // Filter siswa by kelas (untuk guru)
  getStudentsByClass: (kelas) =>
    db.getAllAsync(
      'SELECT * FROM students WHERE class = ? ORDER BY name ASC',
      [kelas]
    ),

  searchStudentsByClass: (query, kelas) =>
    db.getAllAsync(
      'SELECT * FROM students WHERE class = ? AND (name LIKE ? OR nis LIKE ?) ORDER BY name ASC',
      [kelas, `%${query}%`, `%${query}%`]
    ),

  // ── ABSENSI ──────────────────────────────────────────────────
  saveAttendance: (nis, status, session) =>
    db.runAsync(
      'INSERT INTO attendance_logs (nis, status, session) VALUES (?, ?, ?)',
      [nis, status, session]
    ),

  checkAlreadyAbsent: async (nis, session) => {
    const result = await db.getFirstAsync(
      `SELECT id FROM attendance_logs 
       WHERE nis = ? AND session = ? AND date(timestamp, 'localtime') = date('now', 'localtime')`,
      [nis, session]
    );
    return !!result;
  },

  getAttendanceHistory: (limit = 50) =>
    db.getAllAsync(
      'SELECT * FROM attendance_logs ORDER BY timestamp DESC LIMIT ?',
      [limit]
    ),

  // Stats hari ini — semua kelas (admin)
  getDailyStats: () =>
    db.getAllAsync(`
      SELECT status, COUNT(*) as total 
      FROM attendance_logs 
      WHERE date(timestamp, 'localtime') = date('now', 'localtime') 
      GROUP BY status
    `),

  // Stats hari ini — filter kelas (guru)
  getDailyStatsByClass: (kelas) =>
    db.getAllAsync(`
      SELECT a.status, COUNT(*) as total
      FROM attendance_logs a
      JOIN students s ON a.nis = s.nis
      WHERE s.class = ?
      AND date(a.timestamp, 'localtime') = date('now', 'localtime')
      GROUP BY a.status
    `, [kelas]),

  // ── GRAFIK ───────────────────────────────────────────────────
  // Grafik mingguan — semua kelas (admin)
  getWeeklyAttendance: async () => {
    try {
      const allRows = await db.getAllAsync(`
        SELECT 
          date(timestamp, 'localtime') as tanggal, 
          COUNT(*) as total 
        FROM attendance_logs 
        WHERE status = 'hadir' OR status = 'Hadir'
        GROUP BY tanggal 
        ORDER BY tanggal DESC 
        LIMIT 7
      `);

      let data = allRows.map(item => item.total);
      data.reverse();
      while (data.length < 7) data.unshift(0);
      return data;
    } catch (error) {
      console.error("getWeeklyAttendance error:", error);
      return [0, 0, 0, 0, 0, 0, 0];
    }
  },

  // Grafik mingguan — filter kelas (guru)
  getWeeklyAttendanceByClass: async (kelas) => {
    try {
      const allRows = await db.getAllAsync(`
        SELECT
          date(a.timestamp, 'localtime') as tanggal,
          COUNT(*) as total
        FROM attendance_logs a
        JOIN students s ON a.nis = s.nis
        WHERE (a.status = 'hadir' OR a.status = 'Hadir')
        AND s.class = ?
        GROUP BY tanggal
        ORDER BY tanggal DESC
        LIMIT 7
      `, [kelas]);

      let data = allRows.map(item => item.total);
      data.reverse();
      while (data.length < 7) data.unshift(0);
      return data;
    } catch (error) {
      console.error("getWeeklyAttendanceByClass error:", error);
      return [0, 0, 0, 0, 0, 0, 0];
    }
  },

  // ── REPORTING ────────────────────────────────────────────────
  // Report — semua kelas (admin)
  getAttendanceReport: (filterType, value) => {
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

  // Report — filter kelas guru (selalu filter by kelas)
  getAttendanceReportByClass: (kelas, filterType, value) => {
    let query = `
      SELECT a.*, s.name, s.class 
      FROM attendance_logs a 
      JOIN students s ON a.nis = s.nis 
      WHERE s.class = ?
    `;
    let params = [kelas];

    if (filterType === 'month') {
      query += " AND strftime('%m', a.timestamp) = ?";
      params.push(value);
    }

    query += ' ORDER BY a.timestamp DESC';
    return db.getAllAsync(query, params);
  },

  // ── PENGATURAN SEKOLAH ───────────────────────────────────────
  getSchoolProfile: async () => {
    try {
      const result = await db?.getFirstAsync(
        'SELECT school_name, school_logo, time_in_start, time_in_end FROM school_settings WHERE id = 1'
      );
      return {
        school_name: result?.school_name || 'Yayasan Muhammad Al Mumtaz',
        school_logo: result?.school_logo || null,
        time_in_start: result?.time_in_start || '07:00',
        time_in_end: result?.time_in_end || '16:00'
      };
    } catch (error) {
      console.log("getSchoolProfile error:", JSON.stringify(error));
      return { school_name: 'Error Koneksi DB', school_logo: null, time_in_start: '07:00', time_in_end: '16:00' };
    }
  },

  getSettings: () =>
    db.getFirstAsync('SELECT * FROM school_settings WHERE id = 1'),

  // Fix: hapus koma lebih sebelum WHERE
  updateSettings: (schoolName, academicYear, timeIn, timeOut) =>
    db.runAsync(
      'UPDATE school_settings SET school_name = ?, academic_year = ?, time_in_end = ?, time_out_start = ? WHERE id = 1',
      [schoolName, academicYear, timeIn, timeOut]
    ),

  validateTimeWindow: (currentTime, targetTime, windowMinutes = 15) => {
    try {
      if (!targetTime) return true;
      const [currH, currM] = currentTime.split(':').map(Number);
      const [tarH, tarM] = targetTime.split(':').map(Number);
      const diff = Math.abs((currH * 60 + currM) - (tarH * 60 + tarM));
      return diff <= windowMinutes;
    } catch (e) {
      return false;
    }
  },

  // ── STAFF ────────────────────────────────────────────────────
  getStaff: async () => {
    try {
      const result = await db?.getFirstAsync('SELECT username FROM staff LIMIT 1');
      return { username: result?.username || '' };
    } catch (error) {
      console.log("getStaff error:", JSON.stringify(error));
      return { username: 'Error Koneksi DB' };
    }
  },

  addStaff: (username, name, role, password) =>
    db.runAsync(
      'INSERT OR REPLACE INTO staff (username, name, role, password) VALUES (?, ?, ?, ?)',
      [username, name, role, password]
    ),

  loginStaff: (username, password) =>
    db.getFirstAsync(
      'SELECT * FROM staff WHERE username = ? AND password = ?',
      [username, password]
    ),
};

export default db;