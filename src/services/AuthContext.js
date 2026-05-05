import { createContext, useContext, useEffect, useState } from 'react';
import { AuthService } from './authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);      // { id, email, role, full_name, classes }
  const [isLoading, setIsLoading] = useState(true); // cek sesi saat app buka

  // ── Cek sesi saat app pertama dibuka ────────────────────────
  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const session = await AuthService.getSession();
      if (session) {
        setUser({
          id: session.id,
          email: session.email,
          role: session.role,
          full_name: session.full_name,
          classes: session.classes || [],
        });
      }
    } catch (e) {
      console.error('checkSession error:', e.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Login ────────────────────────────────────────────────────
  const login = async (email, password, onLog) => {
    const result = await AuthService.login(email, password, onLog);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  // ── Logout ───────────────────────────────────────────────────
  const logout = async () => {
    await AuthService.clearSession();
    setUser(null);
  };

  // ── Helper ───────────────────────────────────────────────────
  const isAdmin = user?.role === 'admin';
  const isGuru = user?.role === 'guru';

  // Cek apakah guru mengampu kelas tertentu
  const hasClass = (kelas) => user?.classes?.includes(kelas) ?? false;

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAdmin,
      isGuru,
      login,
      logout,
      hasClass,
      checkSession,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ── Hook ─────────────────────────────────────────────────────
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return context;
};