import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { Bell, TrendingUp, UserCheck, UserMinus, UserPlus, Users, Zap } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Dimensions, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit'; // Pastikan sudah instal ini
import Toast from 'react-native-toast-message';
import Card from '../../components/Card';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import NotificationModal from '../../components/NotificationModal';
import SyncIndicator from '../../components/SyncIndicator';
import { LocalDB } from '../../database/sqlite';
import { supabase } from '../../database/supabase';
import { AIInsightService } from '../../services/aiInsight';
import { useCheckConnection } from '../../services/useCheckConnection';
import { Theme, hexToRGBA } from '../../theme/colors';
const screenWidth = Dimensions.get("window").width;
export default function DashboardScreen() {
  const [unreadCount, setUnreadCount] = useState(0);
  const router = useRouter();
  const [modalVisible, setModalVisible] = useState(false);
  const [stats, setStats] = useState({ hadir: 0, izin: 0, alfa: 0 });
  const [chartData, setChartData] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [aiInsight, setAiInsight] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // 1. Variabel untuk Nama Sekolah (Defaultnya "Memuat...")
  const [schoolInfo, setSchoolInfo] = useState({ name: 'Memuat...' });
  const [userInfo, setUserInfo] = useState({ name: 'Memuat...' });
  const isOnline = useCheckConnection(); // Cek status koneksi setiap load data
  // 1. Load Semua Data (Statistik, Grafik, & AI)
  // const loadDashboardData = async () => {
  //   try {
  //     const profile = await LocalDB.getSchoolProfile();
  //     setSchoolInfo({ name: profile.school_name });
  //     const userName = await LocalDB.getStaff();
  //     setUserInfo({ name: userName.username || 'Administrator' });
  //     // Ambil data harian untuk box statistik
  //     const dailyData = await LocalDB.getDailyStats();
  //     const newStats = { hadir: 0, izin: 0, alfa: 0 };
  //     dailyData.forEach(item => {
  //       const status = item.status.toLowerCase();
  //       if (newStats.hasOwnProperty(status)) newStats[status] = item.total;
  //     });
  //     setStats(newStats);

  //     // Ambil data mingguan untuk grafik
  //     const weeklyStats = await LocalDB.getWeeklyAttendance(); // Buat fungsi ini di sqlite.js
  //     if (weeklyStats) setChartData(weeklyStats);

  //     // Ambil Insight AI
  //     const insights = await AIInsightService.getAtRiskStudents();
  //     if (insights.length > 0) setAiInsight(insights[0]);


  //   } catch (error) {
  //     console.error("Dashboard Load Error:", error);
  //   }
  // };
  const updateCount = async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    if (!error) setUnreadCount(count || 0);
  };
  const loadDashboardData = async () => {
    try {
      await updateCount();
      // 1. Data dari LocalDB (Offline-first)
      const profile = await LocalDB.getSchoolProfile();
      setSchoolInfo({ name: profile.school_name });

      const userName = await LocalDB.getStaff();
      setUserInfo({ name: userName.username || 'Administrator' });

      const dailyData = await LocalDB.getDailyStats();
      const newStats = { hadir: 0, izin: 0, alfa: 0 };
      dailyData.forEach(item => {
        const status = item.status.toLowerCase();
        if (newStats.hasOwnProperty(status)) newStats[status] = item.total;
      });
      setStats(newStats);

      const weeklyStats = await LocalDB.getWeeklyAttendance();
      if (weeklyStats) setChartData(weeklyStats);

      const insights = await AIInsightService.getAtRiskStudents();
      if (insights.length > 0) setAiInsight(insights[0]);

      // 2. AMBIL DATA NOTIFIKASI (Online/Supabase)
      const { count, error: notifError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      if (!notifError) {
        setUnreadCount(count || 0);
      }

    } catch (error) {
      console.error("Dashboard Load Error:", error);
    }
  };
  const handleBackupDB = async () => {
    const docDir = FileSystem.documentDirectory;
    const dbName = 'AOneSmartPresent_v7.db';

    const pathUtama = `${docDir}${dbName}`;
    const pathAlternatif = `${docDir}SQLite/${dbName}`;

    try {
      // 1. Cari lokasi file DB yang valid
      const infoUtama = await FileSystem.getInfoAsync(pathUtama);
      const infoAlt = await FileSystem.getInfoAsync(pathAlternatif);
      let finalUri = infoUtama.exists ? pathUtama : (infoAlt.exists ? pathAlternatif : "");

      if (finalUri === "") {
        const files = await FileSystem.readDirectoryAsync(docDir);
        console.log("File tersedia:", files);
        Alert.alert("Error", "File database tidak ditemukan!");
        return;
      }

      // 2. Minta izin akses folder Downloads (atau folder lain pilihan user)
      const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

      if (permissions.granted) {
        // 3. Baca data DB asli
        const base64Data = await FileSystem.readAsStringAsync(finalUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        // 4. Buat file baru di folder tujuan
        const destinationUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permissions.directoryUri,
          dbName,
          'application/x-sqlite3'
        );

        // 5. Tulis datanya
        await FileSystem.writeAsStringAsync(destinationUri, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });

        Alert.alert("Berhasil!", "Database telah disimpan ke folder Downloads.");

        // OPTIONAL: Tetap buka menu Sharing jika kamu ingin mengirimnya juga ke WA
        // await Sharing.shareAsync(finalUri);

      } else {
        // Jika user membatalkan pilih folder, tawarkan Sharing sebagai cadangan
        await Sharing.shareAsync(finalUri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert("Gagal", "Terjadi kesalahan saat membackup data.");
    }
  };
  // 2. Auto Refresh setiap 30 detik
  useEffect(() => {

    loadDashboardData();
    const interval = setInterval(loadDashboardData, 3000);
    return () => clearInterval(interval);
    const channel = supabase
      .channel('db_notif_change')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        updateCount(); // Fungsi update angka lonceng kamu

        Toast.show({
          type: 'success',
          text1: '🔔 Izin Baru Masuk',
          text2: payload.new.body,
          position: 'top',
          topOffset: 60, // Biar nggak ketutup notch/kamera
          onPress: () => {
            Toast.hide();
            setModalVisible(true); // Buka modal detail notif kamu
          }
        });
      })
        // .on('postgres_changes',
        //   { event: '*', schema: 'public', table: 'notifications' },
        //   (payload) => {
        //     // Jika ada perubahan (insert/update), ambil ulang jumlah unread saja
        //     updateNotificationCount();
        //   })
      }, [isOnline]);

    const onRefresh = useCallback(() => {
      setRefreshing(true);
      loadDashboardData().then(() => setRefreshing(false));
    }, [isOnline]);

    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.primary} />
        }
      >
        {/* HEADER SECTION */}
        <View style={styles.header}>
          <View>
            <Text style={styles.welcomeText}>Hallo, {userInfo.name} 🖐️🖐️</Text>
            <Text style={styles.schoolName}>{schoolInfo.name || "Memuat..."}</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => setModalVisible(true)} // Buka modal saat diklik
          // onPress={() => router.push('/admin/notifications')}
          >
            <Bell color={Theme.textMain} size={22} />
            {unreadCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <NotificationModal
            visible={modalVisible}
            onClose={() => setModalVisible(false)}
            onUpdateCount={updateCount}
          />
        </View>

        {/* SYNC STATUS */}
        <View style={styles.syncWrapper}>
          <SyncIndicator isOnline={isOnline} unsyncedCount={3} />
        </View>

        {/* MAIN STATS (GLASSMORPHIC) */}
        <View style={styles.statsGrid}>
          <GlassmorphicBox style={styles.mainStatBox} intensity={30}>
            <UserCheck color={Theme.success} size={32} />
            <Text style={styles.statNumber}>{stats.hadir}</Text>
            <Text style={styles.statLabel}>Siswa Hadir</Text>
          </GlassmorphicBox>

          <View style={styles.sideStats}>
            <View style={[styles.miniStat, { backgroundColor: hexToRGBA(Theme.warning, 0.15) }]}>
              <UserPlus color={Theme.warning} size={20} />
              <Text style={[styles.miniStatNumber, { color: Theme.warning }]}>{stats.izin}</Text>
              <Text style={styles.miniStatLabel}>Izin/Sakit</Text>
            </View>

            <View style={[styles.miniStat, { backgroundColor: hexToRGBA(Theme.danger, 0.15) }]}>
              <UserMinus color={Theme.danger} size={20} />
              <Text style={[styles.miniStatNuber, { color: Theme.danger }]}>{stats.alfa}</Text>
              <Text style={styles.miniStatLabel}>Alfa</Text>
            </View>
          </View>
        </View>

        {/* GRAFIK KEHADIRAN SECTION */}
        <View style={styles.chartContainer}>
          <View style={styles.chartHeader}>
            <TrendingUp color={Theme.primary} size={18} />
            <Text style={styles.chartTitle}>Tren Kehadiran 7 Hari Terakhir</Text>
          </View>
          <LineChart
            data={{
              labels: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
              datasets: [{ data: chartData }]
            }}
            width={screenWidth - 48}
            height={180}
            chartConfig={{
              backgroundColor: Theme.card,
              backgroundGradientFrom: Theme.card,
              backgroundGradientTo: Theme.card,
              decimalPlaces: 0,
              color: (opacity = 1) => hexToRGBA(Theme.primary, opacity),
              labelColor: (opacity = 1) => hexToRGBA(Theme.textMuted, opacity),
              propsForDots: { r: "4", strokeWidth: "2", stroke: Theme.primary },
              fillShadowGradient: Theme.primary,
              fillShadowGradientOpacity: 0.2,
            }}
            bezier
            style={styles.chartStyle}
          />
        </View>

        {/* AI INSIGHT */}
        {aiInsight && (
          <Card statusColor={Theme.primary} style={styles.aiCard}>
            <View style={styles.aiHeader}>
              <Zap color={Theme.primary} size={18} fill={Theme.primary} />
              <Text style={styles.aiTitle}>AI SMART INSIGHT</Text>
            </View>
            <Text style={styles.aiBody}>{aiInsight.insight}</Text>
            <TouchableOpacity style={styles.aiAction}>
              <Text style={styles.aiActionText}>Tindak Lanjuti Sekarang</Text>
            </TouchableOpacity>
          </Card>
        )}

        {/* QUICK ACTIONS */}
        <Text style={styles.sectionTitle}>Aksi Cepat</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionScroll}>
          <TouchableOpacity style={styles.actionItem}>
            <View style={[styles.actionIcon, { backgroundColor: Theme.primary }]}>
              <Users color={Theme.background} size={24} />
            </View>
            <Text style={styles.actionText}>Data Siswa</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionItem} onPress={handleBackupDB}>
            <View style={[styles.actionIcon, { backgroundColor: Theme.success }]}>
              <Zap color={Theme.background} size={24} />
            </View>
            <Text style={styles.actionText}>Backup DB</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={{ height: 100 }} />
      </ScrollView>
    );
  }

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Theme.background },
    content: { padding: 24, paddingTop: 60 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    welcomeText: { color: Theme.textMuted, fontSize: 14, fontWeight: '600' },
    schoolName: { color: Theme.textMain, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
    notifBtn: {
      position: 'relative', // Wajib agar badge bisa diposisikan absolut terhadap tombol
      padding: 5,
      marginRight: 5, // Beri sedikit jarak dari pinggir layar
    },
    notifBadge: {
      position: 'absolute',
      top: 2,           // Sesuaikan posisi naik-turunnya
      right: 2,         // Sesuaikan posisi kiri-kanannya
      backgroundColor: '#FF3B30', // Merah cerah standar notifikasi
      minWidth: 18,     // Menggunakan minWidth agar saat angka 2 digit bulatan melebar otomatis
      height: 18,
      borderRadius: 9,  // Setengah dari height untuk hasil bulat sempurna
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: '#FFFFFF', // Sesuaikan dengan warna background Header kamu
      zIndex: 10,
    },
    badgeText: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: 'bold',
      includeFontPadding: false, // Penting di Android agar teks benar-benar di tengah secara vertikal
      textAlignVertical: 'center',
    },
    syncWrapper: { marginBottom: 25, alignItems: 'flex-start' },
    statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 25 },
    mainStatBox: { flex: 1.2, alignItems: 'center', justifyContent: 'center', paddingVertical: 25, borderRadius: 24, overflow: 'hidden' },
    statNumber: { color: Theme.textMain, fontSize: 42, fontWeight: '900', marginVertical: 5 },
    statLabel: { color: Theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    sideStats: { flex: 1, gap: 15 },
    miniStat: { flex: 1, borderRadius: 20, padding: 15, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    miniStatNumber: { fontSize: 22, fontWeight: '900', marginTop: 4 },
    miniStatLabel: { color: Theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
    chartContainer: { backgroundColor: Theme.card, padding: 16, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: Theme.border },
    chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
    chartTitle: { color: Theme.textMain, fontSize: 14, fontWeight: '800' },
    chartStyle: { marginLeft: -16, borderRadius: 16 },
    aiCard: { backgroundColor: hexToRGBA(Theme.card, 0.8), borderStyle: 'dashed', marginBottom: 25 },
    aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
    aiTitle: { color: Theme.primary, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
    aiBody: { color: Theme.textMain, fontSize: 14, lineHeight: 20, fontWeight: '500' },
    aiAction: { marginTop: 15, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Theme.border },
    aiActionText: { color: Theme.primary, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
    sectionTitle: { color: Theme.textMain, fontSize: 18, fontWeight: '800', marginBottom: 15 },
    actionScroll: { flexDirection: 'row' },
    actionItem: { alignItems: 'center', marginRight: 25 },
    actionIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
    actionText: { color: Theme.textMuted, fontSize: 11, fontWeight: '700' }
  });