# OGK Diary Upgrade

This is an upgraded Expo app for Android with:
- improved UI
- saved favorites
- local daily reminders
- customizable tone, CTA, audience, and brand settings
- copy/share actions for WhatsApp Status, Facebook, and LinkedIn

## Run locally

```bash
npm install
npx expo start
```

## Build APK with EAS

```bash
eas login
eas build -p android --profile preview
```

## Notes
- Daily reminders are local notifications on the phone.
- Email automation is not included in the app itself; that still requires a backend or cloud scheduler.
