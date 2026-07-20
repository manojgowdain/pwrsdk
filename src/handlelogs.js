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

// CRITICAL FIX: Better stringification
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
  
  // It's an object or array - convert to readable JSON with better formatting
  try {
    // Try to get a clean JSON representation
    const jsonStr = JSON.stringify(data, (key, value) => {
      // Handle special cases
      if (typeof value === 'bigint') {
        return value.toString();
      }
      // Skip functions
      if (typeof value === 'function') {
        return '[Function]';
      }
      return value;
    }, 2);
    return jsonStr;
  } catch (e) {
    // If JSON.stringify fails (circular references, etc.)
    try {
      // Fallback: try to stringify with a replacer that handles circular
      const seen = new WeakSet();
      return JSON.stringify(data, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        if (typeof value === 'bigint') {
          return value.toString();
        }
        if (typeof value === 'function') {
          return '[Function]';
        }
        return value;
      }, 2);
    } catch (err) {
      // Last resort: use toString or custom representation
      return Object.prototype.toString.call(data);
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
  console.log(`[${type}]`, data); // Log locally for debugging
  
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
      console.log("No internet, will retry later");
      sending = false;
      return;
    }

    let queue = await loadQueue();
    console.log(`Processing ${queue.length} queued messages`);

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

      console.log(`Sending ${batch.length} logs to Telegram...`);

      try {
        const response = await axios.post(
          `https://api.telegram.org/bot${token}/sendMessage`,
          {
            chat_id: CHAT_ID,
            text,
          },
          {
            timeout: 10000,
          }
        );

        if (response.data.ok) {
          console.log(`✅ Sent ${batch.length} logs to Telegram`);
          await saveQueue(queue);
          await delay(SEND_DELAY);
        } else {
          console.log("Telegram API error:", response.data);
          batch.reverse().forEach((i) => queue.unshift(i));
          await saveQueue(queue);
          break;
        }
      } catch (e) {
        console.log("Failed to send to Telegram:", e.message);
        batch.reverse().forEach((i) => queue.unshift(i));
        await saveQueue(queue);
        break;
      }
    }
  } catch (error) {
    console.log("Process queue error:", error);
  } finally {
    sending = false;
  }
}

/* ===========================
   INITIALIZE
=========================== */

export function initializeAppLogger() {
  console.log("Initializing Telegram logger...");
  
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
      console.log("Internet reconnected, retrying logs...");
      processQueue();
    }
  });

  processQueue();
}