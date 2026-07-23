// withBackgroundActionsManifest.js
//
// Fixes: android.app.InvalidForegroundServiceTypeException: Starting FGS
// with type none ... has been prohibited.
//
// react-native-background-actions' own AndroidManifest.xml (bundled inside
// the library) declares the RNBackgroundActionsTask service WITHOUT a
// foregroundServiceType. As of Android 14 (API 34) — and now strictly
// enforced at targetSdk 34+/36 — a foreground service started with no type
// is rejected outright at runtime, which is the crash you saw.
//
// Since this is an Expo managed project, android/app/src/main/AndroidManifest.xml
// is regenerated on every prebuild, so this can't be hand-edited once —
// it needs to be injected via a config plugin so it survives every build.
//
// This plugin:
//   1. Adds the uses-permission entries Android 14+ requires for a
//      "connectedDevice" typed foreground service.
//   2. Declares (or overrides, via tools:node="merge" + tools:replace) the
//      RNBackgroundActionsTask service with foregroundServiceType="connectedDevice".
//
// This MUST match the `foregroundServiceTypes: ["connectedDevice"]` option
// passed to BackgroundActions.start() in notificationService.js — the two
// have to agree or Android will silently ignore/reject the mismatched type.

const { withAndroidManifest } = require("@expo/config-plugins");

const SERVICE_NAME = "com.asterinet.react.bgactions.RNBackgroundActionsTask";
const FOREGROUND_SERVICE_TYPE = "dataSync";

const REQUIRED_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
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
    // The library's own manifest already declares this service — override
    // its attributes (no foregroundServiceType) with ours via merge rules.
    existing.$["android:foregroundServiceType"] = FOREGROUND_SERVICE_TYPE;
    existing.$["tools:node"] = "merge";
    existing.$["tools:replace"] = "android:foregroundServiceType";
  } else {
    // Not present yet (e.g. library manifest merge hasn't run) — declare
    // it fully so the type is present either way.
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