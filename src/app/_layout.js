import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDatabase } from '../database/sqlite';
import { Theme } from '../theme/colors';
// Mencegah splash screen bawaan Expo tertutup otomatis 
// agar kita bisa kontrol transisinya ke splash.js Lottie kita.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
useEffect(() => {
  async function prepare() {
    try {
      // 1. Inisialisasi Database SQLite (Jantung Offline)
      await initDatabase();
      
      // 2. Cek Status Login
      const isLoggedIn = await AsyncStorage.getItem('@is_logged_in');

      // Beri jeda sedikit agar sistem & animasi benar-benar siap
      await new Promise(resolve => setTimeout(resolve, 300));

      // 3. Arahkan Navigasi berdasarkan session
      if (isLoggedIn === 'true') {
        router.replace('/');
      } else {
        router.replace('/LoginScreen');
      }

    } catch (e) {
      console.warn("Initialization Error:", e);
      // Jika error, default tetap ke login agar aman
      router.replace('/LoginScreen');
    } finally {
      // 4. Sembunyikan Splash bawaan, masuk ke UI utama/splash Lottie
      await SplashScreen.hideAsync();
    }
  }

  prepare();
}, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {/* Status Bar Putih agar terlihat jelas di background gelap AOne */}
      <StatusBar style="light" />
      
      <Stack
        screenOptions={{
          headerShown: false, // Kita buat header custom di tiap halaman
          animation: 'fade',  // Transisi antar halaman yang halus
          contentStyle: { backgroundColor: Theme.background }
        }}
      >
        {/* Entry Point: Splash Screen Lottie */}
        <Stack.Screen name="splash" />
        
        {/* Main App: Bottom Navigation Groups */}
        <Stack.Screen name="(auth)" options={{ headerShown: false, animation: 'fade'}} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false, animation: 'fade'}} />
      </Stack>
    </GestureHandlerRootView>
  );
}