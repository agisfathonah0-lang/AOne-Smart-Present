import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import {
    FilePieChart,
    LayoutDashboard,
    ScanLine,
    Settings2,
    Users,
} from 'lucide-react-native';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Theme, hexToRGBA } from '../../theme/colors';

export default function GuruTabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarSafeAreaInsets: { bottom: insets.bottom },
        headerShown: false,
        tabBarActiveTintColor: Theme.primary,
        tabBarInactiveTintColor: Theme.textMuted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ),
      }}
    >
      {/* 1. DASHBOARD */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <LayoutDashboard
              color={color}
              size={focused ? 26 : 22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      {/* 2. SISWA — posisi sama dengan Master di admin */}
      <Tabs.Screen
        name="master"
        options={{
          title: 'Siswa',
          tabBarIcon: ({ color, focused }) => (
            <Users
              color={color}
              size={focused ? 26 : 22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      {/* 3. ABSENSI (SCANNER) — tetap di tengah */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Absensi',
          tabBarIcon: ({ color, focused }) => (
            <View style={[
              styles.activeTabHighlight,
              { backgroundColor: focused ? Theme.primary : hexToRGBA(Theme.primary, 0.2) }
            ]}>
              <ScanLine
                color={focused ? Theme.background : Theme.primary}
                size={50}
                strokeWidth={2.5}
              />
            </View>
          ),
          tabBarLabel: ({ focused }) => (
            <Text style={[
              styles.tabBarLabel,
              { color: focused ? Theme.primary : Theme.textMuted, marginTop: 15 }
            ]}>
              Absensi
            </Text>
          ),
        }}
      />

      {/* 4. REPORT */}
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Report',
          tabBarIcon: ({ color, focused }) => (
            <FilePieChart
              color={color}
              size={focused ? 26 : 22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />

      {/* 5. SETTINGS */}
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Settings2
              color={color}
              size={focused ? 26 : 22}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
  name="izin"
  options={{
    href: null,  
  }}
/>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    borderTopWidth: 1,
    borderTopColor: hexToRGBA(Theme.primary, 0.1),
    backgroundColor: hexToRGBA(Theme.background, 0.7),
    height: Platform.OS === 'ios' ? 88 : 65,
    paddingBottom: Platform.OS === 'ios' ? 50 : 90,
    paddingTop: 10,
    elevation: 0,
  },
  tabBarLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeTabHighlight: {
    width: 100,
    height: 100,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 35,
    shadowColor: Theme.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
    borderWidth: 4,
    borderColor: Theme.background,
  },
});