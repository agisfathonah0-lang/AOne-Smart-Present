import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as TaskManager from 'expo-task-manager';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';

import { db, initDatabase } from '../database/sqlite';
import { Theme } from '../theme/colors';

// 1. NAMA TASK (HARUS SAMA)
const ALFA_TASK_NAME = 'AUTO_ALFA_CHECK_2215';
let isHolidayGlobal = false;
// 2. DEFINISI TASK (WAJIB DI LUAR EXPORT DEFAULT)
TaskManager.defineTask(ALFA_TASK_NAME, async () => {
  console.log("Background Task sedang berjalan...");
  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Logika 22:15
    if (now.getHours() === 23 && now.getMinutes() >= 41) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "AOne: Background Check",
          body: "Sistem otomatis sedang memproses data...",
        },
        trigger: null,
      });
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// Konfigurasi handler notifikasi
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();

useEffect(() => {
  async function prepare() {
    try {
      console.log("Memulai Inisialisasi...");
      
      // 1. Inisialisasi Database
      await initDatabase();
      console.log("Database: OK.");

      // 2. Ambil Pengaturan dari Database (Dinamis)
      const settings = await db.getFirstAsync(
        'SELECT is_holiday_mode, time_out_start FROM school_settings LIMIT 1'
      );
      
      // Ambil jam dan menit dari time_out_start (Format: '13:00')
      const [targetHour, targetMinute] = (settings?.time_out_start || '13:00')
        .split(':')
        .map(Number);
      
      const isHoliday = settings?.is_holiday_mode === 1;

      // 3. Setup Notifikasi
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted' && Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('emergency-alfa', {
          name: 'Laporan Otomatis',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // 4. Registrasi Background Task (Agar jalan setiap hari)
      const isRegistered = await TaskManager.isTaskRegisteredAsync(ALFA_TASK_NAME);
      if (!isRegistered && status === 'granted') {
        await BackgroundTask.registerTaskAsync(ALFA_TASK_NAME, {
          minimumInterval: 15 * 60, // Cek setiap 15 menit
        });
      }

      // 5. LOGIKA AUTO-ALFA HARIAN
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      const storageKey = `@alfa_done_${today}`;
      
      // HAPUS BARIS DI BAWAH INI JIKA TESTING SELESAI
      // await AsyncStorage.removeItem(storageKey); 

      // Cek apakah waktu sekarang sudah melewati batas jam di database
      const isPastLimit = (now.getHours() > targetHour) || 
                          (now.getHours() === targetHour && now.getMinutes() >= targetMinute);
      
      const alreadyDone = await AsyncStorage.getItem(storageKey);

      console.log(`Jadwal: ${targetHour}:${targetMinute} | Libur: ${isHoliday} | Sudah Jalan: ${alreadyDone}`);

      if (isPastLimit && !alreadyDone) {
        if (isHoliday) {
          console.log("Mode Libur Aktif: Melewati proses Auto-Alfa.");
          await AsyncStorage.setItem(storageKey, 'true'); // Tandai true agar tidak log terus
        } else {
          console.log("Eksekusi Sapu Bersih Alfa...");

          // Query SQL: Hanya masukkan yang belum absen 'pulang' hari ini
          await db.runAsync(
            `INSERT INTO attendance_logs (nis, status, session, timestamp, synced)
             SELECT nis, 'alfa', 'pulang', ?, 0 FROM students
             WHERE nis NOT IN (
               SELECT nis FROM attendance_logs 
               WHERE date(timestamp) = date(?) AND session = 'pulang'
             )`,
            [now.toISOString(), today]
          );

          // Kirim Notifikasi
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "AOne: Sesi Absensi Ditutup 🔔",
              body: `Siswa tidak absen lewat jam ${targetHour}:${targetMinute} otomatis Alfa.`,
              sound: true,
              priority: Notifications.AndroidNotificationPriority.MAX,
              channelId: 'emergency-alfa',
            },
            trigger: null,
          });

          // Simpan status agar tidak duplikasi hari ini
          await AsyncStorage.setItem(storageKey, 'true');
        }
      }

      // 6. Cek Status Login & Navigasi
      const isLoggedIn = await db.getFirstAsync('SELECT id FROM user_session');
      await new Promise(resolve => setTimeout(resolve, 500));

      if (isLoggedIn) {
        router.replace('/');
      } else {
        router.replace('/LoginScreen');
      }

    } catch (e) {
      console.error("Initialization Error:", e);
      router.replace('/LoginScreen');
    } finally {
      await SplashScreen.hideAsync();
    }
  }

  prepare();

  const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
    console.log("Notifikasi diklik!");
  });

  return () => responseSub.remove();
}, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.background } }}>
        <Stack.Screen name="splash" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      <Toast />
    </GestureHandlerRootView>
  );
}