const crypto = require("crypto");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");

const token = '7755708665:AAEOgUu_rYrPnGFE7_BJWmr8hw9_xrZ-5e0'; // Thay bằng token bot của bạn
const bot = new TelegramBot(token, { polling: true });

let userSpamSessions = {}; // Lưu danh sách spam theo người dùng
let blockedUsers = []; // Lưu danh sách người dùng bị chặn

// Hàm gửi tin nhắn spam
const sendMessage = async (username, message, chatId, sessionId, progressMessageId) => {
    let counter = 0;
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

    while (userSpamSessions[chatId]?.[sessionId - 1]?.isActive) {
        try {
            const deviceId = crypto.randomBytes(21).toString("hex");
            const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
            const randomReferrer = referrers[Math.floor(Math.random() * referrers.length)];

            const url = "https://ngl.link/api/submit";
            const headers = {
                "User-Agent": randomUserAgent,
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept-Language": "en-US,en;q=0.9",
                "Connection": "keep-alive",
                "Referer": randomReferrer,
                "X-Forwarded-For": `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`
            };

            const body = `username=${username}&question=${message}&deviceId=${deviceId}&gameSlug=&referrer=${randomReferrer}`;

            const response = await fetch(url, {
                method: "POST","HEAD","GET"
                headers,
                body
            });

            if (response.status !== 200) {
                console.log(`[Lỗi] Bị giới hạn, đang chờ 5 giây...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                counter++;
                console.log(`[Tin nhắn] Phiên ${sessionId}: Đã gửi ${counter} tin nhắn.`);

                // Cập nhật tin nhắn tiến trình
                bot.editMessageText(`Phiên ${sessionId}: Đã gửi ${counter} tin nhắn.`, {
                    chat_id: chatId,
                    message_id: progressMessageId
                });
            }

            // Thời gian chờ ngẫu nhiên giữa các lần gửi tin nhắn
            await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 100) + 50));
        } catch (error) {
            console.error(`[Lỗi] ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
};

// Middleware kiểm tra người dùng bị chặn
const isBlocked = (chatId) => blockedUsers.includes(chatId);

// Lệnh bắt đầu bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || "Không có tên người dùng";
    const firstName = msg.from.first_name || "Không có tên";
    const userId = msg.from.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    // Thông báo cho người dùng về ID của họ
    bot.sendMessage(chatId, `Chào mừng! ID Telegram của bạn là: ${userId}`);

    if (!userSpamSessions[chatId]) {
        userSpamSessions[chatId] = []; // Khởi tạo danh sách spam cho người dùng mới
    }

    bot.sendMessage(chatId, "Chọn tính năng bạn muốn sử dụng:", {
        reply_markup: {
            keyboard: [
                [{ text: "Bắt đầu Spam" }, { text: "Danh sách Spam" }]
            ],
            resize_keyboard: true
        }
    });
});

// Xử lý nút "Bắt đầu Spam"
bot.onText(/Bắt đầu Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    bot.sendMessage(chatId, "Nhập tên người dùng muốn spam:");
    bot.once("message", (msg) => {
        const username = msg.text;
        bot.sendMessage(chatId, "Nhập tin nhắn bạn muốn gửi:");
        bot.once("message", (msg) => {
            const message = msg.text;
            const currentSessionId = userSpamSessions[chatId].length + 1;
            userSpamSessions[chatId].push({ id: currentSessionId, username, message, isActive: true });

            // Gửi tin nhắn thông báo tiến trình
            bot.sendMessage(chatId, `Phiên ${currentSessionId}: Đang bắt đầu spam...`, {
                reply_markup: { inline_keyboard: [[{ text: "Dừng", callback_data: `stop_${currentSessionId}` }]] }
            }).then((sentMessage) => {
                const progressMessageId = sentMessage.message_id;
                sendMessage(username, message, chatId, currentSessionId, progressMessageId);
            });

            bot.sendMessage(chatId, `Phiên spam ${currentSessionId} đã bắt đầu!`);
        });
    });
});

// Xử lý nút "Danh sách Spam"
bot.onText(/Danh sách Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    const sessions = userSpamSessions[chatId] || [];
    if (sessions.length > 0) {
        let listMessage = "Danh sách các phiên spam hiện tại:\n";
        sessions.forEach(session => {
            listMessage += `${session.id}: ${session.username} - ${session.message} [Hoạt động: ${session.isActive}]\n`;
        });

        const buttons = sessions.map(session => [{
            text: `Dừng phiên ${session.id}`,
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

// Xử lý "Dừng phiên"
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const sessionId = parseInt(query.data.split("_")[1]);

    const sessions = userSpamSessions[chatId] || [];
    const session = sessions.find(s => s.id === sessionId);

    if (session) {
        session.isActive = false; // Dừng phiên
        bot.sendMessage(chatId, `Phiên spam ${sessionId} đã bị dừng.`);
    } else {
        bot.sendMessage(chatId, `Không tìm thấy phiên spam với ID ${sessionId}.`);
    }
});