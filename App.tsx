import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#16161A',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#F4F4F2' }}>knockon — Phase 0</Text>
      <StatusBar style="light" />
    </View>
  );
}
