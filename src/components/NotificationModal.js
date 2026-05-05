import { BellOff, ChevronRight, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { db } from '../database/sqlite'; // ✅ Fix: import db
import { supabase } from '../database/supabase';

// ✅ Tambah prop `role` dan `userId`
export default function NotificationModal({ visible, onClose, onUpdateCount, role, userId }) {
    const [notifs, setNotifs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedNotif, setSelectedNotif] = useState(null);

    useEffect(() => {
        if (visible) fetchNotifications();
    }, [visible]);

    // ✅ Fix: filter by user_id agar notif tidak bocor antar user
    const fetchNotifications = async () => {
        if (!userId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (!error) setNotifs(data || []);
        } catch (e) {
            console.error('fetchNotifications error:', e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRead = async (item) => {
        try {
            // Ambil detail dari permission_requests jika ada requestId
            let requestData = null;
            if (item.data?.requestId) {
                const { data, error } = await supabase
                    .from('permission_requests')
                    .select('start_date, end_date, student_name, student_nis, reason')
                    .eq('id', item.data.requestId)
                    .single();

                if (!error) requestData = data;
            }

            setSelectedNotif({ ...item, dates: requestData });

            // Tandai sudah dibaca
            if (!item.is_read) {
                const { error } = await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('id', item.id);

                if (!error) {
                    onUpdateCount?.();
                    fetchNotifications();
                }
            }
        } catch (err) {
            console.error('HandleRead Error:', err);
        }
    };

    const updateStatus = async (status) => {
        const { requestId, nis } = selectedNotif?.data || {};
        const { start_date, end_date } = selectedNotif?.dates || {};

        if (!requestId) return;

        try {
            // 1. Update status di Supabase
            const { error: supabaseError } = await supabase
                .from('permission_requests')
                .update({ status })
                .eq('id', requestId);

            if (supabaseError) throw supabaseError;

            // 2. Jika approved, catat ke SQLite lokal per tanggal
            if (status === 'approved' && nis && start_date && end_date) {
                const statusType = selectedNotif.title?.toLowerCase().includes('sakit') ? 'SAKIT' : 'IZIN';

                let current = new Date(start_date);
                const last = new Date(end_date);

                while (current <= last) {
                    const dateStr = current.toISOString().split('T')[0];
                    for (const session of ['masuk', 'pulang']) {
                        const manualTime = `${dateStr} ${session === 'masuk' ? '07:00:00' : '16:00:00'}`;
                        await db.runAsync(
                            'INSERT INTO attendance_logs (nis, status, session, timestamp, synced) VALUES (?, ?, ?, ?, ?)',
                            [nis, statusType, session, manualTime, 0]
                        );
                    }
                    current.setDate(current.getDate() + 1);
                }
            }

            Toast.show({
                type: 'success',
                text1: `Izin ${status === 'approved' ? 'Disetujui ✅' : 'Ditolak ❌'}`,
                text2: status === 'approved' ? 'Log absensi otomatis dicatat.' : '',
            });

            setSelectedNotif(null);
            fetchNotifications();
            onUpdateCount?.();

        } catch (error) {
            console.error('Update Status Error:', error.message);
            Toast.show({
                type: 'error',
                text1: 'Gagal Memproses',
                text2: 'Terjadi kesalahan sistem atau koneksi.',
            });
        }
    };

    // ✅ Cek apakah notif ini adalah notif izin yang bisa di-approve
    const isIzinNotif = (notif) => !!notif?.data?.requestId;

    // ✅ Cek apakah status izin masih pending (belum diproses)
    const isPending = (notif) => {
        const status = notif?.data?.status;
        return !status || status === 'pending';
    };

    return (
        <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>Notifikasi</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color="#333" />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
                    ) : (
                        <FlatList
                            data={notifs}
                            keyExtractor={(item) => item.id.toString()}
                            ListEmptyComponent={
                                <View style={styles.empty}>
                                    <BellOff size={40} color="#ccc" />
                                    <Text style={{ color: '#aaa', marginTop: 10 }}>
                                        Belum ada pemberitahuan
                                    </Text>
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
                                        <Text style={styles.timeText}>
                                            {new Date(item.created_at).toLocaleString('id-ID')}
                                        </Text>
                                    </View>
                                    {/* ✅ Badge pending hanya untuk guru & notif izin */}
                                    {role === 'guru' && isIzinNotif(item) && isPending(item) && (
                                        <View style={styles.pendingBadge}>
                                            <Text style={styles.pendingText}>Pending</Text>
                                        </View>
                                    )}
                                    <ChevronRight size={18} color="#ccc" style={{ marginLeft: 8 }} />
                                </TouchableOpacity>
                            )}
                        />
                    )}

                    {/* SUB-MODAL: DETAIL IZIN */}
                    {selectedNotif && (
                        <Modal animationType="fade" transparent visible={!!selectedNotif}>
                            <View style={styles.subOverlay}>
                                <View style={styles.detailContent}>
                                    <TouchableOpacity
                                        style={styles.backBtn}
                                        onPress={() => setSelectedNotif(null)}
                                    >
                                        <X size={20} color="#fff" />
                                    </TouchableOpacity>

                                    <ScrollView>
                                        {selectedNotif.data?.imageUrl ? (
                                            <Image
                                                source={{ uri: selectedNotif.data.imageUrl }}
                                                style={styles.detailImg}
                                                resizeMode="contain"
                                            />
                                        ) : (
                                            <View style={styles.noImg}>
                                                <Text style={{ color: '#888' }}>Tidak ada foto lampiran</Text>
                                            </View>
                                        )}

                                        <View style={{ padding: 20 }}>
                                            <Text style={styles.label}>Nama Santri</Text>
                                            <Text style={styles.value}>
                                                {selectedNotif.dates?.student_name || '-'}{' '}
                                                <Text style={{ color: '#888', fontSize: 13 }}>
                                                    ({selectedNotif.dates?.student_nis || '-'})
                                                </Text>
                                            </Text>

                                            <View style={styles.dateRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.label}>Mulai</Text>
                                                    <Text style={styles.value}>
                                                        {selectedNotif.dates?.start_date || '-'}
                                                    </Text>
                                                </View>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.label}>Sampai</Text>
                                                    <Text style={styles.value}>
                                                        {selectedNotif.dates?.end_date || '-'}
                                                    </Text>
                                                </View>
                                            </View>

                                            <Text style={styles.label}>Keperluan</Text>
                                            <Text style={styles.value}>
                                                {selectedNotif.dates?.reason || '-'}
                                            </Text>
                                        </View>
                                    </ScrollView>

                                    {/* ✅ Tombol Approve/Tolak HANYA untuk guru & notif izin pending */}
                                    {role === 'guru' && isIzinNotif(selectedNotif) && isPending(selectedNotif) && (
                                        <View style={styles.modalFooter}>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.rejectBtn]}
                                                onPress={() => updateStatus('rejected')}
                                            >
                                                <Text style={styles.btnText}>Tolak</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.actionBtn, styles.approveBtn]}
                                                onPress={() => updateStatus('approved')}
                                            >
                                                <Text style={styles.btnText}>Setujui</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* ✅ Kalau sudah diproses, tampilkan status saja */}
                                    {role === 'guru' && isIzinNotif(selectedNotif) && !isPending(selectedNotif) && (
                                        <View style={styles.modalFooter}>
                                            <View style={[
                                                styles.statusBadge,
                                                {
                                                    backgroundColor: selectedNotif.data?.status === 'approved'
                                                        ? '#e8f5e9' : '#ffeaea'
                                                }
                                            ]}>
                                                <Text style={[
                                                    styles.statusText,
                                                    {
                                                        color: selectedNotif.data?.status === 'approved'
                                                            ? '#34C759' : '#FF3B30'
                                                    }
                                                ]}>
                                                    {selectedNotif.data?.status === 'approved'
                                                        ? '✅ Sudah Disetujui'
                                                        : '❌ Sudah Ditolak'}
                                                </Text>
                                            </View>
                                        </View>
                                    )}
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
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: '#fff',
        height: '80%',
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
        paddingBottom: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        alignItems: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    closeBtn: { padding: 4 },

    card: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    unreadCard: { backgroundColor: '#f0f7ff' },
    titleText: { fontWeight: 'bold', fontSize: 15, color: '#222' },
    bodyText: { color: '#666', fontSize: 13, marginTop: 2 },
    timeText: { color: '#aaa', fontSize: 11, marginTop: 5 },

    pendingBadge: {
        backgroundColor: '#FFF3CD',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        marginRight: 6,
    },
    pendingText: { color: '#856404', fontSize: 10, fontWeight: '700' },

    empty: { alignItems: 'center', marginTop: 50 },

    subOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    detailContent: {
        width: '90%',
        height: '75%',
        backgroundColor: '#fff',
        borderRadius: 15,
        overflow: 'hidden',
    },
    detailImg: { width: '100%', height: 250, backgroundColor: '#000' },
    noImg: {
        width: '100%',
        height: 150,
        backgroundColor: '#eee',
        justifyContent: 'center',
        alignItems: 'center',
    },
    backBtn: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 10,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 20,
        padding: 5,
    },
    dateRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
        backgroundColor: '#f9f9f9',
        padding: 10,
        borderRadius: 8,
    },
    label: { fontSize: 12, color: '#888', marginBottom: 2 },
    value: { fontSize: 15, fontWeight: 'bold', marginBottom: 10, color: '#333' },

    modalFooter: {
        flexDirection: 'row',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: '#eee',
        gap: 10,
    },
    actionBtn: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    approveBtn: { backgroundColor: '#34C759' },
    rejectBtn: { backgroundColor: '#FF3B30' },
    btnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

    statusBadge: {
        flex: 1,
        paddingVertical: 13,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusText: { fontWeight: 'bold', fontSize: 14 },
});