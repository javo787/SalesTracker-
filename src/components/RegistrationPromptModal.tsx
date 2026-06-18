import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext } from '../context/AppContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onRegister: () => void;
}

const { width } = Dimensions.get('window');

export default function RegistrationPromptModal({ visible, onClose, onRegister }: Props) {
  const { t } = useTranslation();
  const { theme } = useAppContext();
  const isDark = theme === 'dark';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.content, isDark ? styles.contentDark : styles.contentLight]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color={isDark ? '#aaa' : '#888'} />
          </TouchableOpacity>

          <View style={styles.iconContainer}>
            <Ionicons name="cloud-upload-outline" size={60} color="#1D9E75" />
          </View>

          <Text style={[styles.title, isDark ? styles.textDark : styles.textLight]}>
            {t('profile.registrationPromptTitle')}
          </Text>

          <Text style={[styles.desc, isDark ? styles.descDark : styles.descLight]}>
            {t('profile.registrationPromptDesc')}
          </Text>

          <TouchableOpacity style={styles.registerBtn} onPress={onRegister}>
            <Text style={styles.registerBtnText}>{t('auth.register')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.maybeLaterBtn} onPress={onClose}>
            <Text style={styles.maybeLaterText}>{t('common.continue')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: width - 40,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  contentLight: {
    backgroundColor: '#fff',
  },
  contentDark: {
    backgroundColor: '#1E1E1E',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 16,
    padding: 4,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(29, 158, 117, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  desc: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  textLight: { color: '#333' },
  textDark: { color: '#fff' },
  descLight: { color: '#666' },
  descDark: { color: '#aaa' },
  registerBtn: {
    backgroundColor: '#1D9E75',
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  registerBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  maybeLaterBtn: {
    paddingVertical: 12,
  },
  maybeLaterText: {
    color: '#1D9E75',
    fontSize: 15,
    fontWeight: '600',
  },
});
