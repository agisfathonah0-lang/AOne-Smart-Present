import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import {
  BellRing,
  ChevronRight,
  Clock,
  CloudDownload,
  Database,
  Image as ImageIcon,
  LogOut,
  RefreshCw,
  Share2
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
// Import internal
import Card from '../../components/Card';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import db from '../../database/sqlite';
import { supabase } from '../../database/supabase';
import { SyncService } from '../../services/syncService';
import { Theme, hexToRGBA } from '../../theme/colors';

export default function SettingsScreen({ navigation }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' atau 'system'
  const [loadingType, setLoadingType] = useState(null);
  const [lastSync, setLastSync] = useState('Belum pernah');
  const [showEditName, setShowEditName] = useState(false);
  const [tempName, setTempName] = useState('');

  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [stats, setStats] = useState({ local: 0, cloud: 0, unsynced: 0 });

  const [settings, setSettings] = useState({
    school_name: 'Ponpes Miftahul Ulum',
    school_logo: null,
    holiday_mode: false,
    checkin_time: '07:00',
    checkout_time: '14:00',
  });

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    await loadSettings();
    await fetchStats();
  };
  // 1. FUNGSI SETOR DATA SANTRI (MASTER)
  const handlePushMaster = async () => {
    setLoadingType('sync_master');
    try {
      // 1. PAKSA ambil SEMUA data santri (abaikan status synced)
      // Ini untuk memastikan data yang tertinggal dengan status '1' tetap terkirim
      const allStudents = await db.getAllAsync('SELECT * FROM students');

      if (allStudents.length === 0) {
        Alert.alert("Info", "Tidak ada data santri di database lokal.");
        setLoadingType(null);
        return;
      }

      // 2. Mapping data sesuai struktur tabel Anda
      const payload = allStudents.map(s => ({
        nis: s.nis,
        nisn: s.nisn,
        name: s.name,
        class: s.class,
        room: s.room,
        address: s.address,
        gender: s.gender,
        qr_code_data: s.qr_code_data,
        updated_at: new Date().toISOString()
      }));

      // 3. Kirim ke Supabase dengan UPSERT
      // onConflict: 'nis' artinya jika NIS sudah ada di cloud, timpa/update saja.
      // Jika belum ada, maka masukkan sebagai data baru.
      const { error } = await supabase
        .from('students')
        .upsert(payload, { onConflict: 'nis' });

      if (error) throw error;

      // 4. Pastikan semua data di lokal ditandai sudah sinkron (synced = 1)
      const nises = allStudents.map(s => `'${s.nis}'`).join(',');
      await db.execAsync(`UPDATE students SET synced = 1 WHERE nis IN (${nises})`);

      // 5. Refresh angka statistik di layar
      await fetchStats();

      Alert.alert(
        "Berhasil",
        `Sinkronisasi total selesai. ${allStudents.length} data santri dipastikan masuk ke Cloud.`
      );

    } catch (e) {
      console.error("Push Master Error:", e.message);
      Alert.alert("Gagal Sinkron", "Periksa koneksi internet atau struktur tabel: " + e.message);
    } finally {
      setLoadingType(null);
    }
  };

  // 2. FUNGSI SETOR ABSENSI
  const handlePushAttendance = async () => {
    setLoadingType('sync_absen');
    try {
      // Ambil log absensi yang belum sinkron
      const unsynced = await db.getAllAsync('SELECT * FROM attendance_logs WHERE synced = 0');

      if (unsynced.length === 0) {
        Alert.alert("Info", "Semua log absen sudah terkirim.");
        return;
      }

      // Kirim ke Supabase (Sesuaikan nama tabel cloud Anda, misal: 'attendance')
      const { error } = await supabase.from('attendance_logs').insert(
        unsynced.map(log => ({
          nis: log.nis,
          status: log.status,
          tap_time: log.tap_time,
          timestamp: log.tap_time || new Date().toISOString(),
          type: log.type, // check-in atau check-out
          created_at: new Date().toISOString()
        }))
      );

      if (error) throw error;

      // Update status di lokal menggunakan ID
      const ids = unsynced.map(log => log.id).join(',');
      await db.execAsync(`UPDATE attendance_logs SET synced = 1 WHERE id IN (${ids})`);

      await fetchStats();
      Alert.alert("Berhasil", `${unsynced.length} data absensi berhasil disetor.`);
    } catch (e) {
      Alert.alert("Gagal Setor Absen", e.message);
    } finally {
      setLoadingType(null);
    }
  };
  const fetchStats = async () => {
    try {
      const localRes = await db.getAllAsync('SELECT COUNT(*) as total FROM students');
      const unsyncedStud = await db.getAllAsync('SELECT COUNT(*) as total FROM students WHERE synced = 0');
      const unsyncedAbs = await db.getAllAsync('SELECT COUNT(*) as total FROM attendance_logs WHERE synced = 0');

      const { count } = await supabase.from('students').select('*', { count: 'exact', head: true });

      setStats({
        local: localRes[0]?.total || 0,
        unsynced: (unsyncedStud[0]?.total || 0) + (unsyncedAbs[0]?.total || 0),
        cloud: count || 0
      });
    } catch (e) {
      console.log("Stats Error:", e.message);
    }
  };

  const loadSettings = async () => {
    const saved = await AsyncStorage.getItem('@app_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      setSettings(parsed);
      setTempName(parsed.school_name);
    }
    const syncTime = await AsyncStorage.getItem('@last_sync_time');
    if (syncTime) setLastSync(syncTime);
  };

  const handleLogout = async () => {
    try {
      console.log('🚪 Logout (clear session table)...');

      await db.runAsync(`DELETE FROM user_session`);

      console.log('🧹 Semua data session terhapus');

      // redirect ke login
      router.replace('/LoginScreen');

    } catch (err) {
      console.error('❌ Logout Error:', err.message);
    }
  };
  const updateSetting = async (key, value) => {
    console.log('\n=== UPDATE SETTING ===');
    console.log('KEY:', key);
    console.log('VALUE:', value);

    try {
      // =========================
      // 1. HOLIDAY MODE
      // =========================
      if (key === 'holiday_mode') {
        const dbValue = value ? 1 : 0;

        await db.runAsync(
          `UPDATE school_settings SET is_holiday_mode = ? WHERE id = 1`,
          [dbValue]
        );

        const { error } = await supabase
          .from('school_profile')
          .upsert({
            id: 1,
            is_holiday_mode: value,
            last_updated: new Date().toISOString()
          });

        if (error) console.log('❌ Supabase:', error.message);

        const newSettings = { ...settings, holiday_mode: value };
        setSettings(newSettings);
        await AsyncStorage.setItem('@app_settings', JSON.stringify(newSettings));

        console.log('✅ HOLIDAY UPDATED');
        return;
      }

      // =========================
      // 2. CHECKIN TIME (START + END)
      // =========================
    } catch (e) {
      console.log('❌ UPDATE SETTING ERROR:', e.message);
    }
  };

  const handleSubmitTime = async (key) => {
    const value = settings[key];
    const isValidTime = (time) => {
      return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
    };
    console.log('\n=== SUBMIT TIME ===');
    console.log('KEY:', key);
    console.log('VALUE:', value);

    // ✅ Validasi dulu
    if (!isValidTime(value)) {
      Alert.alert('Format salah', 'Gunakan HH:MM');
      return;
    }

    try {
      // =========================
      // 1. CHECKIN
      // =========================
      if (key === 'checkin_time_start') {
        const startTime = value;
        const endTime = value; // sementara sama

        console.log('➡️ MODE: CHECKIN');

        await db.runAsync(
          `UPDATE school_settings 
         SET time_in_start = ?, time_in_end = ?
         WHERE id = 1`,
          [startTime, endTime]
        );

        const { error } = await supabase
          .from('school_profile')
          .upsert({
            id: 1,
            time_in_start: startTime,
            time_in_end: endTime,
            last_updated: new Date().toISOString()
          });

        if (error) console.log('❌ Supabase:', error.message);

        const newSettings = {
          ...settings,
          checkin_time: startTime,
          checkin_time_end: endTime
        };

        setSettings(newSettings);
        await AsyncStorage.setItem('@app_settings', JSON.stringify(newSettings));

        console.log('✅ CHECKIN UPDATED');
        return;
      }

      // =========================
      // 2. GENERAL
      // =========================
      const columnMap = {
        checkin_time_end: 'time_in_end',
        checkout_time_start: 'time_out_start'
      };

      const dbCol = columnMap[key];

      console.log('➡️ MODE: GENERAL');
      console.log('DB COL:', dbCol);

      if (!dbCol) {
        console.warn('❌ Key tidak dikenali:', key);
        return;
      }

      await db.runAsync(
        `UPDATE school_settings SET ${dbCol} = ? WHERE id = 1`,
        [value]
      );

      const { error } = await supabase
        .from('school_profile')
        .upsert({
          id: 1,
          [dbCol]: value,
          last_updated: new Date().toISOString()
        });

      if (error) console.log('❌ Supabase:', error.message);

      const newSettings = { ...settings, [key]: value };

      setSettings(newSettings);
      await AsyncStorage.setItem('@app_settings', JSON.stringify(newSettings));

      console.log('✅ GENERAL UPDATED');

    } catch (e) {
      console.error('❌ Update Error:', e.message);
    }
  };
  const handlePickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.5,
    });

    if (!result.canceled) {
      startUploadProcess(result.assets[0].uri);
    }
  };

  const startUploadProcess = async (uri) => {
    setUploadVisible(true);
    setUploadProgress(20);

    const res = await SyncService.uploadLogo(uri);
    setUploadProgress(70);

    if (res.success) {
      await updateSetting('school_logo', res.url);
      setUploadProgress(100);
      setTimeout(() => {
        setUploadVisible(false);
        Alert.alert("Berhasil", "Logo cloud diperbarui.");
      }, 500);
    } else {
      setUploadVisible(false);
      Alert.alert("Gagal Upload", res.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Pengaturan</Text>
          <Text style={styles.subtitle}>Konfigurasi sistem & profil AOne</Text>
        </View>

        {/* TAB NAVIGATION */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'profile' && styles.tabActive]}
            onPress={() => setActiveTab('profile')}
          >
            <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>PROFIL & WAKTU</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'system' && styles.tabActive]}
            onPress={() => setActiveTab('system')}
          >
            <Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>SINKRON & DATA</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'profile' ? (
          <View>
            <GlassmorphicBox style={styles.profileBox}>
              <TouchableOpacity onPress={handlePickLogo} style={styles.logoWrapper}>
                {settings.school_logo ? (
                  <Image source={{ uri: settings.school_logo }} style={styles.logoImage} />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <ImageIcon color={Theme.primary} size={30} />
                  </View>
                )}
                <View style={styles.editBadge}><RefreshCw size={12} color="#FFF" /></View>
              </TouchableOpacity>
              <Text style={styles.schoolNameDisplay}>{settings.school_name}</Text>
              <TouchableOpacity onPress={() => setShowEditName(true)}>
                <Text style={styles.editBtnText}>Ubah Nama Pesantren</Text>
              </TouchableOpacity>
            </GlassmorphicBox>

            <Text style={styles.sectionLabel}>Jadwal Absensi</Text>
            <Card style={styles.groupCard}>
              <View style={styles.settingItem}>
                <Clock color={Theme.primary} size={20} />
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.itemTitle}>Jam Masuk</Text>
                </View>
                <TextInput
                  style={styles.timeInput}

                  value={settings.checkin_time_start}
                  onChangeText={(v) =>
                    setSettings(prev => ({ ...prev, checkin_time_start: v }))
                  }
                  keyboardType="numeric"
                  returnKeyType="done"
                  onSubmitEditing={() => handleSubmitTime('checkin_time_start')}
                />

              </View>
              <View style={styles.divider} />
              <View style={styles.settingItem}>
                <Clock color={Theme.primary} size={20} />
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.itemTitle}>Jam Pulang</Text>
                </View>
                <TextInput
                  style={styles.timeInput}
                  value={settings.checkout_time_start}
                  onChangeText={(v) =>
                    setSettings(prev => ({ ...prev, checkout_time_start: v }))
                  }
                  keyboardType="numeric"
                  returnKeyType="done"
                  blurOnSubmit={true}
                  onSubmitEditing={() =>
                    handleSubmitTime('checkout_time_start')
                  }
                />
              </View>
            </Card>
          </View>
        ) : (
          <View>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>{stats.local}</Text>
                <Text style={styles.statLabel}>Total Santri</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: Theme.primary }]}>{stats.cloud}</Text>
                <Text style={styles.statLabel}>Cloud</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: stats.unsynced > 0 ? Theme.danger : '#10b981' }]}>
                  {stats.unsynced}
                </Text>
                <Text style={styles.statLabel}>Belum Setor</Text>
              </View>
            </View>

            <Text style={styles.sectionLabel}>Sinkronisasi Cloud</Text>
            <View style={styles.syncGrid}>
              {/* TOMBOL SETOR SANTRI */}
              <TouchableOpacity
                style={[styles.syncActionBtn, { borderColor: '#10b981' }]}
                onPress={handlePushMaster}
                disabled={loadingType !== null}
              >
                {loadingType === 'sync_master' ? (
                  <ActivityIndicator color="#10b981" />
                ) : (
                  <Database color="#10b981" size={24} />
                )}
                <Text style={[styles.syncActionLabel, { color: '#10b981' }]}>Setor Santri</Text>
              </TouchableOpacity>

              {/* TOMBOL SETOR ABSEN */}
              <TouchableOpacity
                style={[styles.syncActionBtn, { borderColor: Theme.primary }]}
                onPress={handlePushAttendance}
                disabled={loadingType !== null}
              >
                {loadingType === 'sync_absen' ? (
                  <ActivityIndicator color={Theme.primary} />
                ) : (
                  <RefreshCw color={Theme.primary} size={24} />
                )}
                <Text style={[styles.syncActionLabel, { color: Theme.primary }]}>Setor Absen</Text>
              </TouchableOpacity>
            </View>

            <Card style={styles.wideCard}>
              <TouchableOpacity style={styles.wideBtn} onPress={async () => {
                setLoadingType('download');
                await SyncService.pullMasterData();
                await SyncService.pullSchoolProfile();
                await fetchStats();
                setLoadingType(null);
                Alert.alert("Berhasil", "Data HP telah diperbarui dari Cloud.");
              }}>
                <CloudDownload color={Theme.primary} size={24} />
                <View style={{ flex: 1, marginLeft: 15 }}>
                  <Text style={styles.wideBtnTitle}>Update Data Master</Text>
                  <Text style={styles.wideBtnDesc}>Tarik data terbaru dari server</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.divider} />
              <Text style={styles.syncStatus}>Last Sync: {lastSync}</Text>
            </Card>

            <Text style={styles.sectionLabel}>Maintenance</Text>
            <Card style={styles.groupCard}>
              <TouchableOpacity style={styles.settingItem} onPress={() => SyncService.exportDatabase()}>
                <Share2 color={Theme.primary} size={20} />
                <Text style={styles.itemTitle}>Ekspor Database (.db)</Text>
                <ChevronRight color={Theme.textMuted} size={18} />
              </TouchableOpacity>
              <View style={styles.divider} />
              <View style={styles.settingItem}>
                <BellRing color={Theme.primary} size={20} />
                <Text style={styles.itemTitle}>Mode Libur</Text>
                <Switch
                  // Pastikan nama kuncinya sama: is_holiday_mode
                  value={settings.is_holiday_mode}
                  onValueChange={(v) => updateSetting('is_holiday_mode', v)}
                  trackColor={{ true: Theme.primary, false: '#767577' }}
                  thumbColor={settings.is_holiday_mode ? Theme.primary : '#f4f3f4'}
                />
              </View>
            </Card>
          </View>
        )}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut color={Theme.danger} size={20} />
          <Text style={styles.logoutText}>Keluar Akun</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* MODAL UPLOAD PROGRESS */}
      <Modal visible={uploadVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <GlassmorphicBox style={styles.uploadCard}>
            <LottieView autoPlay loop source={require('../../assets/animations/upload.json')} style={{ width: 140, height: 140 }} />
            <Text style={styles.uploadText}>Uploading Logo...</Text>
            <View style={styles.progressBarBg}><View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} /></View>
            <Text style={styles.progressPercentage}>{uploadProgress}%</Text>
          </GlassmorphicBox>
        </View>
      </Modal>

      {/* MODAL EDIT NAMA */}
      <Modal visible={showEditName} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nama Pesantren</Text>
            <TextInput style={styles.input} value={tempName} onChangeText={setTempName} autoFocus />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowEditName(false)} style={styles.cancelBtn}><Text style={{ color: '#888' }}>Batal</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => { updateSetting('school_name', tempName); setShowEditName(false); }} style={styles.saveBtn}><Text style={{ color: '#000', fontWeight: 'bold' }}>Simpan</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { padding: 24, paddingTop: 60, paddingBottom: 100 },
  header: { marginBottom: 25 },
  title: { color: Theme.textMain, fontSize: 28, fontWeight: '900' },
  subtitle: { color: Theme.textMuted, fontSize: 14 },

  // Tab Styles
  tabContainer: { flexDirection: 'row', backgroundColor: hexToRGBA(Theme.card, 0.5), borderRadius: 20, padding: 5, marginBottom: 25, borderWidth: 1, borderColor: hexToRGBA(Theme.border, 0.2) },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 15 },
  tabActive: { backgroundColor: Theme.primary },
  tabText: { color: Theme.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  tabTextActive: { color: '#000' },

  profileBox: { padding: 30, alignItems: 'center', borderRadius: 32, marginBottom: 20 },
  logoWrapper: { width: 110, height: 110, borderRadius: 55, backgroundColor: hexToRGBA(Theme.primary, 0.1), justifyContent: 'center', alignItems: 'center', marginBottom: 15, position: 'relative', overflow: 'hidden', borderWidth: 1, borderColor: Theme.primary },
  logoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  logoPlaceholder: { alignItems: 'center' },
  editBadge: { position: 'absolute', bottom: 5, right: 5, backgroundColor: Theme.primary, padding: 6, borderRadius: 12 },
  schoolNameDisplay: { color: Theme.textMain, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  editBtnText: { color: Theme.primary, fontSize: 12, marginTop: 10, fontWeight: '700' },

  timeInput: { backgroundColor: hexToRGBA(Theme.primary, 0.1), color: Theme.primary, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, fontWeight: '800', fontSize: 16, width: 85, textAlign: 'center', borderWidth: 1, borderColor: hexToRGBA(Theme.primary, 0.3) },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 25 },
  statItem: { flex: 1, backgroundColor: hexToRGBA(Theme.card, 0.4), padding: 15, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: hexToRGBA(Theme.border, 0.2) },
  statNum: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  statLabel: { color: Theme.textMuted, fontSize: 10, marginTop: 4 },

  sectionLabel: { color: Theme.primary, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', marginBottom: 15, letterSpacing: 1 },
  syncGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  syncActionBtn: { flex: 1, padding: 20, borderRadius: 28, alignItems: 'center', backgroundColor: hexToRGBA(Theme.card, 0.5), borderWidth: 1.5 },
  syncActionLabel: { fontSize: 14, fontWeight: '900', marginTop: 10 },
  wideCard: { padding: 20, borderRadius: 28, marginBottom: 25 },
  wideBtn: { flexDirection: 'row', alignItems: 'center' },
  wideBtnTitle: { color: Theme.textMain, fontSize: 16, fontWeight: '700' },
  wideBtnDesc: { color: Theme.textMuted, fontSize: 11 },
  syncStatus: { textAlign: 'center', color: Theme.textMuted, fontSize: 10, marginTop: 15 },
  groupCard: { borderRadius: 28, marginBottom: 25, overflow: 'hidden' },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  itemTitle: { color: Theme.textMain, flex: 1, fontWeight: '600', fontSize: 15 },
  divider: { height: 1, backgroundColor: hexToRGBA(Theme.border, 0.3), marginHorizontal: 10 },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 20 },
  logoutText: { color: Theme.danger, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 25 },
  uploadCard: { padding: 30, alignItems: 'center', borderRadius: 30 },
  uploadText: { color: Theme.textMain, fontSize: 18, fontWeight: '800', marginTop: 10 },
  progressBarBg: { width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, marginTop: 20, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: Theme.primary },
  progressPercentage: { color: Theme.primary, fontSize: 12, fontWeight: '900', marginTop: 8 },

  modalContent: { backgroundColor: Theme.card, padding: 25, borderRadius: 30, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: Theme.textMain, fontSize: 22, fontWeight: '800', marginBottom: 20 },
  input: { backgroundColor: '#000', color: '#FFF', padding: 18, borderRadius: 18, fontSize: 16, marginBottom: 20, borderWidth: 1, borderColor: '#444' },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15 },
  saveBtn: { backgroundColor: Theme.primary, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 15 },
  cancelBtn: { padding: 14 }
});