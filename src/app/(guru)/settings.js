import { router } from 'expo-router';
import {
    CloudDownload,
    LogOut,
    RefreshCw,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import Toast from 'react-native-toast-message';
import CustomAlert from '../../components/CustomAlert';
import { db } from '../../database/sqlite';
import { supabase } from '../../database/supabase';
import { useAuth } from '../../services/AuthContext';
import { Theme, hexToRGBA } from '../../theme/colors';

export default function GuruSettingsScreen() {
  const { user, logout } = useAuth();

  const [loadingType, setLoadingType] = useState(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [stats, setStats] = useState({ local: 0, unsynced: 0 });
  const [lastSync, setLastSync] = useState('Belum pernah');

  useEffect(() => {
    fetchStats();
  }, []);

  // ── Stats lokal ──────────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const localRes = await db.getAllAsync('SELECT COUNT(*) as total FROM students WHERE class = ?', [user?.classes?.[0] || '']);
      const unsyncedAbs = await db.getAllAsync('SELECT COUNT(*) as total FROM attendance_logs WHERE synced = 0');
      setStats({
        local: localRes[0]?.total || 0,
        unsynced: unsyncedAbs[0]?.total || 0,
      });
    } catch (e) {
      console.log('Stats error:', e.message);
    }
  };

  // ── Setor Absen ──────────────────────────────────────────────
  const handlePushAttendance = async () => {
    setLoadingType('sync_absen');
    try {
      const unsynced = await db.getAllAsync('SELECT * FROM attendance_logs WHERE synced = 0');
      if (unsynced.length === 0) {
        Alert.alert('Info', 'Semua log absen sudah terkirim.');
        return;
      }
      const { error } = await supabase.from('attendance_logs').insert(
        unsynced.map(log => ({
          nis: log.nis,
          status: log.status,
          session: log.session,
          timestamp: log.timestamp || new Date().toISOString(),
        }))
      );
      if (error) throw error;
      const ids = unsynced.map(log => log.id).join(',');
      await db.execAsync(`UPDATE attendance_logs SET synced = 1 WHERE id IN (${ids})`);
      await fetchStats();
      Toast.show({ type: 'success', text1: 'Berhasil', text2: `${unsynced.length} data absensi berhasil disetor.` });
    } catch (e) {
      Alert.alert('Gagal Setor Absen', e.message);
    } finally {
      setLoadingType(null);
    }
  };

  // ── Tarik Data ───────────────────────────────────────────────
  const handlePullData = async () => {
    setLoadingType('download');
    try {
      // Tarik data siswa sesuai kelas guru saja
      const kelasAmpu = user?.classes?.[0];
      if (!kelasAmpu) throw new Error('Kelas diampu tidak ditemukan.');

      const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .eq('class', kelasAmpu);

      if (error) throw error;

      // Upsert ke SQLite
      for (const s of students) {
        await db.runAsync(
          `INSERT OR REPLACE INTO students 
            (nis, nisn, name, class, room, address, gender, qr_code_data, synced) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [s.nis, s.nisn, s.name, s.class, s.room, s.address, s.gender, s.qr_code_data]
        );
      }

      await fetchStats();
      const now = new Date().toLocaleString('id-ID');
      setLastSync(now);

      Toast.show({
        type: 'success',
        text1: 'Data Diperbarui',
        text2: `${students.length} siswa kelas ${kelasAmpu} berhasil diperbarui.`,
      });
    } catch (e) {
      Alert.alert('Gagal Tarik Data', e.message);
    } finally {
      setLoadingType(null);
    }
  };

  // ── Logout ───────────────────────────────────────────────────
  const handleLogout = () => setAlertVisible(true);

  const executeLogout = async () => {
    try {
      setAlertVisible(false);
      await logout();
      router.replace('/(auth)/LoginScreen');
    } catch (err) {
      console.error('Logout Error:', err.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* HEADER */}
        <View style={styles.header}>
          <Text style={styles.title}>Pengaturan</Text>
          <Text style={styles.subtitle}>Sinkronisasi data & akun</Text>
        </View>

        {/* INFO GURU */}
        <View style={styles.infoCard}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.full_name?.charAt(0).toUpperCase() || 'G'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guruName}>{user?.full_name || 'Guru'}</Text>
            <Text style={styles.guruEmail}>{user?.email || ''}</Text>
            <View style={styles.kelasBadge}>
              <Text style={styles.kelasText}>
                Kelas {user?.classes?.[0] || '-'}
              </Text>
            </View>
          </View>
        </View>

        {/* STATS */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.local}</Text>
            <Text style={styles.statLabel}>Siswa Kelas</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: stats.unsynced > 0 ? Theme.danger : '#10b981' }]}>
              {stats.unsynced}
            </Text>
            <Text style={styles.statLabel}>Belum Disetor</Text>
          </View>
        </View>

        {/* SINKRONISASI */}
        <Text style={styles.sectionLabel}>Sinkronisasi Data</Text>

        {/* Setor Absen */}
        <TouchableOpacity
          style={[styles.syncBtn, { borderColor: Theme.primary }]}
          onPress={handlePushAttendance}
          disabled={loadingType !== null}
          activeOpacity={0.8}
        >
          {loadingType === 'sync_absen' ? (
            <ActivityIndicator color={Theme.primary} />
          ) : (
            <RefreshCw color={Theme.primary} size={22} />
          )}
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={[styles.syncBtnTitle, { color: Theme.primary }]}>Setor Absensi</Text>
            <Text style={styles.syncBtnDesc}>Kirim data absen ke server</Text>
          </View>
          {stats.unsynced > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{stats.unsynced}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Tarik Data */}
        <TouchableOpacity
          style={[styles.syncBtn, { borderColor: '#10b981' }]}
          onPress={handlePullData}
          disabled={loadingType !== null}
          activeOpacity={0.8}
        >
          {loadingType === 'download' ? (
            <ActivityIndicator color="#10b981" />
          ) : (
            <CloudDownload color="#10b981" size={22} />
          )}
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={[styles.syncBtnTitle, { color: '#10b981' }]}>Tarik Data Siswa</Text>
            <Text style={styles.syncBtnDesc}>Perbarui data siswa dari server</Text>
          </View>
        </TouchableOpacity>

        {lastSync !== 'Belum pernah' && (
          <Text style={styles.lastSync}>Terakhir sync: {lastSync}</Text>
        )}

        {/* LOGOUT */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut color={Theme.danger} size={20} />
          <Text style={styles.logoutText}>Keluar Akun</Text>
        </TouchableOpacity>

        <CustomAlert
          visible={alertVisible}
          type="warning"
          title="Konfirmasi Logout"
          message="Apakah Anda yakin ingin keluar?"
          confirmText="KELUAR"
          cancelText="BATAL"
          onConfirm={executeLogout}
          onCancel={() => setAlertVisible(false)}
        />

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { padding: 24, paddingTop: 60, paddingBottom: 100 },

  header: { marginBottom: 25 },
  title: { color: Theme.textMain, fontSize: 28, fontWeight: '900' },
  subtitle: { color: Theme.textMuted, fontSize: 14 },

  // Info Guru
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: hexToRGBA(Theme.card, 0.6),
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.2),
    gap: 15,
  },
  avatarCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: hexToRGBA(Theme.primary, 0.15),
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.primary, 0.3),
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: Theme.primary, fontSize: 22, fontWeight: '900' },
  guruName: { color: Theme.textMain, fontSize: 16, fontWeight: '800' },
  guruEmail: { color: Theme.textMuted, fontSize: 12, marginTop: 2 },
  kelasBadge: {
    alignSelf: 'flex-start',
    backgroundColor: hexToRGBA(Theme.primary, 0.15),
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.primary, 0.3),
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  kelasText: { color: Theme.primary, fontSize: 11, fontWeight: '800' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  statItem: {
    flex: 1,
    backgroundColor: hexToRGBA(Theme.card, 0.4),
    padding: 15,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.2),
  },
  statNum: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  statLabel: { color: Theme.textMuted, fontSize: 10, marginTop: 4, textAlign: 'center' },

  // Section
  sectionLabel: {
    color: Theme.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 15,
    letterSpacing: 1,
  },

  // Sync Buttons
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: hexToRGBA(Theme.card, 0.5),
    borderRadius: 20,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  syncBtnTitle: { fontSize: 15, fontWeight: '800' },
  syncBtnDesc: { color: Theme.textMuted, fontSize: 11, marginTop: 2 },
  badge: {
    backgroundColor: Theme.danger,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  lastSync: {
    color: Theme.textMuted,
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
    marginTop: 10,
  },
  logoutText: { color: Theme.danger, fontWeight: '800' },
});