import { Alert } from 'react-native';
import { db } from '../database/sqlite';
import { supabase } from '../database/supabase';
export const AuthService = {
  login: async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        // Sekarang db tidak akan undefined lagi
        await db.runAsync(
          'INSERT OR REPLACE INTO user_session (id, email, last_login) VALUES (?, ?, ?)',
          [data.user.id, data.user.email, new Date().toISOString()]
        );
        return { success: true };
      }
    } catch (error) {
        Alert.alert('Login Error:', error.message)
      return { success: false, error: error.message };
    }
  }
};