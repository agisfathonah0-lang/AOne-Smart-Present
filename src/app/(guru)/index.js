import { useRouter } from 'expo-router';
import { Bell, FilePieChart, ScanLine, TrendingUp, UserCheck, UserMinus, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
    Dimensions,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import Toast from 'react-native-toast-message';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import NotificationModal from '../../components/NotificationModal';
import SyncIndicator from '../../components/SyncIndicator';
import { LocalDB } from '../../database/sqlite';
import { supabase } from '../../database/supabase';
import { useAuth } from '../../services/AuthContext';
import { useCheckConnection } from '../../services/useCheckConnection';
import { Theme, hexToRGBA } from '../../theme/colors';

const screenWidth = Dimensions.get('window').width;

export default function GuruDashboardScreen() {
  const { user } = useAuth(); // { id, full_name, role, classes: ['1A'] }
  const router = useRouter();
  const isOnline = useCheckConnection();

  const [stats, setStats] = useState({ hadir: 0, izin: 0, alfa: 0 });
  const [chartData, setChartData] = useState([0, 0, 0, 0, 0, 0, 0]);
  const [schoolInfo, setSchoolInfo] = useState({ name: 'Memuat...' });
  const [unreadCount, setUnreadCount] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [pendingIzin, setPendingIzin] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Kelas yang diampu guru ini (ambil yang pertama, karena 1 guru = 1 kelas)
  const kelasAmpu = user?.classes?.[0] || null;

  // ── Update jumlah notif belum dibaca ────────────────────────
  const updateCount = async () => {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user?.id)
        .eq('is_read', false);

      if (!error) setUnreadCount(count || 0);
    } catch (e) {
      console.log('updateCount error:', e.message);
    }
  };

  // ── Hitung izin pending untuk kelas ini ─────────────────────
  const updatePendingIzin = async () => {
    if (!kelasAmpu) return;
    try {
      const { count, error } = await supabase
        .from('permission_requests')
        .select('*, students!inner(class)', { count: 'exact', head: true })
        .eq('students.class', kelasAmpu)
        .eq('status', 'pending');

      if (!error) setPendingIzin(count || 0);
    } catch (e) {
      console.log('pendingIzin error:', e.message);
    }
  };

  // ── Load semua data dashboard ────────────────────────────────
  const loadDashboardData = async () => {
    try {
      // 1. Info sekolah dari SQLite
      const profile = await LocalDB.getSchoolProfile();
      setSchoolInfo({ name: profile.school_name });

      // 2. Stats absensi hari ini — filter kelas guru
      if (kelasAmpu) {
        const dailyData = await LocalDB.getDailyStatsByClass(kelasAmpu);
        const newStats = { hadir: 0, izin: 0, alfa: 0 };
        dailyData.forEach(item => {
          const status = item.status?.toLowerCase();
          if (status in newStats) newStats[status] = item.total;
        });
        setStats(newStats);

        // 3. Grafik mingguan — filter kelas guru
        const weeklyStats = await LocalDB.getWeeklyAttendanceByClass(kelasAmpu);
        if (weeklyStats) setChartData(weeklyStats);
      }

      // 4. Notif & izin pending (online)
      await updateCount();
      await updatePendingIzin();

    } catch (error) {
      console.error('GuruDashboard Load Error:', error);
    }
  };

  // ── Auto refresh & realtime notif ───────────────────────────
  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 30000);

    // Realtime: notif izin baru masuk
    const channel = supabase
      .channel('guru_notif_' + user?.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user?.id}` },
        (payload) => {
          updateCount();
          Toast.show({
            type: 'success',
            text1: '🔔 Izin Baru Masuk',
            text2: payload.new.body,
            position: 'top',
            topOffset: 60,
            onPress: () => {
              Toast.hide();
              setModalVisible(true);
            }
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [isOnline, kelasAmpu]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDashboardData().then(() => setRefreshing(false));
  }, [kelasAmpu]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Theme.primary} />
      }
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeText}>Hallo, {user?.full_name || 'Guru'} 🖐️</Text>
          <Text style={styles.schoolName}>{schoolInfo.name}</Text>
          {kelasAmpu && (
            <View style={styles.kelasBadge}>
              <Text style={styles.kelasText}>Kelas {kelasAmpu}</Text>
            </View>
          )}
        </View>

        {/* Tombol Notifikasi */}
        <TouchableOpacity style={styles.notifBtn} onPress={() => setModalVisible(true)}>
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
        <SyncIndicator isOnline={isOnline} unsyncedCount={0} />
      </View>

      {/* STATS */}
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
            <Text style={[styles.miniStatNumber, { color: Theme.danger }]}>{stats.alfa}</Text>
            <Text style={styles.miniStatLabel}>Alfa</Text>
          </View>
        </View>
      </View>

      {/* IZIN PENDING — hanya tampil kalau ada */}
      {pendingIzin > 0 && (
        <TouchableOpacity
          style={styles.izinAlert}
          onPress={() => router.push('/(guru)/izin')}
          activeOpacity={0.8}
        >
          <View style={styles.izinAlertLeft}>
            <Text style={styles.izinAlertCount}>{pendingIzin}</Text>
            <Text style={styles.izinAlertLabel}>Izin Menunggu Persetujuan</Text>
          </View>
          <Text style={styles.izinAlertAction}>Lihat →</Text>
        </TouchableOpacity>
      )}

      {/* GRAFIK */}
      <View style={styles.chartContainer}>
        <View style={styles.chartHeader}>
          <TrendingUp color={Theme.primary} size={18} />
          <Text style={styles.chartTitle}>Tren Kehadiran 7 Hari — Kelas {kelasAmpu}</Text>
        </View>
        <LineChart
          data={{
            labels: ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'],
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
            propsForDots: { r: '4', strokeWidth: '2', stroke: Theme.primary },
            fillShadowGradient: Theme.primary,
            fillShadowGradientOpacity: 0.2,
          }}
          bezier
          style={styles.chartStyle}
        />
      </View>

      {/* QUICK ACTIONS */}
      <Text style={styles.sectionTitle}>Aksi Cepat</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.actionScroll}>
        {/* Absensi */}
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => router.push('/(guru)/attendance')}
        >
          <View style={[styles.actionIcon, { backgroundColor: Theme.primary }]}>
            <ScanLine color={Theme.background} size={24} />
          </View>
          <Text style={styles.actionText}>Absensi</Text>
        </TouchableOpacity>

        {/* Report */}
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => router.push('/(guru)/reports')}
        >
          <View style={[styles.actionIcon, { backgroundColor: Theme.success }]}>
            <FilePieChart color={Theme.background} size={24} />
          </View>
          <Text style={styles.actionText}>Report</Text>
        </TouchableOpacity>

        {/* Konfirmasi Izin */}
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => router.push('/(guru)/izin')}
        >
          <View style={[styles.actionIcon, { backgroundColor: hexToRGBA(Theme.warning, 0.9) }]}>
            <UserPlus color={Theme.background} size={24} />
          </View>
          <Text style={styles.actionText}>Izin</Text>
          {pendingIzin > 0 && (
            <View style={styles.actionBadge}>
              <Text style={styles.actionBadgeText}>{pendingIzin}</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  content: { padding: 24, paddingTop: 60 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  welcomeText: { color: Theme.textMuted, fontSize: 14, fontWeight: '600' },
  schoolName: { color: Theme.textMain, fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  kelasBadge: {
    alignSelf: 'flex-start',
    backgroundColor: hexToRGBA(Theme.primary, 0.15),
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.primary, 0.3),
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 6,
  },
  kelasText: { color: Theme.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

  notifBtn: { position: 'relative', padding: 5 },
  notifBadge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: '#FF3B30',
    minWidth: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#FFF', zIndex: 10,
  },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },

  syncWrapper: { marginBottom: 25, alignItems: 'flex-start' },

  statsGrid: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  mainStatBox: { flex: 1.2, alignItems: 'center', justifyContent: 'center', paddingVertical: 25, borderRadius: 24, overflow: 'hidden' },
  statNumber: { color: Theme.textMain, fontSize: 42, fontWeight: '900', marginVertical: 5 },
  statLabel: { color: Theme.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  sideStats: { flex: 1, gap: 15 },
  miniStat: { flex: 1, borderRadius: 20, padding: 15, justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  miniStatNumber: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  miniStatLabel: { color: Theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },

  // Banner izin pending
  izinAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: hexToRGBA(Theme.warning, 0.12),
    borderWidth: 1,
    borderColor: hexToRGBA(Theme.warning, 0.3),
    borderRadius: 20,
    padding: 16,
    marginBottom: 20,
  },
  izinAlertLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  izinAlertCount: { color: Theme.warning, fontSize: 24, fontWeight: '900' },
  izinAlertLabel: { color: Theme.textMain, fontSize: 13, fontWeight: '600' },
  izinAlertAction: { color: Theme.warning, fontWeight: '800', fontSize: 13 },

  chartContainer: { backgroundColor: Theme.card, padding: 16, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: Theme.border },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  chartTitle: { color: Theme.textMain, fontSize: 13, fontWeight: '800', flex: 1 },
  chartStyle: { marginLeft: -16, borderRadius: 16 },

  sectionTitle: { color: Theme.textMain, fontSize: 18, fontWeight: '800', marginBottom: 15 },
  actionScroll: { flexDirection: 'row' },
  actionItem: { alignItems: 'center', marginRight: 25, position: 'relative' },
  actionIcon: { width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionText: { color: Theme.textMuted, fontSize: 11, fontWeight: '700' },
  actionBadge: {
    position: 'absolute', top: -4, right: -4,
    backgroundColor: '#FF3B30',
    minWidth: 18, height: 18, borderRadius: 9,
    justifyContent: 'center', alignItems: 'center',
  },
  actionBadgeText: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
});