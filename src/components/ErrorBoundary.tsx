import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import crashlytics from '@react-native-firebase/crashlytics';

interface Props {
  children: React.ReactNode;
  // Вызывается сразу при перехвате ошибки рендера, ДО того как пользователь
  // успеет нажать «Перезапустить». Нужен родителю (App.tsx), чтобы принудительно
  // скрыть сплэш-оверлей: тот скрывается только когда AppContent сам вызовет
  // onReady(), а если AppContent упал при первом рендере — onReady() никогда
  // не будет вызван, и этот экран (с кнопкой «Перезапустить») навсегда
  // останется невидимым ПОД сплэшем.
  onError?: () => void;
}

interface State {
  hasError: boolean;
}

// Без ErrorBoundary необработанная ошибка рендера в ЛЮБОМ экране (например,
// null/undefined поле в старых данных, которых не было в исходном формате
// записи) размонтирует ВСЁ дерево React — пользователь видит просто цвет
// фона нативного корневого view (белый на светлой теме, чёрный на тёмной)
// и не может ничего нажать, единственный выход — принудительно закрыть и
// заново открыть приложение.
//
// Этот компонент ловит такие ошибки и показывает экран с кнопкой
// "Перезапустить", которая пытается сделать то же самое, что ручной
// перезапуск (Updates.reloadAsync() — мягкая перезагрузка JS-бандла), не
// заставляя пользователя самого закрывать приложение.
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Необработанная ошибка рендера:', error, info.componentStack);
    crashlytics().log(`ErrorBoundary: ${info.componentStack?.trim().split('\n')[0] ?? 'unknown component'}`);
    crashlytics().recordError(error);
    this.props.onError?.();
  }

  handleRestart = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      // Updates.reloadAsync недоступен (например, в dev-сборке) —
      // просто пробуем перерисовать дерево заново.
      this.setState({ hasError: false });
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Ionicons name="alert-circle-outline" size={56} color="#FF6B6B" />
          <Text style={styles.title}>Что-то пошло не так</Text>
          <Text style={styles.subtitle}>
            Произошла непредвиденная ошибка. Нажмите «Перезапустить», чтобы продолжить работу.
          </Text>
          <TouchableOpacity style={styles.button} onPress={this.handleRestart}>
            <Text style={styles.buttonText}>Перезапустить</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
    color: '#1a1a1a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1D9E75',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 15,
  },
});
