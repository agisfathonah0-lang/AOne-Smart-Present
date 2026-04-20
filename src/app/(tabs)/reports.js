import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Calendar, FileText, Filter, Search, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Card from '../../components/Card';
import db from '../../database/sqlite';
import { Theme, hexToRGBA } from '../../theme/colors';

export default function ReportsScreen() {
  const [logs, setLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [classes, setClasses] = useState([]);
  
  // States Filter
  const [selectedClass, setSelectedClass] = useState('Semua Kelas');
  const [searchText, setSearchText] = useState('');
  const [filterDate, setFilterDate] = useState({
    day: 'Semua',
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    year: new Date().getFullYear().toString()
  });

  // UI States
  const [showClassModal, setShowClassModal] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);

  const months = [
    { l: 'Januari', v: '01' }, { l: 'Februari', v: '02' }, { l: 'Maret', v: '03' },
    { l: 'April', v: '04' }, { l: 'Mei', v: '05' }, { l: 'Juni', v: '06' },
    { l: 'Juli', v: '07' }, { l: 'Agustus', v: '08' }, { l: 'September', v: '09' },
    { l: 'Oktober', v: '10' }, { l: 'November', v: '11' }, { l: 'Desember', v: '12' }
  ];

  useEffect(() => {
    fetchData();
  }, [filterDate.day, filterDate.month, filterDate.year, selectedClass]);

  const fetchData = async () => {
    try {
      const classRes = await db.getAllAsync("SELECT DISTINCT class FROM students WHERE class IS NOT NULL ORDER BY class ASC");
      setClasses(['Semua Kelas', ...classRes.map(c => c.class)]);

      // Query diperkuat dengan TRIM dan CAST untuk memastikan JOIN sukses
      let query = `
        SELECT 
          IFNULL(s.name, 'Siswa Tidak Terdaftar') as name, 
          IFNULL(s.nisn, '-') as nisn,
          IFNULL(s.class, '-') as class, 
          a.nis,
          date(a.timestamp, 'localtime') as date_only,
          MAX(CASE WHEN a.session = 'masuk' THEN time(a.timestamp, 'localtime') END) as jam_masuk,
          MAX(CASE WHEN a.session = 'pulang' THEN time(a.timestamp, 'localtime') END) as jam_pulang
        FROM attendance_logs a 
        LEFT JOIN students s ON TRIM(CAST(a.nis AS TEXT)) = TRIM(CAST(s.nis AS TEXT))
        WHERE 1=1
      `;

      if (filterDate.year !== 'Semua') query += ` AND strftime('%Y', a.timestamp, 'localtime') = '${filterDate.year}'`;
      if (filterDate.month !== 'Semua') query += ` AND strftime('%m', a.timestamp, 'localtime') = '${filterDate.month}'`;
      if (filterDate.day !== 'Semua') query += ` AND strftime('%d', a.timestamp, 'localtime') = '${filterDate.day.padStart(2, '0')}'`;
      if (selectedClass !== 'Semua Kelas') query += ` AND s.class = '${selectedClass}'`;

      query += ` GROUP BY a.nis, date_only ORDER BY date_only DESC, jam_masuk DESC`;

      const results = await db.getAllAsync(query);
      setLogs(results || []);
      setFilteredLogs(results || []);
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Gagal memuat data.");
    }
  };

  // Filter Logic dengan Proteksi Null (Mencegah toLowerCase error)
  useEffect(() => {
    const res = logs.filter(item => {
      const sName = item.name ? item.name.toLowerCase() : '';
      const sNis = item.nis ? item.nis.toString() : '';
      const sNisn = item.nisn ? item.nisn.toString() : '';
      const search = searchText.toLowerCase();

      return sName.includes(search) || sNis.includes(search) || sNisn.includes(search);
    });
    setFilteredLogs([...res]);
  }, [searchText, logs]);

  const exportPDF = async () => {
    if (filteredLogs.length === 0) return Alert.alert("Kosong", "Tidak ada data.");
    
    const tableRows = filteredLogs.map((item, index) => `
      <tr>
        <td style="text-align:center">${index + 1}</td>
        <td>${item.date_only}</td>
        <td>${item.nis} / ${item.nisn}</td>
        <td>${item.name}</td>
        <td>${item.class}</td>
        <td style="text-align:center">${item.jam_masuk || '-'}</td>
        <td style="text-align:center">${item.jam_pulang || '-'}</td>
      </tr>
    `).join('');

    const html = `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; padding: 10px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #444; padding: 8px; font-size: 10px; }
            th { background-color: #f2f2f2; }
          </style>
        </head>
        <body>
          <div class="header">
            <h3>LAPORAN PRESENSI SISWA</h3>
            <p>Periode: ${filterDate.day}-${filterDate.month}-${filterDate.year} | Kelas: ${selectedClass}</p>
          </div>
          <table>
            <tr><th>No</th><th>Tanggal</th><th>NIS / NISN</th><th>Nama Siswa</th><th>Kelas</th><th>Masuk</th><th>Pulang</th></tr>
            ${tableRows}
          </table>
        </body>
      </html>
    `;
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri);
  };
  // 2. Auto Refresh setiap 30 detik
  useEffect(() => {
    
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);
const renderLogItem = ({ item }) => (
  <Card style={styles.logCard}>
    <View style={styles.logRow}>
      <View style={[styles.statusIndicator, { backgroundColor: item.jam_pulang ? Theme.success : Theme.primary }]} />
      
      {/* Container utama untuk teks */}
      <View style={styles.logInfo}>
        <Text style={[styles.studentName, item.name === 'Siswa Tidak Terdaftar' && {color: Theme.danger}]} numberOfLines={1}>
          {item.name || "Nama Tidak Terdeteksi"}
        </Text>
        <Text style={styles.subInfo}>
          {item.nis || "-"} • NISN: {item.nisn || "-"}
        </Text>
        <Text style={styles.dateInfo}>
          Kelas {item.class || "-"} • {item.date_only}
        </Text>
      </View>

      {/* Container untuk Jam (di sisi kanan) */}
      <View style={styles.timeContainer}>
        <View style={styles.timeBox}>
          <Text style={styles.timeLabel}>MASUK</Text>
          <Text style={styles.timeValue}>{item.jam_masuk?.substring(0,5) || '--:--'}</Text>
        </View>
        <View style={styles.timeBox}>
          <Text style={styles.timeLabel}>PULANG</Text>
          <Text style={styles.timeValue}>{item.jam_pulang?.substring(0,5) || '--:--'}</Text>
        </View>
      </View>
    </View>
  </Card>
);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Laporan</Text>
        <TouchableOpacity style={styles.pdfBtn} onPress={exportPDF}>
          <FileText color="#FFF" size={20} />
          <Text style={{color: '#FFF', fontWeight: 'bold', marginLeft: 5}}>PDF</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.searchBar}>
          <Search color={Theme.textMuted} size={16} />
          <TextInput 
            placeholder="Cari Nama / NIS / NISN..." 
            placeholderTextColor={Theme.textMuted} 
            style={styles.searchInput} 
            value={searchText} 
            onChangeText={setSearchText} 
          />
          {searchText ? <TouchableOpacity onPress={() => setSearchText('')}><X size={16} color={Theme.textMuted}/></TouchableOpacity> : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.dropdownTrigger, {flex: 1}]} onPress={() => setShowClassModal(true)}>
            <Users size={14} color={Theme.primary} />
            <Text style={styles.dropdownValue} numberOfLines={1}>{selectedClass}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dropdownTrigger, {flex: 1.2}]} onPress={() => setShowDateModal(true)}>
            <Calendar size={14} color={Theme.primary} />
            <Text style={styles.dropdownValue}>
              {filterDate.day !== 'Semua' ? `${filterDate.day}/` : ''}
              {filterDate.month !== 'Semua' ? `${filterDate.month}/` : ''}
              {filterDate.year}
            </Text>
            <Filter size={12} color={Theme.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        data={filteredLogs}
        keyExtractor={(item, index) => index.toString()}
        renderItem={renderLogItem}
        extraData={filteredLogs} // Memaksa re-render jika data filter berubah
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>Data tidak ditemukan.</Text>}
      />

      <Modal visible={showClassModal} transparent animationType="slide">
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

      <Modal visible={showDateModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Filter Waktu</Text>
            <Text style={styles.label}>Tahun</Text>
            <TextInput style={styles.inputModal} keyboardType="numeric" value={filterDate.year} onChangeText={(v) => setFilterDate({...filterDate, year: v})} />
            <Text style={[styles.label, {marginTop: 15}]}>Bulan</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{flexDirection: 'row'}}>
                <TouchableOpacity style={[styles.chip, filterDate.month === 'Semua' && styles.chipActive]} onPress={() => setFilterDate({...filterDate, month: 'Semua'})}>
                  <Text style={[styles.chipText, filterDate.month === 'Semua' && {color: '#000'}]}>Semua</Text>
                </TouchableOpacity>
                {months.map(m => (
                  <TouchableOpacity key={m.v} style={[styles.chip, filterDate.month === m.v && styles.chipActive]} onPress={() => setFilterDate({...filterDate, month: m.v})}>
                    <Text style={[styles.chipText, filterDate.month === m.v && {color: '#000'}]}>{m.l}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <Text style={[styles.label, {marginTop: 15}]}>Tanggal (Opsional)</Text>
            <TextInput style={styles.inputModal} placeholder="Semua" placeholderTextColor="#555" keyboardType="numeric" value={filterDate.day === 'Semua' ? '' : filterDate.day} onChangeText={(v) => setFilterDate({...filterDate, day: v || 'Semua'})} />
            <TouchableOpacity style={styles.applyBtn} onPress={() => setShowDateModal(false)}>
                <Text style={{fontWeight: 'bold', fontSize: 16, color: '#000'}}>Terapkan Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { padding: 20, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: Theme.textMain, fontSize: 26, fontWeight: '900' },
  pdfBtn: { backgroundColor: '#e74c3c', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
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
    minHeight: 90, // Beri ruang vertikal yang cukup
    width: '100%' 
  },
  statusIndicator: { 
    width: 6, 
    height: '100%' 
  },
  logInfo: { 
    flex: 1, // WAJIB: Agar teks mengambil ruang tengah
    paddingHorizontal: 15, 
    justifyContent: 'center',
    paddingVertical: 10
  },
  studentName: { 
    color: '#ffffff', 
    fontSize: 16, 
    fontWeight: 'bold',
    marginBottom: 2
  },
  subInfo: { 
    color: Theme.primary, 
    fontSize: 12, 
    fontWeight: '600' 
  },
  dateInfo: { 
    color: Theme.textMuted, 
    fontSize: 11, 
    marginTop: 2 
  },
  timeContainer: { 
    flexDirection: 'row', 
    gap: 8, 
    paddingRight: 15, 
    alignItems: 'center' 
  },
  timeBox: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', padding: 6, borderRadius: 8, minWidth: 52 },
  timeLabel: { fontSize: 7, color: Theme.textMuted, fontWeight: 'bold' },
  timeValue: { fontSize: 12, color: Theme.textMain, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: Theme.card, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 25 },
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