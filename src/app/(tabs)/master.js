import { Buffer } from 'buffer';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Download, FileSpreadsheet, Plus, Printer, QrCode, Search, Trash2, UserPlus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import CustomAlert from '../../components/CustomAlert';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import { LocalDB } from '../../database/sqlite';
import { Theme } from '../../theme/colors';

export default function MasterDataScreen() {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [classList, setClassList] = useState(['Semua']);
  const [selectedClass, setSelectedClass] = useState('Semua');
  const [searchQuery, setSearchQuery] = useState('');

  // State UI
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCardVisible, setIsCardVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [form, setForm] = useState({ nisn: '', name: '', class: '', room: '', address: '', gender: '' });
// state alert
const [alertConfig, setAlertConfig] = useState({
  visible: false,
  title: '',
  message: '',
  type: 'success',
  onConfirm: () => {},
});
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const data = await LocalDB.getAllStudents();
      setStudents(data || []);

      // Generate Daftar Kelas unik untuk Filter
      const uniqueClasses = ['Semua', ...new Set(data.map(item => item.class).filter(Boolean))];
      setClassList(uniqueClasses);

      applyFilters(searchQuery, selectedClass, data);
    } catch (e) {
      console.error("Load data error:", e);
    }
  };

  const applyFilters = (search, className, allData = students) => {
    let filtered = allData;

    if (className !== 'Semua') {
      filtered = filtered.filter(s => s.class === className);
    }

    if (search) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        (s.nisn && s.nisn.includes(search))
      );
    }
    setFilteredStudents(filtered);
  };

  const handleSaveStudent = async () => {
    if (!form.nisn.trim() || !form.name.trim()) {
      return Alert.alert("Error", "NISN dan Nama wajib diisi!");
    }

    try {
      const payload = {
        nis: form.nisn.trim(),
        nisn: form.nisn.trim(),
        name: form.name.trim(),
        gender: form.gender.trim(),
        className: form.class || '-',
        room: form.room || '-',
        address: form.address || '-'
      };

      await LocalDB.addStudent(payload);
      setIsModalVisible(false);
      setForm({ nisn: '', name: '', class: '', room: '', address: '', gender: '' });
      loadData();
      Alert.alert("Sukses", "Data siswa berhasil disimpan.");
    } catch (error) {
      if (error.message.includes("UNIQUE constraint failed")) {
        Alert.alert("Gagal", "NISN sudah digunakan!");
      } else {
        Alert.alert("Database Error", error.message);
      }
    }
  };

const handleDelete = (nis, name) => {
  setAlertConfig({
    visible: true,
    title: "Hapus Data",
    message: `Hapus siswa ${name}? Data ini akan hilang dari penyimpanan lokal.`,
    type: "danger", // Akan mengaktifkan warna merah & lottie hapus
    onConfirm: async () => {
      await LocalDB.deleteStudent(nis);
      loadData();
      // Jangan lupa tutup alert setelah sukses
      setAlertConfig(prev => ({ ...prev, visible: false }));
    }
  });
};

  const handleBulkPrint = async () => {
    if (filteredStudents.length === 0) {
      return Alert.alert("Kosong", "Tidak ada data siswa untuk dicetak.");
    }

    Alert.alert(
      "Cetak Massal",
      `Generate PDF untuk ${filteredStudents.length} siswa kelas ${selectedClass}?`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Cetak PDF",
          onPress: async () => {
            try {
              const htmlContent = generateHTML();
              const { uri } = await Print.printToFileAsync({ html: htmlContent });
              await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            } catch (error) {
              Alert.alert("Error", "Gagal membuat PDF: " + error.message);
            }
          }
        }
      ]
    );
  };

  // Fungsi helper untuk generate HTML struktur kartu (Grid 2 kolom)
  const generateHTML = () => {
    const cardsHtml = filteredStudents.map(s => `
    <div class="card">
      <div class="header">
        <div class="brand">YAYASAN MUHAMMAD AL MUMTAZ</div>
        <div class="tagline">AOne Smart Present • Student Card</div>
      </div>
      <div class="body">
        <div class="info">
          <div class="name">${s.name.toUpperCase()}</div>
          <div class="detail">NISN: ${s.nisn}</div>
          <div class="detail">Kelas: ${s.class} | Kamar: ${s.room}</div>
        </div>
        <div class="qr-placeholder">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${s.nisn}" />
        </div>
      </div>
    </div>
  `).join('');
    return `
    <html>
      <head>
        <style>
          body { font-family: 'Helvetica', sans-serif; padding: 20px; }
          .grid { display: flex; flex-wrap: wrap; gap: 20px; justify-content: center; }
          .card { 
            width: 320px; height: 180px; 
            border: 2px solid #004D40; border-radius: 12px;
            padding: 15px; position: relative; background: #fff;
            page-break-inside: avoid; margin-bottom: 10px;
            border-left: 10px solid #008080;
          }
          .header { border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 10px; }
          .brand { font-size: 10px; font-weight: bold; color: #004D40; }
          .tagline { font-size: 7px; color: #666; }
          .body { display: flex; justify-content: space-between; align-items: flex-end; }
          .name { font-size: 14px; font-weight: 900; color: #333; margin-bottom: 5px; }
          .detail { font-size: 10px; color: #555; }
          .qr-placeholder img { width: 50px; height: 50px; }
        </style>
      </head>
      <body>
        <h2 style="text-align:center;">DATA KARTU SISWA - KELAS ${selectedClass}</h2>
        <div class="grid">${cardsHtml}</div>
      </body>
    </html>
  `;
  };
  const handleImportExcel = async () => {
    try {
      // Gunakan require jika import * as XLSX di atas masih menyebabkan undefined
      const XLSX = require('xlsx');

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'text/csv'
        ],
        copyToCacheDirectory: true
      });

      if (result.canceled || !result.assets) return;

      const fileUri = result.assets[0].uri;

      // 1. Baca file dengan string literal 'base64' (Menghindari EncodingType deprecated/undefined)
      const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'base64',
      });

      // 2. Konversi ke Buffer (Pastikan library 'buffer' sudah diimport di atas)
      const buffer = Buffer.from(fileBase64, 'base64');

      // 3. Parse dengan SheetJS menggunakan type 'buffer'
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      // 4. Konversi ke JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (!jsonData || jsonData.length === 0) {
        return Alert.alert("Gagal", "Format Excel tidak terbaca atau file kosong.");
      }

      // 5. Konfirmasi Simpan
      Alert.alert(
        "Konfirmasi",
        `Ditemukan ${jsonData.length} data. Impor sekarang?`,
        [
          { text: "Batal", style: "cancel" },
          {
            text: "Impor",
            onPress: async () => {
              let successCount = 0;
              for (const item of jsonData) {
                try {
                  // Gunakan mapping kolom yang fleksibel
                  const nisn = item.nisn || item.NISN || item.nis;
                  const nama = item.nama || item.name || item.NAMA;

                  if (nisn && nama) {
                    await LocalDB.addStudent({
                      nis: String(nisn),
                      nisn: String(nisn),
                      name: String(nama),
                      gender: String(gender),
                      className: String(item.kelas || item.class || '-'),
                      room: String(item.kamar || item.room || '-'),
                      address: String(item.alamat || item.address || '-')
                    });
                    successCount++;
                  }
                } catch (err) {
                  console.log("Gagal baris:", err.message);
                }
              }
              loadData(); // Refresh list siswa
              Alert.alert("Sukses", `${successCount} data berhasil diimpor.`);
            }
          }
        ]
      );

    } catch (error) {
      console.error("Import Error:", error);
      Alert.alert("Error", "Gagal memproses file. Pastikan file bukan shortcut/cloud link.");
    }
  };
  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Data Master</Text>
          <Text style={styles.subtitle}>{filteredStudents.length} Siswa Terdaftar</Text>
        </View>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconCircle} onPress={handleImportExcel}>
            <FileSpreadsheet color={Theme.success} size={20} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconCircle} onPress={handleBulkPrint}>
            <Printer color={Theme.primary} size={20} />
          </TouchableOpacity>
        </View>
      </View>

      {/* SEARCH & FILTER */}
      <View style={styles.filterArea}>
        <GlassmorphicBox intensity={10} style={styles.searchBox}>
          <Search color={Theme.textMuted} size={18} />
          <TextInput
            placeholder="Cari nama/NISN..."
            placeholderTextColor={Theme.textMuted}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={(t) => { setSearchQuery(t); applyFilters(t, selectedClass); }}
          />
        </GlassmorphicBox>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
          {classList.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.classBadge, selectedClass === c && styles.classBadgeActive]}
              onPress={() => { setSelectedClass(c); applyFilters(searchQuery, c); }}
            >
              <Text style={[styles.classText, selectedClass === c && styles.classTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* TABLE HEADER */}
      <View style={styles.tableHeader}>
        <Text style={[styles.hCell, { flex: 0.7 }]}>NISN</Text>
        <Text style={[styles.hCell, { flex: 1.5 }]}>NAMA SISWA</Text>
        <Text style={[styles.hCell, { flex: 0.6 }]}>KELAS</Text>
        <Text style={[styles.hCell, { flex: 0.6 }]}>GENDER</Text>
        <Text style={[styles.hCell, { flex: 0.5, textAlign: 'right' }]}>OPSI</Text>
      </View>

      {/* TABLE BODY */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.nis}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.tableRow} onPress={() => { setSelectedStudent(item); setIsCardVisible(true); }}>
            <Text style={[styles.cell, { flex: 0.7 }]}>{item.nisn}</Text>
            <Text style={[styles.cell, { flex: 1.5, fontWeight: 'bold' }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.cell, { flex: 0.6 }]}>{item.class}</Text>
            <Text style={[styles.cell, { flex: 0.6 }]}>{item.gender}</Text>
            <View style={[styles.cell, { flex: 0.5, flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }]}>
              <TouchableOpacity onPress={() => handleDelete(item.nis, item.name)}>
                <Trash2 color={Theme.danger} size={16} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.emptyText}>Data tidak ditemukan</Text>}
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setIsModalVisible(true)}>
        <Plus color={Theme.background} size={28} />
      </TouchableOpacity>

      {/* MODAL TAMBAH (Sama seperti sebelumnya namun disesuaikan desainnya) */}
      <Modal visible={isModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <GlassmorphicBox style={styles.modalContent} intensity={40}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Siswa Baru</Text>
              <TouchableOpacity onPress={() => setIsModalVisible(false)}><X color="#FFF" /></TouchableOpacity>
            </View>
            <TextInput placeholder="NISN (Wajib)" style={styles.input} placeholderTextColor="#888" onChangeText={(t) => setForm({ ...form, nisn: t })} keyboardType="numeric" />
            <TextInput placeholder="Nama Lengkap" style={styles.input} placeholderTextColor="#888" onChangeText={(t) => setForm({ ...form, name: t })} />
            <Text style={styles.label}>Jenis Kelamin</Text>
            <View style={styles.genderContainer}>
              <TouchableOpacity
                style={[styles.genderOption, form.gender === 'L' && styles.genderActive]}
                onPress={() => setForm({ ...form, gender: 'L' })}
              >
                <Text style={[styles.genderText, form.gender === 'L' && styles.genderTextActive]}>Laki-laki</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.genderOption, form.gender === 'P' && styles.genderActive]}
                onPress={() => setForm({ ...form, gender: 'P' })}
              >
                <Text style={[styles.genderText, form.gender === 'P' && styles.genderTextActive]}>Perempuan</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput placeholder="Kelas" style={[styles.input, { flex: 1 }]} placeholderTextColor="#888" onChangeText={(t) => setForm({ ...form, class: t })} />
              <TextInput placeholder="Kamar" style={[styles.input, { flex: 1 }]} placeholderTextColor="#888" onChangeText={(t) => setForm({ ...form, room: t })} />
            </View>
            <TextInput placeholder="Alamat" style={[styles.input, { height: 70 }]} multiline placeholderTextColor="#888" onChangeText={(t) => setForm({ ...form, address: t })} />
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveStudent}>
              <UserPlus color={Theme.background} size={20} />
              <Text style={styles.saveBtnText}>Simpan Data</Text>
            </TouchableOpacity>
          </GlassmorphicBox>
        </View>
      </Modal>

      {/* MODAL KARTU (ID CARD PREVIEW) */}
      <Modal visible={isCardVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          {selectedStudent && (
            <View style={{ alignItems: 'center' }}>
              <GlassmorphicBox intensity={60} style={styles.idCard}>
                <View style={styles.idCardHeader}>
                  <View style={styles.logoCircle}><Text style={{ fontSize: 8, fontWeight: 'bold', color: Theme.primary }}>AOne</Text></View>
                  <Text style={styles.cardBrand}>YAYASAN MUHAMMAD AL MUMTAZ</Text>
                </View>
                <View style={styles.idCardBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{selectedStudent.name.toUpperCase()}</Text>
                    <Text style={styles.cardNisn}>NISN: {selectedStudent.nisn}</Text>
                    <Text style={styles.cardClass}>Kelas: {selectedStudent.class} | Kamar: {selectedStudent.room}</Text>
                  </View>
                  <View style={styles.qrBox}>
                    <QrCode color="#000" size={50} />
                  </View>
                </View>
              </GlassmorphicBox>
              <View style={styles.cardActions}>
                <TouchableOpacity style={styles.downloadBtn}><Download color="#FFF" size={18} /><Text style={{ color: '#FFF' }}>Simpan</Text></TouchableOpacity>
                <TouchableOpacity style={styles.closeBtn} onPress={() => setIsCardVisible(false)}><Text style={{ color: '#FFF' }}>Tutup</Text></TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
      <CustomAlert 
       visible={alertConfig.visible}
       {...alertConfig} 
       onCancel={() => setAlertConfig({...alertConfig, visible: false})}
     />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },
  header: { padding: 25, paddingTop: 60, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: '#FFF', fontSize: 26, fontWeight: '900' },
  subtitle: { color: Theme.textMuted, fontSize: 13 },
  headerIcons: { flexDirection: 'row', gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  filterArea: { paddingHorizontal: 25, marginBottom: 20 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, height: 45, borderRadius: 15 },
  searchInput: { flex: 1, marginLeft: 10, color: '#FFF' },
  classScroll: { marginTop: 15 },
  classBadge: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  classBadgeActive: { backgroundColor: Theme.primary, borderColor: Theme.primary },
  classText: { color: Theme.textMuted, fontSize: 12, fontWeight: 'bold' },
  classTextActive: { color: Theme.background },

  tableHeader: { flexDirection: 'row', paddingHorizontal: 25, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  hCell: { color: Theme.primary, fontSize: 11, fontWeight: '900' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 25, paddingVertical: 15, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  cell: { color: '#EEE', fontSize: 13 },

  fab: { position: 'absolute', bottom: 70, right: 25, width: 60, height: 60, borderRadius: 30, backgroundColor: Theme.primary, justifyContent: 'center', alignItems: 'center', elevation: 10 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 25 },
  modalContent: { padding: 25, borderRadius: 25 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', padding: 15, borderRadius: 15, color: '#FFF', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  saveBtn: { backgroundColor: Theme.primary, padding: 18, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 10 },
  saveBtnText: { color: Theme.background, fontWeight: 'bold', fontSize: 16 },

  idCard: { width: 320, height: 180, padding: 20, backgroundColor: '#004D40', borderRadius: 20, borderLeftWidth: 8, borderLeftColor: Theme.primary },
  idCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  logoCircle: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  cardBrand: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  idCardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flex: 1 },
  cardName: { color: '#FFF', fontSize: 20, fontWeight: '900' },
  cardNisn: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  cardClass: { color: Theme.primary, fontSize: 11, fontWeight: 'bold' },
  qrBox: { backgroundColor: '#FFF', padding: 5, borderRadius: 8 },
  cardActions: { flexDirection: 'row', gap: 10, marginTop: 20, width: 320 },
  downloadBtn: { flex: 2, backgroundColor: Theme.success, padding: 15, borderRadius: 15, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  closeBtn: { flex: 1, backgroundColor: Theme.danger, padding: 15, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: Theme.textMuted, marginTop: 40 },
  label: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
    marginLeft: 5,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  genderContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15
  },
  genderOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  genderActive: {
    backgroundColor: Theme.primary, // Atau warna hijau/biru andalan Anda
    borderColor: Theme.primary,
  },
  genderText: {
    color: '#888',
    fontWeight: '800',
    fontSize: 13
  },
  genderTextActive: {
    color: '#000', // Warna teks saat aktif
  },
});