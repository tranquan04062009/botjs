const crypto = require("crypto");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");

const token = '7766543633:AAFnN9tgGWFDyApzplak0tiJTafCxciFydo'; // Thay bằng token bot của bạn
const bot = new TelegramBot(token, { polling: true });

let userSpamSessions = {}; // Lưu trữ phiên spam của mỗi người dùng
// Không còn blockedUsers

// Hàm gửi tin nhắn spam
const sendMessage = async (username, message, chatId, sessionId) => {
    let counter = 0;
    let lastSentCount = 0; // Biến để theo dõi số tin nhắn đã gửi gần nhất
    let messageId = null; // ID tin nhắn thông báo

    while (userSpamSessions[chatId]?.[sessionId - 1]?.isActive) {
        try {
            // Tạo deviceId ngẫu nhiên cho mỗi tin nhắn
            const deviceId = crypto.randomBytes(21).toString("hex");
            const url = "https://ngl.link/api/submit";
            const headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/109.0",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
            };
            const body = `username=${username}&question=${message}&deviceId=${deviceId}&gameSlug=&referrer=`;

            const response = await fetch(url, {
                method: "POST",
                headers,
                body
            });

            if (response.status !== 200) {
                console.log(`[Lỗi] Bị giới hạn, chờ 5 giây...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                 counter++;
                console.log(`[Tin nhắn] Phiên ${sessionId}: Đã gửi ${counter} tin nhắn.`);

                 if (counter % 5 === 0 || !messageId) {
                    const sentMessage = `Phiên ${sessionId}: Đã gửi ${counter} tin nhắn.`;
                    if (!messageId) {
                        const sentMsg = await bot.sendMessage(chatId, sentMessage);
                         messageId = sentMsg.message_id;
                    } else {
                        bot.editMessageText(sentMessage, { chat_id: chatId, message_id: messageId });
                    }
                    lastSentCount = counter;
                }


            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`[Lỗi] ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
     if (messageId) {
         bot.editMessageText(`Phiên ${sessionId} đã dừng. Tổng cộng đã gửi ${counter} tin nhắn.`, { chat_id: chatId, message_id: messageId });
    }
};


// Lệnh /start để bắt đầu bot
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    const username = msg.from.username || "Không có tên người dùng";
    const firstName = msg.from.first_name || "Không có tên";
    const userId = msg.from.id;

    // Thông báo ID cho người dùng
    bot.sendMessage(chatId, `Chào mừng! ID Telegram của bạn là: ${userId}`);

    // Không còn gửi log cho admin nữa

    if (!userSpamSessions[chatId]) {
        userSpamSessions[chatId] = []; // Khởi tạo phiên spam cho người dùng mới
    }

    bot.sendMessage(chatId, "Chọn tính năng:", {
        reply_markup: {
            keyboard: [
                [{ text: "Bắt đầu Spam" }, { text: "Danh sách Spam" }],
                [{ text: "Tính năng Bot" }]
            ],
            resize_keyboard: true
        }
    });
});

// Xử lý nút "Bắt đầu Spam"
bot.onText(/Bắt đầu Spam/, async (msg) => {
    const chatId = msg.chat.id;


    bot.sendMessage(chatId, "Nhập tên người dùng bạn muốn spam:");
    bot.once("message", (msg) => {
        const username = msg.text;
        bot.sendMessage(chatId, "Nhập tin nhắn bạn muốn gửi:");
        bot.once("message", (msg) => {
            const message = msg.text;
            const currentSessionId = userSpamSessions[chatId].length + 1;
            userSpamSessions[chatId].push({ id: currentSessionId, username, message, isActive: true });
            sendMessage(username, message, chatId, currentSessionId);
            bot.sendMessage(chatId, `Phiên spam ${currentSessionId} đã bắt đầu!`);
        });
    });
});

// Xử lý nút "Danh sách Spam"
bot.onText(/Danh sách Spam/, async (msg) => {
   const chatId = msg.chat.id;


    const sessions = userSpamSessions[chatId] || [];
    if (sessions.length > 0) {
        let listMessage = "Các phiên spam hiện tại:\n";
        sessions.forEach(session => {
            listMessage += `${session.id}: ${session.username} - ${session.message} [Đang hoạt động: ${session.isActive}]\n`;
        });

        const buttons = sessions.map(session => [{
            text: `Dừng Phiên ${session.id}`,
            callback_data: `stop_${session.id}`
        }]);

        bot.sendMessage(chatId, listMessage, {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    } else {
        bot.sendMessage(chatId, "Không có phiên spam nào đang hoạt động.");
    }
});

// Xử lý nút "Dừng phiên"
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const sessionId = parseInt(query.data.split("_")[1]);

    const sessions = userSpamSessions[chatId] || [];
    const session = sessions.find(s => s.id === sessionId);

    if (session) {
        session.isActive = false; // Dừng phiên spam
    } else {
        bot.sendMessage(chatId, `Không tìm thấy phiên spam có ID ${sessionId}.`);
    }
});


// Tính năng bot (ví dụ)
bot.onText(/Tính năng Bot/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, "Đây là một bot spam NGL. Bạn có thể spam một người dùng NGL khác bằng cách sử dụng bot này. Hãy sử dụng nó một cách có trách nhiệm nhé!");
})