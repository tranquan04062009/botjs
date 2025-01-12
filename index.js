const crypto = require("crypto");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");

const token = 'YOUR_TELEGRAM_BOT_TOKEN';
const bot = new TelegramBot(token, { polling: true });

let userSpamSessions = {};
let blockedUsers = [];

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.190 Safari/537.36"
];

const referrers = [
    "https://www.google.com/",
    "https://www.facebook.com/",
    "https://www.reddit.com/",
    "https://www.yahoo.com/"
];

const getRandomValue = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomIP = () => `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;


const sendMessage = async (username, message, chatId, sessionId, progressMessageId) => {
  let counter = 0;
    let retryDelay = 1000;
    while (userSpamSessions[chatId]?.[sessionId - 1]?.isActive && userSpamSessions[chatId]?.[sessionId - 1]?.isEnabled) {
        try {
            const deviceId = crypto.randomBytes(21).toString("hex");
            const randomUserAgent = getRandomValue(userAgents);
            const randomReferrer = getRandomValue(referrers);
            const ip = getRandomIP();

            const url = "https://ngl.link/api/submit";
            const headers = {
                "User-Agent": randomUserAgent,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept-Language": "en-US,en;q=0.9",
                "Connection": "keep-alive",
                "Referer": randomReferrer,
                "X-Forwarded-For": ip
            };

             const body = `username=${username}&question=${message}&deviceId=${deviceId}&gameSlug=&referrer=${randomReferrer}`;
            const response = await fetch(url, {
                method: "POST",
                headers,
                body
            });

            if (response.status !== 200) {
                console.log(`[Lỗi] Phiên ${sessionId}: Bị giới hạn, đang chờ ${retryDelay / 1000} giây...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                retryDelay = Math.min(retryDelay * 2, 10000);
            } else {
                counter++;
                console.log(`[Tin nhắn] Phiên ${sessionId}: Đã gửi ${counter} tin nhắn.`);
                bot.editMessageText(`🔄 Phiên ${sessionId}: Đã gửi ${counter} tin nhắn.`, {
                    chat_id: chatId,
                    message_id: progressMessageId
                });
                retryDelay = 1000
            }

            // Random short delay
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 100));
        } catch (error) {
           console.error(`[Lỗi] Phiên ${sessionId}: ${error}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryDelay = Math.min(retryDelay * 2, 10000);
        }
    }
};

const startConcurrentSpam = async (username, message, chatId, currentSessionId, progressMessageId) => {
     const concurrentSessions = 5;
      const promises = [];
    for (let i = 0; i < concurrentSessions; i++) {
          promises.push(sendMessage(username, message, chatId, currentSessionId, progressMessageId));
    }
    await Promise.all(promises);
}


const startSession = async (chatId, sessionId) => {
    userSpamSessions[chatId][sessionId - 1].isActive = true;
    console.log(`[Phiên] Phiên ${sessionId} đã bắt đầu.`);
};

const stopSession = async (chatId, sessionId) => {
    userSpamSessions[chatId][sessionId - 1].isActive = false;
    console.log(`[Phiên] Phiên ${sessionId} đã dừng.`);
};


const toggleSession = async (chatId, sessionId) => {
  const session = userSpamSessions[chatId].find(s => s.id === sessionId);
  if (session) {
      session.isEnabled = !session.isEnabled;
      console.log(`[Phiên] Phiên ${sessionId} đã được ${session.isEnabled ? 'bật' : 'tắt'}.`);
        if (session.isEnabled && !session.isActive) {
          startSession(chatId,sessionId)
          const progressMessage = await bot.sendMessage(chatId, `🚀 Phiên ${sessionId}: Đang bắt đầu lại spam...`);
          startConcurrentSpam(session.username, session.message, chatId, sessionId, progressMessage.message_id);
        }
  } else {
         console.log(`[Lỗi] Không tìm thấy phiên spam với ID ${sessionId}.`);
  }
};

const isBlocked = (chatId) => blockedUsers.includes(chatId);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "⛔ Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    bot.sendMessage(chatId, `👋 Xin chào! ID Telegram của bạn là: <code>${userId}</code>`, { parse_mode: "HTML" });

    if (!userSpamSessions[chatId]) {
        userSpamSessions[chatId] = [];
    }

    bot.sendMessage(chatId, "⚙️ Chọn tính năng bạn muốn sử dụng:", {
        reply_markup: {
            keyboard: [
                [{ text: "🚀 Bắt đầu Spam" }, { text: "📋 Danh sách Spam" }]
            ],
            resize_keyboard: true
        }
    });
});

bot.onText(/🚀 Bắt đầu Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "⛔ Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    bot.sendMessage(chatId, "👤 Nhập tên người dùng NGL muốn spam:");
    bot.once("message", (msg) => {
        const username = msg.text;
        bot.sendMessage(chatId, "📝 Nhập tin nhắn bạn muốn gửi:");
        bot.once("message", async (msg) => {
            const message = msg.text;
            const currentSessionId = userSpamSessions[chatId].length + 1;
            userSpamSessions[chatId].push({ id: currentSessionId, username, message, isActive: true, isEnabled: true });

           bot.sendMessage(chatId, `🚀 Phiên ${currentSessionId}: Đang bắt đầu spam...`, {
              reply_markup: { inline_keyboard: [[{ text: "🛑 Dừng", callback_data: `stop_${currentSessionId}` }]] }
          }).then(async (sentMessage) => {
              const progressMessageId = sentMessage.message_id;
              startConcurrentSpam(username, message, chatId, currentSessionId, progressMessageId);
            });

            bot.sendMessage(chatId, `✅ Phiên spam ${currentSessionId} đã bắt đầu!`);
        });
    });
});


bot.onText(/📋 Danh sách Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "⛔ Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    const sessions = userSpamSessions[chatId] || [];
    if (sessions.length > 0) {
        let listMessage = "📋 **Danh sách các phiên spam hiện tại:**\n";
        sessions.forEach(session => {
          listMessage += `\n🆔 Phiên ${session.id}: ${session.username} - ${session.message} [Trạng thái: ${session.isActive ? '🟢 Hoạt động' : '🔴 Dừng'} | Bật: ${session.isEnabled ? '✅' : '❌'}]`;
        });

        const buttons = sessions.map(session => [
            { text: `🛑 Dừng phiên ${session.id}`, callback_data: `stop_${session.id}` },
             { text: session.isEnabled ? "❌ Tắt" : "✅ Bật", callback_data: `toggle_${session.id}` }
        ]);

        bot.sendMessage(chatId, listMessage, {
           parse_mode: "Markdown",
           reply_markup: {
            inline_keyboard: buttons
        }
    });
    } else {
      bot.sendMessage(chatId, "Không có phiên spam nào đang hoạt động.");
    }
});


bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const callbackData = query.data;
    const sessionId = parseInt(callbackData.split("_")[1]);

    if(callbackData.startsWith("stop")){
      await stopSession(chatId, sessionId);
        bot.sendMessage(chatId, `✅ Phiên spam ${sessionId} đã bị dừng.`);
    } else if (callbackData.startsWith("toggle")) {
        await toggleSession(chatId, sessionId);
       const session = userSpamSessions[chatId].find(s => s.id === sessionId);
         if(session) {
           bot.sendMessage(chatId, `⚙️ Phiên spam ${sessionId} đã được ${session.isEnabled ? 'bật' : 'tắt'}.`);
        } else {
           bot.sendMessage(chatId, `❌ Không tìm thấy phiên spam với ID ${sessionId}.`);
         }
    }
});