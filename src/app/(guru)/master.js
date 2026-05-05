import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Download, GraduationCap, Printer, QrCode, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import GlassmorphicBox from '../../components/GlassmorphicBox';
import { LocalDB } from '../../database/sqlite';
import { useAuth } from '../../services/AuthContext';
import { Theme } from '../../theme/colors';

export default function GuruMasterScreen() {
  const { user } = useAuth();

  const guruClasses = user?.classes || [];
  const kelasDiampu = guruClasses[0] || null;
  const kelasLabel = guruClasses.join(', ') || '-';

  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCardVisible, setIsCardVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      // ✅ Hanya ambil siswa dari kelas diampu guru
      const data = kelasDiampu
        ? await LocalDB.getStudentsByClass(kelasDiampu)
        : [];
      setStudents(data || []);
      setFilteredStudents(data || []);
    } catch (e) {
      console.error('Load data error:', e);
    }
  };

  const applySearch = (query) => {
    setSearchQuery(query);
    if (!query) {
      setFilteredStudents(students);
      return;
    }
    const filtered = students.filter(s =>
      s.name.toLowerCase().includes(query.toLowerCase()) ||
      (s.nisn && s.nisn.includes(query)) ||
      (s.nis && s.nis.includes(query))
    );
    setFilteredStudents(filtered);
  };

  // ✅ Print PDF kartu siswa — hanya kelas diampu
  const handleBulkPrint = async () => {
    if (filteredStudents.length === 0) {
      return Alert.alert('Kosong', 'Tidak ada data siswa untuk dicetak.');
    }

    Alert.alert(
      'Cetak Kartu',
      `Generate PDF untuk ${filteredStudents.length} siswa kelas ${kelasDiampu}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Cetak PDF',
          onPress: async () => {
            try {
              const cardsHtml = filteredStudents.map(s => `
                <div class="card">
                  <div class="header">
                    <div class="brand">PONPES MIFTAHUL ULUM SAROLANGUN</div>
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

              const html = `
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
                    <h2 style="text-align:center;">DATA KARTU SISWA - KELAS ${kelasDiampu}</h2>
                    <div class="grid">${cardsHtml}</div>
                  </body>
                </html>
              `;
              const { uri } = await Print.printToFileAsync({ html });
              await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
            } catch (error) {
              Alert.alert('Error', 'Gagal membuat PDF: ' + error.message);
            }
          },
        },
      ]
    );
  };

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

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Data Siswa</Text>
          {/* ✅ Badge kelas + jumlah siswa */}
          <View style={styles.kelasBadge}>
            <GraduationCap size={12} color={Theme.primary} />
            <Text style={styles.kelasText}>Kelas {kelasLabel}</Text>
            <Text style={styles.dot}>•</Text>
            <Text style={styles.subtitle}>{filteredStudents.length} Siswa</Text>
          </View>
        </View>
        {/* ✅ Hanya tombol print, tidak ada import/tambah */}
        <TouchableOpacity style={styles.iconCircle} onPress={handleBulkPrint}>
          <Printer color={Theme.primary} size={20} />
        </TouchableOpacity>
      </View>

      {/* SEARCH */}
      <View style={styles.filterArea}>
        <GlassmorphicBox intensity={10} style={styles.searchBox}>
          <Search color={Theme.textMuted} size={18} />
          <TextInput
            placeholder="Cari nama/NISN..."
            placeholderTextColor={Theme.textMuted}
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={applySearch}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => applySearch('')}>
              <X size={16} color={Theme.textMuted} />
            </TouchableOpacity>
          ) : null}
        </GlassmorphicBox>
      </View>

      {/* TABLE HEADER — tanpa kolom OPSI/hapus */}
      <View style={styles.tableHeader}>
        <Text style={[styles.hCell, { flex: 0.8 }]}>NISN</Text>
        <Text style={[styles.hCell, { flex: 1.8 }]}>NAMA SISWA</Text>
        <Text style={[styles.hCell, { flex: 0.6 }]}>GENDER</Text>
        <Text style={[styles.hCell, { flex: 0.5, textAlign: 'right' }]}>QR</Text>
      </View>

      {/* TABLE BODY */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.nis}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.tableRow}
            onPress={() => { setSelectedStudent(item); setIsCardVisible(true); }}
          >
            <Text style={[styles.cell, { flex: 0.8 }]}>{item.nisn}</Text>
            <Text style={[styles.cell, { flex: 1.8, fontWeight: 'bold' }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.cell, { flex: 0.6 }]}>{item.gender}</Text>
            {/* ✅ Ikon QR untuk lihat kartu */}
            <View style={[styles.cell, { flex: 0.5, alignItems: 'flex-end' }]}>
              <QrCode color={Theme.primary} size={16} />
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Data tidak ditemukan</Text>
        }
      />

      {/* MODAL ID CARD — view only, tanpa edit */}
      <Modal visible={isCardVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          {selectedStudent && (
            <View style={{ alignItems: 'center' }}>
              {/* ID Card */}
              <GlassmorphicBox intensity={60} style={styles.idCard}>
                <View style={styles.idCardHeader}>
                  <View style={styles.logoCircle}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold', color: Theme.primary }}>AOne</Text>
                  </View>
                  <Text style={styles.cardBrand}>PONPES MIFTAHUL ULUM</Text>
                </View>
                <View style={styles.idCardBody}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardName}>{selectedStudent.name.toUpperCase()}</Text>
                    <Text style={styles.cardNisn}>NISN: {selectedStudent.nisn}</Text>
                    <Text style={styles.cardClass}>
                      Kelas: {selectedStudent.class} | Kamar: {selectedStudent.room}
                    </Text>
                  </View>
                  <View style={styles.qrBox}>
                    <QrCode color="#000" size={50} />
                  </View>
                </View>
              </GlassmorphicBox>

              {/* ✅ Tombol: Print kartu 1 siswa + Tutup (tanpa tombol edit/hapus) */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.downloadBtn}
                  onPress={async () => {
                    try {
                      const s = selectedStudent;
                      const html = `
                        <html>
                          <head>
                            <style>
                              body { font-family: 'Helvetica', sans-serif; display: flex; justify-content: center; padding: 40px; }
                              .card { 
                                width: 320px; height: 180px; 
                                border: 2px solid #004D40; border-radius: 12px;
                                padding: 15px; background: #fff;
                                border-left: 10px solid #008080;
                              }
                              .header { border-bottom: 1px solid #eee; padding-bottom: 8px; margin-bottom: 10px; }
                              .brand { font-size: 10px; font-weight: bold; color: #004D40; }
                              .body { display: flex; justify-content: space-between; align-items: flex-end; }
                              .name { font-size: 14px; font-weight: 900; color: #333; margin-bottom: 5px; }
                              .detail { font-size: 10px; color: #555; }
                              img { width: 60px; height: 60px; }
                            </style>
                          </head>
                          <body>
                            <div class="card">
                              <div class="header">
                                <div class="brand">PONPES MIFTAHUL ULUM SAROLANGUN</div>
                              </div>
                              <div class="body">
                                <div>
                                  <div class="name">${s.name.toUpperCase()}</div>
                                  <div class="detail">NISN: ${s.nisn}</div>
                                  <div class="detail">Kelas: ${s.class} | Kamar: ${s.room}</div>
                                </div>
                                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${s.nisn}" />
                              </div>
                            </div>
                          </body>
                        </html>
                      `;
                      const { uri } = await Print.printToFileAsync({ html });
                      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
                    } catch (e) {
                      Alert.alert('Error', 'Gagal print kartu.');
                    }
                  }}
                >
                  <Download color="#FFF" size={18} />
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Print Kartu</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={() => setIsCardVisible(false)}
                >
                  <Text style={{ color: '#FFF', fontWeight: 'bold' }}>Tutup</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.background },

  header: {
    padding: 25,
    paddingTop: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: { color: '#FFF', fontSize: 26, fontWeight: '900' },
  kelasBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  kelasText: { color: Theme.primary, fontSize: 12, fontWeight: '800' },
  dot: { color: Theme.textMuted, fontSize: 12 },
  subtitle: { color: Theme.textMuted, fontSize: 12 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },

  filterArea: { paddingHorizontal: 25, marginBottom: 20 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 15, height: 45, borderRadius: 15,
  },
  searchInput: { flex: 1, marginLeft: 10, color: '#FFF' },

  tableHeader: {
    flexDirection: 'row', paddingHorizontal: 25,
    paddingVertical: 12, borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  hCell: { color: Theme.primary, fontSize: 11, fontWeight: '900' },
  tableRow: {
    flexDirection: 'row', paddingHorizontal: 25,
    paddingVertical: 15, borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)', alignItems: 'center',
  },
  cell: { color: '#EEE', fontSize: 13 },

  emptyText: { textAlign: 'center', color: Theme.textMuted, marginTop: 40, lineHeight: 24 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center', alignItems: 'center', padding: 25,
  },
  idCard: {
    width: 320, height: 180, padding: 20,
    backgroundColor: '#004D40', borderRadius: 20,
    borderLeftWidth: 8, borderLeftColor: Theme.primary,
  },
  idCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 },
  logoCircle: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center',
  },
  cardBrand: { color: '#FFF', fontWeight: 'bold', fontSize: 12 },
  idCardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flex: 1 },
  cardName: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  cardNisn: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  cardClass: { color: Theme.primary, fontSize: 11, fontWeight: 'bold' },
  qrBox: { backgroundColor: '#FFF', padding: 5, borderRadius: 8 },

  cardActions: { flexDirection: 'row', gap: 10, marginTop: 20, width: 320 },
  downloadBtn: {
    flex: 2, backgroundColor: Theme.success, padding: 15, borderRadius: 15,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  closeBtn: {
    flex: 1, backgroundColor: Theme.danger, padding: 15,
    borderRadius: 15, justifyContent: 'center', alignItems: 'center',
  },
});