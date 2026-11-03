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
            <Ionicons name="home-outline" size={size} color={String(color)} />
          ),
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable style={styles.headerButton} accessibilityLabel="Configurações">
                <Ionicons name="settings-outline" size={24} color={theme.text} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="income"
        options={{
          title: 'Receita',
          headerTitle: 'Receitas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="arrow-down-circle-outline" size={size} color={String(color)} />
          ),
          headerRight: () => (
            <Link href={{ pathname: '/new-transaction', params: { initialType: 'INCOME' } }} asChild>
              <Pressable style={styles.headerButton}>
                <Ionicons name="add-circle" size={28} color={theme.income} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Despesas',
          headerTitle: 'Despesas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="arrow-up-circle-outline" size={size} color={String(color)} />
          ),
          headerRight: () => (
            <Link href={{ pathname: '/new-transaction', params: { initialType: 'EXPENSE' } }} asChild>
              <Pressable style={styles.headerButton}>
                <Ionicons name="add-circle" size={28} color={theme.expense} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Relatórios',
          headerTitle: 'Relatórios',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pie-chart-outline" size={size} color={String(color)} />
          ),
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          href: null,
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
