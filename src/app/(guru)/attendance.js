import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { CheckCircle2, GraduationCap, History, XCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import { db, LocalDB } from '../../database/sqlite';
import { useAuth } from '../../services/AuthContext';
import { Theme } from '../../theme/colors';

export default function GuruAttendanceScreen() {
  const isFocused = useIsFocused();
  const { user } = useAuth(); // ambil info guru dari AuthContext
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [status, setStatus] = useState('ready'); // ready, success, error
  const [mode, setMode] = useState('masuk'); // masuk, pulang
  const [lastStudent, setLastStudent] = useState(null);
  const [sessionLogs, setSessionLogs] = useState([]);

  // Kelas diampu guru (ambil dari user context, contoh: ['1A'])
  const guruClasses = user?.classes || [];
  const kelasLabel = guruClasses.join(', ') || '-';

  // Optimasi: Simpan daftar siswa kelas diampu di memori
  const studentsList = useRef([]);

  // --- ANIMASI SCAN ---
  const translateY = useRef(new Animated.Value(0)).current;
  const SCAN_FRAME_SIZE = 220;

  useEffect(() => {
    if (permission?.granted && isFocused) {
      startScanningAnimation();
      loadStudentsToMemory();
    }
  }, [permission, isFocused]);

  // ✅ PERBEDAAN UTAMA: Load hanya siswa dari kelas yang diampu guru
  const loadStudentsToMemory = async () => {
    try {
      if (guruClasses.length === 0) {
        console.warn('Guru tidak memiliki kelas diampu');
        studentsList.current = [];
        return;
      }

      // Gunakan fungsi getStudentsByClass dari sqlite.js
      // Jika guru pegang 1 kelas, ambil kelas pertama
      const kelas = guruClasses[0];
      const data = await LocalDB.getStudentsByClass(kelas);
      studentsList.current = data;
      console.log(`Loaded ${data.length} siswa untuk kelas ${kelas}`);
    } catch (e) {
      console.error('Gagal load data siswa kelas diampu', e);
    }
  };

  const startScanningAnimation = () => {
    translateY.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: SCAN_FRAME_SIZE,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  if (!permission) return <View style={styles.container} />;
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Butuh izin kamera untuk scan kartu</Text>
        <TouchableOpacity onPress={requestPermission} style={styles.btn}>
          <Text style={styles.btnText}>Beri Izin</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ✅ Cek jika guru tidak punya kelas diampu
  if (guruClasses.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <GraduationCap size={60} color={Theme.textMuted} />
        <Text style={[styles.message, { marginTop: 16 }]}>
          Kamu belum memiliki kelas yang diampu.{'\n'}Hubungi Admin untuk pengaturan kelas.
        </Text>
      </View>
    );
  }

  const handleBarCodeScanned = async ({ data }) => {
    const settingsHoliday = await db.getFirstAsync('SELECT is_holiday_mode FROM school_settings LIMIT 1');
    const isHoliday = settingsHoliday?.is_holiday_mode === 1;
    if (isHoliday) {
      Toast.show({
        type: 'error',
        text1: 'Sistem Terkunci',
        text2: 'Tidak bisa scan di hari libur/perizinan 🚩',
      });
      return;
    }

    if (scanned || !isFocused) return;
    setScanned(true);

    try {
      // 1. Cari siswa di memori (hanya dari kelas yang diampu)
      const student = studentsList.current.find(s => s.nis === data || s.nisn === data);
      if (!student) {
        // ✅ Pesan error lebih spesifik untuk guru
        provideFeedback('error', 'Tidak Dikenal', 'Bukan siswa kelas ' + kelasLabel);
        await Speech.stop();
        Speech.speak(`QR tidak terdaftar di kelas ${kelasLabel}`, { language: 'id-ID' });
        return;
      }

      // 2. Ambil jam operasional & waktu sekarang
      const settings = await LocalDB.getSchoolProfile();
      const currentTimeStr = new Date().toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });

      // --- LOGIKA A: CEK URUTAN ABSEN ---
      if (mode === 'pulang') {
        const alreadyIn = await LocalDB.checkAlreadyAbsent(student.nis, 'masuk');
        if (!alreadyIn) {
          provideFeedback('error', student.name, 'BELUM ABSEN MASUK');
          await Speech.stop();
          Speech.speak(`Maaf ${student.name}, kamu belum absen masuk pagi tadi`, { language: 'id-ID' });
          return;
        }
      }

      // --- LOGIKA B: CEK TOLERANSI WAKTU (15 MENIT) ---
      const targetTime = mode === 'masuk' ? settings?.time_in_start : settings?.time_in_end;
      const isTimely = LocalDB.validateTimeWindow(currentTimeStr, targetTime, 15);

      if (!isTimely) {
        console.log('JAM SEKARANG:', currentTimeStr);
        console.log('JAM TARGET DB:', targetTime);
        console.log('HASIL VALIDASI:', isTimely);
        provideFeedback('error', student.name, 'WAKTU TIDAK SESUAI');
        await Speech.stop();
        Speech.speak(`Waktu absen salah. Jadwal jam ${targetTime}`, { language: 'id-ID' });
        return;
      }

      // --- LOGIKA C: CEK DOUBLE ABSEN ---
      const isAlready = await LocalDB.checkAlreadyAbsent(student.nis, mode);
      if (isAlready) {
        provideFeedback('error', student.name, `SUDAH ABSEN ${mode.toUpperCase()}`);
        await Speech.stop();
        Speech.speak(`${student.name}, sudah absen ${mode}`, { language: 'id-ID' });
        return;
      }

      // --- BERHASIL: SIMPAN DATA ---
      await LocalDB.saveAttendance(student.nis, 'hadir', mode);

      // Update Logs & UI
      setSessionLogs(prev => [
        {
          id: Date.now().toString(),
          name: student.name,
          time: currentTimeStr,
        },
        ...prev,
      ]);

      setLastStudent(student);
      provideFeedback('success', student.name, `BERHASIL ABSEN ${mode.toUpperCase()}`);

      await Speech.stop();
      Speech.speak(`Hadir ${mode}, ${student.name}`, { language: 'id-ID' });
    } catch (error) {
      console.error('Scan Error:', error);
      setScanned(false);
    }
  };

  const provideFeedback = (type, name, msg) => {
    setStatus(type);
    Haptics.notificationAsync(
      type === 'success'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error
    );

    setTimeout(() => {
      setScanned(false);
      setStatus('ready');
    }, 2500);
  };

  return (
    <View style={styles.container}>
      {/* 1. KAMERA */}
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeSettings={{ barcodeTypes: ['qr'] }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
      )}

      {/* 2. HEADER: MODE SELECTOR + BADGE KELAS */}
      <View style={styles.header}>
        {/* ✅ Badge kelas diampu guru */}
        <View style={styles.kelasBadge}>
          <GraduationCap size={13} color={Theme.primary} />
          <Text style={styles.kelasText}>Kelas {kelasLabel}</Text>
        </View>

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'masuk' && styles.modeActive]}
            onPress={() => { setMode('masuk'); setSessionLogs([]); }}
          >
            <Text style={styles.modeText}>ABSEN MASUK</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'pulang' && styles.modeActive]}
            onPress={() => { setMode('pulang'); setSessionLogs([]); }}
          >
            <Text style={styles.modeText}>ABSEN PULANG</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. OVERLAY SCANNER */}
      {isFocused && (
        <View style={styles.overlay} pointerEvents="none">
          <View
            style={[
              styles.scanFrame,
              {
                borderColor:
                  status === 'success'
                    ? Theme.success
                    : status === 'error'
                    ? Theme.danger
                    : 'rgba(255,255,255,0.3)',
              },
            ]}
          >
            <Animated.View
              style={[
                styles.scanBar,
                {
                  backgroundColor:
                    status === 'success'
                      ? Theme.success
                      : status === 'error'
                      ? Theme.danger
                      : Theme.primary,
                  transform: [{ translateY: translateY }],
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* 4. BOTTOM PANEL */}
      <View style={styles.bottomPanel}>
        <GlassmorphicBox intensity={60} style={styles.infoBox}>
          {status === 'ready' ? (
            <View style={styles.historySection}>
              <View style={styles.tableHeader}>
                <History size={16} color={Theme.primary} />
                <Text style={styles.tableTitle}>RIWAYAT SESI {mode.toUpperCase()}</Text>
                {/* ✅ Tampilkan jumlah siswa yang sudah absen */}
                <Text style={styles.countBadge}>{sessionLogs.length} siswa</Text>
              </View>
              <FlatList
                data={sessionLogs}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <View style={styles.tableRow}>
                    <Text style={styles.rowTime}>{item.time}</Text>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <CheckCircle2 size={14} color={Theme.success} />
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>Belum ada data di sesi ini</Text>
                }
              />
            </View>
          ) : (
            <View style={styles.resultRow}>
              {status === 'success' ? (
                <CheckCircle2 color={Theme.success} size={40} />
              ) : (
                <XCircle color={Theme.danger} size={40} />
              )}
              <View style={styles.textGroup}>
                <Text style={styles.resName}>
                  {status === 'success' ? lastStudent?.name : 'Gagal'}
                </Text>
                <Text
                  style={[
                    styles.resStatus,
                    { color: status === 'success' ? Theme.success : Theme.danger },
                  ]}
                >
                  {status === 'success'
                    ? `BERHASIL ABSEN ${mode.toUpperCase()}`
                    : 'QR TIDAK TERDAFTAR / BUKAN KELAS ' + kelasLabel.toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        </GlassmorphicBox>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header dengan badge kelas di atas mode selector
  header: {
    position: 'absolute',
    top: 55,
    width: '100%',
    paddingHorizontal: 20,
    gap: 8,
    zIndex: 10,
  },
  kelasBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Theme.primary,
    marginBottom: 2,
  },
  kelasText: {
    color: Theme.primary,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  modeRow: { flexDirection: 'row', gap: 10 },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modeActive: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  modeText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1 },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 220, height: 220, borderWidth: 2, borderRadius: 20, overflow: 'hidden' },
  scanBar: { width: '100%', height: 3, shadowOpacity: 0.5, shadowRadius: 5, elevation: 5 },

  bottomPanel: { position: 'absolute', bottom: 40, left: 20, right: 20, height: 260 },
  infoBox: { flex: 1, padding: 15, borderRadius: 24, overflow: 'hidden' },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 20, flex: 1 },
  textGroup: { flex: 1 },
  resName: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  resStatus: { fontSize: 12, fontWeight: '800', letterSpacing: 1, marginTop: 4 },

  historySection: { flex: 1 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  tableTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800', flex: 1 },
  countBadge: {
    color: Theme.primary,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowTime: { color: Theme.primary, fontWeight: 'bold', width: 50, fontSize: 12 },
  rowName: { color: '#fff', flex: 1, fontSize: 14, fontWeight: '600', marginRight: 10 },
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 30,
    fontSize: 12,
  },

  message: { color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 20, fontSize: 14, lineHeight: 22 },
  btn: { backgroundColor: Theme.primary, padding: 15, borderRadius: 12, alignSelf: 'center' },
  btnText: { color: '#000', fontWeight: 'bold' },
});