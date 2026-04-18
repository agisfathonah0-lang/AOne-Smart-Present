import { useRouter } from 'expo-router';
import LottieView from 'lottie-react-native';
import { useEffect } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { initDatabase } from '../database/sqlite';
import { SyncService } from '../services/syncService';
import { Theme } from '../theme/colors';

export default function SplashScreen() {
  const router = useRouter();
  const fadeAnim = new Animated.Value(0);

  useEffect(() => {
    // 1. Jalankan Inisialisasi Sistem di Background
    const prepareSystem = async () => {
      try {
        // Init SQLite Tables
        await initDatabase();
        
        // Cek data master terbaru dari cloud (silent)
        await SyncService.pullMasterData();
        
        // Animasi teks muncul perlahan
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }).start();
      } catch (e) {
        console.warn(e);
      }
    };

    prepareSystem();

    // 2. Navigasi ke Dashboard setelah animasi Lottie dirasa cukup (misal 4 detik)
    const timer = setTimeout(() => {
      router.replace('/'); 
    }, 4500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Animasi Startup Modern */}
      <LottieView
        autoPlay
        loop={false}
        style={styles.animation}
        source={require('../assets/animations/startup.json')}
      />

      {/* Brand Identity */}
      <Animated.View style={[styles.textContainer, { opacity: fadeAnim }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>v1.0 - AI ENHANCED</Text>
        </View>
        <Text style={styles.brandTitle}>AONE SMART</Text>
        <Text style={[styles.brandTitle, { color: Theme.primary }]}>PRESENT</Text>
        
        <View style={styles.footer}>
          <Text style={styles.yayasanText}>Developed by</Text>
          <Text style={styles.agencyText}>AOne Project & Agency</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: Theme.background, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  animation: { 
    width: '80%', 
    aspectRatio: 1,
    marginBottom: 40
  },
  textContainer: { 
    alignItems: 'center',
    position: 'absolute',
    bottom: 60
  },
  badge: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)'
  },
  badgeText: {
    color: Theme.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1
  },
  brandTitle: { 
    color: Theme.textMain, 
    fontSize: 28, 
    fontWeight: '900', 
    letterSpacing: 4,
    lineHeight: 32
  },
  footer: {
    marginTop: 30,
    alignItems: 'center'
  },
  yayasanText: { 
    color: Theme.textMuted, 
    fontSize: 10, 
    textTransform: 'uppercase', 
    letterSpacing: 1 
  },
  agencyText: {
    color: Theme.textMain,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  }
});