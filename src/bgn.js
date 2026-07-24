import { DeviceEventEmitter, Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import * as Notifications from "expo-notifications";
import BLE from "./BLEService.js";

const BACKGROUND_TICK_EVENT = "haloband-background-tick";
const BACKGROUND_BLE_EVENT = "haloband-background-ble";
const DEFAULT_LINKING_URI = "haloband://";

/**
 * Configure how notifications are displayed
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Configure notification channel (Android)
 */
export const configureNotifications = async () => {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility:
      Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    showBadge: true,
    enableLights: true,
  });
};

/**
 * Request notification permission
 */
export const requestNotificationPermission = async () => {
  try {
    await configureNotifications();

    const { status } = await Notifications.getPermissionsAsync();

    if (status === "granted") {
      return true;
    }

    const request = await Notifications.requestPermissionsAsync();

    return request.status === "granted";
  } catch (e) {
    console.log("Notification permission error:", e);
    return false;
  }
};

/**
 * Background Service Options
 */
export const backgroundServiceOptions = {
  taskName: "MBService",
  taskTitle: "Welcome to HaloBand",
  taskDesc: "Waiting for Health Data...",
  taskIcon: {
    name: "ic_launcher",
    type: "mipmap",
  },
  color: "#2196F3",
  linkingURI: DEFAULT_LINKING_URI,
  foregroundServiceType: ["connectedDevice"],
  parameters: {
    delay: 2000,
  },
};

/**
 * Sleep helper
 */
export const sleep = (time) =>
  new Promise((resolve) => setTimeout(resolve, time));

const getBackgroundDeviceId = async (deviceId) => {
  if (deviceId) {
    await BLE.rememberDeviceId(deviceId);
    return deviceId;
  }

  const connectedDevice = BLE.getConnectedDevice();
  if (connectedDevice?.id) {
    await BLE.rememberDeviceId(connectedDevice.id);
    return connectedDevice.id;
  }

  return BLE.getRememberedDeviceId();
};

const emitBleStatus = (status) => {
  DeviceEventEmitter.emit(BACKGROUND_BLE_EVENT, {
    ...status,
    timestamp: Date.now(),
  });
};

const ensureBackgroundBleConnection = async ({
  deviceId,
  onHealthMetrics,
  onBleError,
}) => {
  const activeDeviceId = await getBackgroundDeviceId(deviceId);

  if (!activeDeviceId) {
    emitBleStatus({ connected: false, reason: "missing-device-id" });
    return false;
  }

  const alreadyConnected = await BLE.isConnected();

  if (!alreadyConnected) {
    BLE.stopMonitoring();
    await BLE.autoConnect(activeDeviceId);
    emitBleStatus({ connected: true, deviceId: activeDeviceId, reconnected: true });
  } else {
    emitBleStatus({ connected: true, deviceId: activeDeviceId, reconnected: false });
  }

  if (BLE.hasActiveMonitor()) {
    return true;
  }

  BLE.monitorHealthMetrics((error, metrics) => {
    if (error) {
      emitBleStatus({ connected: false, deviceId: activeDeviceId, error: error.message });
      onBleError?.(error);
      return;
    }

    emitBleStatus({ connected: true, deviceId: activeDeviceId, metrics });
    onHealthMetrics?.(metrics);
  }, {
    replaceExisting: false,
  });

  return true;
};

/**
 * Background Loop
 */
export const veryIntensiveTask = async (taskDataArguments = {}) => {
  const {
    delay = backgroundServiceOptions.parameters.delay,
    deviceId,
    onHealthMetrics,
    onBleError,
    reconnectEveryTicks = 5,
  } = taskDataArguments;

  let counter = 0;

  while (BackgroundService.isRunning()) {
    counter++;
    let bleConnected = false;

    console.log("Background Tick:", counter);

    if (counter === 1 || counter % reconnectEveryTicks === 0) {
      try {
        bleConnected = await ensureBackgroundBleConnection({
          deviceId,
          onHealthMetrics,
          onBleError,
        });
      } catch (e) {
        console.log("Background BLE reconnect error:", e);
        emitBleStatus({
          connected: false,
          deviceId,
          error: e.message,
        });
      }
    } else {
      bleConnected = await BLE.isConnected();

      if (bleConnected && !BLE.hasActiveMonitor()) {
        bleConnected = await ensureBackgroundBleConnection({
          deviceId,
          onHealthMetrics,
          onBleError,
        });
      }
    }

    try {
      await BackgroundService.updateNotification({
        taskTitle: backgroundServiceOptions.taskTitle,
        taskDesc: bleConnected
          ? `BLE connected ${new Date().toLocaleTimeString()}`
          : `BLE reconnecting ${new Date().toLocaleTimeString()}`,
      });
    } catch (e) {
      console.log("Notification update error:", e);
    }

    DeviceEventEmitter.emit(BACKGROUND_TICK_EVENT, {
      counter,
      timestamp: Date.now(),
    });

    await sleep(delay);
  }
};

/**
 * Start Background Service
 */
export const startBackgroundService = async (options = {}) => {
  try {
    if (BackgroundService.isRunning()) {
      console.log("Background Service already running");
      return true;
    }

    const granted = await requestNotificationPermission();

    if (!granted) {
      console.log("Notification permission denied");
      return false;
    }

    await BackgroundService.start(veryIntensiveTask, {
      ...backgroundServiceOptions,
      ...options,
      parameters: {
        ...backgroundServiceOptions.parameters,
        ...(options.parameters || {}),
      },
    });

    console.log("Background Service Started");

    return true;
  } catch (e) {
    console.log("Start Background Service Error:", e);
    return false;
  }
};

/**
 * Stop Background Service
 */
export const stopBackgroundService = async () => {
  try {
    if (BackgroundService.isRunning()) {
      await BackgroundService.stop();
      console.log("Background Service Stopped");
    }

    return true;
  } catch (e) {
    console.log("Stop Background Service Error:", e);
    return false;
  }
};

/**
 * Check if Background Service is Running
 */
export const isBackgroundServiceRunning = () => {
  return BackgroundService.isRunning();
};

/**
 * Subscribe to Background Tick Events
 */
export const subscribeToBackgroundTicks = (listener) => {
  return DeviceEventEmitter.addListener(
    BACKGROUND_TICK_EVENT,
    listener
  );
};

/**
 * Subscribe to Background BLE Events
 */
export const subscribeToBackgroundBle = (listener) => {
  return DeviceEventEmitter.addListener(BACKGROUND_BLE_EVENT, listener);
};

export const getLastNotificationResponse = () => {
  return Notifications.getLastNotificationResponseAsync();
};

export const subscribeToNotificationTaps = (listener) => {
  return Notifications.addNotificationResponseReceivedListener(listener);
};

/**
 * Send Local Notification
 */
export const sendNormalNotification = async (
  title,
  body,
  data = {}
) => {
  try {
    await configureNotifications();

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: {
          url: DEFAULT_LINKING_URI,
          ...data,
        },
        ...(Platform.OS === "android"
          ? {
              channelId: "default",
            }
          : {}),
      },
      trigger: null,
    });

    console.log("Local Notification Sent");
  } catch (e) {
    console.log("Failed to send normal notification:", e);
  }
};

/**
 * Update Foreground Notification
 */
export const updatePersistentNotification = async (options = {}) => {
  try {
    if (!BackgroundService.isRunning()) return;

    await BackgroundService.updateNotification({
      taskTitle:
        options.title ||
        backgroundServiceOptions.taskTitle,

      taskDesc:
        options.body ||
        options.desc ||
        options.message ||
        backgroundServiceOptions.taskDesc,
    });

    console.log("Persistent notification updated");
  } catch (e) {
    console.log("Failed to update persistent notification:", e);
  }
};

/**
 * Cancel all notifications
 */
export const cancelAllNotifications = async () => {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (e) {
    console.log("Cancel notifications error:", e);
  }
};

/**
 * Cancel a scheduled notification
 */
export const cancelNotification = async (identifier) => {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (e) {
    console.log("Cancel notification error:", e);
  }
};
