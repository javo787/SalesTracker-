import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Alert, RefreshControl
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addProduct, getProducts } from '../db/database';

export default function ProductsScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [stock, setStock] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadProducts = () => setProducts(getProducts());

  useFocusEffect(useCallback(() => { loadProducts(); }, []));

  const onRefresh = () => {
    setRefreshing(true);
    loadProducts();
    setRefreshing(false);
  };

  const handleAdd = () => {
    if (!name.trim() || !buyPrice || !sellPrice) {
      Alert.alert('Ошибка', 'Заполните название, цену закупки и продажи');
      return;
    }
    addProduct(name.trim(), parseFloat(buyPrice), parseFloat(sellPrice), parseInt(stock) || 0);
    setName(''); setBuyPrice(''); setSellPrice(''); setStock('');
    setShowForm(false);
    loadProducts();
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <TouchableOpacity
        style={styles.addBtn}
        onPress={() => setShowForm(!showForm)}
      >
        <Text style={styles.addBtnText}>{showForm ? '✕ Отмена' : '+ Добавить товар'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.formTitle}>Новый товар</Text>

          <Text style={styles.label}>Название *</Text>
          <TextInput
            style={styles.input}
            placeholder="Например: помидоры, мука 1кг"
            value={name}
            onChangeText={setName}
          />

          <View style={styles.row}>
            <View style={styles.half}>
              <Text style={styles.label}>Закупка *</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                value={buyPrice}
                onChangeText={setBuyPrice}
              />
            </View>
            <View style={styles.half}>
              <Text style={styles.label}>Продажа *</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                keyboardType="numeric"
                value={sellPrice}
                onChangeText={setSellPrice}
              />
            </View>
          </View>

          <Text style={styles.label}>Остаток (шт)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            keyboardType="numeric"
            value={stock}
            onChangeText={setStock}
          />

          {buyPrice && sellPrice && (
            <View style={styles.marginPreview}>
              <Text style={styles.marginText}>
                Маржа: {(parseFloat(sellPrice) - parseFloat(buyPrice)).toFixed(1)} сом
                ({((( parseFloat(sellPrice) - parseFloat(buyPrice)) / parseFloat(sellPrice)) * 100).toFixed(0)}%)
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.saveBtn} onPress={handleAdd}>
            <Text style={styles.saveBtnText}>Сохранить товар</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>
        Все товары ({products.length})
      </Text>

      {products.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Товаров пока нет</Text>
          <Text style={styles.emptyHint}>Добавь первый товар выше</Text>
        </View>
      ) : (
        products.map((p: any) => (
          <View key={p.id} style={styles.productItem}>
            <View style={styles.productLeft}>
              <Text style={styles.productName}>{p.name}</Text>
              <Text style={styles.productPrices}>
                Закупка: {p.buy_price} сом · Продажа: {p.sell_price} сом
              </Text>
            </View>
            <View style={styles.productRight}>
              <Text style={[
                styles.productStock,
                p.stock < 5 && { color: '#E53935' }
              ]}>
                {p.stock} шт
              </Text>
              <Text style={styles.productProfit}>
                +{(p.sell_price - p.buy_price).toFixed(0)} сом
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  addBtn: {
    margin: 16, backgroundColor: '#1D9E75',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  form: {
    marginHorizontal: 16, marginBottom: 8, backgroundColor: '#fff',
    borderRadius: 12, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  formTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  label: { fontSize: 13, color: '#555', marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: '#F5F5F5', borderRadius: 8, padding: 12,
    fontSize: 15, color: '#222', borderWidth: 1, borderColor: '#E0E0E0',
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  marginPreview: {
    marginTop: 12, padding: 10, backgroundColor: '#F0FBF7',
    borderRadius: 8, borderWidth: 1, borderColor: '#1D9E75',
  },
  marginText: { fontSize: 13, color: '#1D9E75', fontWeight: '500' },
  saveBtn: {
    backgroundColor: '#1D9E75', borderRadius: 10,
    padding: 14, alignItems: 'center', marginTop: 16,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  sectionTitle: {
    fontSize: 15, fontWeight: '600', color: '#333',
    paddingHorizontal: 16, marginBottom: 8,
  },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 15, color: '#999', marginBottom: 6 },
  emptyHint: { fontSize: 13, color: '#bbb' },
  productItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 8,
    borderRadius: 12, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 2,
  },
  productLeft: { flex: 1 },
  productName: { fontSize: 15, fontWeight: '500', color: '#222' },
  productPrices: { fontSize: 12, color: '#999', marginTop: 3 },
  productRight: { alignItems: 'flex-end' },
  productStock: { fontSize: 15, fontWeight: '600', color: '#222' },
  productProfit: { fontSize: 13, color: '#1D9E75', marginTop: 3 },
});