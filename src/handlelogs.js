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
const SEND_DELAY = 2500;

/* ===========================
   INTERNAL
=========================== */

let currentBot = 0;
let sending = false;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function stringifyData(data) {
  if (data === null) return "null";
  if (data === undefined) return "undefined";
  if (data instanceof Error) return data.stack || data.message;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return String(data);
  
  try {
    return JSON.stringify(data, (key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (typeof value === 'function') return '[Function]';
      return value;
    }, 2);
  } catch {
    return Object.prototype.toString.call(data);
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
   CONSOLE APP - Works like console.log
=========================== */

export async function consoleApp(...args) {
  // Join all arguments like console.log does
  const message = args.map(arg => {
    if (typeof arg === 'string') return arg;
    return stringifyData(arg);
  }).join(' ');

  // Also log to console
  console.log(message);

  const queue = await loadQueue();
  
  queue.push({
    time: new Date().toLocaleString("en-IN", { hour12: false }),
    message: message,
  });

  await saveQueue(queue);
  processQueue();
}

/* ===========================
   PROCESS QUEUE - Send one by one
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
      const log = queue.shift();
      const text = `[${log.time}]\n${log.message}`;

      const token = BOT_TOKENS[currentBot];
      currentBot = (currentBot + 1) % BOT_TOKENS.length;

      try {
        const response = await axios.post(
          `https://api.telegram.org/bot${token}/sendMessage`,
          { chat_id: CHAT_ID, text },
          { timeout: 10000 }
        );

        if (response.data.ok) {
          await saveQueue(queue);
          await delay(SEND_DELAY);
        } else {
          queue.unshift(log);
          await saveQueue(queue);
          break;
        }
      } catch {
        queue.unshift(log);
        await saveQueue(queue);
        break;
      }
    }
  } catch (error) {
    console.log("Queue error:", error);
  } finally {
    sending = false;
  }
}

/* ===========================
   INITIALIZE - Auto retry on internet
=========================== */

export function initializeLogger() {
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable) {
      processQueue();
    }
  });
  
  processQueue();
}