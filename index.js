const crypto = require("crypto");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");

const token = '7755708665:AAEOgUu_rYrPnGFE7_BJWmr8hw9_xrZ-5e0'; // Thay bằng token bot của bạn
const bot = new TelegramBot(token, { polling: true });

let userSpamSessions = {}; // Lưu danh sách spam theo người dùng
let blockedUsers = []; // Lưu danh sách người dùng bị chặn

// Hàm gửi tin nhắn spam (Đã tối ưu hóa để gửi 100 luồng đồng thời cho mỗi phiên)
const sendMessages = async (username, message, chatId, sessionId, progressMessageId) => {
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

    const maxRequests = 1000; // Số tin nhắn tối đa cho mỗi phiên
    const maxThreads = 100; // Số luồng tối đa cho mỗi phiên

    // Mảng lưu các promise cho các tin nhắn
    let promiseArray = [];

    // Hàm gửi một tin nhắn riêng biệt
    const sendSingleMessage = async (index) => {
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

        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body
            });

            if (response.status !== 200) {
                console.log(`[Lỗi] Bị giới hạn, đang chờ 2 giây...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log(`[Tin nhắn] Phiên ${sessionId}: Đã gửi tin nhắn số ${index + 1}`);
            }

            // Thời gian chờ ngẫu nhiên giữa các lần gửi tin nhắn
            await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100)); // 200ms - 500ms
        } catch (error) {
            console.error(`[Lỗi] ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    };

    // Lặp lại để tạo ra các luồng gửi tin nhắn
    for (let i = 0; i < maxThreads; i++) {
        promiseArray.push(sendSingleMessage(i)); // Tạo các promise cho các luồng gửi tin nhắn
    }

    // Chạy tất cả các luồng đồng thời
    await Promise.all(promiseArray);

    // Cập nhật tin nhắn tiến trình sau khi hoàn thành
    const session = userSpamSessions[chatId]?.find(s => s.id === sessionId);
    if (session) {
        bot.editMessageText(`Phiên ${sessionId}: Đã gửi ${maxThreads} tin nhắn.`, {
            chat_id: chatId,
            message_id: progressMessageId
        });
    }
};

// Xử lý danh sách spam và quản lý các phiên đồng thời
bot.onText(/Danh sách Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (blockedUsers.includes(chatId)) {
        bot.sendMessage(chatId, "Bạn đã bị chặn khỏi việc sử dụng bot này.");
        return;
    }

    const sessions = userSpamSessions[chatId] || [];
    if (sessions.length > 0) {
        let listMessage = "Danh sách các phiên spam hiện tại:\n";
        sessions.forEach(session => {
            listMessage += `${session.id}: ${session.username} - ${session.message} [Hoạt động: ${session.isActive ? "Đang chạy" : "Đã dừng"}]\n`;
        });

        const buttons = sessions.map(session => [
            {
                text: session.isActive ? `Dừng ${session.id}` : `Tiếp tục ${session.id}`,
                callback_data: `${session.isActive ? "stop" : "resume"}_${session.id}`
            }
        ]);

        bot.sendMessage(chatId, listMessage, {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    } else {
        bot.sendMessage(chatId, "Không có phiên spam nào đang hoạt động.");
    }
});

// Xử lý các nút "Dừng" và "Tiếp tục"
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const [action, sessionId] = query.data.split("_");
    const session = userSpamSessions[chatId]?.find(s => s.id === parseInt(sessionId));

    if (!session) {
        bot.sendMessage(chatId, `Không tìm thấy phiên spam với ID ${sessionId}.`);
        return;
    }

    if (action === "stop") {
        session.isActive = false; // Dừng phiên
        bot.sendMessage(chatId, `Phiên spam ${sessionId} đã bị dừng.`);
    } else if (action === "resume") {
        session.isActive = true; // Tiếp tục phiên
        bot.sendMessage(chatId, `Phiên spam ${sessionId} đã được tiếp tục.`);
        const progressMessageId = query.message.message_id;
        
        // Xử lý nhiều phiên đồng thời bằng cách sử dụng Promise.all
        sendMessages(session.username, session.message, chatId, session.id, progressMessageId);
    }
});

// Xử lý nút "Bắt đầu Spam"
bot.onText(/Bắt đầu Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (blockedUsers.includes(chatId)) {
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
            userSpamSessions[chatId].push({ id: currentSessionId, username, message, isActive: true, counter: 0 });
            bot.sendMessage(chatId, `Phiên spam ${currentSessionId} đã bắt đầu!`);

            const progressMessageId = msg.message_id;
            sendMessages(username, message, chatId, currentSessionId, progressMessageId);
        });
    });
});