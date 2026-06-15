import React from 'react';
import { Text, TextStyle } from 'react-native';

interface Props {
  text: string;
  query: string;
  accentColor: string;
  baseStyle?: TextStyle;
}

export function HighlightedText({ text, query, accentColor, baseStyle }: Props) {
  if (!query.trim()) return <Text style={baseStyle}>{text}</Text>;

  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index === -1) return <Text style={baseStyle}>{text}</Text>;

  return (
    <Text style={baseStyle}>
      {text.slice(0, index)}
      <Text style={[baseStyle, { color: accentColor, fontWeight: 'bold' }]}>
        {text.slice(index, index + query.length)}
      </Text>
      {text.slice(index + query.length)}
    </Text>
  );
}
