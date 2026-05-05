import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BarChart3, Calendar, ClipboardList, FileText, GraduationCap, Search, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Card from '../../components/Card';
import db from '../../database/sqlite';
import { useAuth } from '../../services/AuthContext';
import { Theme, hexToRGBA } from '../../theme/colors';

export default function GuruReportsScreen() {
  const { user } = useAuth();

  // ✅ Kelas diampu guru (ambil dari AuthContext)
  const guruClasses = user?.classes || [];
  const kelasLabel = guruClasses.join(', ') || '-';
  // Untuk query, gunakan kelas pertama (guru hanya 1 kelas)
  const kelasDiampu = guruClasses[0] || null;

  const [activeTab, setActiveTab] = useState('logs');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  // States Filter — tidak ada filter kelas (sudah otomatis dari kelas diampu)
  const [searchText, setSearchText] = useState('');
  const [limit, setLimit] = useState(50);
  const [filterDate, setFilterDate] = useState({
    day: 'Semua',
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    year: new Date().getFullYear().toString(),
  });

  const [showDateModal, setShowDateModal] = useState(false);

  const months = [
    { l: 'Januari', v: '01' }, { l: 'Februari', v: '02' }, { l: 'Maret', v: '03' },
    { l: 'April', v: '04' }, { l: 'Mei', v: '05' }, { l: 'Juni', v: '06' },
    { l: 'Juli', v: '07' }, { l: 'Agustus', v: '08' }, { l: 'September', v: '09' },
    { l: 'Oktober', v: '10' }, { l: 'November', v: '11' }, { l: 'Desember', v: '12' },
  ];

  // ✅ Cek jika guru tidak punya kelas
  if (!kelasDiampu) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <GraduationCap size={60} color={Theme.textMuted} />
        <Text style={styles.emptyText}>
          Kamu belum memiliki kelas yang diampu.{'\n'}Hubungi Admin untuk pengaturan kelas.
        </Text>
      </View>
    );
  }

  // ✅ Query selalu difilter by kelas diampu guru
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let query = '';
      if (activeTab === 'logs') {
        query = `
          SELECT 
            IFNULL(s.name, 'Siswa Tidak Terdaftar') as name, 
            IFNULL(s.nisn, '-') as nisn,
            IFNULL(s.class, '-') as class, a.nis,
            date(a.timestamp, 'localtime') as date_only,
            MAX(a.status) as status_display,
            MAX(CASE WHEN a.session = 'masuk' THEN time(a.timestamp, 'localtime') END) as jam_masuk,
            MAX(CASE WHEN a.session = 'pulang' THEN time(a.timestamp, 'localtime') END) as jam_pulang
          FROM attendance_logs a 
          LEFT JOIN students s ON TRIM(CAST(a.nis AS TEXT)) = TRIM(CAST(s.nis AS TEXT))
          WHERE s.class = '${kelasDiampu}'
        `;
      } else {
        query = `
          SELECT s.name, s.nis, s.nisn, s.class,
            COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'HADIR' THEN date(a.timestamp, 'localtime') END) as total_hadir,
            COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'IZIN' THEN date(a.timestamp, 'localtime') END) as total_izin,
            COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'SAKIT' THEN date(a.timestamp, 'localtime') END) as total_sakit,
            COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'ALFA' THEN date(a.timestamp, 'localtime') END) as total_alfa
          FROM students s
          LEFT JOIN attendance_logs a ON TRIM(CAST(s.nis AS TEXT)) = TRIM(CAST(a.nis AS TEXT))
          WHERE s.class = '${kelasDiampu}'
        `;
      }

      // Filter Tanggal
      if (filterDate.year !== 'Semua') query += ` AND strftime('%Y', a.timestamp, 'localtime') = '${filterDate.year}'`;
      if (filterDate.month !== 'Semua') query += ` AND strftime('%m', a.timestamp, 'localtime') = '${filterDate.month}'`;
      if (filterDate.day !== 'Semua') query += ` AND strftime('%d', a.timestamp, 'localtime') = '${filterDate.day.padStart(2, '0')}'`;

      // Filter Search
      if (searchText) query += ` AND (s.name LIKE '%${searchText}%' OR s.nis LIKE '%${searchText}%')`;

      if (activeTab === 'logs') {
        query += ` GROUP BY a.nis, date_only ORDER BY date_only DESC, jam_masuk DESC LIMIT ${limit}`;
      } else {
        query += ` GROUP BY s.nis ORDER BY s.name ASC LIMIT ${limit}`;
      }

      const results = await db.getAllAsync(query);
      setData(results || []);
    } catch (error) {
      console.error('Fetch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
      const interval = setInterval(() => fetchData(true), 5000);
      return () => clearInterval(interval);
    }, [activeTab, filterDate, searchText, limit])
  );

  const exportPDF = async () => {
    if (data.length === 0) return Alert.alert('Kosong', 'Tidak ada data untuk diekspor.');

    const tanggalCetak = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    let tableHeader = activeTab === 'logs'
      ? `<tr>
          <th>No</th><th>Tanggal</th><th>Nama Santri</th>
          <th>Status</th><th>Masuk</th><th>Pulang</th>
        </tr>`
      : `<tr>
          <th>No</th><th>NIS</th><th>Nama Santri</th>
          <th style="background-color:#e8f5e9;">H</th>
          <th style="background-color:#fff3e0;">I</th>
          <th style="background-color:#e0f7fa;">S</th>
          <th style="background-color:#ffeeb3;">A</th>
        </tr>`;

    let tableRows = data.map((item, index) => {
      if (activeTab === 'logs') {
        const status = item.status_display?.toUpperCase() || 'HADIR';
        return `<tr>
          <td align="center">${index + 1}</td>
          <td>${item.date_only}</td>
          <td><b>${item.name}</b></td>
          <td align="center">${status}</td>
          <td align="center">${item.jam_masuk?.substring(0, 5) || '-'}</td>
          <td align="center">${item.jam_pulang?.substring(0, 5) || '-'}</td>
        </tr>`;
      } else {
        return `<tr>
          <td align="center">${index + 1}</td>
          <td>${item.nis}</td>
          <td><b>${item.name}</b></td>
          <td align="center">${item.total_hadir || 0}</td>
          <td align="center">${item.total_izin || 0}</td>
          <td align="center">${item.total_sakit || 0}</td>
          <td align="center">${item.total_alfa || 0}</td>
        </tr>`;
      }
    }).join('');

    const html = `
      <html>
        <head>
          <style>
            body { font-family: 'Helvetica', sans-serif; padding: 20px; color: #333; }
            .kop-surat { border-bottom: 3px double #000; padding-bottom: 10px; margin-bottom: 20px; text-align: center; }
            .nama-yayasan { font-size: 20px; font-weight: bold; margin: 0; text-transform: uppercase; }
            .nama-pesantren { font-size: 16px; font-weight: bold; margin: 5px 0; color: #2e7d32; }
            .alamat { font-size: 10px; font-style: italic; margin: 0; }
            .judul-laporan { text-align: center; font-size: 14px; font-weight: bold; margin-top: 20px; text-decoration: underline; }
            .info-periode { text-align: center; font-size: 11px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { border: 1px solid #000; padding: 8px; font-size: 10px; background-color: #f2f2f2; text-transform: uppercase; }
            td { border: 1px solid #000; padding: 6px; font-size: 10px; }
            .footer { margin-top: 40px; }
            .ttd-box { float: right; width: 200px; text-align: center; font-size: 12px; }
            .app-brand { clear: both; margin-top: 80px; border-top: 1px solid #ddd; padding-top: 5px; font-size: 9px; color: #999; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="kop-surat">
            <p class="nama-yayasan">المعهد مفتاح العلوم</p>
            <p class="nama-pesantren">PONDOK PESANTREN MIFTAHUL ULUM SAROLANGUN</p>
            <p class="alamat">Jln.Jati desa Sei Merah, Pelawan, Sarolangun Jambi. Kode Pos: 37481</p>
          </div>
          <div class="judul-laporan">
            ${activeTab === 'logs' ? 'LAPORAN RIWAYAT ABSENSI HARIAN' : 'LAPORAN REKAPITULASI ABSENSI SANTRI'}
          </div>
          <div class="info-periode">
            Kelas: ${kelasDiampu} | Wali Kelas: ${user?.full_name || '-'} | Periode: ${filterDate.month}/${filterDate.year}
          </div>
          <table>
            <thead>${tableHeader}</thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">
            <div class="ttd-box">
              <p>Sarolangun, ${tanggalCetak.split(',')[1]}</p>
              <p style="margin-top: 60px;"><b>Wali Kelas ${kelasDiampu}</b></p>
              <p>( ${user?.full_name || '..............................'} )</p>
            </div>
          </div>
          <div class="app-brand">
            Dokumen ini dibuat otomatis oleh <b>AOne Smart Present</b> pada ${tanggalCetak}
          </div>
        </body>
      </html>
    `;

    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
    } catch (err) {
      Alert.alert('Error', 'Gagal mencetak PDF.');
    }
  };

  const renderItem = ({ item }) => {
    const status = item.status_display?.toUpperCase();
    const isIzin = status === 'IZIN';
    const isSakit = status === 'SAKIT';
    const isAlfa = status === 'ALFA';

    const getStatusColor = () => {
      if (isIzin) return '#FF9500';
      if (isSakit) return '#00C7BE';
      if (isAlfa) return '#FF3B30';
      return null;
    };
    const statusColor = getStatusColor();

    return (
      <Card style={styles.logCard}>
        <View style={styles.logRow}>
          <View style={[
            styles.statusIndicator,
            {
              backgroundColor: statusColor
                ? statusColor
                : activeTab === 'logs'
                ? (item.jam_pulang ? Theme.success : Theme.primary)
                : Theme.secondary,
            },
          ]} />
          <View style={styles.logInfo}>
            <Text style={styles.studentName} numberOfLines={1}>{String(item.name || 'Nama Kosong')}</Text>
            <Text style={styles.subInfo} numberOfLines={1}>{item.nis}</Text>
            {activeTab === 'logs' && (
              <Text style={styles.dateInfo}>
                {item.date_only}
                {statusColor && (
                  <Text style={{ color: statusColor, fontWeight: 'bold' }}> • {status}</Text>
                )}
              </Text>
            )}
          </View>
          <View style={styles.rightSection}>
            {activeTab === 'logs' ? (
              <View style={styles.timeContainer}>
                <View style={styles.timeBox}>
                  <Text style={styles.timeLabel}>MASUK</Text>
                  <Text style={[styles.timeValue, statusColor && { color: statusColor }]}>
                    {statusColor ? status : (item.jam_masuk?.substring(0, 5) || '--:--')}
                  </Text>
                </View>
                <View style={styles.timeBox}>
                  <Text style={styles.timeLabel}>PULANG</Text>
                  <Text style={[styles.timeValue, statusColor && { color: statusColor }]}>
                    {statusColor ? status : (item.jam_pulang?.substring(0, 5) || '--:--')}
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <View style={styles.rekapBox}>
                  <Text style={styles.rekapValue}>{item.total_hadir || 0}</Text>
                  <Text style={styles.rekapLabel}>H</Text>
                </View>
                <View style={styles.rekapBox}>
                  <Text style={[styles.rekapValue, { color: '#FF9500' }]}>{item.total_izin || 0}</Text>
                  <Text style={styles.rekapLabel}>I</Text>
                </View>
                <View style={styles.rekapBox}>
                  <Text style={[styles.rekapValue, { color: '#00C7BE' }]}>{item.total_sakit || 0}</Text>
                  <Text style={styles.rekapLabel}>S</Text>
                </View>
                <View style={styles.rekapBox}>
                  <Text style={[styles.rekapValue, { color: '#FF3B30' }]}>{item.total_alfa || 0}</Text>
                  <Text style={styles.rekapLabel}>A</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Laporan</Text>
          {/* ✅ Badge kelas diampu */}
          <View style={styles.kelasBadge}>
            <GraduationCap size={12} color={Theme.primary} />
            <Text style={styles.kelasText}>Kelas {kelasLabel}</Text>
            <View style={styles.dot} />
            <Text style={styles.liveText}>Auto-Update</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.pdfBtn} onPress={exportPDF}>
          <FileText color="#FFF" size={20} />
          <Text style={styles.pdfBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      {/* TABS */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'logs' && styles.tabActive]}
          onPress={() => { setActiveTab('logs'); setLimit(50); }}
        >
          <ClipboardList size={18} color={activeTab === 'logs' ? '#000' : Theme.textMuted} />
          <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>Riwayat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rekap' && styles.tabActive]}
          onPress={() => { setActiveTab('rekap'); setLimit(50); }}
        >
          <BarChart3 size={18} color={activeTab === 'rekap' ? '#000' : Theme.textMuted} />
          <Text style={[styles.tabText, activeTab === 'rekap' && styles.tabTextActive]}>Rekap</Text>
        </TouchableOpacity>
      </View>

      {/* FILTER — tanpa filter kelas, sudah otomatis */}
      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Search color={Theme.textMuted} size={16} />
          <TextInput
            placeholder="Cari Nama / NIS..."
            placeholderTextColor={Theme.textMuted}
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
          />
          {searchText ? (
            <TouchableOpacity onPress={() => setSearchText('')}>
              <X size={16} color={Theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
        {/* ✅ Hanya filter tanggal, tidak ada filter kelas */}
        <TouchableOpacity style={styles.dropdownTrigger} onPress={() => setShowDateModal(true)}>
          <Calendar size={14} color={Theme.primary} />
          <Text style={styles.dropdownValue}>
            {filterDate.day !== 'Semua' ? `${filterDate.day}/` : ''}
            {filterDate.month !== 'Semua' ? `${filterDate.month}/` : ''}
            {filterDate.year}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Theme.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          ListEmptyComponent={<Text style={styles.emptyText}>Data tidak ditemukan.</Text>}
          ListFooterComponent={
            data.length >= limit ? (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setLimit(limit + 50)}>
                <Text style={styles.loadMoreText}>Muat Lebih Banyak...</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      {/* Modal Pilih Tanggal */}
      <Modal visible={showDateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Waktu</Text>
            <Text style={styles.label}>Tahun</Text>
            <TextInput
              style={styles.inputModal}
              keyboardType="numeric"
              value={filterDate.year}
              onChangeText={v => setFilterDate({ ...filterDate, year: v })}
            />
            <Text style={[styles.label, { marginTop: 15 }]}>Bulan</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.chip, filterDate.month === 'Semua' && styles.chipActive]}
                onPress={() => setFilterDate({ ...filterDate, month: 'Semua' })}
              >
                <Text style={[styles.chipText, filterDate.month === 'Semua' && { color: '#000' }]}>Semua</Text>
              </TouchableOpacity>
              {months.map(m => (
                <TouchableOpacity
                  key={m.v}
                  style={[styles.chip, filterDate.month === m.v && styles.chipActive]}
                  onPress={() => setFilterDate({ ...filterDate, month: m.v })}
                >
                  <Text style={[styles.chipText, filterDate.month === m.v && { color: '#000' }]}>{m.l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={[styles.label, { marginTop: 15 }]}>Tanggal (Opsional)</Text>
            <TextInput
              style={styles.inputModal}
              placeholder="Semua"
              placeholderTextColor="#555"
              keyboardType="numeric"
              value={filterDate.day === 'Semua' ? '' : filterDate.day}
              onChangeText={v => setFilterDate({ ...filterDate, day: v || 'Semua' })}
            />
            <TouchableOpacity style={styles.applyBtn} onPress={() => setShowDateModal(false)}>
              <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#000' }}>Terapkan Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { padding: 20, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { color: Theme.textMain, fontSize: 26, fontWeight: '900' },
  kelasBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  kelasText: { color: Theme.primary, fontSize: 11, fontWeight: '800' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#2ecc71' },
  liveText: { color: '#2ecc71', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  pdfBtn: { backgroundColor: '#e74c3c', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, flexDirection: 'row', alignItems: 'center' },
  pdfBtnText: { color: '#FFF', fontWeight: 'bold', marginLeft: 5, fontSize: 12 },
  tabContainer: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: hexToRGBA(Theme.card, 0.3), borderRadius: 12, padding: 4, marginBottom: 15 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 8 },
  tabActive: { backgroundColor: Theme.primary },
  tabText: { color: Theme.textMuted, fontWeight: '600', fontSize: 13 },
  tabTextActive: { color: '#000' },
  filterSection: { paddingHorizontal: 20, gap: 10, marginBottom: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: hexToRGBA(Theme.card, 0.5), borderRadius: 10, paddingHorizontal: 12, height: 45, borderWidth: 1, borderColor: Theme.border },
  searchInput: { flex: 1, color: Theme.textMain, marginLeft: 10 },
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: hexToRGBA(Theme.card, 0.5), borderRadius: 10, paddingHorizontal: 12, height: 40, borderWidth: 1, borderColor: Theme.border, gap: 8 },
  dropdownValue: { color: Theme.textMain, fontWeight: '600', fontSize: 12 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 50 },
  logCard: { marginBottom: 12, padding: 0, overflow: 'hidden', backgroundColor: Theme.card },
  logRow: { flexDirection: 'row', alignItems: 'center', width: '100%', minHeight: 90 },
  statusIndicator: { width: 6, height: '100%' },
  logInfo: { flex: 1, justifyContent: 'center', paddingLeft: 12, paddingVertical: 10 },
  studentName: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  subInfo: { color: Theme.primary, fontSize: 14, fontWeight: '600' },
  dateInfo: { color: '#bdc3c7', fontSize: 12, marginTop: 4 },
  rightSection: { paddingRight: 12, alignItems: 'flex-end', justifyContent: 'center', minWidth: 140 },
  timeContainer: { flexDirection: 'row', gap: 6, paddingRight: 15 },
  timeBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 6, borderRadius: 8, minWidth: 50 },
  timeLabel: { fontSize: 7, color: Theme.textMuted, fontWeight: 'bold' },
  timeValue: { fontSize: 11, color: Theme.textMain, fontWeight: 'bold' },
  rekapBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', paddingVertical: 6, width: 32, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  rekapValue: { fontSize: 13, fontWeight: '900', marginBottom: -2 },
  rekapLabel: { color: Theme.textMuted, fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase' },
  loadMoreBtn: { padding: 15, alignItems: 'center', marginTop: 10 },
  loadMoreText: { color: Theme.primary, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.card, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25, maxHeight: '80%' },
  modalTitle: { color: Theme.textMain, fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  label: { color: Theme.textMuted, fontSize: 12, marginBottom: 5 },
  inputModal: { backgroundColor: Theme.background, color: Theme.textMain, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: Theme.border },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, backgroundColor: Theme.background, marginRight: 8, borderWidth: 1, borderColor: Theme.border },
  chipActive: { backgroundColor: Theme.primary },
  chipText: { color: Theme.textMain, fontSize: 12 },
  applyBtn: { backgroundColor: Theme.primary, padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 25 },
  emptyText: { color: Theme.textMuted, textAlign: 'center', marginTop: 50 },
});