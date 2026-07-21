import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const CHANNEL_ID = "haloband-persistent";
const PERSISTENT_NOTIFICATION_ID = "haloband-status-notification";
const LOCAL_PUSH_CHANNEL_ID = "haloband-local-push";

// Flag to track if notification is manually dismissed
let isNotificationManuallyDismissed = false;

// Foreground presentation config - updated to remove deprecated API
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Create notification channels (Android only)
async function ensureChannels() {
  if (Platform.OS !== "android") return;

  // Channel for persistent/sticky notification
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: "Haloband Status",
    importance: Notifications.AndroidImportance.LOW,
    vibrationPattern: [0],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: false,
    sound: null,
  });

  // Channel for local push notifications (with sound and vibration)
  await Notifications.setNotificationChannelAsync(LOCAL_PUSH_CHANNEL_ID, {
    name: "Haloband Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 0, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
    // Remove sound: "default" to avoid the error, or use a custom sound
  });
}

// MAIN PERMISSION FUNCTION - Call this once during login
export async function requestNotificationPermissions() {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("Notification permission not granted");
      return false;
    }

    // Ensure channels are created after permission is granted
    await ensureChannels();
    
    console.log("Notification permissions granted");
    return true;
  } catch (err) {
    console.log("Failed to request notification permissions:", err);
    return false;
  }
}

// For persistent/sticky notification (shows device status)
export async function showPersistentStatusNotification({
  title = "Haloband",
  body = "Monitoring device status",
} = {}) {
  try {
    // Don't show if manually dismissed
    if (isNotificationManuallyDismissed) {
      console.log("Notification manually dismissed, not showing");
      return;
    }

    // Cancel any existing one first
    await Notifications.dismissNotificationAsync(PERSISTENT_NOTIFICATION_ID).catch(() => {});

    await Notifications.scheduleNotificationAsync({
      identifier: PERSISTENT_NOTIFICATION_ID,
      content: {
        title,
        body,
        sticky: true, // Cannot be swiped away on Android
        autoDismiss: false,
        priority: Notifications.AndroidNotificationPriority.LOW,
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: null, // Show immediately
    });

    console.log("Persistent notification shown:", { title, body });
  } catch (err) {
    console.log("Failed to show persistent notification:", err);
  }
}

// Update the persistent notification with device status
export async function updatePersistentStatusNotification(status) {
  // Don't update if manually dismissed
  if (isNotificationManuallyDismissed) {
    console.log("Notification manually dismissed, skipping update");
    return;
  }

  const body = status?.connected
    ? `Connected • HR ${status.heartRate ?? "--"} bpm • SpO₂ ${status.spo2 ?? "--"}% • Batt ${status.battery ?? "--"}%`
    : "Not connected";

  await showPersistentStatusNotification({
    title: status?.connected ? "Haloband Connected" : "Haloband Disconnected",
    body,
  });
}

// Clear persistent notification (user manually clears it)
export async function clearPersistentStatusNotification() {
  try {
    // Set flag to prevent reappearing
    isNotificationManuallyDismissed = true;
    
    await Notifications.dismissNotificationAsync(PERSISTENT_NOTIFICATION_ID);
    console.log("Persistent notification cleared and disabled");
  } catch (err) {
    console.log("Failed to clear persistent notification:", err);
  }
}

// Re-enable persistent notifications (call when you want to show again)
export function enablePersistentNotifications() {
  isNotificationManuallyDismissed = false;
  console.log("Persistent notifications re-enabled");
}

// Check if notification is currently disabled
export function isPersistentNotificationDisabled() {
  return isNotificationManuallyDismissed;
}

// LOCAL PUSH NOTIFICATION - For BLE device events
export async function sendLocalPushNotification(title, body, data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data,
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === "android" && { channelId: LOCAL_PUSH_CHANNEL_ID }),
      },
      trigger: null, // Show immediately
    });

    console.log("Local push notification sent:", { title, body });
  } catch (err) {
    console.log("Failed to send local push notification:", err);
  }
}

// Helper function to send BLE-related notifications
export function sendBLENotification(eventType, data = {}) {
  const notifications = {
    connected: {
      title: "Device Connected",
      body: "Your Haloband is now connected",
    },
    disconnected: {
      title: "Device Disconnected",
      body: "Your Haloband has been disconnected",
    },
    heartRateAlert: {
      title: "Heart Rate Alert",
      body: `Heart rate: ${data?.heartRate || "--"} bpm`,
    },
    spo2Alert: {
      title: "SpO2 Alert",
      body: `SpO2: ${data?.spo2 || "--"}%`,
    },
    batteryLow: {
      title: "Low Battery",
      body: `Battery level: ${data?.battery || "--"}%`,
    },
    otaUpdate: {
      title: "OTA Update Available",
      body: "A new firmware update is available for your device",
    },
  };

  const notification = notifications[eventType];
  if (notification) {
    sendLocalPushNotification(notification.title, notification.body, data);
  }
}