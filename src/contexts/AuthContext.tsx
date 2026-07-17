import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { 
  User as FirebaseUser, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  getAdditionalUserInfo
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { User } from '../types';
import { fileToAvatarDataUrl } from '../utils/avatar';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<{ user: User; isNewUser: boolean }>;
  register: (email: string, password: string, displayName: string, role: string) => Promise<User>;
  logout: () => Promise<void>;
  updateAvatar: (file: File) => Promise<void>;
  setAvatarUrl: (avatarUrl: string | null) => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserRef = useRef<User | null>(null);
  currentUserRef.current = currentUser;

  const login = async (email: string, password: string) => {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      // Store token for API calls
      const token = await result.user.getIdToken();
      localStorage.setItem('authToken', token);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const saveUserData = useCallback(async (userData: User) => {
    localStorage.setItem(`user-${userData.id}`, JSON.stringify(userData));

    try {
      await setDoc(doc(db, 'users', userData.id), {
        ...userData,
        createdAt: userData.createdAt.toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving user data to Firestore:', error);
    }
  }, []);

  const loadUserData = useCallback(async (user: FirebaseUser): Promise<User> => {
    try {
      const snapshot = await getDoc(doc(db, 'users', user.uid));

      if (snapshot.exists()) {
        const data = snapshot.data() as any;
        return {
          id: user.uid,
          email: data.email || user.email!,
          displayName: data.displayName || user.displayName || 'User',
          role: data.role || 'child',
          isPremium: data.isPremium || false,
          avatarUrl: data.avatarUrl || user.photoURL || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        };
      }
    } catch (error) {
      console.error('Error loading user data from Firestore:', error);

      const cachedUser = localStorage.getItem(`user-${user.uid}`);
      if (cachedUser) {
        const data = JSON.parse(cachedUser);
        return {
          ...data,
          avatarUrl: data.avatarUrl || user.photoURL || null,
          createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        };
      }
    }

    const userData: User = {
      id: user.uid,
      email: user.email!,
      displayName: user.displayName || 'User',
      role: 'child',
      isPremium: false,
      avatarUrl: user.photoURL || null,
      createdAt: new Date()
    };

    await saveUserData(userData);
    return userData;
  }, [saveUserData]);

  const loginWithGoogle = async (): Promise<{ user: User; isNewUser: boolean }> => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Store token for API calls
      const token = await result.user.getIdToken();
      localStorage.setItem('authToken', token);
      
      const userData = await loadUserData(result.user);
      const isNewUser = getAdditionalUserInfo(result)?.isNewUser ?? false;
      setCurrentUser(userData);
      return { user: userData, isNewUser };
      
    } catch (error) {
      console.error('Google login error:', error);
      throw error;
    }
  };

  const register = async (email: string, password: string, displayName: string, role: string): Promise<User> => {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      
      // Update the user profile
      await updateProfile(result.user, {
        displayName: displayName
      });

      const userData: User = {
        id: result.user.uid,
        email: result.user.email!,
        displayName: displayName,
        role: role as 'child' | 'parent' | 'coach' | 'admin',
        isPremium: false,
        avatarUrl: result.user.photoURL || null,
        createdAt: new Date()
      };

      // Store token for API calls
      const token = await result.user.getIdToken();
      localStorage.setItem('authToken', token);
      
      await saveUserData(userData);
      setCurrentUser(userData);
      return userData;
      
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('authToken');
      setCurrentUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const setAvatarUrl = useCallback(async (avatarUrl: string | null) => {
    const prev = currentUserRef.current;
    if (!prev) return;

    const updatedUser: User = { ...prev, avatarUrl };
    currentUserRef.current = updatedUser;
    setCurrentUser(updatedUser);
    await saveUserData(updatedUser);
  }, [saveUserData]);

  const updateAvatar = useCallback(async (file: File) => {
    const prev = currentUserRef.current;
    if (!prev) {
      throw new Error('You must be signed in to update your avatar.');
    }

    const avatarUrl = await fileToAvatarDataUrl(file);
    const updatedUser: User = { ...prev, avatarUrl };
    currentUserRef.current = updatedUser;
    setCurrentUser(updatedUser);
    await saveUserData(updatedUser);
  }, [saveUserData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      
      if (user) {
        const userData = await loadUserData(user);
        
        setCurrentUser(userData);
        
        // Refresh token
        const token = await user.getIdToken();
        localStorage.setItem('authToken', token);
      } else {
        setCurrentUser(null);
        localStorage.removeItem('authToken');
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, [loadUserData]);

  const value: AuthContextType = {
    currentUser,
    firebaseUser,
    login,
    loginWithGoogle,
    register,
    logout,
    updateAvatar,
    setAvatarUrl,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
