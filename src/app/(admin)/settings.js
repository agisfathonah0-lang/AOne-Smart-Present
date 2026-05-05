import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import LottieView from 'lottie-react-native';
import {
  BellRing,
  Check,
  ChevronRight,
  Clock,
  CloudDownload,
  Database,
  Eye,
  EyeOff,
  Image as ImageIcon,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  UserCheck,
  UserX,
  X,
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
  View,
} from 'react-native';

// Import internal
import Toast from 'react-native-toast-message';
import Card from '../../components/Card';
import CustomAlert from '../../components/CustomAlert';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import db from '../../database/sqlite';
import { supabase } from '../../database/supabase';
import { SyncService } from '../../services/syncService';
import { Theme, hexToRGBA } from '../../theme/colors';



export default function SettingsScreen({ navigation }) {
  // ─── Tab & Loading ───────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'system' | 'users'
  const [loadingType, setLoadingType] = useState(null);

  // ─── Profile & Settings ──────────────────────────────────────
  const [lastSync, setLastSync] = useState('Belum pernah');
  const [showEditName, setShowEditName] = useState(false);
  const [tempName, setTempName] = useState('');
  const [uploadVisible, setUploadVisible] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [stats, setStats] = useState({ local: 0, cloud: 0, unsynced: 0 });
  const [alertVisible, setAlertVisible] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [settings, setSettings] = useState({
    school_name: 'Ponpes Miftahul Ulum',
    school_logo: null,
    holiday_mode: false,
    checkin_time: '07:00',
    checkout_time: '14:00',
  });

  // ─── Manajemen User (Guru) ───────────────────────────────────
  const [guruList, setGuruList] = useState([]);
  const [kelasList, setKelasList] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showAddGuru, setShowAddGuru] = useState(false);
  const [showEditGuru, setShowEditGuru] = useState(false);
  const [selectedGuru, setSelectedGuru] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [formGuru, setFormGuru] = useState({
    full_name: '',
    email: '',
    password: '',
    class: '',
  });
  const [savingGuru, setSavingGuru] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  // ─── Effects ─────────────────────────────────────────────────
  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (activeTab === 'users') {
      initUsersTab();
    }
  }, [activeTab]);

  useEffect(() => {
    if (successVisible) {
      const timer = setTimeout(() => setSuccessVisible(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [successVisible]);

  // ─── Init ─────────────────────────────────────────────────────
  const init = async () => {
    await loadSettings();
    await fetchStats();
  };

  const initUsersTab = async () => {
    await fetchGuruList();
    await fetchKelasList();
  };

  // ─── Settings & Profile Functions ────────────────────────────
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

  const updateTimeOP = async (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
  };

  const updateSetting = async (key, value) => {
    try {
      const dbCol = key === 'holiday_mode' ? 'is_holiday_mode' : key;
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);
      await AsyncStorage.setItem('@app_settings', JSON.stringify(newSettings));

      const dbValue = typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? '');
      await db.runAsync(
        `UPDATE school_settings SET ${dbCol} = ? WHERE id = 1`,
        [dbValue]
      );

      const { error } = await supabase
        .from('school_profile')
        .upsert({ id: 1, [dbCol]: value, last_updated: new Date().toISOString() });

      if (error) console.log('Supabase Sync Error:', error.message);
      else {
        setSuccessVisible(true);
        console.log('✅ Berhasil Sinkron Lokal & Cloud');
      }
    } catch (e) {
      console.error('Update Error:', e.message);
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
        setSuccessVisible(true);
      }, 500);
    } else {
      setUploadVisible(false);
      Alert.alert('Gagal Upload', res.message);
    }
  };

  const handleSaveAllSettings = async () => {
    const { checkin_time, checkout_time } = settings;
    try {
      if (!checkin_time || !checkout_time) {
        return Alert.alert('Peringatan', 'Jam masuk dan pulang tidak boleh kosong.');
      }
      await db.runAsync(
        'UPDATE school_settings SET time_in_start = ?, time_in_end = ? WHERE id = 1',
        [checkin_time, checkout_time]
      );
      const { error } = await supabase
        .from('school_profile')
        .update({ time_in_start: checkin_time, time_in_end: checkout_time })
        .eq('id', 1);
      if (error) throw error;
      const allRows = await db.getAllAsync('SELECT * FROM school_settings');
      console.log(allRows);
      Toast.show({
        type: 'success',
        text1: 'Jadwal Operasional Diperbarui',
        text2: 'Jadwal baru telah disimpan dan disinkronkan ke cloud.',
      });
    } catch (err) {
      console.error(err);
      Alert.alert('Gagal Sinkron', 'Pengaturan tersimpan di lokal, namun gagal mengunggah ke cloud.');
    }
  };

  // ─── Sync Functions ───────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const localRes = await db.getAllAsync('SELECT COUNT(*) as total FROM students');
      const unsyncedStud = await db.getAllAsync('SELECT COUNT(*) as total FROM students WHERE synced = 0');
      const unsyncedAbs = await db.getAllAsync('SELECT COUNT(*) as total FROM attendance_logs WHERE synced = 0');
      const { count } = await supabase.from('students').select('*', { count: 'exact', head: true });
      setStats({
        local: localRes[0]?.total || 0,
        unsynced: (unsyncedStud[0]?.total || 0) + (unsyncedAbs[0]?.total || 0),
        cloud: count || 0,
      });
    } catch (e) {
      console.log('Stats Error:', e.message);
    }
  };

  const handlePushMaster = async () => {
    setLoadingType('sync_master');
    try {
      const allStudents = await db.getAllAsync('SELECT * FROM students');
      if (allStudents.length === 0) {
        Alert.alert('Info', 'Tidak ada data santri di database lokal.');
        setLoadingType(null);
        return;
      }
      const payload = allStudents.map(s => ({
        nis: s.nis,
        nisn: s.nisn,
        name: s.name,
        class: s.class,
        room: s.room,
        address: s.address,
        gender: s.gender,
        qr_code_data: s.qr_code_data,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('students').upsert(payload, { onConflict: 'nis' });
      if (error) throw error;
      const nises = allStudents.map(s => `'${s.nis}'`).join(',');
      await db.execAsync(`UPDATE students SET synced = 1 WHERE nis IN (${nises})`);
      await fetchStats();
      Alert.alert('Berhasil', `Sinkronisasi total selesai. ${allStudents.length} data santri dipastikan masuk ke Cloud.`);
    } catch (e) {
      console.error('Push Master Error:', e.message);
      Alert.alert('Gagal Sinkron', 'Periksa koneksi internet atau struktur tabel: ' + e.message);
    } finally {
      setLoadingType(null);
    }
  };

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
          tap_time: log.tap_time,
          timestamp: log.tap_time || new Date().toISOString(),
          type: log.type,
          created_at: new Date().toISOString(),
        }))
      );
      if (error) throw error;
      const ids = unsynced.map(log => log.id).join(',');
      await db.execAsync(`UPDATE attendance_logs SET synced = 1 WHERE id IN (${ids})`);
      await fetchStats();
      Alert.alert('Berhasil', `${unsynced.length} data absensi berhasil disetor.`);
    } catch (e) {
      Alert.alert('Gagal Setor Absen', e.message);
    } finally {
      setLoadingType(null);
    }
  };

  // ─── Logout ───────────────────────────────────────────────────
  const handleLogout = () => setAlertVisible(true);

  const executeLogout = async () => {
    try {
      setAlertVisible(false);
      console.log('🚪 Logout (clear session table)...');
      await db.runAsync('DELETE FROM user_session');
      console.log('🧹 Semua data session terhapus');
      router.replace('/LoginScreen');
    } catch (err) {
      console.error('❌ Logout Error:', err.message);
    }
  };

  // ─── User Management Functions ────────────────────────────────
  const fetchGuruList = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          is_active,
          created_at,
          guru_kelas (class)
        `)
        .eq('role', 'guru')
        .order('full_name', { ascending: true });
      if (error) throw error;
      setGuruList(data || []);
    } catch (e) {
      Alert.alert('Error', 'Gagal memuat data guru: ' + e.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchKelasList = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('class')
        .order('class', { ascending: true });
      if (error) throw error;
      const unique = [...new Set(data.map(s => s.class).filter(Boolean))];
      setKelasList(unique);
    } catch (e) {
      console.log('Gagal ambil kelas:', e.message);
    }
  };

  const handleTambahGuru = async () => {
    const supabaseUrl = 'https://hyekpkcwruafuhqptbtp.supabase.co';
const supabaseAnonKey = 'sb_publishable_kYiHpgg6R3i7namjdoXHhw_Fuj1_fQL';
    const { full_name, email, password, class: kelasAmpu } = formGuru;
    if (!full_name.trim()) return Alert.alert('Peringatan', 'Nama guru tidak boleh kosong.');
    if (!email.trim()) return Alert.alert('Peringatan', 'Email tidak boleh kosong.');
    if (!password.trim() || password.length < 6) return Alert.alert('Peringatan', 'Password minimal 6 karakter.');
    if (!kelasAmpu) return Alert.alert('Peringatan', 'Pilih kelas yang diampu.');

    setSavingGuru(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${supabaseUrl}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ full_name, email, password, class: kelasAmpu }),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Gagal membuat akun guru.');

      Toast.show({ type: 'success', text1: 'Berhasil', text2: `Akun guru ${full_name} berhasil dibuat.` });
      setShowAddGuru(false);
      setFormGuru({ full_name: '', email: '', password: '', class: '' });
      await fetchGuruList();
    } catch (e) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSavingGuru(false);
    }
  };

  const handleEditGuru = async () => {
    const { full_name, class: kelasAmpu } = formGuru;
    if (!full_name.trim()) return Alert.alert('Peringatan', 'Nama guru tidak boleh kosong.');
    if (!kelasAmpu) return Alert.alert('Peringatan', 'Pilih kelas yang diampu.');

    setSavingGuru(true);
    try {
      const { error: userError } = await supabase
        .from('users')
        .update({ full_name })
        .eq('id', selectedGuru.id);
      if (userError) throw userError;

      await supabase.from('guru_kelas').delete().eq('guru_id', selectedGuru.id);
      await supabase.from('guru_kelas').insert({ guru_id: selectedGuru.id, class: kelasAmpu });

      Toast.show({ type: 'success', text1: 'Berhasil', text2: 'Data guru berhasil diperbarui.' });
      setShowEditGuru(false);
      setSelectedGuru(null);
      await fetchGuruList();
    } catch (e) {
      Alert.alert('Gagal', e.message);
    } finally {
      setSavingGuru(false);
    }
  };

  const handleToggleAktif = async (guru) => {
    setTogglingId(guru.id);
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: !guru.is_active })
        .eq('id', guru.id);
      if (error) throw error;
      await fetchGuruList();
      Toast.show({
        type: 'success',
        text1: guru.is_active ? 'Akun Dinonaktifkan' : 'Akun Diaktifkan',
        text2: `${guru.full_name} ${guru.is_active ? 'tidak dapat login.' : 'dapat login kembali.'}`,
      });
    } catch (e) {
      Alert.alert('Gagal', e.message);
    } finally {
      setTogglingId(null);
    }
  };

  const handleHapusGuru = (guru) => {
    Alert.alert(
      'Hapus Guru',
      `Yakin ingin menghapus akun ${guru.full_name}? Aksi ini tidak dapat dibatalkan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(guru.id);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const response = await fetch(
                `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-user`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ user_id: guru.id }),
                }
              );
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || 'Gagal menghapus akun.');

              Toast.show({ type: 'success', text1: 'Berhasil', text2: `Akun ${guru.full_name} dihapus.` });
              await fetchGuruList();
            } catch (e) {
              Alert.alert('Gagal', e.message);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const openEditGuru = (guru) => {
    setSelectedGuru(guru);
    setFormGuru({
      full_name: guru.full_name,
      email: '',
      password: '',
      class: guru.guru_kelas?.[0]?.class || '',
    });
    setShowEditGuru(true);
  };

  // ─── Sub-Components ───────────────────────────────────────────

  /**
   * DropdownKelas — didefinisikan di luar render agar tidak
   * di-recreate setiap render. Menggunakan kelasList dari closure.
   */
  const DropdownKelas = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    return (
      <View style={{ marginBottom: 15 }}>
        <Text style={stylesUser.inputLabel}>KELAS DIAMPU</Text>
        <TouchableOpacity
          style={stylesUser.dropdownBtn}
          onPress={() => setOpen(!open)}
          activeOpacity={0.8}
        >
          <Text style={[stylesUser.dropdownText, !value && { color: Theme.textMuted }]}>
            {value ? `Kelas ${value}` : 'Pilih kelas...'}
          </Text>
          <ChevronRight
            color={Theme.primary}
            size={18}
            style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
          />
        </TouchableOpacity>
        {open && (
          <View style={stylesUser.dropdownList}>
            <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
              {kelasList.map((kelas) => (
                <TouchableOpacity
                  key={kelas}
                  style={[
                    stylesUser.dropdownItem,
                    value === kelas && stylesUser.dropdownItemActive,
                  ]}
                  onPress={() => { onChange(kelas); setOpen(false); }}
                >
                  <Text style={[
                    stylesUser.dropdownItemText,
                    value === kelas && { color: '#000', fontWeight: '800' },
                  ]}>
                    Kelas {kelas}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  // ─── Render Helpers ───────────────────────────────────────────
  const renderTabButtons = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'profile' && styles.tabActive]}
        onPress={() => setActiveTab('profile')}
      >
        <Text style={[styles.tabText, activeTab === 'profile' && styles.tabTextActive]}>
          PROFIL
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'system' && styles.tabActive]}
        onPress={() => setActiveTab('system')}
      >
        <Text style={[styles.tabText, activeTab === 'system' && styles.tabTextActive]}>
          SINKRON
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'users' && styles.tabActive]}
        onPress={() => setActiveTab('users')}
      >
        <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
          USER
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderProfil = () => (
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

      <View style={styles.configContainer}>
        <Text style={styles.configHeader}>JADWAL OPERASIONAL</Text>
        <View style={styles.glassCard}>
          <View style={styles.inputWrapper}>
            <View style={styles.timeBox}>
              <View style={styles.labelRow}>
                <Clock size={14} color={Theme.primary} />
                <Text style={styles.boxLabel}>MASUK</Text>
              </View>
              <TextInput
                style={styles.modernInput}
                value={settings.checkin_time}
                onChangeText={(v) => updateTimeOP('checkin_time', v)}
                keyboardType="numbers-and-punctuation"
                placeholder="07:00"
              />
            </View>
            <View style={styles.verticalLine} />
            <View style={styles.timeBox}>
              <View style={styles.labelRow}>
                <Clock size={14} color={Theme.primary} />
                <Text style={styles.boxLabel}>PULANG</Text>
              </View>
              <TextInput
                style={styles.modernInput}
                value={settings.checkout_time}
                onChangeText={(v) => updateTimeOP('checkout_time', v)}
                keyboardType="numbers-and-punctuation"
                placeholder="16:00"
              />
            </View>
          </View>
          <TouchableOpacity
            style={styles.glowButton}
            onPress={handleSaveAllSettings}
            activeOpacity={0.8}
          >
            <Text style={styles.glowButtonText}>UPDATE JADWAL</Text>
            <Check size={18} color="#000" strokeWidth={3} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const renderSinkron = () => (
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
          Alert.alert('Berhasil', 'Data HP telah diperbarui dari Cloud.');
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
            value={settings.is_holiday_mode}
            onValueChange={(v) => updateSetting('is_holiday_mode', v)}
            trackColor={{ true: Theme.primary, false: '#767577' }}
            thumbColor={settings.is_holiday_mode ? Theme.primary : '#f4f3f4'}
          />
        </View>
      </Card>
    </View>
  );

  const renderManajemenUser = () => (
    <View>
      {/* Header + Tombol Tambah */}
      <View style={stylesUser.userHeader}>
        <View>
          <Text style={stylesUser.userTitle}>Daftar Guru</Text>
          <Text style={stylesUser.userSubtitle}>{guruList.length} guru terdaftar</Text>
        </View>
        <TouchableOpacity
          style={stylesUser.addBtn}
          onPress={() => {
            setFormGuru({ full_name: '', email: '', password: '', class: '' });
            setShowAddGuru(true);
          }}
        >
          <Plus color="#000" size={18} strokeWidth={3} />
          <Text style={stylesUser.addBtnText}>Tambah</Text>
        </TouchableOpacity>
      </View>

      {/* List Guru */}
      {loadingUsers ? (
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 30 }} />
      ) : guruList.length === 0 ? (
        <View style={stylesUser.emptyState}>
          <Text style={stylesUser.emptyText}>Belum ada guru terdaftar</Text>
        </View>
      ) : (
        guruList.map((guru) => (
          <View key={guru.id} style={[
            stylesUser.guruCard,
            !guru.is_active && stylesUser.guruCardInactive,
          ]}>
            <View style={stylesUser.guruAvatar}>
              <Text style={stylesUser.guruAvatarText}>
                {guru.full_name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={stylesUser.guruName}>{guru.full_name}</Text>
              <Text style={stylesUser.guruKelas}>
                {guru.guru_kelas?.[0]?.class
                  ? `Kelas ${guru.guru_kelas[0].class}`
                  : 'Belum assign kelas'}
              </Text>
              <View style={[
                stylesUser.statusBadge,
                { backgroundColor: guru.is_active ? hexToRGBA('#10b981', 0.15) : hexToRGBA(Theme.danger, 0.15) },
              ]}>
                <Text style={[
                  stylesUser.statusText,
                  { color: guru.is_active ? '#10b981' : Theme.danger },
                ]}>
                  {guru.is_active ? 'Aktif' : 'Nonaktif'}
                </Text>
              </View>
            </View>

            <View style={stylesUser.actionButtons}>
              <TouchableOpacity style={stylesUser.iconBtn} onPress={() => openEditGuru(guru)}>
                <Pencil color={Theme.primary} size={16} />
              </TouchableOpacity>
              <TouchableOpacity
                style={stylesUser.iconBtn}
                onPress={() => handleToggleAktif(guru)}
                disabled={togglingId === guru.id}
              >
                {togglingId === guru.id ? (
                  <ActivityIndicator color={Theme.primary} size="small" />
                ) : guru.is_active ? (
                  <UserX color={Theme.danger} size={16} />
                ) : (
                  <UserCheck color="#10b981" size={16} />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={stylesUser.iconBtn}
                onPress={() => handleHapusGuru(guru)}
                disabled={deletingId === guru.id}
              >
                {deletingId === guru.id ? (
                  <ActivityIndicator color={Theme.danger} size="small" />
                ) : (
                  <Trash2 color={Theme.danger} size={16} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))
      )}

      {/* MODAL TAMBAH GURU */}
      <Modal visible={showAddGuru} transparent animationType="slide">
        <View style={stylesUser.modalOverlay}>
          <View style={stylesUser.modalSheet}>
            <View style={stylesUser.modalHandle} />
            <View style={stylesUser.modalHeader}>
              <Text style={stylesUser.modalTitle}>Tambah Guru</Text>
              <TouchableOpacity onPress={() => setShowAddGuru(false)}>
                <X color={Theme.textMuted} size={22} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={stylesUser.inputLabel}>NAMA LENGKAP</Text>
              <TextInput
                style={stylesUser.textInput}
                placeholder="Contoh: Ahmad Fauzi"
                placeholderTextColor={Theme.textMuted}
                value={formGuru.full_name}
                onChangeText={(v) => setFormGuru({ ...formGuru, full_name: v })}
              />
              <Text style={stylesUser.inputLabel}>EMAIL</Text>
              <TextInput
                style={stylesUser.textInput}
                placeholder="guru@sekolah.com"
                placeholderTextColor={Theme.textMuted}
                value={formGuru.email}
                onChangeText={(v) => setFormGuru({ ...formGuru, email: v })}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Text style={stylesUser.inputLabel}>PASSWORD</Text>
              <View style={stylesUser.passwordWrapper}>
                <TextInput
                  style={stylesUser.passwordInput}
                  placeholder="Min. 6 karakter"
                  placeholderTextColor={Theme.textMuted}
                  value={formGuru.password}
                  onChangeText={(v) => setFormGuru({ ...formGuru, password: v })}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword
                    ? <EyeOff color={Theme.textMuted} size={18} />
                    : <Eye color={Theme.textMuted} size={18} />}
                </TouchableOpacity>
              </View>
              <DropdownKelas
                value={formGuru.class}
                onChange={(v) => setFormGuru({ ...formGuru, class: v })}
              />
              <TouchableOpacity
                style={stylesUser.saveBtn}
                onPress={handleTambahGuru}
                disabled={savingGuru}
              >
                {savingGuru
                  ? <ActivityIndicator color="#000" />
                  : <Text style={stylesUser.saveBtnText}>BUAT AKUN GURU</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL EDIT GURU */}
      <Modal visible={showEditGuru} transparent animationType="slide">
        <View style={stylesUser.modalOverlay}>
          <View style={stylesUser.modalSheet}>
            <View style={stylesUser.modalHandle} />
            <View style={stylesUser.modalHeader}>
              <Text style={stylesUser.modalTitle}>Edit Guru</Text>
              <TouchableOpacity onPress={() => setShowEditGuru(false)}>
                <X color={Theme.textMuted} size={22} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={stylesUser.inputLabel}>NAMA LENGKAP</Text>
              <TextInput
                style={stylesUser.textInput}
                placeholder="Nama guru"
                placeholderTextColor={Theme.textMuted}
                value={formGuru.full_name}
                onChangeText={(v) => setFormGuru({ ...formGuru, full_name: v })}
              />
              <DropdownKelas
                value={formGuru.class}
                onChange={(v) => setFormGuru({ ...formGuru, class: v })}
              />
              <Text style={stylesUser.noteText}>
                * Email tidak dapat diubah. Hubungi Supabase Dashboard untuk mengubah email.
              </Text>
              <TouchableOpacity
                style={stylesUser.saveBtn}
                onPress={handleEditGuru}
                disabled={savingGuru}
              >
                {savingGuru
                  ? <ActivityIndicator color="#000" />
                  : <Text style={stylesUser.saveBtnText}>SIMPAN PERUBAHAN</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );

  // ─── Main Return ──────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Pengaturan</Text>
          <Text style={styles.subtitle}>Konfigurasi sistem & profil AOne</Text>
        </View>

        {renderTabButtons()}

        {activeTab === 'profile' && renderProfil()}
        {activeTab === 'system' && renderSinkron()}
        {activeTab === 'users' && renderManajemenUser()}

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <LogOut color={Theme.danger} size={20} />
          <Text style={styles.logoutText}>Keluar Akun</Text>
        </TouchableOpacity>

        <CustomAlert
          visible={alertVisible}
          type="warning"
          title="Konfirmasi Logout"
          message="Apakah Anda yakin ingin keluar? Anda harus login kembali untuk mengakses data absensi."
          confirmText="KELUAR"
          cancelText="BATAL"
          onConfirm={executeLogout}
          onCancel={() => setAlertVisible(false)}
        />
      </ScrollView>

      {/* MODAL UPLOAD PROGRESS */}
      <Modal visible={uploadVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <GlassmorphicBox style={styles.uploadCard}>
            <LottieView
              autoPlay
              loop
              source={require('../../assets/animations/upload.json')}
              style={{ width: 140, height: 140 }}
            />
            <Text style={styles.uploadText}>Uploading Logo...</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
            </View>
            <Text style={styles.progressPercentage}>{uploadProgress}%</Text>
          </GlassmorphicBox>
        </View>
      </Modal>

      {/* MODAL EDIT NAMA */}
      <Modal visible={showEditName} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Nama Pesantren</Text>
            <TextInput
              style={styles.input}
              value={tempName}
              onChangeText={setTempName}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setShowEditName(false)} style={styles.cancelBtn}>
                <Text style={{ color: '#888' }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { updateSetting('school_name', tempName); setShowEditName(false); }}
                style={styles.saveBtn}
              >
                <Text style={{ color: '#000', fontWeight: 'bold' }}>Simpan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CustomAlert
        visible={successVisible}
        type="success"
        title="Update Berhasil!"
        onConfirm={() => setSuccessVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { padding: 24, paddingTop: 60, paddingBottom: 100 },
  header: { marginBottom: 25 },
  title: { color: Theme.textMain, fontSize: 28, fontWeight: '900' },
  subtitle: { color: Theme.textMuted, fontSize: 14 },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: hexToRGBA(Theme.card, 0.5),
    borderRadius: 20,
    padding: 5,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.2),
  },
  tabButton: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 15 },
  tabActive: { backgroundColor: Theme.primary },
  tabText: { color: Theme.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  tabTextActive: { color: '#000' },

  profileBox: { padding: 30, alignItems: 'center', borderRadius: 32, marginBottom: 20 },
  logoWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: hexToRGBA(Theme.primary, 0.1),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.primary,
  },
  logoImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  logoPlaceholder: { alignItems: 'center' },
  editBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: Theme.primary,
    padding: 6,
    borderRadius: 12,
  },
  schoolNameDisplay: { color: Theme.textMain, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  editBtnText: { color: Theme.primary, fontSize: 12, marginTop: 10, fontWeight: '700' },

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
  statNum: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  statLabel: { color: Theme.textMuted, fontSize: 10, marginTop: 4 },

  sectionLabel: {
    color: Theme.primary,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 15,
    letterSpacing: 1,
  },
  syncGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
  syncActionBtn: {
    flex: 1,
    padding: 20,
    borderRadius: 28,
    alignItems: 'center',
    backgroundColor: hexToRGBA(Theme.card, 0.5),
    borderWidth: 1.5,
  },
  syncActionLabel: { fontSize: 14, fontWeight: '900', marginTop: 10 },
  wideCard: { padding: 20, borderRadius: 28, marginBottom: 25 },
  wideBtn: { flexDirection: 'row', alignItems: 'center' },
  wideBtnTitle: { color: Theme.textMain, fontSize: 16, fontWeight: '700' },
  wideBtnDesc: { color: Theme.textMuted, fontSize: 11 },
  syncStatus: { textAlign: 'center', color: Theme.textMuted, fontSize: 10, marginTop: 15 },
  groupCard: { borderRadius: 28, marginBottom: 25, overflow: 'hidden', padding: 20 },
  settingItem: { flexDirection: 'row', alignItems: 'center', padding: 10 },
  itemTitle: { color: Theme.textMain, flex: 1, fontWeight: '600', fontSize: 15 },
  divider: { height: 1, backgroundColor: hexToRGBA(Theme.border, 0.3), marginHorizontal: 10 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 20,
  },
  logoutText: { color: Theme.danger, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 25 },
  uploadCard: { padding: 30, alignItems: 'center', borderRadius: 30 },
  uploadText: { color: Theme.textMain, fontSize: 18, fontWeight: '800', marginTop: 10 },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    marginTop: 20,
    overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: Theme.primary },
  progressPercentage: { color: Theme.primary, fontSize: 12, fontWeight: '900', marginTop: 8 },

  modalContent: {
    backgroundColor: Theme.card,
    padding: 25,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#333',
  },
  modalTitle: { color: Theme.textMain, fontSize: 22, fontWeight: '800', marginBottom: 20 },
  input: {
    backgroundColor: '#000',
    color: '#FFF',
    padding: 18,
    borderRadius: 18,
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 15 },
  saveBtn: { backgroundColor: Theme.primary, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 15 },
  cancelBtn: { padding: 14 },

  configContainer: { marginVertical: 20, paddingHorizontal: 2 },
  configHeader: {
    color: Theme.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 12,
    marginLeft: 5,
  },
  glassCard: {
    backgroundColor: hexToRGBA(Theme.card, 0.8),
    borderRadius: 30,
    padding: 25,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.primary, 0.2),
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  timeBox: { flex: 1, alignItems: 'center' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  boxLabel: { color: Theme.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  modernInput: {
    color: Theme.textMain,
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    backgroundColor: hexToRGBA('#000', 0.3),
    width: '90%',
    paddingVertical: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.5),
  },
  verticalLine: { width: 1, height: 40, backgroundColor: hexToRGBA(Theme.border, 0.2) },
  glowButton: {
    backgroundColor: Theme.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 20,
    gap: 12,
  },
  glowButtonText: { color: '#000', fontSize: 14, fontWeight: '900', letterSpacing: 1 },
});

// ─── Styles User Management ────────────────────────────────────
const stylesUser = StyleSheet.create({
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  userTitle: { color: Theme.textMain, fontSize: 18, fontWeight: '800' },
  userSubtitle: { color: Theme.textMuted, fontSize: 12, marginTop: 2 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  addBtnText: { color: '#000', fontWeight: '800', fontSize: 13 },
  guruCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: hexToRGBA(Theme.card, 0.6),
    borderRadius: 20,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.2),
    gap: 12,
  },
  guruCardInactive: {
    opacity: 0.5,
    borderColor: hexToRGBA(Theme.danger, 0.2),
  },
  guruAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: hexToRGBA(Theme.primary, 0.15),
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.primary, 0.3),
    justifyContent: 'center',
    alignItems: 'center',
  },
  guruAvatarText: { color: Theme.primary, fontSize: 18, fontWeight: '900' },
  guruName: { color: Theme.textMain, fontSize: 15, fontWeight: '700' },
  guruKelas: { color: Theme.textMuted, fontSize: 12, marginTop: 2 },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 5,
  },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actionButtons: { flexDirection: 'row', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: hexToRGBA(Theme.card, 0.8),
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.3),
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: Theme.textMuted, fontSize: 14 },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Theme.card,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: 40,
    maxHeight: '85%',
    borderTopWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.3),
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: hexToRGBA(Theme.border, 0.4),
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  modalTitle: { color: Theme.textMain, fontSize: 20, fontWeight: '800' },

  inputLabel: {
    color: Theme.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: hexToRGBA('#000', 0.4),
    color: Theme.textMain,
    padding: 16,
    borderRadius: 16,
    fontSize: 15,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.3),
    marginBottom: 18,
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: hexToRGBA('#000', 0.4),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.3),
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  passwordInput: { flex: 1, color: Theme.textMain, paddingVertical: 16, fontSize: 15 },
  dropdownBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: hexToRGBA('#000', 0.4),
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.3),
    padding: 16,
    marginBottom: 5,
  },
  dropdownText: { color: Theme.textMain, fontSize: 15 },
  dropdownList: {
    backgroundColor: Theme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.border, 0.3),
    marginBottom: 15,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: hexToRGBA(Theme.border, 0.15),
  },
  dropdownItemActive: { backgroundColor: Theme.primary },
  dropdownItemText: { color: Theme.textMain, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Theme.primary,
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    marginTop: 10,
  },
  saveBtnText: { color: '#000', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
  noteText: {
    color: Theme.textMuted,
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 15,
    lineHeight: 16,
  },
});