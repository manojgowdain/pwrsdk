import * as Updates from "expo-updates";

export async function checkForOTAUpdates() {
  // Development Build / Expo Go
  if (__DEV__) {
    console.log("Skipping OTA check (development mode)");
    return;
  }

  // Development Client
  if (Updates.isEmbeddedLaunch) {
    console.log("Embedded launch");
  }

  try {
    console.log("==================================");
    console.log("Checking for OTA Updates...");
    console.log("Channel:", Updates.channel);
    console.log("Runtime Version:", Updates.runtimeVersion);
    console.log("Update ID:", Updates.updateId);
    console.log("==================================");

    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      console.log("New OTA update available");

      await Updates.fetchUpdateAsync();

      console.log("Reloading...");

      await Updates.reloadAsync();
    } else {
      console.log("Already up to date");
    }
  } catch (e) {
    console.error("OTA Update Error:", e);
  }
}