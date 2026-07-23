import BLE from "./src/BLEService";
export { consoleApp, getCurrentStatus } from "./src/handlelogs";
export {
  requestNotificationPermissions,
  showPersistentStatusNotification,
  updatePersistentStatusNotification,
  clearPersistentStatusNotification,
  enablePersistentNotifications,
  isPersistentNotificationDisabled,
  sendLocalPushNotification,
  sendBLENotification,  
} from "./src/bgn";
export { checkForOTAUpdates } from "./src/update";

export const requestBlePermission = () => BLE.requestPermissions();

// Subscribe to Bluetooth adapter state changes (poweredOn/Off/etc).
// Returns a subscription object — call .remove() to unsubscribe.
export const onStateChange = (callback, emitCurrentState = true) =>
  BLE.onStateChange(callback, emitCurrentState);

export const scanDevices = () =>
  new Promise((resolve, reject) => {
    const devices = [];

    BLE.scanDevices(
      (device) => {
        if (!devices.find((d) => d.id === device.id)) {
          devices.push(device);
        }
      },
      (error) => {
        if (error) {
          reject(error);
        } else {
          resolve(devices);
        }
      },
    );
  });

// Expects the full device object from scanDevices() results.
export const connect = (device) => BLE.connect(device);

// Expects a raw deviceId string (e.g. persisted from a previous pairing).
export const autoConnect = (deviceId) => BLE.autoConnect(deviceId);

export const disconnect = () => BLE.disconnect();

export const isConnected = () => BLE.isConnected();

export const monitorHealthMetrics = (callback) =>
  BLE.monitorHealthMetrics(callback);

export const stopMonitoring = () => BLE.stopMonitoring();

export const stopScan = () => BLE.stopScan();

// characteristicUUID defaults to undefined here so BLEService falls
// back to CHARACTERISTICS.reset for existing call sites.
export const sendCommand = (base64, characteristicUUID) =>
  BLE.sendCommand(base64, characteristicUUID);

export const read = (uuid) => BLE.read(uuid);

export const getServices = () => BLE.getServices();

export const getConnectedDevice = () => BLE.getConnectedDevice();

export const destroy = () => BLE.destroy();

export const unpair = async () => {
  const device = BLE.getConnectedDevice();

  if (!device) return false;

  await BLE.disconnect();
  return true;
};
