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
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      sound: "default",
      lockscreenVisibility:
        Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
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

export const sleep = (time) =>
  new Promise((resolve) => setTimeout(resolve, time));

/**
 * Background loop
 */
export const veryIntensiveTask = async (taskDataArguments) => {
  const { delay } = taskDataArguments;

  let counter = 0;

  while (BackgroundService.isRunning()) {
    counter++;

    console.log("Background Tick:", counter);

    await BackgroundService.updateNotification({
      taskTitle: backgroundServiceOptions.taskTitle,
      taskDesc: `Running ${new Date().toLocaleTimeString()}`,
    });

    DeviceEventEmitter.emit(BACKGROUND_TICK_EVENT, {
      counter,
      timestamp: Date.now(),
    });

    await sleep(delay);
  }
};

/**
 * Start background service
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
        ...options.parameters,
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
 * Stop background service
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
 * Is background service running
 */
export const isBackgroundServiceRunning = () => {
  return BackgroundService.isRunning();
};

/**
 * Listen for background ticks
 */
export const subscribeToBackgroundTicks = (listener) => {
  return DeviceEventEmitter.addListener(BACKGROUND_TICK_EVENT, listener);
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
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: "default",
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
 * Update Foreground Persistent Notification
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

    console.log("Persistent notification updated:", options);
  } catch (e) {
    console.log("Failed to update persistent notification:", e);
  }
};

/**
 * Cancel all local notifications
 */
export const cancelAllNotifications = async () => {
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch (e) {
    console.log(e);
  }
};

/**
 * Cancel a scheduled notification
 */
export const cancelNotification = async (identifier) => {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
  } catch (e) {
    console.log(e);
  }
};