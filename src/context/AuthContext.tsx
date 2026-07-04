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
      console.log('[AUTH_LOG][context:loadStored] storedUser=', storedUser?._id || 'none'); // AUTH_LOG
      if (storedUser) {
        setUser(storedUser);
        // Validate with server in background if not local guest
        if (storedUser._id !== 'local_guest') {
          try {
            const freshUser = await api.get<User>('/profile');
            console.log('[AUTH_LOG][context:loadStored] validation success, user=', freshUser._id); // AUTH_LOG
            setUser(freshUser);
            const token = await AuthService.getStoredToken();
            if (token) {
              AuthService.saveAuthData({ token, user: freshUser });
            }
          } catch (e) {
            console.warn('Failed to validate session with server');
            const token = await AuthService.getStoredToken();
            console.log('[AUTH_LOG][context:loadStored] validation failed, token exists=', !!token); // AUTH_LOG
            if (!token) setUser(null);
          }
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const loginAsGuest = async () => {
    console.log('[AUTH_LOG][context:loginAsGuest] entry'); // AUTH_LOG
    const result = await AuthService.loginAsGuest();
    console.log('[AUTH_LOG][context:loginAsGuest] success, userId=', result.user._id, 'provider=', result.user.authProvider); // AUTH_LOG
    setUser(result.user);
  };

  const loginWithEmail = async (email: string, password: string) => {
    console.log('[AUTH_LOG][context:loginWithEmail] entry email=', email); // AUTH_LOG
    const result = await AuthService.loginWithEmail(email, password);
    console.log('[AUTH_LOG][context:loginWithEmail] success, userId=', result.user._id, 'provider=', result.user.authProvider); // AUTH_LOG
    setUser(result.user);
  };

  const registerWithEmail = async (email: string, password: string, name: string, referralCode?: string) => {
    console.log('[AUTH_LOG][context:registerWithEmail] entry email=', email, 'name=', name); // AUTH_LOG
    const result = await AuthService.registerWithEmail(email, password, name, referralCode);
    console.log('[AUTH_LOG][context:registerWithEmail] success, userId=', result.user._id, 'provider=', result.user.authProvider); // AUTH_LOG
    setUser(result.user);
  };

  const loginWithGoogle = async (idToken: string) => {
    console.log('[AUTH_LOG][context:loginWithGoogle] entry'); // AUTH_LOG
    const result = await api.post<AuthResult>('/auth/google', { idToken });
    await AuthService.saveAuthData(result);
    console.log('[AUTH_LOG][context:loginWithGoogle] success, userId=', result.user._id, 'provider=', result.user.authProvider); // AUTH_LOG
    setUser(result.user);
  };

  const loginWithTelegram = async () => {
    console.log('[AUTH_LOG][context:loginWithTelegram] entry'); // AUTH_LOG
    const result = await AuthService.loginWithTelegram();
    console.log('[AUTH_LOG][context:loginWithTelegram] success, userId=', result.user._id, 'provider=', result.user.authProvider); // AUTH_LOG
    setUser(result.user);
  };

  const logout = async () => {
    console.log('[AUTH_LOG][context:logout] entry'); // AUTH_LOG
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
    console.log('[AUTH_LOG][context:convertGuest] entry provider=', provider); // AUTH_LOG
    const { user: updatedUser } = await api.post<{ user: User }>('/auth/convert', { provider, ...data });
    console.log('[AUTH_LOG][context:convertGuest] success, userId=', updatedUser._id, 'provider=', updatedUser.authProvider); // AUTH_LOG
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
