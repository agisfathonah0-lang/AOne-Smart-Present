import { Ionicons } from '@expo/vector-icons'; // Icon bawaan expo
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
import { Theme } from '../../theme/colors'; // Pastikan path-nya sesuai dengan folder kamu

// Hapus props { navigation } karena kita pakai useRouter()
const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    if (!email || !password) {
      return Alert.alert('Error', 'Silakan isi email dan password!');
    }
    
    setLoading(true);
    try {
      const result = await AuthService.login(email, password);
      if (result.success) {
        // Gunakan replace agar user tidak bisa kembali ke halaman login
        router.replace('/(tabs)'); 
      } else {
        Alert.alert('Login Gagal', result.error || 'Terjadi kesalahan');
      }
    } catch (error) {
      Alert.alert('Error', 'Gagal terhubung ke server');
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
          <Ionicons name="qr-code" size={60} color="#3498db" />
        </View>

        <Text style={styles.title}>AOne Smart Present</Text>
        <Text style={styles.subtitle}>Absensi Online Smart and Secure</Text>

        <View style={styles.inputGroup}>
          <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
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
    backgroundColor: Theme.background || '#0f172a', // Gunakan warna gelap dari tema
    padding: 20 
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 25,
    borderRadius: 24, // Lebih membulat agar modern
    elevation: 8,
    shadowColor: Theme.primary || '#22d3ee',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)', // Outline tipis biar "high-end"
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { 
    fontSize: 26, 
    fontWeight: '900', 
    textAlign: 'center', 
    color: '#1e293b',
    letterSpacing: 2, // Sesuai dengan brandTitle di Splash
    textTransform: 'uppercase'
  },
  subtitle: { 
    fontSize: 12, 
    textAlign: 'center', 
    color: '#64748b', 
    marginBottom: 30,
    fontWeight: '600',
    letterSpacing: 1
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 15,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  inputIcon: {
    marginRight: 10,
    color: Theme.primary || '#22d3ee', // Icon pakai warna tema
  },
  input: { 
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500'
  },
  button: { 
    backgroundColor: Theme.primary || '#22d3ee', // Warna utama aplikasi
    padding: 18, 
    borderRadius: 14, 
    alignItems: 'center',
    marginTop: 10,
    // Efek glow di bawah tombol
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
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  footerText: {
    marginTop: 25,
    textAlign: 'center',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1
  }
});

export default LoginScreen;