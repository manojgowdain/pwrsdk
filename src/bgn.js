import { PermissionsAndroid, Platform, DeviceEventEmitter } from 'react-native';
import BackgroundService from 'react-native-background-actions';
import * as Notifications from 'expo-notifications';

const BACKGROUND_TICK_EVENT = 'haloband-background-tick';
const LOCAL_PUSH_CHANNEL_ID = 'haloband-local-push';

let isNotificationManuallyDismissed = false;

// Configure presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensureChannels() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(LOCAL_PUSH_CHANNEL_ID, {
    name: "Haloband Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 0, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge: true,
  });
}

export const backgroundServiceOptions = {
  taskName: 'MBService',
  taskTitle: 'BLE connected',
  taskDesc: 'Ble Connected',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#000000',
  foregroundServiceType: ['dataSync'],
  parameters: {
    delay: 2000,
  },
};

export const sleep = (time) =>
  new Promise((resolve) => setTimeout(resolve, time));

export const veryIntensiveTask = async (taskDataArguments) => {
  const { delay, deviceId } = taskDataArguments;
  let counter = 0;

  const BLE = require("./BLEService").default;

  // Set up health metric subscription
  const startMonitoring = () => {
    BLE.monitorHealthMetrics((error, healthMetrics) => {
      if (error) {
        console.log("Background BLE monitor error:", error);
        return;
      }
      if (healthMetrics) {
        console.log("Background BLE telemetry:", healthMetrics);
        
        // Update notification with metrics
        const desc = `HR: ${healthMetrics.heartRate} bpm | SpO₂: ${healthMetrics.spo2}% | Batt: ${healthMetrics.battery}%`;
        BackgroundService.updateNotification({
          taskDesc: desc,
        }).catch((err) => console.log("Failed to update BG notification with metrics:", err));

        // Alert notifications
        if (healthMetrics.battery <= 15) {
          sendBLENotification("batteryLow", { battery: healthMetrics.battery });
        }
        if (healthMetrics.heartRate > 120 || healthMetrics.heartRate < 50) {
          sendBLENotification("heartRateAlert", { heartRate: healthMetrics.heartRate });
        }
        if (healthMetrics.spo2 < 90) {
          sendBLENotification("spo2Alert", { spo2: healthMetrics.spo2 });
        }

        // Emit tick with metrics
        DeviceEventEmitter.emit(BACKGROUND_TICK_EVENT, {
          counter,
          timestamp: new Date().toISOString(),
          connected: true,
          healthMetrics,
        });
      }
    });
  };

  let connected = await BLE.isConnected();
  let targetDeviceId = deviceId || BLE.getConnectedDevice()?.id;

  if (connected) {
    startMonitoring();
  }

  while (BackgroundService.isRunning()) {
    counter++;
    
    connected = await BLE.isConnected();
    
    if (!connected && targetDeviceId) {
      console.log("BLE disconnected in background, trying autoConnect...");
      try {
        await BLE.autoConnect(targetDeviceId);
        console.log("BLE autoConnected successfully in background");
        startMonitoring();
      } catch (err) {
        console.log("BLE autoConnect failed in background:", err);
      }
    }

    DeviceEventEmitter.emit(BACKGROUND_TICK_EVENT, {
      counter,
      timestamp: new Date().toISOString(),
      connected,
    });

    await sleep(delay || 2000);
  }

  BLE.stopMonitoring();
};

export const requestNotificationPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (Platform.Version < 33) {
    return true;
  }

  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.log('Notification permission request failed:', error);
    return false;
  }
};

export const startBackgroundService = async (options = {}) => {
  try {
    if (BackgroundService.isRunning()) {
      console.log('Background Service already running');
      return true;
    }

    const granted = await requestNotificationPermission();
    if (!granted) {
      console.log('Notification permission required for background service');
      return false;
    }

    const BLE = require("./BLEService").default;
    const connectedDevice = BLE.getConnectedDevice();
    const deviceId = options.parameters?.deviceId || connectedDevice?.id;

    await BackgroundService.start(veryIntensiveTask, {
      ...backgroundServiceOptions,
      ...options,
      parameters: {
        ...backgroundServiceOptions.parameters,
        ...options.parameters,
        deviceId,
      },
    });

    console.log('Background Service Started');
    return true;
  } catch (error) {
    console.log('Failed to start background service:', error);
    return false;
  }
};

export const stopBackgroundService = async () => {
  try {
    if (BackgroundService.isRunning()) {
      await BackgroundService.stop();
      console.log('Background Service Stopped');
    }
    return true;
  } catch (error) {
    console.log('Failed to stop background service:', error);
    return false;
  }
};

export const isBackgroundServiceRunning = () => {
  return BackgroundService.isRunning();
};

export const subscribeToBackgroundTicks = (listener) => {
  return DeviceEventEmitter.addListener(BACKGROUND_TICK_EVENT, listener);
};

// --- Notification API integration ---

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

    await ensureChannels();
    
    await requestNotificationPermission();

    console.log("Notification permissions granted");
    return true;
  } catch (err) {
    console.log("Failed to request notification permissions:", err);
    return false;
  }
}

export async function showPersistentStatusNotification({
  title = "Haloband",
  body = "Monitoring device status",
} = {}) {
  if (isNotificationManuallyDismissed) {
    console.log("Notification manually dismissed, not showing");
    return;
  }

  const BLE = require("./BLEService").default;
  const connectedDevice = BLE.getConnectedDevice();
  const deviceId = connectedDevice?.id;

  if (BackgroundService.isRunning()) {
    await BackgroundService.updateNotification({
      taskTitle: title,
      taskDesc: body,
    });
  } else {
    await startBackgroundService({
      taskTitle: title,
      taskDesc: body,
      parameters: {
        delay: 2000,
        deviceId,
      },
    });
  }
}

export async function updatePersistentStatusNotification(status) {
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

export async function clearPersistentStatusNotification() {
  try {
    isNotificationManuallyDismissed = true;
    await stopBackgroundService();
    console.log("Persistent notification cleared and disabled");
  } catch (err) {
    console.log("Failed to clear persistent notification:", err);
  }
}

export function enablePersistentNotifications() {
  isNotificationManuallyDismissed = false;
  console.log("Persistent notifications re-enabled");
}

export function isPersistentNotificationDisabled() {
  return isNotificationManuallyDismissed;
}

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
      trigger: null,
    });

    console.log("Local push notification sent:", { title, body });
  } catch (err) {
    console.log("Failed to send local push notification:", err);
  }
}

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
