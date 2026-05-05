import { useIsFocused } from '@react-navigation/native'; // Wajib install @react-navigation/native
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { CheckCircle2, History, XCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import { db, LocalDB } from '../../database/sqlite';
import { Theme } from '../../theme/colors';
export default function AttendanceScreen() {
  const isFocused = useIsFocused();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [status, setStatus] = useState('ready'); // ready, success, error
  const [mode, setMode] = useState('masuk'); // masuk, pulang
  const [lastStudent, setLastStudent] = useState(null);
  const [sessionLogs, setSessionLogs] = useState([]);

  // Optimasi: Simpan daftar siswa di memori agar scan secepat kilat
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

  const loadStudentsToMemory = async () => {
    try {
      const data = await LocalDB.getAllStudents();
      studentsList.current = data;
    } catch (e) {
      console.error("Gagal load data siswa", e);
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

  const handleBarCodeScanned = async ({ data }) => {
  const settingsHoliday = await db.getFirstAsync('SELECT is_holiday_mode FROM school_settings LIMIT 1');
  const isHoliday = settingsHoliday?.is_holiday_mode === 1;
  console.log("Status Hari Libur (Scan):", isHoliday);
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
      // 1. Cari siswa di memori
      const student = studentsList.current.find(s => s.nis === data || s.nisn === data);
      if (!student) {
        provideFeedback('error', "Tidak Dikenal", "Data tidak ditemukan");
        return;
      }

      // 2. Ambil jam operasional & waktu sekarang
      const settings = await LocalDB.getSchoolProfile();
      const currentTimeStr = new Date().toLocaleTimeString('en-GB', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      // const currentTimeStr = new Date().toLocaleTimeString('en-GB', { hour12: false }).slice(0, 5);

      // --- LOGIKA A: CEK URUTAN ABSEN ---
      if (mode === 'pulang') {
        const alreadyIn = await LocalDB.checkAlreadyAbsent(student.nis, 'masuk');
        if (!alreadyIn) {
          provideFeedback('error', student.name, "BELUM ABSEN MASUK");
          await Speech.stop();
          Speech.speak(`Maaf ${student.name}, kamu belum absen masuk pagi tadi`, { language: 'id-ID' });
          return;
        }
      }

      // --- LOGIKA B: CEK TOLERANSI WAKTU (15 MENIT) ---
      const targetTime = mode === 'masuk' ? settings?.time_in_start : settings?.time_in_end;
      const isTimely = LocalDB.validateTimeWindow(currentTimeStr, targetTime, 15);

      if (!isTimely) {
        // Tambahkan ini di handleBarCodeScanned
console.log("JAM SEKARANG:", currentTimeStr);
console.log("JAM TARGET DB:", targetTime);


console.log("HASIL VALIDASI:", isTimely);
        provideFeedback('error', student.name, "WAKTU TIDAK SESUAI");
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
      setSessionLogs(prev => [{
        id: Date.now().toString(),
        name: student.name,
        time: currentTimeStr,
      }, ...prev]);

      setLastStudent(student);
      provideFeedback('success', student.name, `BERHASIL ABSEN ${mode.toUpperCase()}`);

      await Speech.stop();
      Speech.speak(`Hadir ${mode}, ${student.name}`, { language: 'id-ID' });

    } catch (error) {
      console.error("Scan Error:", error);
      setScanned(false);
    }
    
  };

  const provideFeedback = (type, name, msg) => {
    setStatus(type);
    Haptics.notificationAsync(
      type === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    );

    setTimeout(() => {
      setScanned(false);
      setStatus('ready');
    }, 2500);
  };

  return (
    <View style={styles.container}>
      {/* 1. KAMERA: Hanya render jika layar fokus (isFocused) */}
      {isFocused ? (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeSettings={{ barcodeTypes: ["qr"] }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]} />
      )}

      {/* 2. HEADER: MODE SELECTOR */}
      <View style={styles.header}>
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

      {/* 3. OVERLAY SCANNER */}
      {isFocused && (
        <View style={styles.overlay} pointerEvents="none">
          <View style={[
            styles.scanFrame,
            { borderColor: status === 'success' ? Theme.success : status === 'error' ? Theme.danger : 'rgba(255,255,255,0.3)' }
          ]}>
            <Animated.View
              style={[
                styles.scanBar,
                {
                  backgroundColor: status === 'success' ? Theme.success : status === 'error' ? Theme.danger : Theme.primary,
                  transform: [{ translateY: translateY }]
                }
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
                ListEmptyComponent={<Text style={styles.emptyText}>Belum ada data di sesi ini</Text>}
              />
            </View>
          ) : (
            <View style={styles.resultRow}>
              {status === 'success' ? <CheckCircle2 color={Theme.success} size={40} /> : <XCircle color={Theme.danger} size={40} />}
              <View style={styles.textGroup}>
                <Text style={styles.resName}>{status === 'success' ? lastStudent?.name : "Gagal"}</Text>
                <Text style={[styles.resStatus, { color: status === 'success' ? Theme.success : Theme.danger }]}>
                  {status === 'success' ? `BERHASIL ABSEN ${mode.toUpperCase()}` : "QR TIDAK TERDAFTAR / DUPLIKAT"}
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
  header: { position: 'absolute', top: 60, flexDirection: 'row', width: '100%', paddingHorizontal: 20, gap: 10, zIndex: 10 },
  modeBtn: { flex: 1, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
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
  tableHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  tableTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowTime: { color: Theme.primary, fontWeight: 'bold', width: 50, fontSize: 12 },
  rowName: { color: '#fff', flex: 1, fontSize: 14, fontWeight: '600', marginRight: 10 },
  emptyText: { color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 30, fontSize: 12 },
  message: { color: '#fff', textAlign: 'center', marginBottom: 20 },
  btn: { backgroundColor: Theme.primary, padding: 15, borderRadius: 12, alignSelf: 'center' },
  btnText: { color: '#000', fontWeight: 'bold' },
});