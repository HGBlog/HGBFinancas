import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { View, ActivityIndicator } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import { getDatabase } from '@/db/database';
import { initNotifications, scheduleExpenseReminderNotifications } from '@/services/notificationService';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    async function init() {
      try {
        await getDatabase();
        try {
          await initNotifications();
          await scheduleExpenseReminderNotifications();
        } catch (notifErr) {
          console.warn('Aviso ao inicializar notificações:', notifErr);
        }
      } catch (e) {
        console.error('Erro ao inicializar banco de dados SQLite:', e);
      } finally {
        setDbReady(true);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (loaded && dbReady) {
      SplashScreen.hideAsync();
    }
  }, [loaded, dbReady]);

  if (!loaded || !dbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0D9488" />
      </View>
    );
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="new-transaction" 
          options={{ 
            presentation: 'modal', 
            title: 'Novo Lançamento',
            headerShown: true 
          }} 
        />
        <Stack.Screen 
          name="account/[id]" 
          options={{ 
            title: 'Extrato da Conta',
            headerShown: true 
          }} 
        />
        <Stack.Screen 
          name="category-manager" 
          options={{ 
            title: 'Gerenciar Categorias',
            headerShown: true 
          }} 
        />
        <Stack.Screen 
          name="import-ofx" 
          options={{ 
            title: 'Importar Extrato OFX',
            headerShown: true 
          }} 
        />
        <Stack.Screen 
          name="settings" 
          options={{ 
            title: 'Configurações',
            headerShown: true 
          }} 
        />
        <Stack.Screen 
          name="backup" 
          options={{ 
            title: 'Backup & Restauração',
            headerShown: true 
          }} 
        />
      </Stack>
    </ThemeProvider>
  );
}
