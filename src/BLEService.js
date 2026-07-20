import "react-native-get-random-values";
import { BleManager } from "react-native-ble-plx";
import { Platform, PermissionsAndroid } from "react-native";
import { decode as atob } from "base-64";
import { SERVICE_UUID, CHARACTERISTICS } from "./BLEConfig.js";
import { KalmanFilter } from "./KalmanFilter.js";
import {
  RawPayloadSchema,
  HealthReadingSchema,
  HealthMetricsSchema,
  DeviceIdSchema,
  DeviceObjectSchema,
  Base64Schema,
  CharacteristicUUIDSchema,
} from "./BLEService.schema.js";

class BLEService {
  constructor() {
    this.manager = new BleManager();
    this.device = null;
    this.subscription = null;

    // Kalman filters smooth the noisy sensor channels (HR, SpO2,
    // temperature) so a single garbage/dropped-bit sample from the
    // wearable doesn't spike straight through to the UI. Battery and
    // steps are monotonic/discrete counters, not noisy analog
    // readings, so they're passed through unfiltered.
    this._resetFilters();
  }

  _resetFilters() {
    this.hrFilter = new KalmanFilter({ R: 4, Q: 0.05 });
    this.spo2Filter = new KalmanFilter({ R: 2, Q: 0.02 });
    this.tempFilter = new KalmanFilter({ R: 0.5, Q: 0.01 });
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
    const parsed = DeviceObjectSchema.safeParse(device);
    if (!parsed.success) {
      throw new Error(
        `connect() expects a scanned device object with a connect() method: ${parsed.error.message}`
      );
    }

    this.stopScan();

    this.device = await device.connect();

    await this.device.discoverAllServicesAndCharacteristics();

    // Fresh device, fresh sensor stream — don't let filters carry
    // stale estimates over from a previous connection.
    this._resetFilters();

    return this.device;
  }

  // ==========================
  // Auto Connect
  // Takes a raw deviceId (e.g. from storage) instead of a device
  // object, since there's no live scan result to call .connect() on.
  // ==========================
  async autoConnect(deviceId) {
    const parsed = DeviceIdSchema.safeParse(deviceId);
    if (!parsed.success) {
      throw new Error(`autoConnect() invalid deviceId: ${parsed.error.message}`);
    }

    this.device = await this.manager.connectToDevice(parsed.data);

    await this.device.discoverAllServicesAndCharacteristics();

    this._resetFilters();

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
  // Health Metrics
  // FIX: remove any existing subscription before creating a new one,
  // otherwise calling monitorHealthMetrics() twice leaks the old listener.
  // Zod (schemas live in BLEService.schema.js) validates the raw
  // payload shape and numeric ranges first, filtering out anything
  // structurally malformed. The surviving hr/spo2/temperature samples
  // are then passed through per-channel Kalman filters so a
  // one-off garbage reading gets smoothed against the recent trend
  // instead of appearing as a spike in the UI. Battery and steps
  // pass through unfiltered since they're not noisy analog signals.
  // ==========================
  monitorHealthMetrics(callback) {
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

        try {
          const raw = atob(characteristic.value).trim();

          // Expected BLE payload:
          // HR,SPO2,TEMP_C,BATTERY,STEPS
          // Example: 72,98,36.5,85,5234

          const rawResult = RawPayloadSchema.safeParse(raw);
          if (!rawResult.success) {
            callback(
              new Error(`Invalid BLE payload "${raw}": ${rawResult.error.message}`),
              null
            );
            return;
          }

          const parts = rawResult.data.split(",");
          const [hr, spo2, tempC, battery, steps] = parts.map(Number);

          const readingResult = HealthReadingSchema.safeParse({
            hr,
            spo2,
            tempC,
            battery,
            steps,
          });

          if (!readingResult.success) {
            callback(
              new Error(`BLE payload out of range "${raw}": ${readingResult.error.message}`),
              null
            );
            return;
          }

          const {
            hr: validHr,
            spo2: validSpo2,
            tempC: validTempC,
            battery: validBattery,
            steps: validSteps,
          } = readingResult.data;

          // Smooth the noisy analog channels. A single dropped-bit
          // or motion-artifact sample gets pulled back toward the
          // recent trend instead of passing straight through.
          const smoothedHr = Math.round(this.hrFilter.filter(validHr));
          const smoothedSpo2 = Math.round(this.spo2Filter.filter(validSpo2));
          const smoothedTempC = Number(this.tempFilter.filter(validTempC).toFixed(2));

          const tempF = Number(((smoothedTempC * 9) / 5 + 32).toFixed(2));
          const tempK = Number((smoothedTempC + 273.15).toFixed(2));

          // Approximate calculations
          const calories = Number((validSteps * 0.04).toFixed(2));
          const distance = Number(((validSteps * 0.75) / 1000).toFixed(2));

          const healthMetrics = {
            heartRate: smoothedHr,
            spo2: smoothedSpo2,
            temperature: {
              celsius: smoothedTempC,
              fahrenheit: tempF,
              kelvin: tempK,
            },
            battery: validBattery,
            steps: validSteps,
            calories,
            distance, // km
            // raw,
          };

          const outputResult = HealthMetricsSchema.safeParse(healthMetrics);
          if (!outputResult.success) {
            callback(
              new Error(`Failed to build healthMetrics object: ${outputResult.error.message}`),
              null
            );
            return;
          }

          callback(null, outputResult.data);
        } catch (err) {
          callback(err, null);
        }
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

    const commandResult = Base64Schema.safeParse(base64Command);
    if (!commandResult.success) {
      throw new Error(`sendCommand() invalid base64Command: ${commandResult.error.message}`);
    }

    const uuidResult = CharacteristicUUIDSchema.safeParse(characteristicUUID);
    if (!uuidResult.success) {
      throw new Error(`sendCommand() invalid characteristicUUID: ${uuidResult.error.message}`);
    }

    try {
      return await this.device.writeCharacteristicWithResponseForService(
        SERVICE_UUID,
        uuidResult.data,
        commandResult.data
      );
    } catch {
      return await this.device.writeCharacteristicWithoutResponseForService(
        SERVICE_UUID,
        uuidResult.data,
        commandResult.data
      );
    }
  }

  // ==========================
  // Read Characteristic
  // ==========================
  async read(uuid) {
    if (!this.device) return null;

    const uuidResult = CharacteristicUUIDSchema.safeParse(uuid);
    if (!uuidResult.success) {
      throw new Error(`read() invalid uuid: ${uuidResult.error.message}`);
    }

    const value = await this.device.readCharacteristicForService(
      SERVICE_UUID,
      uuidResult.data
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