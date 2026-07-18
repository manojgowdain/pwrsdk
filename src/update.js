import * as Updates from "expo-updates";

export async function checkForOTAUpdates() {
  try {
    console.log("==================================");
    console.log("Checking for OTA Updates...");
    console.log("Channel:", Updates.channel);
    console.log("Runtime Version:", Updates.runtimeVersion);
    console.log("Update ID:", Updates.updateId);
    console.log("==================================");

    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      console.log("New OTA update available. Downloading...");

      await Updates.fetchUpdateAsync();

      console.log("OTA update downloaded. Restarting app...");

      await Updates.reloadAsync();
    } else {
      console.log("App is already up to date.");
    }
  } catch (error) {
    console.error("OTA Update Error:", error);
  }
}

