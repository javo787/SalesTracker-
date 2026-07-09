import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  SafeAreaView, TextInput, ActivityIndicator, Dimensions
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useShop } from '../context/ShopContext';
import { Colors, Radius, Shadow } from '../constants/theme';

const { width } = Dimensions.get('window');

export default function ShopSetupScreen() {
  const { t } = useTranslation();
  const { createShop, joinShop } = useShop();

  const [selectedRole, setSelectedRole] = useState<'owner' | 'seller' | null>(null);
  const [shopNameInput, setShopNameInput] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAction = async () => {
    if (!selectedRole) { setError(t('onboarding.errorSelectRole')); return; }
    setLoading(true);
    setError('');
    try {
      if (selectedRole === 'owner') {
        if (!shopNameInput.trim()) { setError(t('onboarding.errorShopName')); setLoading(false); return; }
        await createShop(shopNameInput.trim());
      } else {
        if (inviteCodeInput.length < 6) { setError(t('onboarding.errorInviteCode')); setLoading(false); return; }
        await joinShop(inviteCodeInput.trim().toUpperCase());
      }
    } catch (e: any) {
      setError(e.message || t('onboarding.errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Настройка магазина</Text>
          <Text style={styles.subtitle}>Создайте новый магазин или присоединитесь к существующему как продавец.</Text>
        </View>

        <View style={roleStyles.roleRow}>
          <TouchableOpacity
            style={[roleStyles.roleBtn, selectedRole === 'owner' && roleStyles.roleBtnActive]}
            onPress={() => { setSelectedRole('owner'); setError(''); }}
          >
            <Ionicons name="storefront-outline" size={32} color={Colors.primary} style={roleStyles.roleEmoji} />
            <Text style={[roleStyles.roleText, selectedRole === 'owner' && roleStyles.roleTextActive]}>Я владелец</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[roleStyles.roleBtn, selectedRole === 'seller' && roleStyles.roleBtnActive]}
            onPress={() => { setSelectedRole('seller'); setError(''); }}
          >
            <Ionicons name="person-outline" size={32} color={Colors.primary} style={roleStyles.roleEmoji} />
            <Text style={[roleStyles.roleText, selectedRole === 'seller' && roleStyles.roleTextActive]}>Я продавец</Text>
          </TouchableOpacity>
        </View>

        {selectedRole === 'owner' && (
          <View style={roleStyles.inputGroup}>
            <Text style={roleStyles.label}>Название магазина</Text>
            <TextInput
              style={roleStyles.input}
              placeholder={t('debt.placeholderShopName')}
              value={shopNameInput}
              onChangeText={setShopNameInput}
              autoFocus
            />
          </View>
        )}

        {selectedRole === 'seller' && (
          <View style={roleStyles.inputGroup}>
            <Text style={roleStyles.label}>Код приглашения (6 символов)</Text>
            <TextInput
              style={roleStyles.input}
              placeholder={t('debt.placeholderInviteCode')}
              value={inviteCodeInput}
              onChangeText={setInviteCodeInput}
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />
          </View>
        )}

        {error ? <Text style={roleStyles.errorText}>{error}</Text> : null}
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          (!selectedRole || loading) && { opacity: 0.5 }
        ]}
        onPress={handleAction}
        disabled={!selectedRole || loading}
      >
        {loading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Продолжить</Text>
        )}
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 40 },
  content: { width: '100%', paddingHorizontal: 30 },
  header: { marginBottom: 40, alignItems: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  subtitle: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22 },
  button: { width: width - 60, height: 56, borderRadius: 28, backgroundColor: '#534AB7', alignItems: 'center', justifyContent: 'center', ...Shadow.md },
  buttonText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' }
});

const roleStyles = StyleSheet.create({
  roleRow: { flexDirection: 'row', gap: 12, marginBottom: 30 },
  roleBtn: { flex: 1, padding: 20, borderRadius: 16, borderWidth: 2, borderColor: '#F0F0F0', alignItems: 'center', backgroundColor: '#FAFAFA' },
  roleBtnActive: { borderColor: '#534AB7', backgroundColor: '#F5F4FF' },
  roleEmoji: { marginBottom: 10 },
  roleText: { fontSize: 14, fontWeight: '600', color: '#666' },
  roleTextActive: { color: '#534AB7' },
  inputGroup: { width: '100%' },
  label: { fontSize: 14, color: '#666', marginBottom: 10, fontWeight: '500' },
  input: { width: '100%', height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', paddingHorizontal: 16, fontSize: 16, backgroundColor: '#FAFAFA' },
  errorText: { color: '#FF3B30', fontSize: 14, marginTop: 12, textAlign: 'center' }
});
