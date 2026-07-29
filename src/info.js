import * as Device from "expo-device";
import * as Battery from "expo-battery";
import NetInfo from "@react-native-community/netinfo";
import DeviceInfo from "react-native-device-info";

export default async function getDeviceInfo() {
  const battery = await Battery.getBatteryLevelAsync();
  const batteryState = await Battery.getBatteryStateAsync();
  const net = await NetInfo.fetch();

  return {
    brand: Device.brand,
    manufacturer: Device.manufacturer,
    model: Device.modelName,
    deviceName: await DeviceInfo.getDeviceName(),
    os: `${Device.osName} ${Device.osVersion}`,
    battery: `${Math.round(battery * 100)}%`,
    charging:
      batteryState === Battery.BatteryState.CHARGING ? "Yes" : "No",
    appVersion: DeviceInfo.getVersion(),
    build: DeviceInfo.getBuildNumber(),
    uniqueId: await DeviceInfo.getUniqueId(),
    ip: await DeviceInfo.getIpAddress(),
    wifi: net.type,
    online: net.isConnected,
  };
}

