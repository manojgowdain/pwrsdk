import * as Updates from "expo-updates";
import {consoleApp} from "./handlelogs";

export async function checkForOTAUpdates() {
  // Development Build / Expo Go
  if (__DEV__) {
    consoleApp("Skipping OTA check (development mode)");
    return;
  }

  // Development Client
  if (Updates.isEmbeddedLaunch) {
    consoleApp("Embedded launch");
  }

  try {
    consoleApp("==================================");
    consoleApp("Checking for OTA Updates...");
    consoleApp("Channel: " + Updates.channel);
    consoleApp("Runtime Version: " + Updates.runtimeVersion);
    consoleApp("Update ID: " + Updates.updateId);
    consoleApp("==================================");

    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      consoleApp("New OTA update available");

      await Updates.fetchUpdateAsync();

      consoleApp("Reloading...");

      await Updates.reloadAsync();
    } else {
      consoleApp("Already up to date");
    }
  } catch (e) {
    consoleApp("OTA Update Error: " + e);
  }
}