import React, { useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Platform, Keyboard,
} from 'react-native';
import { useAppContext } from '../../context/AppContext';
import { searchClients } from '../../db/database';
import { useAutocomplete } from '../../hooks/useAutocomplete';

interface Client {
  id: number;
  name: string;
  phone: string;
}

interface Props {
  value: string;
  phone: string;
  onChange: (name: string) => void;
  onChangePhone: (phone: string) => void;
  onSelect: (client: Client) => void;
}

export default function ClientAutocomplete({
  value, phone, onChange, onChangePhone, onSelect,
}: Props) {
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';

  const fetchFn = useCallback((q: string) => searchClients(q) as Client[], []);
  const fetchTop = useCallback(() => searchClients('') as Client[], []);
  const { results, isOpen, search, onFocus, onBlur, select } =
    useAutocomplete<Client>(fetchFn, fetchTop, 300);

  const handleChange = (text: string) => { onChange(text); search(text); };
  const handleSelect = (c: Client) => { select(c, onSelect); Keyboard.dismiss(); };

  const inputStyle = [
    styles.input,
    isDark ? styles.inputDark : styles.inputLight,
  ];

  return (
    <View style={styles.container}>
      <TextInput
        style={inputStyle}
        placeholder="Имя клиента *"
        placeholderTextColor={isDark ? '#888' : '#aaa'}
        value={value}
        onChangeText={handleChange}
        onFocus={() => onFocus(value)}
        onBlur={onBlur}
      />
      <TextInput
        style={[inputStyle, { marginTop: 8 }]}
        placeholder="Телефон (необязательно)"
        placeholderTextColor={isDark ? '#888' : '#aaa'}
        value={phone}
        onChangeText={onChangePhone}
        keyboardType="phone-pad"
      />
      {isOpen && (
        <View style={[
          styles.dropdown,
          isDark ? styles.dropdownDark : styles.dropdownLight,
        ]}>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 180 }}>
            {results.map((c: Client) => (
              <TouchableOpacity
                key={String(c.id)}
                style={styles.item}
                onPress={() => handleSelect(c)}
              >
                <Text style={[styles.itemName, isDark ? styles.textDark : styles.textLight]}>
                  {c.name}
                </Text>
                {c.phone ? (
                  <Text style={styles.itemPhone}>{c.phone}</Text>
                ) : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { zIndex: 999, position: 'relative' },
  input: {
    borderRadius: 8, padding: 12, fontSize: 15, borderWidth: 1,
  },
  inputLight: { backgroundColor: '#F5F5F5', borderColor: '#E0E0E0', color: '#333' },
  inputDark:  { backgroundColor: '#2C2C2C', borderColor: '#444',    color: '#EEE' },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    borderRadius: 8, marginTop: 4, zIndex: 1000,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 8 },
    }),
  },
  dropdownLight: { backgroundColor: '#fff',     borderWidth: 1, borderColor: '#E0E0E0' },
  dropdownDark:  { backgroundColor: '#2C2C2C',  borderWidth: 1, borderColor: '#444'    },
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EEE',
  },
  itemName:  { fontSize: 15 },
  itemPhone: { fontSize: 12, color: '#999' },
  textLight: { color: '#333' },
  textDark:  { color: '#EEE' },
});
