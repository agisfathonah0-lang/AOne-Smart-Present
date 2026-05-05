import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { CheckCircle2, ChevronLeft, Clock, FileText, Filter, Image as ImageIcon, XCircle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { db } from '../../database/sqlite';
import { supabase } from '../../database/supabase';
import { useAuth } from '../../services/AuthContext';
import { Theme, hexToRGBA } from '../../theme/colors';

const STATUS_FILTERS = ['Semua', 'pending', 'approved', 'rejected'];

const statusConfig = {
    pending: { label: 'Menunggu', color: '#FF9500', bg: hexToRGBA('#FF9500', 0.15), icon: Clock },
    approved: { label: 'Disetujui', color: '#34C759', bg: hexToRGBA('#34C759', 0.15), icon: CheckCircle2 },
    rejected: { label: 'Ditolak', color: '#FF3B30', bg: hexToRGBA('#FF3B30', 0.15), icon: XCircle },
};

export default function GuruIzinScreen() {
    const { user } = useAuth();
    const router = useRouter();

    const guruClasses = user?.classes || [];
    const kelasDiampu = guruClasses[0] || null;

    const [izinList, setIzinList] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeFilter, setActiveFilter] = useState('Semua');
    const [selectedIzin, setSelectedIzin] = useState(null);
    const [processing, setProcessing] = useState(false);

    // ── Fetch izin kelas diampu dari Supabase ────────────────
    const fetchIzin = async () => {
        if (!kelasDiampu) return;
        setLoading(true);
        try {
            let query = supabase
                .from('permission_requests')
                .select('*, students!inner(class, name)')
                .eq('students.class', kelasDiampu)
                .order('created_at', { ascending: false });

            if (activeFilter !== 'Semua') {
                query = query.eq('status', activeFilter);
            }

            const { data, error } = await query;
            if (!error) setIzinList(data || []);
        } catch (e) {
            console.error('fetchIzin error:', e.message);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchIzin();
        }, [activeFilter, kelasDiampu])
    );

    // ── Approve / Tolak ──────────────────────────────────────
    const updateStatus = async (status) => {
        if (!selectedIzin) return;
        setProcessing(true);
        try {
            // 1. Update status di Supabase
            const { error } = await supabase
                .from('permission_requests')
                .update({ status })
                .eq('id', selectedIzin.id);

            if (error) throw error;

            // 2. Jika approved, catat ke SQLite lokal
            if (status === 'approved' && selectedIzin.nis && selectedIzin.start_date && selectedIzin.end_date) {
                const statusType = selectedIzin.type?.toLowerCase().includes('sakit') ? 'SAKIT' : 'IZIN';

                let current = new Date(selectedIzin.start_date);
                const last = new Date(selectedIzin.end_date);

                while (current <= last) {
                    const dateStr = current.toISOString().split('T')[0];
                    for (const session of ['masuk', 'pulang']) {
                        const manualTime = `${dateStr} ${session === 'masuk' ? '07:00:00' : '16:00:00'}`;
                        await db.runAsync(
                            'INSERT OR IGNORE INTO attendance_logs (nis, status, session, timestamp, synced) VALUES (?, ?, ?, ?, ?)',
                            [selectedIzin.nis, statusType, session, manualTime, 0]
                        );
                    }
                    current.setDate(current.getDate() + 1);
                }
            }

            Toast.show({
                type: 'success',
                text1: status === 'approved' ? '✅ Izin Disetujui' : '❌ Izin Ditolak',
                text2: status === 'approved' ? 'Log absensi otomatis dicatat.' : '',
            });

            setSelectedIzin(null);
            fetchIzin();
        } catch (e) {
            console.error('updateStatus error:', e.message);
            Toast.show({
                type: 'error',
                text1: 'Gagal Memproses',
                text2: 'Cek koneksi internet kamu.',
            });
        } finally {
            setProcessing(false);
        }
    };

    // ── Hitung pending ───────────────────────────────────────
    const pendingCount = izinList.filter(i => i.status === 'pending').length;

    // ── Render item ──────────────────────────────────────────
    const renderItem = ({ item }) => {
        const cfg = statusConfig[item.status] || statusConfig.pending;
        const Icon = cfg.icon;

        return (
            <TouchableOpacity
                style={styles.card}
                onPress={() => setSelectedIzin(item)}
                activeOpacity={0.8}
            >
                {/* Garis kiri status */}
                <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />

                <View style={styles.cardBody}>
                    <View style={styles.cardTop}>
                        <Text style={styles.cardName} numberOfLines={1}>
                            {item.student_name || item.students?.name || '-'}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                            <Icon size={11} color={cfg.color} />
                            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
                        </View>
                    </View>

                    <Text style={styles.cardType}>{item.type || 'Izin'}</Text>

                    <View style={styles.cardBottom}>
                        <Text style={styles.cardDate}>
                            {item.start_date}
                            {item.end_date && item.end_date !== item.start_date
                                ? ` → ${item.end_date}`
                                : ''}
                        </Text>
                        {item.image_url && (
                            <View style={styles.imgIndicator}>
                                <ImageIcon size={11} color={Theme.textMuted} />
                                <Text style={styles.imgText}>Ada foto</Text>
                            </View>
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (!kelasDiampu) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <FileText size={60} color={Theme.textMuted} />
                <Text style={styles.emptyText}>
                    Kamu belum memiliki kelas yang diampu.{'\n'}Hubungi Admin.
                </Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* HEADER */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color={Theme.textMain} />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.title}>Pengajuan Izin</Text>
                    <Text style={styles.subtitle}>
                        Kelas {kelasDiampu}
                        {pendingCount > 0 && (
                            <Text style={{ color: '#FF9500' }}> • {pendingCount} menunggu</Text>
                        )}
                    </Text>
                </View>
            </View>

            {/* FILTER STATUS */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.filterContent}
            >
                <Filter size={14} color={Theme.textMuted} style={{ marginRight: 8, alignSelf: 'center' }} />
                {STATUS_FILTERS.map(f => {
                    const isActive = activeFilter === f;
                    const cfg = statusConfig[f];
                    return (
                        <TouchableOpacity
                            key={f}
                            style={[
                                styles.filterChip,
                                isActive && {
                                    backgroundColor: cfg ? cfg.bg : hexToRGBA(Theme.primary, 0.15),
                                    borderColor: cfg ? cfg.color : Theme.primary,
                                }
                            ]}
                            onPress={() => setActiveFilter(f)}
                        >
                            <Text style={[
                                styles.filterText,
                                isActive && { color: cfg ? cfg.color : Theme.primary, fontWeight: '800' }
                            ]}>
                                {cfg ? cfg.label : 'Semua'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {/* LIST */}
            {loading ? (
                <ActivityIndicator color={Theme.primary} style={{ marginTop: 50 }} />
            ) : (
                <FlatList
                    data={izinList}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <FileText size={50} color={Theme.textMuted} />
                            <Text style={styles.emptyText}>
                                {activeFilter === 'Semua'
                                    ? 'Belum ada pengajuan izin'
                                    : `Tidak ada izin ${statusConfig[activeFilter]?.label?.toLowerCase()}`}
                            </Text>
                        </View>
                    }
                />
            )}

            {/* MODAL DETAIL IZIN */}
            <Modal visible={!!selectedIzin} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <TouchableOpacity
                            style={styles.modalClose}
                            onPress={() => setSelectedIzin(null)}
                        >
                            <XCircle size={28} color={Theme.textMuted} />
                        </TouchableOpacity>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Foto lampiran */}
                            {selectedIzin?.image_url ? (
                                <Image
                                    source={{ uri: selectedIzin.image_url }}
                                    style={styles.detailImg}
                                    resizeMode="cover"
                                />
                            ) : (
                                <View style={styles.noImg}>
                                    <ImageIcon size={32} color={Theme.textMuted} />
                                    <Text style={{ color: Theme.textMuted, marginTop: 8, fontSize: 12 }}>
                                        Tidak ada foto lampiran
                                    </Text>
                                </View>
                            )}

                            <View style={styles.detailBody}>
                                {/* Status badge */}
                                {selectedIzin && (() => {
                                    const cfg = statusConfig[selectedIzin.status] || statusConfig.pending;
                                    const Icon = cfg.icon;
                                    return (
                                        <View style={[styles.detailStatusBadge, { backgroundColor: cfg.bg, borderColor: cfg.color }]}>
                                            <Icon size={14} color={cfg.color} />
                                            <Text style={[styles.detailStatusText, { color: cfg.color }]}>
                                                {cfg.label}
                                            </Text>
                                        </View>
                                    );
                                })()}

                                <Text style={styles.detailName}>
                                    {selectedIzin?.student_name || selectedIzin?.students?.name || '-'}
                                </Text>
                                <Text style={styles.detailNis}>NIS: {selectedIzin?.nis || '-'}</Text>

                                <View style={styles.infoRow}>
                                    <View style={styles.infoBox}>
                                        <Text style={styles.infoLabel}>Jenis</Text>
                                        <Text style={styles.infoValue}>{selectedIzin?.type || 'Izin'}</Text>
                                    </View>
                                    <View style={styles.infoBox}>
                                        <Text style={styles.infoLabel}>Mulai</Text>
                                        <Text style={styles.infoValue}>{selectedIzin?.start_date || '-'}</Text>
                                    </View>
                                    <View style={styles.infoBox}>
                                        <Text style={styles.infoLabel}>Sampai</Text>
                                        <Text style={styles.infoValue}>{selectedIzin?.end_date || '-'}</Text>
                                    </View>
                                </View>

                                <Text style={styles.infoLabel}>Alasan</Text>
                                <Text style={styles.reasonText}>
                                    {selectedIzin?.reason || '-'}
                                </Text>

                                <Text style={styles.infoLabel}>Diajukan</Text>
                                <Text style={styles.infoValue}>
                                    {selectedIzin?.created_at
                                        ? new Date(selectedIzin.created_at).toLocaleString('id-ID')
                                        : '-'}
                                </Text>
                            </View>
                        </ScrollView>

                        {/* Tombol aksi — hanya jika masih pending */}
                        {selectedIzin?.status === 'pending' && (
                            <View style={styles.modalFooter}>
                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.rejectBtn, processing && { opacity: 0.6 }]}
                                    onPress={() => updateStatus('rejected')}
                                    disabled={processing}
                                >
                                    <XCircle size={18} color="#fff" />
                                    <Text style={styles.btnText}>Tolak</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.actionBtn, styles.approveBtn, processing && { opacity: 0.6 }]}
                                    onPress={() => updateStatus('approved')}
                                    disabled={processing}
                                >
                                    <CheckCircle2 size={18} color="#fff" />
                                    <Text style={styles.btnText}>Setujui</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Theme.background },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 12,
    },
    backBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: hexToRGBA(Theme.card, 0.5),
        justifyContent: 'center', alignItems: 'center',
    },
    title: { color: Theme.textMain, fontSize: 22, fontWeight: '900' },
    subtitle: { color: Theme.textMuted, fontSize: 12, marginTop: 2 },

    filterScroll: { maxHeight: 50 },
    filterContent: {
        paddingHorizontal: 20,
        paddingBottom: 10,
        alignItems: 'center',
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        marginRight: 8,
    },
    filterText: { color: Theme.textMuted, fontSize: 12, fontWeight: '600' },

    listContent: { padding: 20, paddingBottom: 100 },

    card: {
        flexDirection: 'row',
        backgroundColor: Theme.card,
        borderRadius: 16,
        marginBottom: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    cardAccent: { width: 5 },
    cardBody: { flex: 1, padding: 14 },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    cardName: { color: Theme.textMain, fontSize: 15, fontWeight: '800', flex: 1, marginRight: 8 },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    },
    statusText: { fontSize: 10, fontWeight: '700' },
    cardType: { color: Theme.textMuted, fontSize: 12, marginBottom: 8 },
    cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    cardDate: { color: Theme.primary, fontSize: 11, fontWeight: '700' },
    imgIndicator: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    imgText: { color: Theme.textMuted, fontSize: 10 },

    emptyContainer: { alignItems: 'center', marginTop: 80 },
    emptyText: { color: Theme.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 22, fontSize: 13 },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Theme.card,
        borderTopLeftRadius: 28, borderTopRightRadius: 28,
        maxHeight: '90%', overflow: 'hidden',
    },
    modalClose: {
        position: 'absolute', top: 14, right: 16, zIndex: 10,
    },
    detailImg: { width: '100%', height: 240, backgroundColor: '#000' },
    noImg: {
        width: '100%', height: 140,
        backgroundColor: 'rgba(255,255,255,0.04)',
        justifyContent: 'center', alignItems: 'center',
    },
    detailBody: { padding: 20 },
    detailStatusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 12, paddingVertical: 5,
        borderRadius: 12, borderWidth: 1,
        marginBottom: 14,
    },
    detailStatusText: { fontSize: 12, fontWeight: '800' },
    detailName: { color: Theme.textMain, fontSize: 20, fontWeight: '900', marginBottom: 2 },
    detailNis: { color: Theme.textMuted, fontSize: 12, marginBottom: 16 },
    infoRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    infoBox: {
        flex: 1, backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 12, padding: 10,
    },
    infoLabel: { color: Theme.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
    infoValue: { color: Theme.textMain, fontSize: 13, fontWeight: '700' },
    reasonText: {
        color: Theme.textMain, fontSize: 14, lineHeight: 22,
        marginTop: 4, marginBottom: 16,
    },

    modalFooter: {
        flexDirection: 'row', gap: 12,
        padding: 16, borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.07)',
    },
    actionBtn: {
        flex: 1, flexDirection: 'row',
        paddingVertical: 14, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    approveBtn: { backgroundColor: '#34C759' },
    rejectBtn: { backgroundColor: '#FF3B30' },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});