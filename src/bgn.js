import { PermissionsAndroid, Platform, DeviceEventEmitter } from 'react-native';
import BackgroundService from 'react-native-background-actions';

const BACKGROUND_TICK_EVENT = 'haloband-background-tick';

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
  const { delay } = taskDataArguments;
  let counter = 0;

  while (BackgroundService.isRunning()) {
    counter++;
    console.log('App Running In Background, tick:', counter);

    await BackgroundService.updateNotification({
      taskDesc: `Running ${new Date().toLocaleTimeString()}`,
    });

    // Emit event so the main application context can listen to background activity
    DeviceEventEmitter.emit(BACKGROUND_TICK_EVENT, {
      counter,
      timestamp: new Date().toISOString(),
    });

    await sleep(delay);
  }
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

    await BackgroundService.start(veryIntensiveTask, {
      ...backgroundServiceOptions,
      ...options,
      parameters: {
        ...backgroundServiceOptions.parameters,
        ...options.parameters,
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

/**
 * Send a normal/local push notification
 */
export const sendNormalNotification = async (title, body, data = {}) => {
  try {
    const { sendLocalPushNotification } = require("pwrsdk");
    await sendLocalPushNotification(title, body, data);
  } catch (error) {
    console.log("Failed to send normal notification:", error);
  }
};

/**
 * Update the persistent background service notification
 */
export const updatePersistentNotification = async (options = {}) => {
  try {
    if (BackgroundService.isRunning()) {
      await BackgroundService.updateNotification({
        taskTitle: options.title || backgroundServiceOptions.taskTitle,
        taskDesc: options.body || options.desc || options.message || backgroundServiceOptions.taskDesc,
      });
      console.log("Persistent notification updated:", options);
    }
  } catch (error) {
    console.log("Failed to update persistent notification:", error);
  }
};

