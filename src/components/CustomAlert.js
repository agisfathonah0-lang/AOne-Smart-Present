import LottieView from 'lottie-react-native';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Theme } from '../theme/colors'; // Pastikan path benar
import GlassmorphicBox from './GlassmorphicBox'; // Pastikan path benar
const CustomAlert = ({ 
  visible, 
  title, 
  message, 
  type = 'success', // 'success', 'danger', 'warning'
  onConfirm, 
  onCancel,
  confirmText,
  cancelText = "BATAL"
}) => {
  
  // Pilih animasi berdasarkan type
  const getAnimation = () => {
    switch(type) {
      case 'danger': return require('../assets/animations/delete.json');
      case 'warning': return require('../assets/animations/warning.json');
      default: return require('../assets/animations/success.json');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <GlassmorphicBox style={styles.alertBox} intensity={60}>
          <LottieView
            autoPlay
            loop={type === 'warning'}
            source={getAnimation()}
            style={styles.lottie}
          />
          
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actionContainer}>
            {/* Tombol Batal (Hanya muncul jika ada onCancel) */}
            {onCancel && (
              <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
                <Text style={styles.cancelBtnText}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            {/* Tombol Konfirmasi */}
            <TouchableOpacity 
              style={[
                styles.confirmBtn, 
                { backgroundColor: type === 'danger' ? Theme.danger : Theme.primary }
              ]} 
              onPress={onConfirm}
            >
              <Text style={styles.confirmBtnText}>
                {confirmText || (type === 'danger' ? 'HAPUS' : 'MENGERTI')}
              </Text>
            </TouchableOpacity>
          </View>
        </GlassmorphicBox>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  alertBox: {
    width: '100%',
    padding: 25,
    borderRadius: 35,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  lottie: { width: 120, height: 120, marginBottom: 10 },
  title: { color: '#FFF', fontSize: 20, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  message: { color: '#BBB', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 25 },
  actionContainer: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmBtn: { flex: 1, paddingVertical: 15, borderRadius: 20, alignItems: 'center' },
  cancelBtn: { 
    flex: 1, 
    paddingVertical: 15, 
    borderRadius: 20, 
    alignItems: 'center', 
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  confirmBtnText: { color: '#000', fontWeight: '900', fontSize: 13 },
  cancelBtnText: { color: '#FFF', fontWeight: '700', fontSize: 13 }
});

export default CustomAlert;