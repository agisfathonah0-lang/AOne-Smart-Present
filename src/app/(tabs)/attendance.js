import { useIsFocused } from '@react-navigation/native'; // Wajib install @react-navigation/native
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { CheckCircle2, History, XCircle } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import { LocalDB } from '../../database/sqlite';
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
    if (scanned || !isFocused) return;
    setScanned(true);

    try {
      // Cari di memori (jauh lebih ringan dibanding query DB terus-menerus)
      const student = studentsList.current.find(s => s.nis === data || s.nisn === data);

      if (!student) {
        provideFeedback('error', "Tidak Dikenal", "Data tidak ditemukan");
        return;
      }

      const isAlready = await LocalDB.checkAlreadyAbsent(student.nis, mode);
      if (isAlready) {
        provideFeedback('error', student.name, `SUDAH ABSEN ${mode.toUpperCase()}`);
        await Speech.stop();
        setTimeout(() => {
          Speech.speak(`${student.name}, sudah absen`, {
            language: 'id-ID',
            pitch: 1.0,
            rate: 0.9, // Sedikit diperlambat agar terdengar lebih jelas di lingkungan sekolah yang ramai
          });
        }, 2900);
        return;
      }

      await LocalDB.saveAttendance(student.nis, 'hadir', mode);

      const newLog = {
        id: Date.now().toString(),
        name: student.name,
        time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      };

      setSessionLogs(prev => [newLog, ...prev]);
      setLastStudent(student);

      provideFeedback('success', student.name, `BERHASIL ABSEN ${mode.toUpperCase()}`);

      await Speech.stop();
      setTimeout(() => {
        Speech.speak(`Hadir ${mode}, ${student.name}`, {
          language: 'id-ID',
          pitch: 1.0,
          rate: 1.0 // Gunakan rate 1.0 agar intonasi natural
        });
      }, 150);
    } catch (error) {
      console.error(error);
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