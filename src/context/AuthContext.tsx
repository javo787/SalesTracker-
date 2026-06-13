import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthResult } from '../types/auth';
import { AuthService } from '../services/authService';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  isLoading: boolean;
  loginAsGuest(): Promise<void>;
  loginWithEmail(email: string, password: string): Promise<void>;
  registerWithEmail(email: string, password: string, name: string, referralCode?: string): Promise<void>;
  loginWithGoogle(idToken: string): Promise<void>;
  loginWithTelegram(): Promise<void>;
  logout(): Promise<void>;
  updateProfile(data: Partial<User>): Promise<void>;
  convertGuestAccount(provider: string, data: any): Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedUser = await AuthService.getStoredUser();
      if (storedUser) {
        setUser(storedUser);
        // Validate with server in background if not local guest
        if (storedUser._id !== 'local_guest') {
          try {
            const freshUser = await api.get<User>('/profile');
            setUser(freshUser);
            AuthService.saveAuthData({ token: (await AuthService.getStoredToken())!, user: freshUser });
          } catch (e) {
            console.warn('Failed to validate session with server');
            if ((e as any).message === 'API request failed') { // Potential 401
               // Check if token still exists, if not, it was cleared by api.ts
               const token = await AuthService.getStoredToken();
               if (!token) setUser(null);
            }
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsGuest = async () => {
    const result = await AuthService.loginAsGuest();
    setUser(result.user);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const result = await AuthService.loginWithEmail(email, password);
    setUser(result.user);
  };

  const registerWithEmail = async (email: string, password: string, name: string, referralCode?: string) => {
    const result = await AuthService.registerWithEmail(email, password, name, referralCode);
    setUser(result.user);
  };

  const loginWithGoogle = async (idToken: string) => {
    const result = await api.post<AuthResult>('/auth/google', { idToken });
    await AuthService.saveAuthData(result);
    setUser(result.user);
  };

  const loginWithTelegram = async () => {
    const result = await AuthService.loginWithTelegram();
    setUser(result.user);
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
  };

  const updateProfile = async (data: Partial<User>) => {
    const updatedUser = await api.patch<User>('/profile', data);
    setUser(updatedUser);
    const token = await AuthService.getStoredToken();
    if (token) AuthService.saveAuthData({ token, user: updatedUser });
  };

  const convertGuestAccount = async (provider: string, data: any) => {
    const { user: updatedUser } = await api.post<{ user: User }>('/auth/convert', { provider, ...data });
    setUser(updatedUser);
    const token = await AuthService.getStoredToken();
    if (token) AuthService.saveAuthData({ token, user: updatedUser });
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isGuest: user?.authProvider === 'anonymous',
      isLoading,
      loginAsGuest,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      loginWithTelegram,
      logout,
      updateProfile,
      convertGuestAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
