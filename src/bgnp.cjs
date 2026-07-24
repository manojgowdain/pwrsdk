// withBackgroundActionsManifest.cjs
//
// Expo config plugin for react-native-background-actions on Android 14+.
// The pwrsdk package is ESM, so this plugin is kept as .cjs because Expo
// config plugin loading commonly expects CommonJS.

const { withAndroidManifest } = require("@expo/config-plugins");

const SERVICE_NAME = "com.asterinet.react.bgactions.RNBackgroundActionsTask";
const FOREGROUND_SERVICE_TYPE = "connectedDevice";

const REQUIRED_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
  "android.permission.BLUETOOTH_SCAN",
  "android.permission.BLUETOOTH_CONNECT",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.WAKE_LOCK",
];

function ensurePermissions(androidManifest) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) {
    manifest["uses-permission"] = [];
  }

  REQUIRED_PERMISSIONS.forEach((permission) => {
    const exists = manifest["uses-permission"].some(
      (item) => item.$["android:name"] === permission
    );
    if (!exists) {
      manifest["uses-permission"].push({ $: { "android:name": permission } });
    }
  });
}

function ensureServiceType(androidManifest) {
  const application = androidManifest.manifest.application?.[0];
  if (!application) return;

  if (!application.service) {
    application.service = [];
  }

  const existing = application.service.find(
    (service) => service.$["android:name"] === SERVICE_NAME
  );

  if (existing) {
    existing.$["android:foregroundServiceType"] = FOREGROUND_SERVICE_TYPE;
    existing.$["tools:node"] = "merge";
    existing.$["tools:replace"] = "android:foregroundServiceType";
  } else {
    application.service.push({
      $: {
        "android:name": SERVICE_NAME,
        "android:foregroundServiceType": FOREGROUND_SERVICE_TYPE,
        "android:exported": "false",
      },
    });
  }
}

function ensureToolsNamespace(androidManifest) {
  const manifest = androidManifest.manifest;
  if (!manifest.$["xmlns:tools"]) {
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
  }
}

const withBackgroundActionsManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    ensureToolsNamespace(config.modResults);
    ensurePermissions(config.modResults);
    ensureServiceType(config.modResults);
    return config;
  });
};

module.exports = withBackgroundActionsManifest;
