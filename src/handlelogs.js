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

const MAX_LOGS_PER_MESSAGE = 20;
const SEND_DELAY = 2500;

/* ===========================
   INTERNAL
=========================== */

let currentBot = 0;
let sending = false;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const timestamp = () =>
  new Date().toLocaleString("en-IN", {
    hour12: false,
  });

// Convert ANY data to readable string
function stringifyData(data) {
  if (data === null) return "null";
  if (data === undefined) return "undefined";
  
  // If it's an Error
  if (data instanceof Error) {
    return data.stack || data.message;
  }
  
  // If it's a string, return as is
  if (typeof data === 'string') {
    return data;
  }
  
  // If it's a number, boolean, etc.
  if (typeof data !== 'object') {
    return String(data);
  }
  
  // It's an object or array - convert to readable JSON
  try {
    return JSON.stringify(data, null, 2);
  } catch (e) {
    // If JSON.stringify fails (circular references, etc.)
    try {
      return JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          // Skip circular references
          return '[Circular]';
        }
        return value;
      }, 2);
    } catch {
      return String(data);
    }
  }
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
   MAIN LOGGER - Pass anything
=========================== */

export async function consoleApp(data, type = "LOG") {
  const queue = await loadQueue();
  
  // Convert whatever data is passed to string
  const messageStr = stringifyData(data);

  queue.push({
    type,
    time: timestamp(),
    message: messageStr,
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
   INITIALIZE
=========================== */

export function initializeAppLogger() {
  // Handle uncaught exceptions
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