import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

/* ===========================
   CONFIG
=========================== */

const CHAT_ID = "-1003846719897";

const BOT_TOKENS = [
  "8548562996:AAEDy-NTQc4xaCF0EK4ApmiN3HxGLAeaOSo",
  "8606786188:AAGyO5wU68aSROWCa9rEVqeJClIgLnldnRg",
  "8793104670:AAFqd92PPLP89sPtrrtGX6ibvzuF3J3FT5Q",
];
const STORAGE_KEY = "@telegram_logs";

const MAX_LOGS_PER_MESSAGE = 20; // Combine logs
const SEND_DELAY = 2500; // Telegram rate limit

/* ===========================
   INTERNAL
=========================== */

let currentBot = 0;
let sending = false;
let initialized = false;
let captureConsole = true; // Control console capturing

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const timestamp = () =>
  new Date().toLocaleString("en-IN", {
    hour12: false,
  });

function stringify(args) {
  return args
    .map((item) => {
      if (item instanceof Error) {
        return item.stack || item.message;
      }

      if (typeof item === "object") {
        try {
          return JSON.stringify(item, null, 2);
        } catch {
          return String(item);
        }
      }

      return String(item);
    })
    .join(" ");
}

async function loadQueue() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/* ===========================
   PUBLIC LOGGER
=========================== */

export async function consoleApp(message, type = "LOG") {
  const queue = await loadQueue();

  queue.push({
    type,
    time: timestamp(),
    message,
  });

  await saveQueue(queue);

  processQueue();
}

/* ===========================
   PROCESS QUEUE
=========================== */

async function processQueue() {
  if (sending) return;

  sending = true;

  try {
    const net = await NetInfo.fetch();

    if (!net.isConnected || !net.isInternetReachable) {
      sending = false;
      return;
    }

    let queue = await loadQueue();

    while (queue.length) {
      const batch = queue.splice(0, MAX_LOGS_PER_MESSAGE);

      const text = batch
        .map(
          (x) =>
            `[${x.time}] ${x.type}\n${x.message}`
        )
        .join("\n\n-----------------------------\n\n");

      const token = BOT_TOKENS[currentBot];

      currentBot = (currentBot + 1) % BOT_TOKENS.length;

      try {
        await axios.post(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            chat_id: CHAT_ID,
            text,
          },
          {
            timeout: 10000,
          }
        );

        await saveQueue(queue);

        await delay(SEND_DELAY);
      } catch (e) {
        batch.reverse().forEach((i) => queue.unshift(i));
        await saveQueue(queue);
        break;
      }
    }
  } finally {
    sending = false;
  }
}

/* ===========================
   AUTO CAPTURE CONSOLE
=========================== */

export function initializeAppLogger(disableConsoleCapture = false) {
  if (initialized) return;

  initialized = true;
  captureConsole = !disableConsoleCapture;

  // Only capture console if enabled
  if (captureConsole) {
    const log = console.log;
    const warn = console.warn;
    const error = console.error;
    const info = console.info;

    console.log = (...args) => {
      log(...args);
      consoleApp(stringify(args), "LOG");
    };

    console.warn = (...args) => {
      warn(...args);
      consoleApp(stringify(args), "WARN");
    };

    console.error = (...args) => {
      error(...args);
      consoleApp(stringify(args), "ERROR");
    };

    console.info = (...args) => {
      info(...args);
      consoleApp(stringify(args), "INFO");
    };
  }

  // Always capture uncaught JS exceptions (even if console capture is disabled)
  if (global.ErrorUtils?.getGlobalHandler) {
    const defaultHandler = global.ErrorUtils.getGlobalHandler();

    global.ErrorUtils.setGlobalHandler((err, isFatal) => {
      consoleApp(
        `${isFatal ? "FATAL" : "EXCEPTION"}\n\n${err.stack || err.message}`,
        "CRASH"
      );

      defaultHandler?.(err, isFatal);
    });
  }

  // Retry when internet comes back
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      processQueue();
    }
  });

  processQueue();
}

/* ===========================
   ENABLE/DISABLE CONSOLE CAPTURE
=========================== */

export function enableConsoleCapture() {
  captureConsole = true;
  // Re-initialize to capture console
  initializeAppLogger(false);
}

export function disableConsoleCapture() {
  captureConsole = false;
  // Restore original console methods
  // Note: You'd need to store original methods to restore them properly
  // This is a simplified version
  console.log = console.log.__original__ || console.log;
  console.warn = console.warn.__original__ || console.warn;
  console.error = console.error.__original__ || console.error;
  console.info = console.info.__original__ || console.info;
}