import axios from "axios";

const CHAT_ID = "-1003846719897";

const BOT_TOKENS = [
  "8548562996:AAEDy-NTQc4xaCF0EK4ApmiN3HxGLAeaOSo",
  "8606786188:AAGyO5wU68aSROWCa9rEVqeJClIgLnldnRg",
  "8793104670:AAFqd92PPLP89sPtrrtGX6ibvzuF3J3FT5Q",
];

let currentBot = 0;

export async function sendTelegramMessage(message) {
  const token = BOT_TOKENS[currentBot];

  // Round Robin
  currentBot = (currentBot + 1) % BOT_TOKENS.length;

  try {
    const { data } = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: "HTML",
      }
    );

    return data;
  } catch (error) {
    console.error(
      "Telegram Error:",
      error.response?.data || error.message
    );
    throw error;
  }
}