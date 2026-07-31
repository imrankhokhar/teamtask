import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from './src/auth';
import { useRealtimeNotifications } from './src/notifications';
import { colors } from './src/theme';
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
import { refreshApiUrl } from './src/api';

const Stack = createNativeStackNavigator();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
  },
};

function RootNav() {
  const { user, loading } = useAuth();
  useRealtimeNotifications();

  React.useEffect(() => {
    refreshApiUrl().catch(() => undefined);
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
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
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
          <Stack.Screen name="Sounds" component={SoundsScreen} />
          <Stack.Screen name="EmailSettings" component={EmailSettingsScreen} />
          <Stack.Screen name="EmailTemplates" component={EmailTemplatesScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
          <Stack.Screen name="Connection" component={ConnectionScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <RootNav />
      </NavigationContainer>
    </AuthProvider>
  );
}
