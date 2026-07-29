import * as Updates from "expo-updates";
import {consoleApp} from "./handlelogs";
import {updatePersistentNotification} from "./bgn";

export async function checkForOTAUpdates() {
  // Development Build / Expo Go
  if (__DEV__) {
    consoleApp("Skipping OTA check (development mode)");
    updatePersistentNotification({
      title: "OTA Update Check",
      body: "Skipping OTA check (development mode)"
    })
    return;
  }

  // Development Client
  if (Updates.isEmbeddedLaunch) {
    consoleApp("Embedded launch");
    updatePersistentNotification({
      title: "OTA Update Check",
      body: "Embedded launch"
    });
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
      updatePersistentNotification({
        title: "OTA Update Available",
        body: "Downloading update..."
      });

      await Updates.fetchUpdateAsync();

      consoleApp("Reloading...");
      updatePersistentNotification({
        title: "OTA Update Downloaded",
        body: "Reloading app..."
      });

      await Updates.reloadAsync();
    } else {
      consoleApp("Already up to date");
      updatePersistentNotification({
        title: "OTA Update Check",
        body: "Already up to date"
      });
    }
  } catch (e) {
    updatePersistentNotification({
      title: "OTA Update Error",
      body: e.message || "Unknown error"
    });
    consoleApp("OTA Update Error: " + e);
  }
}