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
const SEND_DELAY = 2500;
const MAX_QUEUE_SIZE = 100;
const AUTO_RETRY_INTERVAL = 30000; // 30 seconds

/* ===========================
   INTERNAL
=========================== */

let currentBot = 0;
let lastSendTime = 0;
let isOnline = false;
let isProcessing = false;

// Internal queue system
const queue = {
  items: [],
  pending: [],
  failed: [],
  sent: [],
  stats: {
    total: 0,
    sent: 0,
    failed: 0,
    pending: 0
  },
  
  add(message) {
    const item = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      message,
      timestamp: new Date().toISOString(),
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      createdAt: Date.now()
    };
    
    this.items.push(item);
    this.pending.push(item);
    this.stats.total++;
    this.stats.pending++;
    
    // Auto trim
    if (this.items.length > MAX_QUEUE_SIZE) {
      const removed = this.items.shift();
      if (removed.status === 'pending') {
        this.pending = this.pending.filter(i => i.id !== removed.id);
        this.stats.pending--;
      }
    }
    
    return item;
  },
  
  markSent(id) {
    const item = this.findItem(id);
    if (item) {
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
      this.pending = this.pending.filter(i => i.id !== id);
      this.sent.push(item);
      this.stats.sent++;
      this.stats.pending--;
    }
    return item;
  },
  
  markFailed(id, error = null) {
    const item = this.findItem(id);
    if (item) {
      item.attempts++;
      if (item.attempts >= item.maxAttempts) {
        item.status = 'failed';
        this.pending = this.pending.filter(i => i.id !== id);
        this.failed.push(item);
        this.stats.failed++;
        this.stats.pending--;
      } else {
        // Re-add to pending for retry
        this.pending.push(item);
      }
    }
    return item;
  },
  
  findItem(id) {
    return this.items.find(i => i.id === id);
  },
  
  retryFailed() {
    const failedItems = [...this.failed];
    if (failedItems.length === 0) return 0;
    
    this.failed = [];
    this.stats.failed -= failedItems.length;
    
    failedItems.forEach(item => {
      item.status = 'pending';
      item.attempts = 0;
      this.pending.push(item);
      this.stats.pending++;
    });
    
    return failedItems.length;
  }
};

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

async function checkOnlineStatus() {
  const net = await NetInfo.fetch();
  isOnline = net.isConnected && net.isInternetReachable;
  return isOnline;
}

async function sendToTelegram(message) {
  const token = BOT_TOKENS[currentBot];
  currentBot = (currentBot + 1) % BOT_TOKENS.length;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: message,
      }),
    });

    const data = await response.json();
    return data.ok === true;
  } catch (error) {
    console.error('Telegram send error:', error);
    return false;
  }
}

async function processQueue() {
  if (isProcessing) return;
  if (queue.pending.length === 0) return;
  
  isProcessing = true;
  
  try {
    await checkOnlineStatus();
    
    if (!isOnline) {
      console.log(`[QUEUE] Offline - ${queue.pending.length} items waiting`);
      isProcessing = false;
      setTimeout(processQueue, 10000);
      return;
    }
    
    const item = queue.pending[0];
    
    // Rate limiting
    const now = Date.now();
    const timeSinceLastSend = now - lastSendTime;
    if (timeSinceLastSend < SEND_DELAY) {
      await delay(SEND_DELAY - timeSinceLastSend);
    }
    
    const timestamp = new Date().toLocaleString("en-IN", { hour12: false });
    const formattedMessage = `[${timestamp}]\n${item.message}`;
    
    console.log(`[QUEUE] Sending (${item.attempts + 1}/${item.maxAttempts})...`);
    
    const success = await sendToTelegram(formattedMessage);
    
    if (success) {
      queue.markSent(item.id);
      lastSendTime = Date.now();
      console.log(`[QUEUE] ✅ Sent`);
    } else {
      queue.markFailed(item.id, 'Telegram API error');
      console.log(`[QUEUE] ❌ Failed (attempt ${item.attempts}/${item.maxAttempts})`);
    }
  } catch (error) {
    console.error('[QUEUE] Error:', error);
    if (queue.pending.length > 0) {
      queue.markFailed(queue.pending[0].id, error.message);
    }
  } finally {
    isProcessing = false;
    if (queue.pending.length > 0) {
      setTimeout(processQueue, 100);
    }
  }
}

/* ===========================
   EXPORTED FUNCTIONS
=========================== */

export async function consoleApp(...args) {
  // Join all arguments like console.log does
  const message = args.map(arg => {
    if (typeof arg === 'string') return arg;
    return stringifyData(arg);
  }).join(' ');

  // Also log to console
  console.log(message);

  // Check online status
  await checkOnlineStatus();
  
  // Add to queue
  queue.add(message);
  console.log(`[QUEUE] Added (${queue.stats.pending} pending)`);
  
  // Process queue if online
  if (isOnline) {
    setTimeout(processQueue, 100);
  }
}

export function getCurrentStatus() {
  return {
    isOnline: isOnline,
    status: isOnline ? 'online' : 'offline',
    queue: {
      total: queue.stats.total,
      pending: queue.stats.pending,
      sent: queue.stats.sent,
      failed: queue.stats.failed,
      items: queue.items.length
    },
    processing: isProcessing,
    timestamp: new Date().toISOString()
  };
}

/* ===========================
   INITIALIZE - Auto setup
=========================== */

export function initializeLogger() {
  // Initial check
  checkOnlineStatus();
  
  // Auto retry failed items
  setInterval(() => {
    if (isOnline && queue.failed.length > 0) {
      console.log(`[AUTO] Retrying ${queue.failed.length} failed items...`);
      queue.retryFailed();
      processQueue();
    }
  }, AUTO_RETRY_INTERVAL);
  
  // Monitor network changes
  NetInfo.addEventListener((state) => {
    const wasOnline = isOnline;
    isOnline = state.isConnected && state.isInternetReachable;
    
    if (isOnline !== wasOnline) {
      console.log(`📡 Status changed to: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
      
      if (isOnline) {
        consoleApp('🟢 Device is now ONLINE');
        setTimeout(processQueue, 1000);
      } else {
        consoleApp('🔴 Device is now OFFLINE');
      }
    }
  });
  
  // Initial status
  console.log(`📱 Logger initialized - Status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
  consoleApp('📱 Logger initialized');
  
  return { consoleApp, getCurrentStatus };
}