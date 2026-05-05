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
import { AuthProvider, useAuth } from '../services/AuthContext';
import { Theme } from '../theme/colors';

// ── Background Task ──────────────────────────────────────────
const ALFA_TASK_NAME = 'AUTO_ALFA_CHECK_2215';

TaskManager.defineTask(ALFA_TASK_NAME, async () => {
  console.log("Background Task sedang berjalan...");
  try {
    const now = new Date();
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

// ── Notifikasi Handler ───────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

SplashScreen.preventAutoHideAsync();

// ── Komponen navigasi (pakai useAuth di dalam AuthProvider) ──
function RootNavigator() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    async function prepare() {
      try {
        console.log("Memulai Inisialisasi...");

        // 1. Inisialisasi Database
        await initDatabase();
        console.log("Database: OK.");

        // 2. Ambil pengaturan dari SQLite
        const settings = await db.getFirstAsync(
          'SELECT is_holiday_mode, time_out_start FROM school_settings LIMIT 1'
        );

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

        // 4. Registrasi Background Task
        const isRegistered = await TaskManager.isTaskRegisteredAsync(ALFA_TASK_NAME);
        if (!isRegistered && status === 'granted') {
          await BackgroundTask.registerTaskAsync(ALFA_TASK_NAME, {
            minimumInterval: 15 * 60,
          });
        }

        // 5. Auto-Alfa Harian
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const storageKey = `@alfa_done_${today}`;

        const isPastLimit = (now.getHours() > targetHour) ||
          (now.getHours() === targetHour && now.getMinutes() >= targetMinute);

        const alreadyDone = await AsyncStorage.getItem(storageKey);

        console.log(`Jadwal: ${targetHour}:${targetMinute} | Libur: ${isHoliday} | Sudah Jalan: ${alreadyDone}`);

        if (isPastLimit && !alreadyDone) {
          if (isHoliday) {
            console.log("Mode Libur Aktif: Melewati Auto-Alfa.");
            await AsyncStorage.setItem(storageKey, 'true');
          } else {
            console.log("Eksekusi Auto-Alfa...");
            await db.runAsync(
              `INSERT INTO attendance_logs (nis, status, session, timestamp, synced)
               SELECT nis, 'alfa', 'pulang', ?, 0 FROM students
               WHERE nis NOT IN (
                 SELECT nis FROM attendance_logs
                 WHERE date(timestamp) = date(?) AND session = 'pulang'
               )`,
              [now.toISOString(), today]
            );

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

            await AsyncStorage.setItem(storageKey, 'true');
          }
        }

      } catch (e) {
        console.error("Initialization Error:", e);
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

  // Tunggu AuthContext selesai cek sesi
  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/(auth)/LoginScreen');
      return;
    }

    // Redirect berdasarkan role
    if (user.role === 'admin') {
      router.replace('/(admin)');
    } else if (user.role === 'guru') {
      router.replace('/(guru)');
    } else {
      // Role tidak dikenali → logout paksa
      router.replace('/(auth)/LoginScreen');
    }
  }, [isLoading, user]);

  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: Theme.background }
    }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(admin)" />
      <Stack.Screen name="(guru)" />
      <Stack.Screen name="(guru)/izin" /> 
    </Stack>
  );
}

// ── Root Layout (wrap dengan AuthProvider) ───────────────────
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <Toast />
    </GestureHandlerRootView>
  );
}