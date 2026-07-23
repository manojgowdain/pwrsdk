import { DeviceEventEmitter, Platform } from "react-native";
import BackgroundService from "react-native-background-actions";
import * as Notifications from "expo-notifications";

const BACKGROUND_TICK_EVENT = "haloband-background-tick";

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
  taskTitle: "BLE Connected",
  taskDesc: "Waiting for Health Data...",
  taskIcon: {
    name: "ic_launcher",
    type: "mipmap",
  },
  color: "#2196F3",
  linkingURI: "",
  foregroundServiceType: ["dataSync"],
  parameters: {
    delay: 2000,
  },
};

/**
 * Sleep helper
 */
export const sleep = (time) =>
  new Promise((resolve) => setTimeout(resolve, time));

/**
 * Background Loop
 */
export const veryIntensiveTask = async (taskDataArguments) => {
  const { delay } = taskDataArguments;

  let counter = 0;

  while (BackgroundService.isRunning()) {
    counter++;

    console.log("Background Tick:", counter);

    try {
      await BackgroundService.updateNotification({
        taskTitle: backgroundServiceOptions.taskTitle,
        taskDesc: `Running ${new Date().toLocaleTimeString()}`,
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
        data,
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