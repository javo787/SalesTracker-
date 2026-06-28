import React, { useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Platform,
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

  const fetchFn  = useCallback((q: string) => searchClients(q) as Client[], []);
  const fetchTop = useCallback(() => searchClients('') as Client[], []);
  const { results, isOpen, search, onFocus, onBlur, select } =
    useAutocomplete<Client>(fetchFn, fetchTop, 250);

  const handleFocus = useCallback(() => onFocus(value), [value, onFocus]);

  const handleChange = useCallback((text: string) => {
    onChange(text);
    search(text);
  }, [onChange, search]);

  const handleSelect = useCallback((c: Client) => {
    select(c, onSelect);
  }, [select, onSelect]);

  const handleBlur = useCallback(() => onBlur(), [onBlur]);

  const inputStyle  = [styles.input, isDark ? styles.inputDark : styles.inputLight];
  const dropBg      = isDark ? '#2C2C2C' : '#ffffff';
  const dropBorder  = isDark ? '#444'    : '#E0E0E0';
  const textColor   = isDark ? '#EEE'    : '#222';

  return (
    <View style={styles.container}>

      {/* ── Dropdown ABOVE the input ───────────────────────────────────
          Rendered first in JSX → appears visually above the name field.
          No Modal → keyboard never dismisses.
          Parent ScrollView has keyboardShouldPersistTaps="handled" →
          tapping a suggestion works while keyboard is open.
      ─────────────────────────────────────────────────────────────── */}
      {isOpen && results.length > 0 && (
        <View
          style={[
            styles.dropdown,
            {
              backgroundColor: dropBg,
              borderColor: dropBorder,
              ...Platform.select({
                android: { elevation: 6 },
                ios: {
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: -3 },
                  shadowOpacity: 0.12,
                  shadowRadius: 8,
                },
              }),
            },
          ]}
        >
          {results.map((c, index) => (
            <TouchableOpacity
              key={String(c.id)}
              style={[
                styles.item,
                { borderBottomColor: dropBorder },
                index === results.length - 1 && { borderBottomWidth: 0 },
              ]}
              onPress={() => handleSelect(c)}
              activeOpacity={0.7}
            >
              <View style={styles.itemLeft}>
                <Text style={[styles.itemName, { color: textColor }]} numberOfLines={1}>
                  {c.name}
                </Text>
                {c.phone ? (
                  <Text style={styles.itemPhone}>{c.phone}</Text>
                ) : null}
              </View>
              <Text style={styles.selectHint}>↵</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Name input */}
      <TextInput
        style={inputStyle}
        placeholder="Имя клиента *"
        placeholderTextColor={isDark ? '#888' : '#aaa'}
        value={value}
        onChangeText={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        returnKeyType="next"
        autoCorrect={false}
        autoCapitalize="words"
      />

      {/* Phone input */}
      <TextInput
        style={[inputStyle, { marginTop: 8 }]}
        placeholder="Телефон (необязательно)"
        placeholderTextColor={isDark ? '#888' : '#aaa'}
        value={phone}
        onChangeText={onChangePhone}
        keyboardType="phone-pad"
        returnKeyType="done"
      />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  input: {
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingVertical: Platform.OS === 'ios' ? 13 : 11,
    fontSize: 15,
    borderWidth: 1,
  },
  inputLight: { backgroundColor: '#F7F7F7', borderColor: '#E0E0E0', color: '#222' },
  inputDark:  { backgroundColor: '#2C2C2C', borderColor: '#444',    color: '#EEE' },
  dropdown: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 4,   // small gap between list and name input
    maxHeight: 210,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  itemLeft:   { flex: 1, marginRight: 8 },
  itemName:   { fontSize: 15, fontWeight: '500' },
  itemPhone:  { fontSize: 12, color: '#999', marginTop: 2 },
  selectHint: { fontSize: 16, color: '#bbb' },
});
