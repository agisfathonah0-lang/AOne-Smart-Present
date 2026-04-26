import { BellOff, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { supabase } from '../database/supabase'; // Sesuaikan path ini
export default function NotificationModal({ visible, onClose, onUpdateCount }) {
    const [notifs, setNotifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedNotif, setSelectedNotif] = useState(null);
    // Di dalam function NotificationModal
    // const updateStatus = async (status) => {
    //     if (!selectedNotif?.data?.requestId) return;

    //     try {
    //         const { error } = await supabase
    //             .from('permission_requests') // Ganti dengan nama tabel izin kamu jika berbeda
    //             .update({ status: status })
    //             .eq('id', selectedNotif.data.requestId);

    //         if (error) throw error;

    //         alert(`Izin berhasil di-${status}`);
    //         setSelectedNotif(null); // Tutup sub-modal detail
    //         fetchNotifications();    // Refresh list notif
    //     } catch (error) {
    //         console.error("Error updating status:", error.message);
    //         alert("Gagal memperbarui status izin");
    //     }
    // };
    const updateStatus = async (status) => {
        const { requestId, nis } = selectedNotif?.data || {};
        const { start_date, end_date } = selectedNotif?.dates || {};

        if (!requestId) return;

        try {
            // 1. Update status di Supabase (Online)
            const { error: supabaseError } = await supabase
                .from('permission_requests')
                .update({ status: status })
                .eq('id', requestId);

            if (supabaseError) throw supabaseError;

            // 2. Jika Approved, looping rentang tanggal dan simpan ke SQLite (Offline-First)
            if (status === 'approved' && nis && start_date && end_date) {
                // Cek apakah judul notif mengandung kata 'Sakit' atau 'Izin'
                // Atau kamu bisa kirim tipe dari Edge Function
                const statusType = selectedNotif.title.toLowerCase().includes('sakit') ? 'SAKIT' : 'IZIN';

                let current = new Date(start_date);
                const last = new Date(end_date);

                while (current <= last) {
                    const dateStr = current.toISOString().split('T')[0];
                    for (const s of ['masuk', 'pulang']) {
                        const manualTime = `${dateStr} ${s === 'masuk' ? '07:00:00' : '16:00:00'}`;
                        await db.runAsync(
                            'INSERT INTO attendance_logs (nis, status, session, timestamp, synced) VALUES (?, ?, ?, ?, ?)',
                            [nis, statusType, s, manualTime, 0]
                        );
                    }
                    current.setDate(current.getDate() + 1);
                }
            }

            // 3. Feedback & UI Cleanup
            Toast.show({
                type: 'success',
                text1: `Izin ${status === 'approved' ? 'Disetujui' : 'Ditolak'}`,
                text2: status === 'approved' ? 'Log absensi otomatis dicatat.' : ''
            });

            setSelectedNotif(null);
            fetchNotifications();
            if (onUpdateCount) onUpdateCount();

        } catch (error) {
            console.error("Update Status Error:", error.message);
            Toast.show({
                type: 'error',
                text1: 'Gagal Memproses',
                text2: 'Terjadi kesalahan sistem atau koneksi.'
            });
        }
    };
    useEffect(() => {
        if (visible) {
            fetchNotifications();
        }
    }, [visible]);

    const fetchNotifications = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false });
        setNotifs(data || []);
        setLoading(false);
    };

    // const handleRead = async (item) => {
    //     setSelectedNotif(item);
    //     if (!item.is_read) {
    //         await supabase.from('notifications').update({ is_read: true }).eq('id', item.id);
    //         onUpdateCount(); // Update angka di dashboard
    //         fetchNotifications(); // Refresh list
    //     }
    // };
    const handleRead = async (item) => {
        try {
            // 1. Ambil detail tambahan (tanggal) dari tabel permission_requests
            const { data: requestData, error: dateError } = await supabase
                .from('permission_requests')
                .select('start_date, end_date, student_name, student_nis, reason')
                .eq('id', item.data.requestId)
                .single();

            if (dateError) console.error("Gagal mengambil detail tanggal:", dateError.message);

            // 2. Gabungkan data notifikasi dengan data tanggal untuk ditampilkan di Modal
            setSelectedNotif({ ...item, dates: requestData });

            // 3. Jika belum dibaca, update status di DB dan refresh count di dashboard
            if (!item.is_read) {
                const { error: updateError } = await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('id', item.id);

                if (!updateError) {
                    onUpdateCount();      // Update angka di lonceng dashboard
                    fetchNotifications();  // Refresh daftar notif agar style "unread" hilang
                }
            }
        } catch (err) {
            console.error("HandleRead Error:", err);
        }
    };
    return (
        <Modal animationType="slide" transparent={true} visible={visible} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Notifikasi Izin</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={notifs}
                            keyExtractor={(item) => item.id}
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <BellOff size={40} color="#ccc" />
                                    <Text style={{ color: '#aaa', marginTop: 10 }}>Belum ada pemberitahuan</Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[styles.card, !item.is_read && styles.unreadCard]}
                                    onPress={() => handleRead(item)}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.titleText}>{item.title}</Text>
                                        <Text style={styles.bodyText} numberOfLines={1}>{item.body}</Text>
                                        <Text style={styles.timeText}>{new Date(item.created_at).toLocaleTimeString()}</Text>
                                    </View>
                                    <ChevronRight size={18} color="#ccc" />
                                </TouchableOpacity>
                            )}
                        />
                    )}

                    {/* SUB-MODAL: DETAIL IZIN & GAMBAR */}
                    {selectedNotif && (
                        <Modal animationType="fade" transparent={true} visible={!!selectedNotif}>
                            <View style={styles.subOverlay}>
                                <View style={styles.detailContent}>
                                    <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedNotif(null)}>
                                        <X size={20} color="#fff" />
                                    </TouchableOpacity>

                                    <ScrollView>
                                        {selectedNotif.data?.imageUrl ? (
                                            <Image source={{ uri: selectedNotif.data.imageUrl }} style={styles.detailImg} resizeMode="contain" />
                                        ) : (
                                            <View style={styles.noImg}><Text>Tidak ada foto lampiran</Text></View>
                                        )}

                                        <View style={{ padding: 20 }}>
                                            <Text style={styles.label}>Nama Santri</Text>
                                            <Text style={styles.value}>{selectedNotif.dates?.student_name} || {selectedNotif.dates?.student_nis}</Text>

                                            {/* TAMPILKAN TANGGAL DI SINI */}
                                            <View style={styles.dateRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.label}>Mulai</Text>
                                                    <Text style={styles.value}>{selectedNotif.dates?.start_date || '-'}</Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.label}>Sampai</Text>
                                                    <Text style={styles.value}>{selectedNotif.dates?.end_date || '-'}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.label}>Keperluan</Text>
                                            <Text style={styles.value}>{selectedNotif.dates?.reason}</Text>
                                        </View>
                                    </ScrollView>
                                    {/* TOMBOL APPROVE & REJECT */}
                                    <View style={styles.modalFooter}>
                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.rejectBtn]}
                                            onPress={() => updateStatus('rejected')}
                                        >
                                            <Text style={styles.btnText}>Reject</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.actionBtn, styles.approveBtn]}
                                            onPress={() => updateStatus('approved')}
                                        >
                                            <Text style={styles.btnText}>Approve</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </Modal>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    container: { backgroundColor: '#fff', height: '80%', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingBottom: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    card: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    unreadCard: { backgroundColor: '#f0f7ff' },
    titleText: { fontWeight: 'bold', fontSize: 15 },
    bodyText: { color: '#666', fontSize: 13, marginTop: 2 },
    timeText: { color: '#aaa', fontSize: 11, marginTop: 5 },
    empty: { alignItems: 'center', marginTop: 50 },

    subOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
    detailContent: { width: '90%', height: '70%', backgroundColor: '#fff', borderRadius: 15, overflow: 'hidden' },
    detailImg: { width: '100%', height: 300, backgroundColor: '#000' },
    noImg: { width: '100%', height: 200, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
    label: { fontSize: 12, color: '#888' },
    value: { fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: '#333' },
    backBtn: { position: 'absolute', top: 10, right: 10, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 5 },
    dateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 8,
    },
    label: {
        fontSize: 12,
        color: '#888',
        marginBottom: 2
    },
    value: {
        fontSize: 15,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333'
    },
    modalFooter: {
        flexDirection: 'row',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    approveBtn: {
        backgroundColor: '#34C759', // Hijau iOS
    },
    rejectBtn: {
        backgroundColor: '#FF3B30', // Merah iOS
    },
    btnText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 15,
    },
});