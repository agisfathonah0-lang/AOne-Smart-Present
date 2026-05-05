import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BarChart3, Calendar, ClipboardList, FileText, Search, Users, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Card from '../../components/Card';
import db from '../../database/sqlite';
import { Theme, hexToRGBA } from '../../theme/colors';

export default function ReportsScreen() {
  const [activeTab, setActiveTab] = useState('logs');
  const [data, setData] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);

  // States Filter
  const [selectedClass, setSelectedClass] = useState('Semua Kelas');
  const [searchText, setSearchText] = useState('');
  const [limit, setLimit] = useState(50); // Agar aplikasi ringan (Pagination)
  const [filterDate, setFilterDate] = useState({
    day: 'Semua',
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    year: new Date().getFullYear().toString()
  });

  const [showClassModal, setShowClassModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);

  const months = [
    { l: 'Januari', v: '01' }, { l: 'Februari', v: '02' }, { l: 'Maret', v: '03' },
    { l: 'April', v: '04' }, { l: 'Mei', v: '05' }, { l: 'Juni', v: '06' },
    { l: 'Juli', v: '07' }, { l: 'Agustus', v: '08' }, { l: 'September', v: '09' },
    { l: 'Oktober', v: '10' }, { l: 'November', v: '11' }, { l: 'Desember', v: '12' }
  ];

  // Fungsi Ambil Data dengan Optimasi SQL
  // const fetchData = async (silent = false) => {
  //   if (!silent) setLoading(true);
  //   try {
  //     const classRes = await db.getAllAsync("SELECT DISTINCT class FROM students WHERE class IS NOT NULL ORDER BY class ASC");
  //     setClasses(['Semua Kelas', ...classRes.map(c => c.class)]);

  //     let query = "";
  //     if (activeTab === 'logs') {
  //       query = `
  //         SELECT 
  //           IFNULL(s.name, 'Siswa Tidak Terdaftar') as name, 
  //           IFNULL(s.nisn, '-') as nisn,
  //           IFNULL(s.class, '-') as class, a.nis,
  //           date(a.timestamp, 'localtime') as date_only,
  //           MAX(CASE WHEN a.session = 'masuk' THEN time(a.timestamp, 'localtime') END) as jam_masuk,
  //           MAX(CASE WHEN a.session = 'pulang' THEN time(a.timestamp, 'localtime') END) as jam_pulang
  //         FROM attendance_logs a 
  //         LEFT JOIN students s ON TRIM(CAST(a.nis AS TEXT)) = TRIM(CAST(s.nis AS TEXT))
  //         WHERE 1=1
  //       `;
  //     } else {
  //       query = `
  //         SELECT s.name, s.nis, s.nisn, s.class,
  //         COUNT(DISTINCT date(a.timestamp, 'localtime')) as total_hadir
  //         FROM students s
  //         LEFT JOIN attendance_logs a ON TRIM(CAST(s.nis AS TEXT)) = TRIM(CAST(a.nis AS TEXT))
  //         WHERE 1=1
  //       `;
  //     }

  //     if (filterDate.year !== 'Semua') query += ` AND strftime('%Y', a.timestamp, 'localtime') = '${filterDate.year}'`;
  //     if (filterDate.month !== 'Semua') query += ` AND strftime('%m', a.timestamp, 'localtime') = '${filterDate.month}'`;
  //     if (filterDate.day !== 'Semua') query += ` AND strftime('%d', a.timestamp, 'localtime') = '${filterDate.day.padStart(2, '0')}'`;
  //     if (selectedClass !== 'Semua Kelas') query += ` AND s.class = '${selectedClass}'`;
  //     if (searchText) query += ` AND (s.name LIKE '%${searchText}%' OR s.nis LIKE '%${searchText}%')`;

  //     if (activeTab === 'logs') {
  //       query += ` GROUP BY a.nis, date_only ORDER BY date_only DESC, jam_masuk DESC LIMIT ${limit}`;
  //     } else {
  //       query += ` GROUP BY s.nis ORDER BY s.class ASC, s.name ASC LIMIT ${limit}`;
  //     }

  //     const results = await db.getAllAsync(query);
  //     setData(results || []);
  //   } catch (error) {
  //     console.error("Fetch Error:", error);
  //   } finally {
  //     setLoading(false);
  //   }
  // };
  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const classRes = await db.getAllAsync("SELECT DISTINCT class FROM students WHERE class IS NOT NULL ORDER BY class ASC");
      setClasses(['Semua Kelas', ...classRes.map(c => c.class)]);

      let query = "";
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
        WHERE 1=1
      `;
      } else {
        query = `
        SELECT s.name, s.nis, s.nisn, s.class,
          -- Gunakan UPPER untuk memastikan kecocokan huruf besar/kecil
          COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'HADIR' THEN date(a.timestamp, 'localtime') END) as total_hadir,
          COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'IZIN' THEN date(a.timestamp, 'localtime') END) as total_izin,
          COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'SAKIT' THEN date(a.timestamp, 'localtime') END) as total_sakit,
          COUNT(DISTINCT CASE WHEN UPPER(a.status) = 'ALFA' THEN date(a.timestamp, 'localtime') END) as total_alfa
        FROM students s
        LEFT JOIN attendance_logs a ON TRIM(CAST(s.nis AS TEXT)) = TRIM(CAST(a.nis AS TEXT))
        WHERE 1=1
      `;
      }

      // Filter Tanggal & Search
      if (filterDate.year !== 'Semua') query += ` AND strftime('%Y', a.timestamp, 'localtime') = '${filterDate.year}'`;
      if (filterDate.month !== 'Semua') query += ` AND strftime('%m', a.timestamp, 'localtime') = '${filterDate.month}'`;
      if (filterDate.day !== 'Semua') query += ` AND strftime('%d', a.timestamp, 'localtime') = '${filterDate.day.padStart(2, '0')}'`;
      if (selectedClass !== 'Semua Kelas') query += ` AND s.class = '${selectedClass}'`;
      if (searchText) query += ` AND (s.name LIKE '%${searchText}%' OR s.nis LIKE '%${searchText}%')`;

      if (activeTab === 'logs') {
        query += ` GROUP BY a.nis, date_only ORDER BY date_only DESC, jam_masuk DESC LIMIT ${limit}`;
      } else {
        query += ` GROUP BY s.nis ORDER BY s.class ASC, s.name ASC LIMIT ${limit}`;
      }

      const results = await db.getAllAsync(query);
      setData(results || []);
    } catch (error) {
      console.error("Fetch Error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-Update & Refresh saat fokus
  useFocusEffect(
    useCallback(() => {
      fetchData();
      const interval = setInterval(() => fetchData(true), 5000);
      return () => clearInterval(interval);
    }, [activeTab, filterDate, selectedClass, searchText, limit])
  );

  const exportPDF = async () => {
    if (data.length === 0) return Alert.alert("Kosong", "Tidak ada data untuk diekspor.");

    const tanggalCetak = new Date().toLocaleDateString('id-ID', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // 1. Header Tabel Dinamis
    let tableHeader = activeTab === 'logs'
      ? `<tr>
        <th>No</th>
        <th>Tanggal</th>
        <th>Nama Santri</th>
        <th>Kelas</th>
        <th>Status</th>
        <th>Masuk</th>
        <th>Pulang</th>
      </tr>`
      : `<tr>
        <th>No</th>
        <th>NIS</th>
        <th>Nama Santri</th>
        <th>Kelas</th>
        <th style="background-color: #e8f5e9;">H</th>
        <th style="background-color: #fff3e0;">I</th>
        <th style="background-color: #e0f7fa;">S</th>
        <th style="background-color: #ffeeb3;">A</th>
      </tr>`;

    // 2. Baris Tabel Dinamis
    let tableRows = data.map((item, index) => {
      if (activeTab === 'logs') {
        const status = item.status_display?.toUpperCase() || 'HADIR';
        return `<tr>
        <td align="center">${index + 1}</td>
        <td>${item.date_only}</td>
        <td><b>${item.name}</b></td>
        <td align="center">${item.class}</td>
        <td align="center">${status}</td>
        <td align="center">${item.jam_masuk?.substring(0, 5) || '-'}</td>
        <td align="center">${item.jam_pulang?.substring(0, 5) || '-'}</td>
      </tr>`;
      } else {
        return `<tr>
        <td align="center">${index + 1}</td>
        <td>${item.nis}</td>
        <td><b>${item.name}</b></td>
        <td align="center">${item.class}</td>
        <td align="center">${item.total_hadir || 0}</td>
        <td align="center">${item.total_izin || 0}</td>
        <td align="center">${item.total_sakit || 0}</td>
        <td align="center">${item.total_alfa || 0}</td>
      </tr>`;
      }
    }).join('');

    // 3. Template HTML Lengkap (Kop Surat & Style)
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
          Periode: ${filterDate.month} / ${filterDate.year} | Kelas: ${selectedClass}
        </div>

        <table>
          <thead>${tableHeader}</thead>
          <tbody>${tableRows}</tbody>
        </table>

        <div class="footer">
          <div class="ttd-box">
            <p>Sarolangun, ${tanggalCetak.split(',')[1]}</p>
            <p style="margin-top: 60px;"><b>Admin Kesantrian</b></p>
            <p>( .................................... )</p>
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
      Alert.alert("Error", "Gagal mencetak PDF.");
    }
  };

  const renderItem = ({ item }) => {
    // 1. Definisikan Status secara Case-Insensitive
    const status = item.status_display?.toUpperCase();
    const isIzin = status === 'IZIN';
    const isSakit = status === 'SAKIT';
    const isAlfa = status === 'ALFA';

    // 2. Tentukan Warna Tema Berdasarkan Status
    const getStatusColor = () => {
      if (isIzin) return '#FF9500'; // Orange
      if (isSakit) return '#00C7BE'; // Teal/Tosca
      if (isAlfa) return '#FF3B30';  // Merah
      return null;
    };

    const statusColor = getStatusColor();

    return (
      <Card style={styles.logCard}>
        <View style={styles.logRow}>
          {/* 1. KIRI: Indikator Warna */}
          <View style={[
            styles.statusIndicator,
            {
              backgroundColor: statusColor
                ? statusColor
                : activeTab === 'logs'
                  ? (item.jam_pulang ? Theme.success : Theme.primary)
                  : Theme.secondary
            }
          ]} />

          {/* 2. TENGAH: Info Siswa */}
          <View style={styles.logInfo}>
            <Text style={styles.studentName} numberOfLines={1}>
              {String(item.name || "Nama Kosong")}
            </Text>
            <Text style={styles.subInfo} numberOfLines={1}>
              {item.nis} • {item.class}
            </Text>
            {activeTab === 'logs' && (
              <Text style={styles.dateInfo}>
                {item.date_only}
                {statusColor && (
                  <Text style={{ color: statusColor, fontWeight: 'bold' }}> • {status}</Text>
                )}
              </Text>
            )}
          </View>

          {/* 3. KANAN: Detail Log atau Rekapitulasi */}
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
              /* TAMPILAN REKAP: 4 Kolom (Hadir, Izin, Sakit, Alfa) */
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
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Laporan</Text>
          <View style={styles.liveIndicator}>
            <View style={styles.dot} />
            <Text style={styles.liveText}>Auto-Update Aktif</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.pdfBtn} onPress={exportPDF}>
          <FileText color="#FFF" size={20} />
          <Text style={styles.pdfBtnText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'logs' && styles.tabActive]} onPress={() => { setActiveTab('logs'); setLimit(50); }}>
          <ClipboardList size={18} color={activeTab === 'logs' ? '#000' : Theme.textMuted} />
          <Text style={[styles.tabText, activeTab === 'logs' && styles.tabTextActive]}>Riwayat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'rekap' && styles.tabActive]} onPress={() => { setActiveTab('rekap'); setLimit(50); }}>
          <BarChart3 size={18} color={activeTab === 'rekap' ? '#000' : Theme.textMuted} />
          <Text style={[styles.tabText, activeTab === 'rekap' && styles.tabTextActive]}>Rekap</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Search color={Theme.textMuted} size={16} />
          <TextInput placeholder="Cari Nama / NIS..." placeholderTextColor={Theme.textMuted} style={styles.searchInput} value={searchText} onChangeText={setSearchText} />
          {searchText ? <TouchableOpacity onPress={() => setSearchText('')}><X size={16} color={Theme.textMuted} /></TouchableOpacity> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.dropdownTrigger, { flex: 1 }]} onPress={() => setShowClassModal(true)}>
            <Users size={14} color={Theme.primary} />
            <Text style={styles.dropdownValue} numberOfLines={1}>{selectedClass}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dropdownTrigger, { flex: 1.2 }]} onPress={() => setShowDateModal(true)}>
            <Calendar size={14} color={Theme.primary} />
            <Text style={styles.dropdownValue}>{filterDate.day !== 'Semua' ? `${filterDate.day}/` : ''}{filterDate.month !== 'Semua' ? `${filterDate.month}/` : ''}{filterDate.year}</Text>
          </TouchableOpacity>
        </View>
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
          ListFooterComponent={data.length >= limit ? (
            <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setLimit(limit + 50)}>
              <Text style={styles.loadMoreText}>Muat Lebih Banyak...</Text>
            </TouchableOpacity>
          ) : null}
        />
      )}

      {/* Modal Pilih Kelas */}
      <Modal visible={showClassModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowClassModal(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Pilih Kelas</Text>
            <FlatList data={classes} renderItem={({ item }) => (
              <TouchableOpacity style={[styles.dropdownItem, selectedClass === item && styles.itemActive]} onPress={() => { setSelectedClass(item); setShowClassModal(false); }}>
                <Text style={[styles.itemText, selectedClass === item && { color: '#000' }]}>{item}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Modal Pilih Tanggal */}
      <Modal visible={showDateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Waktu</Text>
            <Text style={styles.label}>Tahun</Text>
            <TextInput style={styles.inputModal} keyboardType="numeric" value={filterDate.year} onChangeText={(v) => setFilterDate({ ...filterDate, year: v })} />
            <Text style={[styles.label, { marginTop: 15 }]}>Bulan</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <TouchableOpacity style={[styles.chip, filterDate.month === 'Semua' && styles.chipActive]} onPress={() => setFilterDate({ ...filterDate, month: 'Semua' })}>
                <Text style={[styles.chipText, filterDate.month === 'Semua' && { color: '#000' }]}>Semua</Text>
              </TouchableOpacity>
              {months.map(m => (
                <TouchableOpacity key={m.v} style={[styles.chip, filterDate.month === m.v && styles.chipActive]} onPress={() => setFilterDate({ ...filterDate, month: m.v })}>
                  <Text style={[styles.chipText, filterDate.month === m.v && { color: '#000' }]}>{m.l}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={[styles.label, { marginTop: 15 }]}>Tanggal (Opsional)</Text>
            <TextInput style={styles.inputModal} placeholder="Semua" placeholderTextColor="#555" keyboardType="numeric" value={filterDate.day === 'Semua' ? '' : filterDate.day} onChangeText={(v) => setFilterDate({ ...filterDate, day: v || 'Semua' })} />
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
  liveIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2ecc71', marginRight: 5 },
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
  dropdownTrigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: hexToRGBA(Theme.card, 0.5), borderRadius: 10, paddingHorizontal: 10, height: 40, borderWidth: 1, borderColor: Theme.border, gap: 5 },
  dropdownValue: { flex: 1, color: Theme.textMain, fontWeight: '600', fontSize: 11 },
  listContainer: { paddingHorizontal: 20, paddingBottom: 50 },
  logCard: { marginBottom: 12, padding: 0, overflow: 'hidden', backgroundColor: Theme.card },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%', // Pastikan mengambil lebar penuh
    minHeight: 90,
  },
  statusIndicator: {
    width: 6,
    height: '100%',
    // Hapus marginRight: 15 di sini, kita gunakan padding di logInfo saja
  },
  studentName: {
    color: '#FFFFFF',      // Paksa Putih
    fontSize: 18,          // Perbesar ukuran (sebelumnya mungkin cuma 14-16)
    fontWeight: 'bold',    // Tebalkan
    marginBottom: 4,       // Beri jarak ke teks bawahnya
  },
  subInfo: {
    color: Theme.primary,  // Gunakan warna cerah (cyan/biru muda)
    fontSize: 14,          // Perbesar sedikit
    fontWeight: '600',
  },
  dateInfo: {
    color: '#bdc3c7',      // Abu-abu terang agar terbaca
    fontSize: 12,
    marginTop: 4,
  },
  logInfo: {
    flex: 1, // Ini akan memastikan nama mengalah jika ruang sempit
    justifyContent: 'center',
    paddingLeft: 12,
    paddingVertical: 10,
  },
  // logInfo: {
  //   flex: 1,
  //   justifyContent: 'center',
  //   paddingLeft: 15, // Jarak dari garis biru ke teks nama
  //   paddingVertical: 10,
  //   // Tambahkan ini untuk tes:
  //   minWidth: 100,
  // },
  // rightSection: {
  //   // Hilangkan marginLeft: 10 jika ada
  //   paddingRight: 15,
  //   alignItems: 'flex-end',
  //   justifyContent: 'center',
  // },
  rightSection: {
    paddingRight: 12,
    alignItems: 'flex-end',
    justifyContent: 'center',
    // Memberikan batas minimal agar area kanan tetap konsisten
    minWidth: 140,
  },
  rekapContainer: {
    flexDirection: 'row',
    gap: 4, // Jarak antar kotak sangat rapat
    alignItems: 'center',
  },
  // Style lainnya (timeBox, rekapBox) tetap sama...
  timeContainer: { flexDirection: 'row', gap: 6, paddingRight: 15 },
  timeBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 6, borderRadius: 8, minWidth: 50 },
  timeLabel: { fontSize: 7, color: Theme.textMuted, fontWeight: 'bold' },
  timeValue: { fontSize: 11, color: Theme.textMain, fontWeight: 'bold' },
  // rekapBox: { marginRight: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRGBA(Theme.secondary, 0.1), padding: 10, borderRadius: 12, minWidth: 60 },
  // rekapValue: { color: Theme.secondary, fontSize: 15, fontWeight: '900' },
  rekapBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', // Background tipis transparan
    paddingVertical: 6,
    width: 32, // Lebar kotak tetap dan kecil
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rekapValue: {
    fontSize: 13, // Ukuran angka proporsional
    fontWeight: '900',
    marginBottom: -2, // Merapatkan jarak angka ke label
  },
  rekapLabel: {
    color: Theme.textMuted,
    fontSize: 8, // Inisial (H, I, S, A) kecil saja
    fontWeight: 'bold',
    textTransform: 'uppercase'
  },
  // rekapLabel: { color: Theme.textMuted, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase' },
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
  dropdownItem: { padding: 15, borderRadius: 10, marginBottom: 5 },
  itemActive: { backgroundColor: Theme.primary },
  itemText: { color: Theme.textMain, fontWeight: 'bold', textAlign: 'center' },
  emptyText: { color: Theme.textMuted, textAlign: 'center', marginTop: 50 }
});