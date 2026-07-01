import React from 'react';
import { View } from 'react-native';

export const PRESET_COLORS = [
  { label: 'Чёрный',         hex: '#1C1C1C' },
  { label: 'Белый',          hex: '#F5F5F0' },
  { label: 'Серый',          hex: '#9E9E9E' },
  { label: 'Коричневый',     hex: '#8B4513' },
  { label: 'Тём.коричневый', hex: '#3E1C02' },
  { label: 'Бежевый',        hex: '#F0DFB4' },
  { label: 'Кремовый',       hex: '#FFFDD0' },
  { label: 'Нюд',            hex: '#E8C4A0' },
  { label: 'Горчичный',      hex: '#D4A017' },
  { label: 'Жёлтый',        hex: '#FFD700' },
  { label: 'Оранжевый',      hex: '#FF8C00' },
  { label: 'Красный',        hex: '#D32F2F' },
  { label: 'Бордовый',       hex: '#7B1A2A' },
  { label: 'Розовый',        hex: '#F48FB1' },
  { label: 'Фиолетовый',     hex: '#7B1FA2' },
  { label: 'Синий',          hex: '#1565C0' },
  { label: 'Тём.синий',      hex: '#0D1B4B' },
  { label: 'Голубой',        hex: '#42A5F5' },
  { label: 'Зелёный',        hex: '#2E7D32' },
  { label: 'Хаки',           hex: '#7A7A3A' },
  { label: 'Оливковый',      hex: '#6B6B2A' },
  { label: 'Золотой',        hex: '#C9A84C' },
  { label: 'Серебряный',     hex: '#B0BEC5' },
  { label: 'Мульти',         hex: '#MULTICOLOR' },
];

export function getColorHex(colorLabel: string): string | null {
  const found = PRESET_COLORS.find(
    c => c.label.toLowerCase() === colorLabel.toLowerCase()
  );
  return found ? found.hex : null;
}

interface ColorCircleProps {
  hex: string;
  size?: number;
  style?: any;
}

export function ColorCircle({ hex, size = 20, style }: ColorCircleProps) {
  if (hex === '#MULTICOLOR') {
    return (
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        flexDirection: 'row',
      }}>
        <View style={{ flex: 1, backgroundColor: '#D32F2F' }} />
        <View style={{ flex: 1, backgroundColor: '#FFD700' }} />
        <View style={{ flex: 1, backgroundColor: '#2E7D32' }} />
        <View style={{ flex: 1, backgroundColor: '#1565C0' }} />
      </View>
    );
  }

  return (
    <View style={[
      {
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hex,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.15)',
      },
      style
    ]} />
  );
}
