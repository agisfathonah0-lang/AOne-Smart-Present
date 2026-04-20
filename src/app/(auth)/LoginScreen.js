import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { AuthService } from '../../services/authService';
import { Theme } from '../../theme/colors';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusLog, setStatusLog] = useState(''); // State untuk menampilkan langkah proses
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert('Error', 'Silakan isi email dan password!');
    }
    
    setLoading(true);
    setStatusLog('Memulai proses login...'); // Indikator awal

    try {
      // Kita kirim callback (msg) agar AuthService bisa update statusLog
      const result = await AuthService.login(email, password, (msg) => {
        setStatusLog(msg);
      });

      if (result.success) {
        setStatusLog('Berhasil! Mengalihkan...');
        setTimeout(() => {
            router.replace('/(tabs)'); 
        }, 500);
      } else {
        Alert.alert('Login Gagal', result.error || 'Terjadi kesalahan');
        setStatusLog('');
      }
    } catch (error) {
      Alert.alert('Error', 'Gagal terhubung ke server');
      setStatusLog('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <View style={styles.card}>
        {/* Logo/Icon Header */}
        <View style={styles.iconContainer}>
          <View style={styles.logoCircle}>
            <Ionicons name="qr-code" size={40} color="#fff" />
          </View>
        </View>

        <Text style={styles.title}>AOne Smart Present</Text>
        <Text style={styles.subtitle}>Absensi Online Smart and Secure</Text>

        <View style={styles.inputGroup}>
          <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email / Username"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputGroup}>
          <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color="#666" />
          </TouchableOpacity>
        </View>

        {/* LOG INDIKATOR (Muncul hanya saat loading) */}
        {loading && (
          <View style={styles.logBox}>
            <ActivityIndicator size="small" color={Theme.primary || '#22d3ee'} />
            <Text style={styles.logText}>{statusLog}</Text>
          </View>
        )}

        <TouchableOpacity 
          style={[styles.button, loading && styles.buttonDisabled]} 
          onPress={handleLogin} 
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>MASUK</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>Version 2026.1.0</Text>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    backgroundColor: Theme.background || '#0f172a', 
    padding: 20 
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 25,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 15,
  },
  logoCircle: {
    width: 80,
    height: 80,
    backgroundColor: Theme.primary || '#22d3ee',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Theme.primary || '#22d3ee',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10
  },
  title: { 
    fontSize: 22, 
    fontWeight: '900', 
    textAlign: 'center', 
    color: '#1e293b',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  subtitle: { 
    fontSize: 11, 
    textAlign: 'center', 
    color: '#64748b', 
    marginBottom: 25,
    fontWeight: '600',
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 15,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    marginRight: 10,
    color: Theme.primary || '#22d3ee',
  },
  input: { 
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
  },
  logBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
  },
  logText: {
    marginLeft: 10,
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    flex: 1
  },
  button: { 
    backgroundColor: Theme.primary || '#22d3ee',
    padding: 18, 
    borderRadius: 14, 
    alignItems: 'center',
    marginTop: 5,
    shadowColor: Theme.primary || '#22d3ee',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonDisabled: {
    backgroundColor: '#cbd5e1',
    shadowOpacity: 0,
    elevation: 0
  },
  buttonText: { 
    color: '#fff', 
    fontWeight: '900', 
    fontSize: 16,
    letterSpacing: 1,
  },
  footerText: {
    marginTop: 25,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600',
  }
});

export default LoginScreen;