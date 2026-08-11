import React, { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth';
import { ThemeProvider, useTheme } from './src/theme';
import { useRealtimeNotifications } from './src/notifications';
import LoginScreen from './src/screens/LoginScreen';
import TasksScreen from './src/screens/TasksScreen';
import CreateTaskScreen from './src/screens/CreateTaskScreen';
import TaskDetailScreen from './src/screens/TaskDetailScreen';
import TeamsScreen from './src/screens/TeamsScreen';
import UsersScreen from './src/screens/UsersScreen';
import RolesScreen from './src/screens/RolesScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AdminScreen from './src/screens/AdminScreen';
import SoundsScreen from './src/screens/SoundsScreen';
import EmailSettingsScreen from './src/screens/EmailSettingsScreen';
import EmailTemplatesScreen from './src/screens/EmailTemplatesScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import ConnectionScreen from './src/screens/ConnectionScreen';
import ChangePasswordScreen from './src/screens/ChangePasswordScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import FuelCalScreen from './src/screens/FuelCalScreen';
import { refreshApiUrl } from './src/api';
import LoadingView from './src/components/LoadingView';

const Stack = createNativeStackNavigator();

function RootNav() {
  const { user, loading } = useAuth();
  const { colors, resolved } = useTheme();
  useRealtimeNotifications();

  React.useEffect(() => {
    refreshApiUrl().catch(() => undefined);
  }, []);

  if (loading) {
    return <LoadingView fullScreen label="Starting TeamTask…" />;
  }

  return (
    <>
      <StatusBar style={resolved === 'light' ? 'dark' : 'light'} />
      <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Connection" component={ConnectionScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Tasks" component={TasksScreen} />
            <Stack.Screen name="CreateTask" component={CreateTaskScreen} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} />
            <Stack.Screen name="Teams" component={TeamsScreen} />
            <Stack.Screen name="Users" component={UsersScreen} />
            <Stack.Screen name="Roles" component={RolesScreen} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} />
            <Stack.Screen name="FuelCal" component={FuelCalScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
            <Stack.Screen name="Sounds" component={SoundsScreen} />
            <Stack.Screen name="EmailSettings" component={EmailSettingsScreen} />
            <Stack.Screen name="EmailTemplates" component={EmailTemplatesScreen} />
            <Stack.Screen name="Admin" component={AdminScreen} />
            <Stack.Screen name="Connection" component={ConnectionScreen} />
          </>
        )}
      </Stack.Navigator>
    </>
  );
}

function ThemedApp() {
  const { colors, resolved, ready } = useTheme();

  const navTheme = useMemo(() => {
    const base = resolved === 'light' ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: colors.bg,
        card: colors.bgElevated,
        text: colors.text,
        border: colors.border,
        primary: colors.accent,
      },
    };
  }, [colors, resolved]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <RootNav />
    </NavigationContainer>
  );
}

export default function App() {
  // Load from app assets (not node_modules/@expo/...) so production URLs have no "@"
  // which breaks on many reverse proxies / nginx setups.
  const [fontsLoaded] = useFonts({
    Ionicons: require('./assets/fonts/Ionicons.ttf'),
  });

  if (!fontsLoaded) {
    return <LoadingView fullScreen label="Loading…" />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
