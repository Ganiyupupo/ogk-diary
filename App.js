import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const STORAGE_KEY = 'ogk_settings_v2';
const FAVORITES_KEY = 'ogk_favorites_v2';

const defaultSettings = {
  brandName: 'OGK Diary',
  niche: 'Motivation',
  audience: 'young professionals and entrepreneurs',
  cta: 'Keep showing up today.',
  dailyReminder: true,
  reminderHour: '07',
  reminderMinute: '30',
  tone: 'bold',
};

const themes = {
  bold: ['discipline', 'consistency', 'self-respect', 'execution', 'grit'],
  calm: ['gratitude', 'clarity', 'patience', 'healing', 'balance'],
  growth: ['learning', 'progress', 'habits', 'leadership', 'vision'],
};

function pick(arr, i) {
  return arr[i % arr.length];
}

function generatePosts(settings, dayOffset = 0) {
  const pool = themes[settings.tone] || themes.bold;
  const topic = pick(pool, new Date().getDate() + dayOffset);
  const hook = `${topic[0].toUpperCase()}${topic.slice(1)} is built in ordinary moments.`;
  const whatsapp = `${hook} ${settings.cta} #${settings.niche.replace(/\s+/g, '')} #DailyMotivation`;
  const facebook = `${settings.brandName} — Daily ${settings.niche} Post\n\n${hook}\n\nMost people quit because progress is quiet before it becomes visible. Stay steady, stay focused, and keep your standards high.\n\nAudience: ${settings.audience}.\n\n${settings.cta}\n\n#Motivation #Mindset #Success #OGKDiary`;
  const linkedin = `Today’s professional reminder: ${topic} compounds.\n\nThe people who grow fastest are usually the ones who keep their commitments when nobody is watching. Small, repeated actions build credibility, confidence, and momentum.\n\nFor ${settings.audience}: keep your systems simple and your standards high.\n\n${settings.cta}\n\n#Leadership #PersonalDevelopment #Motivation #GrowthMindset`;
  return { topic, whatsapp, facebook, linkedin };
}

async function requestNotificationPermissions() {
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  return status === 'granted';
}

async function scheduleReminder(hourStr, minuteStr) {
  const hour = Math.max(0, Math.min(23, Number(hourStr || 7)));
  const minute = Math.max(0, Math.min(59, Number(minuteStr || 30)));
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'OGK Diary',
      body: 'Your daily posts are ready to generate.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

function Field({ label, value, onChangeText, placeholder }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#6b7280"
      />
    </View>
  );
}

function PostCard({ title, text, onCopy, onShare, onFavorite }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{text}</Text>
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={onCopy}>
          <Text style={styles.actionText}>Copy</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={onShare}>
          <Text style={styles.actionText}>Share</Text>
        </Pressable>
        <Pressable style={styles.favoriteBtn} onPress={onFavorite}>
          <Text style={styles.favoriteText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function App() {
  const [settings, setSettings] = useState(defaultSettings);
  const [saved, setSaved] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const fav = await AsyncStorage.getItem(FAVORITES_KEY);
        if (raw) setSettings({ ...defaultSettings, ...JSON.parse(raw) });
        if (fav) setSaved(JSON.parse(fav));
      } catch (e) {
        console.log('Storage load failed', e);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!settings.dailyReminder) {
        await Notifications.cancelAllScheduledNotificationsAsync();
        return;
      }
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleReminder(settings.reminderHour, settings.reminderMinute);
      }
    })();
  }, [settings.dailyReminder, settings.reminderHour, settings.reminderMinute]);

  const posts = useMemo(() => generatePosts(settings, dayOffset), [settings, dayOffset]);

  const updateSetting = (key, value) => setSettings((s) => ({ ...s, [key]: value }));

  const saveSettings = async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    Alert.alert('Saved', 'Your OGK Diary settings have been updated.');
    setSettingsOpen(false);
  };

  const copyText = async (label, text) => {
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const shareText = async (label, text) => {
    try {
      await Share.share({ message: `${label}\n\n${text}` });
    } catch (e) {
      Alert.alert('Share failed', 'Could not open the share menu.');
    }
  };

  const saveFavorite = async (title, text) => {
    const entry = {
      id: `${Date.now()}-${title}`,
      title,
      text,
      createdAt: new Date().toLocaleString(),
    };
    const next = [entry, ...saved].slice(0, 20);
    setSaved(next);
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    Alert.alert('Saved', `${title} saved to Favorites.`);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.brand}>{settings.brandName}</Text>
          <Text style={styles.heroTitle}>Premium daily post generator</Text>
          <Text style={styles.heroSub}>Motivation content for WhatsApp, Facebook, and LinkedIn.</Text>
          <View style={styles.heroButtons}>
            <Pressable style={styles.primaryBtn} onPress={() => setSettingsOpen(true)}>
              <Text style={styles.primaryText}>Settings</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setDayOffset((v) => v + 1)}>
              <Text style={styles.secondaryText}>Next day</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statRow}>
          <View style={styles.statCard}><Text style={styles.statValue}>{posts.topic}</Text><Text style={styles.statLabel}>Today’s focus</Text></View>
          <View style={styles.statCard}><Text style={styles.statValue}>{saved.length}</Text><Text style={styles.statLabel}>Saved posts</Text></View>
        </View>

        <PostCard title="WhatsApp Status" text={posts.whatsapp} onCopy={() => copyText('WhatsApp Status', posts.whatsapp)} onShare={() => shareText('WhatsApp Status', posts.whatsapp)} onFavorite={() => saveFavorite('WhatsApp Status', posts.whatsapp)} />
        <PostCard title="Facebook Post" text={posts.facebook} onCopy={() => copyText('Facebook Post', posts.facebook)} onShare={() => shareText('Facebook Post', posts.facebook)} onFavorite={() => saveFavorite('Facebook Post', posts.facebook)} />
        <PostCard title="LinkedIn Post" text={posts.linkedin} onCopy={() => copyText('LinkedIn Post', posts.linkedin)} onShare={() => shareText('LinkedIn Post', posts.linkedin)} onFavorite={() => saveFavorite('LinkedIn Post', posts.linkedin)} />

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Favorites</Text>
          {saved.length === 0 ? (
            <Text style={styles.cardBody}>Save posts here to reuse your best-performing ideas.</Text>
          ) : (
            saved.map((item) => (
              <View key={item.id} style={styles.favoriteItem}>
                <Text style={styles.favoriteItemTitle}>{item.title}</Text>
                <Text style={styles.favoriteItemDate}>{item.createdAt}</Text>
                <Text style={styles.favoriteItemBody}>{item.text}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <Modal visible={settingsOpen} animationType="slide">
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalContainer}>
            <Text style={styles.modalTitle}>Customize OGK Diary</Text>
            <Field label="Brand name" value={settings.brandName} onChangeText={(v) => updateSetting('brandName', v)} placeholder="OGK Diary" />
            <Field label="Niche" value={settings.niche} onChangeText={(v) => updateSetting('niche', v)} placeholder="Motivation" />
            <Field label="Audience" value={settings.audience} onChangeText={(v) => updateSetting('audience', v)} placeholder="young professionals" />
            <Field label="Daily CTA" value={settings.cta} onChangeText={(v) => updateSetting('cta', v)} placeholder="Keep showing up today." />
            <Field label="Tone (bold/calm/growth)" value={settings.tone} onChangeText={(v) => updateSetting('tone', v.toLowerCase())} placeholder="bold" />

            <View style={styles.rowBetween}>
              <Text style={styles.label}>Daily reminder</Text>
              <Switch value={settings.dailyReminder} onValueChange={(v) => updateSetting('dailyReminder', v)} />
            </View>

            <View style={styles.rowGap}>
              <View style={styles.half}><Field label="Hour" value={settings.reminderHour} onChangeText={(v) => updateSetting('reminderHour', v)} placeholder="07" /></View>
              <View style={styles.half}><Field label="Minute" value={settings.reminderMinute} onChangeText={(v) => updateSetting('reminderMinute', v)} placeholder="30" /></View>
            </View>

            <View style={styles.heroButtons}>
              <Pressable style={styles.primaryBtn} onPress={saveSettings}><Text style={styles.primaryText}>Save</Text></Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => setSettingsOpen(false)}><Text style={styles.secondaryText}>Close</Text></Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 18, paddingBottom: 44 },
  hero: { backgroundColor: '#111827', borderRadius: 22, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#1f2937' },
  brand: { color: '#34d399', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  heroTitle: { color: 'white', fontSize: 28, fontWeight: '800', marginBottom: 8 },
  heroSub: { color: '#cbd5e1', lineHeight: 20, marginBottom: 16 },
  heroButtons: { flexDirection: 'row', gap: 12 },
  primaryBtn: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14 },
  primaryText: { color: '#052e16', fontWeight: '800' },
  secondaryBtn: { backgroundColor: '#1f2937', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14 },
  secondaryText: { color: '#e5e7eb', fontWeight: '700' },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 2 },
  statCard: { flex: 1, backgroundColor: '#111827', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#1f2937' },
  statValue: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 6 },
  statLabel: { color: '#94a3b8', fontSize: 13 },
  card: { backgroundColor: '#111827', borderRadius: 20, padding: 16, marginTop: 12, borderWidth: 1, borderColor: '#1f2937' },
  cardTitle: { color: 'white', fontSize: 19, fontWeight: '800', marginBottom: 10 },
  cardBody: { color: '#d1d5db', lineHeight: 22, fontSize: 15 },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, backgroundColor: '#1d4ed8', alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
  actionText: { color: 'white', fontWeight: '700' },
  favoriteBtn: { flex: 1, backgroundColor: '#334155', alignItems: 'center', paddingVertical: 11, borderRadius: 12 },
  favoriteText: { color: '#f8fafc', fontWeight: '700' },
  modalSafe: { flex: 1, backgroundColor: '#0f172a' },
  modalContainer: { padding: 18, paddingBottom: 40 },
  modalTitle: { color: 'white', fontSize: 26, fontWeight: '800', marginBottom: 16 },
  fieldWrap: { marginBottom: 14 },
  label: { color: '#e5e7eb', marginBottom: 8, fontWeight: '700' },
  input: { backgroundColor: '#111827', color: 'white', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#1f2937' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  rowGap: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  favoriteItem: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#1f2937' },
  favoriteItemTitle: { color: '#fff', fontWeight: '700', marginBottom: 4 },
  favoriteItemDate: { color: '#94a3b8', fontSize: 12, marginBottom: 6 },
  favoriteItemBody: { color: '#d1d5db', lineHeight: 21 },
});
