import "react-native-get-random-values";
import { BleManager } from "react-native-ble-plx";
import { Platform, PermissionsAndroid } from "react-native";
import { decode as atob } from "base-64";
import { SERVICE_UUID, CHARACTERISTICS } from "./BLEConfig.js";

class BLEService {
  constructor() {
    this.manager = new BleManager();
    this.device = null;
    this.subscription = null;
  }

  // ==========================
  // Request Permissions
  // ==========================
  async requestPermissions() {
    if (Platform.OS !== "android") return true;

    if (Platform.Version >= 31) {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);

      return (
        result["android.permission.BLUETOOTH_SCAN"] === "granted" &&
        result["android.permission.BLUETOOTH_CONNECT"] === "granted"
      );
    }

    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    return result === "granted";
  }

  // ==========================
  // Bluetooth State Listener
  // Exposes the shared manager's state stream so the app never
  // has to instantiate a second BleManager.
  // ==========================
  onStateChange(callback, emitCurrentState = true) {
    return this.manager.onStateChange(callback, emitCurrentState);
  }

  // ==========================
  // Scan Devices
  // ==========================
  scanDevices(onDevice, onFinish, timeout = 5000) {
    const found = {};

    this.manager.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        console.log(error);
        onFinish(error);
        return;
      }

      if (!device) return;

      if (!found[device.id]) {
        found[device.id] = true;
        onDevice(device);
      }
    });

    setTimeout(() => {
      this.manager.stopDeviceScan();
      onFinish(null);
    }, timeout);
  }

  stopScan() {
    this.manager.stopDeviceScan();
  }

  // ==========================
  // Connect
  // Expects the full device object returned from scanDevices(),
  // since it calls device.connect() directly.
  // ==========================
  async connect(device) {
    this.stopScan();

    this.device = await device.connect();

    await this.device.discoverAllServicesAndCharacteristics();

    return this.device;
  }

  // ==========================
  // Auto Connect
  // Takes a raw deviceId (e.g. from storage) instead of a device
  // object, since there's no live scan result to call .connect() on.
  // ==========================
  async autoConnect(deviceId) {
    this.device = await this.manager.connectToDevice(deviceId);

    await this.device.discoverAllServicesAndCharacteristics();

    return this.device;
  }

  // ==========================
  // Is Connected
  // FIX: wrapped in try/catch so a device that has dropped at the
  // native BLE stack level doesn't throw here — just reports false.
  // ==========================
  async isConnected() {
    if (!this.device) return false;

    try {
      return await this.device.isConnected();
    } catch (err) {
      console.log("isConnected check failed:", err);
      return false;
    }
  }

  // ==========================
  // Disconnect
  // ==========================
  async disconnect() {
    if (!this.device) return;

    await this.device.cancelConnection();

    this.device = null;
  }

  // ==========================
  // Listen Data
  // FIX: remove any existing subscription before creating a new one,
  // otherwise calling monitorData() twice leaks the old listener.
  // ==========================
  monitorData(callback) {
    if (!this.device) return;

    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    this.subscription = this.device.monitorCharacteristicForService(
      SERVICE_UUID,
      CHARACTERISTICS.data,
      (error, characteristic) => {
        if (error) {
          callback(error, null);
          return;
        }

        if (!characteristic?.value) return;

        const value = atob(characteristic.value);

        callback(null, value);
      }
    );
  }

  stopMonitoring() {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  // ==========================
  // Write Command
  // FIX: characteristic UUID is now a parameter instead of being
  // hardcoded to CHARACTERISTICS.reset, so this can actually send
  // to any characteristic. Defaults to CHARACTERISTICS.reset to
  // preserve existing call sites that don't pass one.
  // ==========================
  async sendCommand(base64Command, characteristicUUID = CHARACTERISTICS.reset) {
    if (!this.device) throw new Error("No Device Connected");

    try {
      return await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        characteristicUUID,
        base64Command
      );
    } catch {
      return await this.device.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        characteristicUUID,
        base64Command
      );
    }
  }

  // ==========================
  // Read Characteristic
  // ==========================
  async read(uuid) {
    if (!this.device) return null;

    const value = await this.device.readCharacteristicForService(
      SERVICE_UUID,
      uuid
    );

    return value;
  }

  // ==========================
  // Get Services
  // ==========================
  async getServices() {
    if (!this.device) return [];

    return await this.device.services();
  }

  // ==========================
  // Current Device
  // ==========================
  getConnectedDevice() {
    return this.device;
  }

  // ==========================
  // Destroy
  // FIX: clear this.device so a reused instance doesn't hold a
  // stale reference after destroy() has torn down the manager.
  // ==========================
  destroy() {
    this.stopMonitoring();
    this.manager.destroy();
    this.device = null;
  }
}

export default new BLEService();