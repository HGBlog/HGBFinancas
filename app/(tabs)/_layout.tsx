import { Tabs, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet } from 'react-native';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme];

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.tabIconDefault,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
        headerStyle: {
          backgroundColor: theme.card,
        },
        headerTitleStyle: {
          fontWeight: '700',
          color: theme.text,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          headerTitle: () => (
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          ),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={String(color)} />
          ),
          headerRight: () => (
            <Link href="/new-transaction" asChild>
              <Pressable style={styles.headerButton}>
                <Ionicons name="add-circle" size={28} color={theme.tint} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: 'Contas',
          headerTitle: 'Minhas Contas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="card-outline" size={size} color={String(color)} />
          ),
          headerRight: () => (
            <Link href="/new-transaction" asChild>
              <Pressable style={styles.headerButton}>
                <Ionicons name="add-circle" size={28} color={theme.tint} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Relatórios',
          headerTitle: 'Relatórios Financeiros',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: 'Planejamento',
          headerTitle: 'Orçamento & Contas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null, // Ocultar tela de exemplo original
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    marginRight: 16,
    padding: 4,
  },
  headerLogo: {
    width: 165,
    height: 48,
  },
});
