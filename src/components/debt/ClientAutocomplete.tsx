import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, Modal, Platform, Keyboard,
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

// How many px above the input the list appears
const LIST_MAX_HEIGHT = 200;
const ITEM_HEIGHT = 52;

export default function ClientAutocomplete({
  value, phone, onChange, onChangePhone, onSelect,
}: Props) {
  const { resolvedTheme } = useAppContext();
  const isDark = resolvedTheme === 'dark';

  // Ref to measure input position on screen
  const inputRef = useRef<View>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number; left: number; width: number; above: boolean;
  } | null>(null);

  const fetchFn = useCallback((q: string) => searchClients(q) as Client[], []);
  const fetchTop = useCallback(() => searchClients('') as Client[], []);
  const { results, isOpen, search, onFocus, onBlur, select, dismiss } =
    useAutocomplete<Client>(fetchFn, fetchTop, 250);

  // Measure input position and decide: show above or below
  const measureInput = useCallback(() => {
    if (!inputRef.current) return;
    inputRef.current.measureInWindow((x, y, width, height) => {
      const listH = Math.min(results.length * ITEM_HEIGHT, LIST_MAX_HEIGHT);
      // If there's more space above the input than below — render above
      const above = y > listH + 16;
      setDropdownPos({
        left: x,
        width,
        top: above ? y - listH - 4 : y + height + 4,
        above,
      });
    });
  }, [results.length]);

  const handleFocus = useCallback(() => {
    onFocus(value);
    // Small delay so keyboard starts appearing and y-coordinate is final
    setTimeout(measureInput, 120);
  }, [value, onFocus, measureInput]);

  const handleChange = useCallback((text: string) => {
    onChange(text);
    search(text);
    // Re-measure after results update (handled in useEffect below)
  }, [onChange, search]);

  // Re-measure whenever results change and dropdown is open
  React.useEffect(() => {
    if (isOpen) {
      setTimeout(measureInput, 50);
    }
  }, [results.length, isOpen, measureInput]);

  const handleSelect = useCallback((c: Client) => {
    select(c, onSelect);
    Keyboard.dismiss();
    setDropdownPos(null);
  }, [select, onSelect]);

  const handleBlur = useCallback(() => {
    onBlur();
    // Delay matches useAutocomplete onBlur 150ms to let onPress fire first
    setTimeout(() => setDropdownPos(null), 200);
  }, [onBlur]);

  const inputStyle = [
    styles.input,
    isDark ? styles.inputDark : styles.inputLight,
  ];

  const dropBg = isDark ? '#2C2C2C' : '#ffffff';
  const dropBorder = isDark ? '#444' : '#E0E0E0';
  const textColor = isDark ? '#EEE' : '#222';

  return (
    <View style={styles.container}>
      {/* Wrap the name input in a measured View */}
      <View ref={inputRef} collapsable={false}>
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
        />
      </View>

      <TextInput
        style={[inputStyle, { marginTop: 8 }]}
        placeholder="Телефон (необязательно)"
        placeholderTextColor={isDark ? '#888' : '#aaa'}
        value={phone}
        onChangeText={onChangePhone}
        keyboardType="phone-pad"
        returnKeyType="done"
      />

      {/* Dropdown rendered in a transparent Modal — above keyboard, outside ScrollView */}
      {isOpen && results.length > 0 && dropdownPos ? (
        <Modal
          transparent
          animationType="none"
          visible
          onRequestClose={dismiss}
          statusBarTranslucent
        >
          {/* Invisible backdrop — tap outside to close */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={dismiss}
            activeOpacity={1}
          />
          <View
            style={[
              styles.dropdown,
              {
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
                maxHeight: LIST_MAX_HEIGHT,
                backgroundColor: dropBg,
                borderColor: dropBorder,
              },
              Platform.OS === 'android' ? { elevation: 12 } : {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 10,
              },
            ]}
          >
            <FlatList
              data={results}
              keyExtractor={(c) => String(c.id)}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              renderItem={({ item: c, index }) => (
                <TouchableOpacity
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
              )}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // No zIndex needed — dropdown is in a Modal
  },
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
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: ITEM_HEIGHT,
  },
  itemLeft: { flex: 1, marginRight: 8 },
  itemName:  { fontSize: 15, fontWeight: '500' },
  itemPhone: { fontSize: 12, color: '#999', marginTop: 2 },
  selectHint: { fontSize: 16, color: '#bbb' },
});
