import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, TextInput, Dimensions,
  Modal, Animated, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

type Mode = 'normal' | 'trade';
type TradeTab = 'markup' | 'margin' | 'batch' | 'reverse';

export default function CalculatorScreen({ navigation }: any) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('normal');
  const [tradeTab, setTradeTab] = useState<TradeTab>('markup');

  // Обычный калькулятор
  const [cur, setCur] = useState('0');
  const [prev, setPrev] = useState('');
  const [op, setOp] = useState<string | null>(null);
  const [expr, setExpr] = useState('');
  const [fresh, setFresh] = useState(false);

  // Торговый — наценка
  const [tBuy, setTBuy] = useState('');
  const [tPct, setTPct] = useState('');

  // Торговый — маржа
  const [mBuy, setMBuy] = useState('');
  const [mSell, setMSell] = useState('');

  // Торговый — партия
  const [bBuy, setBBuy] = useState('');
  const [bSell, setBSell] = useState('');
  const [bQty, setBQty] = useState('1');

  // Торговый — обратный
  const [rvBuy, setRvBuy] = useState('');
  const [rvProfit, setRvProfit] = useState('');

  // Обучение
  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);

  useEffect(() => {
    checkFirstTime();
  }, []);

  const checkFirstTime = async () => {
    const done = await AsyncStorage.getItem('calculator_tutorial_done');
    if (!done) {
      setShowTutorial(true);
    }
    const savedMode = await AsyncStorage.getItem('calc_mode');
    if (savedMode) setMode(savedMode as Mode);
  };

  const finishTutorial = async () => {
    setShowTutorial(false);
    await AsyncStorage.setItem('calculator_tutorial_done', 'true');
  };

  // --- Сохранение последнего режима ---
  const switchMode = async (m: Mode) => {
    setMode(m);
    await AsyncStorage.setItem('calc_mode', m);
  };

  // --- Обычный калькулятор ---
  const OPS: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  const evaluate = (p: number, o: string, c: number): number => {
    let res = 0;
    switch (o) {
      case '+': res = p + c; break;
      case '-': res = p - c; break;
      case '*': res = p * c; break;
      case '/': res = c === 0 ? 0 : p / c; break;
      default: res = c;
    }
    return Math.round(res * 1e10) / 1e10;
  };

  const pressKey = (k: string) => {
    if (k === 'AC') {
      setCur('0'); setPrev(''); setOp(null); setFresh(false); setExpr('');
    } else if (k === 'BACK') {
      if (cur.length > 1) {
        setCur(cur.slice(0, -1));
      } else {
        setCur('0');
      }
    } else if (k === '+/-') {
      setCur(String(-parseFloat(cur)));
    } else if (k === '%') {
      setCur(String(parseFloat(cur) / 100));
    } else if (['+', '-', '*', '/'].includes(k)) {
      if (op && !fresh) {
        const res = evaluate(parseFloat(prev), op, parseFloat(cur));
        setCur(String(res));
        setPrev(String(res));
      } else {
        setPrev(cur);
      }
      setOp(k);
      setFresh(true);
      setExpr(`${cur} ${OPS[k]}`);
    } else if (k === '=') {
      if (op) {
        const res = evaluate(parseFloat(prev), op, parseFloat(cur));
        setExpr(`${prev} ${OPS[op]} ${cur} =`);
        setCur(String(res));
        setOp(null);
        setFresh(false);
      }
    } else if (k === '.') {
      if (!cur.includes('.')) setCur(cur + '.');
    } else {
      if (fresh || cur === '0') { setCur(k); setFresh(false); }
      else setCur(cur + k);
    }
  };

  const displayValue = cur.length > 10
    ? parseFloat(cur).toExponential(3)
    : parseFloat(cur).toLocaleString('ru-RU');

  const transferToSale = () => {
    navigation.navigate('Продажа', { prefillPrice: cur });
  };

  // --- Торговые расчёты ---
  const fmt = (n: number) =>
    isNaN(n) || !isFinite(n) ? '—' : Math.round(n).toLocaleString('ru-RU');
  const fmtP = (n: number) =>
    isNaN(n) || !isFinite(n) ? '—' : (Math.round(n * 10) / 10) + '%';

  // Наценка
  const markupSell = () => {
    const buy = parseFloat(tBuy); const pct = parseFloat(tPct);
    if (!buy || !pct) return { sell: '—', profit: '—' };
    const sell = buy * (1 + pct / 100);
    return { sell: fmt(sell), profit: fmt(sell - buy) };
  };

  // Маржа
  const marginResult = () => {
    const buy = parseFloat(mBuy); const sell = parseFloat(mSell);
    if (!buy || !sell) return { pct: '—', profit: '—' };
    return { pct: fmtP((sell - buy) / sell * 100), profit: fmt(sell - buy) };
  };

  // Партия
  const batchResult = () => {
    const buy = parseFloat(bBuy); const sell = parseFloat(bSell);
    const qty = parseFloat(bQty) || 1;
    if (!buy || !sell) return { rev: '—', profit: '—' };
    return { rev: fmt(sell * qty), profit: fmt((sell - buy) * qty) };
  };

  // Обратный
  const reverseResult = () => {
    const buy = parseFloat(rvBuy); const profit = parseFloat(rvProfit);
    if (!buy || !profit) return { sell: '—', pct: '—' };
    const sell = buy + profit;
    return { sell: fmt(sell), pct: fmtP(profit / sell * 100) };
  };

  const saveTrade = (sellPrice: string, buyPrice: string, qty: string = '1') => {
    navigation.navigate('Продажа', {
      prefillSell: sellPrice,
      prefillBuy: buyPrice,
      prefillQty: qty,
    });
  };

  const mu = markupSell();
  const mr = marginResult();
  const bt = batchResult();
  const rv = reverseResult();

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* Переключатель режима */}
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <View style={styles.modeSwitch}>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'normal' && styles.modeBtnActive]}
              onPress={() => switchMode('normal')}
            >
              <Text style={[styles.modeBtnText, mode === 'normal' && styles.modeBtnTextActive]}>
                {t('calculator.modeNormal')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, mode === 'trade' && styles.modeBtnActive]}
              onPress={() => switchMode('trade')}
            >
              <Text style={[styles.modeBtnText, mode === 'trade' && styles.modeBtnTextActive]}>
                {t('calculator.modeTrade')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== ОБЫЧНЫЙ РЕЖИМ ===== */}
        {mode === 'normal' && (
          <View style={styles.normalSection}>
            {/* Дисплей */}
            <View style={styles.display}>
              <Text style={styles.displayExpr} numberOfLines={1}>{expr}</Text>
              <View style={styles.displayMain}>
                <Text style={styles.displayVal} numberOfLines={1} adjustsFontSizeToFit>
                  {displayValue}
                </Text>
                <TouchableOpacity style={styles.backspaceBtn} onPress={() => pressKey('BACK')}>
                  <Ionicons name="backspace-outline" size={28} color={GREEN} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Кнопки */}
            <View style={styles.keys}>
              {/* Ряд 1 */}
              <TouchableOpacity style={[styles.key, styles.keyFn]} onPress={() => pressKey('AC')}>
                <Text style={styles.keyFnText}>AC</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.key, styles.keyFn]} onPress={() => pressKey('+/-')}>
                <Text style={styles.keyFnText}>+/−</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.key, styles.keyFn]} onPress={() => pressKey('%')}>
                <Text style={styles.keyFnText}>%</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('/')}>
                <Text style={styles.keyOpText}>÷</Text>
              </TouchableOpacity>

              {/* Ряд 2 */}
              {['7','8','9'].map(k => (
                <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
                  <Text style={styles.keyText}>{k}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('*')}>
                <Text style={styles.keyOpText}>×</Text>
              </TouchableOpacity>

              {/* Ряд 3 */}
              {['4','5','6'].map(k => (
                <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
                  <Text style={styles.keyText}>{k}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('-')}>
                <Text style={styles.keyOpText}>−</Text>
              </TouchableOpacity>

              {/* Ряд 4 */}
              {['1','2','3'].map(k => (
                <TouchableOpacity key={k} style={styles.key} onPress={() => pressKey(k)}>
                  <Text style={styles.keyText}>{k}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={[styles.key, styles.keyOp]} onPress={() => pressKey('+')}>
                <Text style={styles.keyOpText}>+</Text>
              </TouchableOpacity>

              {/* Ряд 5 */}
              <TouchableOpacity style={[styles.key, styles.keyZero]} onPress={() => pressKey('0')}>
                <Text style={styles.keyText}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.key} onPress={() => pressKey('.')}>
                <Text style={styles.keyText}>.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.key, styles.keyEq]} onPress={() => pressKey('=')}>
                <Text style={styles.keyEqText}>=</Text>
              </TouchableOpacity>
            </View>

            {/* Перенос в продажу */}
            <TouchableOpacity style={styles.transferBtn} onPress={transferToSale}>
              <Ionicons name="arrow-forward-circle-outline" size={20} color={GREEN} style={{marginRight: 8}} />
              <Text style={styles.transferBtnText}>{t('calculator.transfer')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== ТОРГОВЫЙ РЕЖИМ ===== */}
        {mode === 'trade' && (
          <View style={styles.tradeSection}>
            {/* Табы */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tradeTabs} contentContainerStyle={{paddingHorizontal: 16}}>
              {(['markup','margin','batch','reverse'] as TradeTab[]).map((tId) => {
                const labels: Record<TradeTab, string> = {
                  markup: t('calculator.tabs.markup'),
                  margin: t('calculator.tabs.margin'),
                  batch: t('calculator.tabs.batch'),
                  reverse: t('calculator.tabs.reverse')
                };
                return (
                  <TouchableOpacity
                    key={tId}
                    style={[styles.tradeTab, tradeTab === tId && styles.tradeTabActive]}
                    onPress={() => setTradeTab(tId)}
                  >
                    <Text style={[styles.tradeTabText, tradeTab === tId && styles.tradeTabTextActive]}>
                      {labels[tId]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.tradeForm}>
              {/* Наценка */}
              {tradeTab === 'markup' && (
                <View>
                  <Text style={styles.label}>{t('calculator.labels.buyPrice')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={tBuy} onChangeText={setTBuy} />
                  <Text style={styles.label}>{t('calculator.labels.desiredMarkup')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={tPct} onChangeText={setTPct} />
                  <View style={styles.resultCards}>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.sellPrice')}</Text>
                      <Text style={styles.rVal}>{mu.sell}</Text>
                    </View>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.profitPerItem')}</Text>
                      <Text style={[styles.rVal, styles.rValAccent]}>{mu.profit}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.saveBtn}
                    onPress={() => {
                      const sell = String(parseFloat(tBuy) * (1 + parseFloat(tPct) / 100));
                      saveTrade(sell, tBuy, '1');
                    }}>
                    <Text style={styles.saveBtnText}>{t('calculator.saveAsSale')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Маржа */}
              {tradeTab === 'margin' && (
                <View>
                  <Text style={styles.label}>{t('calculator.labels.buyPrice')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={mBuy} onChangeText={setMBuy} />
                  <Text style={styles.label}>{t('calculator.labels.sellPrice')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={mSell} onChangeText={setMSell} />
                  <View style={styles.resultCards}>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.margin')}</Text>
                      <Text style={styles.rVal}>{mr.pct}</Text>
                    </View>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.profitPerItem')}</Text>
                      <Text style={[styles.rVal, styles.rValAccent]}>{mr.profit}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.saveBtn}
                    onPress={() => saveTrade(mSell, mBuy, '1')}>
                    <Text style={styles.saveBtnText}>{t('calculator.saveAsSale')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Партия */}
              {tradeTab === 'batch' && (
                <View>
                  <Text style={styles.label}>{t('calculator.labels.buyPrice')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={bBuy} onChangeText={setBBuy} />
                  <Text style={styles.label}>{t('calculator.labels.sellPrice')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={bSell} onChangeText={setBSell} />
                  <Text style={styles.label}>{t('calculator.labels.quantity')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="1" value={bQty} onChangeText={setBQty} />
                  <View style={styles.resultCards}>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.revenue')}</Text>
                      <Text style={styles.rVal}>{bt.rev}</Text>
                    </View>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.profit')}</Text>
                      <Text style={[styles.rVal, styles.rValAccent]}>{bt.profit}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.saveBtn}
                    onPress={() => saveTrade(bSell, bBuy, bQty)}>
                    <Text style={styles.saveBtnText}>{t('calculator.saveAsSale')}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Обратный */}
              {tradeTab === 'reverse' && (
                <View>
                  <Text style={styles.label}>{t('calculator.labels.buyPrice')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={rvBuy} onChangeText={setRvBuy} />
                  <Text style={styles.label}>{t('calculator.labels.desiredProfit')}</Text>
                  <TextInput style={styles.input} keyboardType="numeric"
                    placeholder="0" value={rvProfit} onChangeText={setRvProfit} />
                  <View style={styles.resultCards}>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.sellPrice')}</Text>
                      <Text style={[styles.rVal, styles.rValAccent]}>{rv.sell}</Text>
                    </View>
                    <View style={styles.rCard}>
                      <Text style={styles.rLabel}>{t('calculator.labels.margin')}</Text>
                      <Text style={styles.rVal}>{rv.pct}</Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.saveBtn}
                    onPress={() => {
                      const sell = String(parseFloat(rvBuy) + parseFloat(rvProfit));
                      saveTrade(sell, rvBuy, '1');
                    }}>
                    <Text style={styles.saveBtnText}>{t('calculator.saveAsSale')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Оверлей обучения */}
      {showTutorial && (
        <Modal transparent animationType="fade">
          <View style={styles.tutorialOverlay}>
            <View style={styles.tutorialBox}>
              <Ionicons
                name={
                  tutorialStep === 0 ? "options-outline" :
                  tutorialStep === 1 ? "trending-up-outline" :
                  "share-outline"
                }
                size={40} color={GREEN}
              />
              <Text style={styles.tutorialTitle}>
                {tutorialStep === 0 ? t('calculator.tutorial.welcome') :
                 tutorialStep === 1 ? t('calculator.tabs.markup') :
                 t('calculator.transfer')}
              </Text>
              <Text style={styles.tutorialText}>
                {tutorialStep === 0 ? t('calculator.tutorial.modes') :
                 tutorialStep === 1 ? t('calculator.tutorial.trade') :
                 t('calculator.tutorial.transfer')}
              </Text>

              <View style={styles.tutorialDots}>
                {[0,1,2].map(i => (
                  <View key={i} style={[styles.tutDot, tutorialStep === i && styles.tutDotActive]} />
                ))}
              </View>

              <TouchableOpacity
                style={styles.tutorialBtn}
                onPress={() => {
                  if (tutorialStep < 2) setTutorialStep(tutorialStep + 1);
                  else finishTutorial();
                }}
              >
                <Text style={styles.tutorialBtnText}>
                  {tutorialStep < 2 ? t('calculator.tutorial.next') : t('calculator.tutorial.finish')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const GREEN = '#1D9E75';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    backgroundColor: '#FFF',
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modeSwitch: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#F1F3F5',
    borderRadius: 25,
    padding: 4,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: '#868E96' },
  modeBtnTextActive: { color: '#FFF' },

  normalSection: { padding: 20 },
  display: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 20,
    alignItems: 'flex-end',
    minHeight: 120,
    justifyContent: 'flex-end',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  displayExpr: { fontSize: 16, color: '#ADB5BD', marginBottom: 4 },
  displayMain: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'flex-end' },
  displayVal: { fontSize: 44, fontWeight: '600', color: '#212529', flex: 1, textAlign: 'right' },
  backspaceBtn: { marginLeft: 15, padding: 5 },

  keys: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  key: {
    width: (width - 40 - 30) / 4,
    aspectRatio: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
    marginBottom: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5 },
      android: { elevation: 2 },
    }),
  },
  keyText: { fontSize: 24, fontWeight: '500', color: '#212529' },
  keyFn: { backgroundColor: '#F8F9FA' },
  keyFnText: { fontSize: 18, fontWeight: '600', color: '#495057' },
  keyOp: { backgroundColor: '#E6F6F1' },
  keyOpText: { fontSize: 28, fontWeight: '500', color: GREEN },
  keyEq: { backgroundColor: GREEN },
  keyEqText: { fontSize: 32, fontWeight: '500', color: '#FFF' },
  keyZero: { width: ((width - 40 - 30) / 4) * 2 + 10, aspectRatio: undefined, paddingVertical: 18 },

  transferBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#E6F6F1',
    borderWidth: 1,
    borderColor: 'rgba(29, 158, 117, 0.1)',
  },
  transferBtnText: { fontSize: 16, fontWeight: '600', color: GREEN },

  tradeSection: { paddingTop: 20 },
  tradeTabs: { marginBottom: 20 },
  tradeTab: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 25,
    marginRight: 10,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  tradeTabActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  tradeTabText: { fontSize: 14, color: '#495057', fontWeight: '600' },
  tradeTabTextActive: { color: '#FFF' },

  tradeForm: { marginHorizontal: 20 },
  label: { fontSize: 14, color: '#495057', marginBottom: 8, marginTop: 10, fontWeight: '500' },
  input: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    color: '#212529',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    marginBottom: 10,
  },
  resultCards: { flexDirection: 'row', gap: 12, marginTop: 15 },
  rCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  rLabel: { fontSize: 12, color: '#868E96', marginBottom: 6, fontWeight: '500' },
  rVal: { fontSize: 20, fontWeight: '700', color: '#212529' },
  rValAccent: { color: GREEN },

  saveBtn: {
    marginTop: 25,
    backgroundColor: GREEN,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Tutorial
  tutorialOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30
  },
  tutorialBox: {
    backgroundColor: '#FFF',
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
    width: '100%',
  },
  tutorialTitle: { fontSize: 22, fontWeight: '800', color: '#212529', marginTop: 15, textAlign: 'center' },
  tutorialText: { fontSize: 16, color: '#495057', textAlign: 'center', marginTop: 10, lineHeight: 24 },
  tutorialDots: { flexDirection: 'row', marginTop: 25, gap: 8 },
  tutDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DEE2E6' },
  tutDotActive: { width: 24, backgroundColor: GREEN },
  tutorialBtn: {
    marginTop: 30,
    backgroundColor: GREEN,
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center'
  },
  tutorialBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});