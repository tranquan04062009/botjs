const crypto = require("crypto");
const fetch = require("node-fetch");
const TelegramBot = require("node-telegram-bot-api");

const token = '7766543633:AAFnN9tgGWFDyApzplak0tiJTafCxciFydo'; // Thay bằng token bot của bạn
const bot = new TelegramBot(token, { polling: true });

let userSpamSessions = {}; // Menyimpan daftar spam per pengguna
let blockedUsers = []; // Menyimpan daftar pengguna yang diblokir
const adminIdList = [6692083976]; // Tambahkan ID admin di sini

// Fungsi untuk mengirim pesan spam
const sendMessage = async (username, message, chatId, sessionId) => {
    let counter = 0;
    while (userSpamSessions[chatId]?.[sessionId - 1]?.isActive) {
        try {
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
                console.log(`[Error] Rate-limited, waiting 5 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            } else {
                counter++;
                console.log(`[Msg] Session ${sessionId}: Sent ${counter} messages.`);
                bot.sendMessage(chatId, `Session ${sessionId}: Sent ${counter} messages.`);
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.error(`[Error] ${error}`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
};

// Middleware untuk memeriksa blokir
const isBlocked = (chatId) => blockedUsers.includes(chatId);

// Perintah untuk memulai bot
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || "Tidak ada username";
    const firstName = msg.from.first_name || "Tidak ada nama";
    const userId = msg.from.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "Anda telah diblokir dari menggunakan bot ini.");
        return;
    }

    // Beri tahu pengguna ID mereka
    bot.sendMessage(chatId, `Selamat datang! ID Telegram Anda adalah: ${userId}`);

    // Kirim log ke semua admin tentang pengguna baru
    adminIdList.forEach((adminId) => {
        bot.sendMessage(
            adminId,
            `Pengguna baru memulai bot:\nID: ${userId}\nUsername: ${username}\nNama: ${firstName}`
        );
    });

    if (!userSpamSessions[chatId]) {
        userSpamSessions[chatId] = []; // Inisialisasi daftar spam untuk pengguna baru
    }

    bot.sendMessage(chatId, "Pilih fitur yang tersedia:", {
        reply_markup: {
            keyboard: [
                [{ text: "Start Spam" }, { text: "List Spam" }],
                [{ text: "Fitur Bot" }]
            ],
            resize_keyboard: true
        }
    });
});

// Handle tombol "Start Spam"
bot.onText(/Start Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "Anda telah diblokir dari menggunakan bot ini.");
        return;
    }

    bot.sendMessage(chatId, "Masukkan username yang ingin di-spam:");
    bot.once("message", (msg) => {
        const username = msg.text;
        bot.sendMessage(chatId, "Masukkan pesan yang ingin dikirim:");
        bot.once("message", (msg) => {
            const message = msg.text;
            const currentSessionId = userSpamSessions[chatId].length + 1;
            userSpamSessions[chatId].push({ id: currentSessionId, username, message, isActive: true });
            sendMessage(username, message, chatId, currentSessionId);
            bot.sendMessage(chatId, `Spam session ${currentSessionId} dimulai!`);
        });
    });
});

// Handle tombol "List Spam"
bot.onText(/List Spam/, (msg) => {
    const chatId = msg.chat.id;

    if (isBlocked(chatId)) {
        bot.sendMessage(chatId, "Anda telah diblokir dari menggunakan bot ini.");
        return;
    }

    const sessions = userSpamSessions[chatId] || [];
    if (sessions.length > 0) {
        let listMessage = "Sesi spam saat ini:\n";
        sessions.forEach(session => {
            listMessage += `${session.id}: ${session.username} - ${session.message} [Aktif: ${session.isActive}]\n`;
        });

        const buttons = sessions.map(session => [{
            text: `Hentikan Session ${session.id}`,
            callback_data: `stop_${session.id}`
        }]);

        bot.sendMessage(chatId, listMessage, {
            reply_markup: {
                inline_keyboard: buttons
            }
        });
    } else {
        bot.sendMessage(chatId, "Tidak ada sesi spam yang aktif.");
    }
});

// Handle "Hentikan Session"
bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const sessionId = parseInt(query.data.split("_")[1]);

    const sessions = userSpamSessions[chatId] || [];
    const session = sessions.find(s => s.id === sessionId);

    if (session) {
        session.isActive = false; // Hentikan sesi
        bot.sendMessage(chatId, `Spam session ${sessionId} telah dihentikan.`);
    } else {
        bot.sendMessage(chatId, `Sesi spam dengan ID ${sessionId} tidak ditemukan.`);
    }
});

// Admin command untuk melihat semua aktivitas pengguna
bot.onText(/\/admin/, (msg) => {
    const chatId = msg.chat.id;

    if (!adminIdList.includes(chatId)) {
        bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan oleh admin.");
        return;
    }

    let adminMessage = "Daftar pengguna bot:\n";
    Object.keys(userSpamSessions).forEach(userId => {
        adminMessage += `User ${userId}:\n`;
        userSpamSessions[userId].forEach(session => {
            adminMessage += `- [ID ${session.id}] ${session.username}: ${session.message} (Aktif: ${session.isActive})\n`;
        });
    });

    bot.sendMessage(chatId, adminMessage);
});

// Admin command untuk memblokir pengguna
bot.onText(/\/block (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;

    if (!adminIdList.includes(chatId)) {
        bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan oleh admin.");
        return;
    }

    const targetId = parseInt(match[1]);
    if (!blockedUsers.includes(targetId)) {
        blockedUsers.push(targetId);
        bot.sendMessage(chatId, `Pengguna ${targetId} telah diblokir.`);
    } else {
        bot.sendMessage(chatId, `Pengguna ${targetId} sudah diblokir.`);
    }
});

// Admin command untuk membuka blokir pengguna
bot.onText(/\/unblock (\d+)/, (msg, match) => {
    const chatId = msg.chat.id;

    if (!adminIdList.includes(chatId)) {
        bot.sendMessage(chatId, "Perintah ini hanya dapat digunakan oleh admin.");
        return;
    }

    const targetId = parseInt(match[1]);
    const index = blockedUsers.indexOf(targetId);
    if (index > -1) {
        blockedUsers.splice(index, 1);
        bot.sendMessage(chatId, `Pengguna ${targetId} telah dibuka blokirnya.`);
    } else {
        bot.sendMessage(chatId, `Pengguna ${targetId} tidak ditemukan di daftar blokir.`);
    }
});
