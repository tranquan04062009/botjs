const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');

// --- CONFIGURATION ---
const BOT_TOKEN = "7766543633:AAFnN9tgGWFDyApzplak0tiJTafCxciFydo";
const SHARE_COMMAND = "/share";
const START_COMMAND = "/start";
const HELP_COMMAND = "/help";
const STOP_COMMAND = "/stop";
const STATUS_COMMAND = "/status";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

let shareInProgress = {};
let activeThreads = {};
let stopRequested = {};
let shareCount = {};

// --- TOKEN EXTRACTION ---
const getTokens = async (input_file) => {
    let gome_token = [];
    const readFileAsync = promisify(fs.readFile);
    try {
        const fileContent = await readFileAsync(input_file, 'utf-8');
        const cookies = fileContent.split('\n').filter(cookie => cookie.trim() !== '');
        for (const cookie of cookies) {
            const headers = {
                'authority': 'business.facebook.com',
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
                'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
                'cache-control': 'max-age=0',
                'cookie': cookie,
                'referer': 'https://www.facebook.com/',
                'sec-ch-ua': '".Not/A)Brand";v="99", "Google Chrome";v="103", "Chromium";v="103"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Linux"',
                'sec-fetch-dest': 'document',
                'sec-fetch-mode': 'navigate',
                'sec-fetch-site': 'same-origin',
                'sec-fetch-user': '?1',
                'upgrade-insecure-requests': '1',
            };
            try {
                const response = await axios.get('https://business.facebook.com/content_management', { headers });
                const homeBusiness = response.data;
                const tokenMatch = homeBusiness.match(/EAAG(.*?)"/);
                if (tokenMatch) {
                    const token = tokenMatch[1];
                    const cookieToken = `${cookie}|EAAG${token}`;
                    gome_token.push(cookieToken);
                }
            } catch (error) {
                console.error("Error extracting token:", error);
            }
        }
    } catch (error) {
        console.error("Error reading cookie file:", error);
    }
    return gome_token;
};


// --- SHARE FUNCTION ---
const share = async (tach, id_share, chatId, delayTime, bot) => {
    const userId = chatId;
    if (!activeThreads[userId]) {
        activeThreads[userId] = { status: 'started' };
    }

    const [cookie, token] = tach.split('|');
    const headers = {
        'accept': '*/*',
        'accept-encoding': 'gzip, deflate',
        'connection': 'keep-alive',
        'content-length': '0',
        'cookie': cookie,
        'host': 'graph.facebook.com'
    };

    try {
        if (stopRequested[userId]) {
            return;
        }
        const response = await axios.post(`https://graph.facebook.com/me/feed?link=https://m.facebook.com/${id_share}&published=0&access_token=${token}`, {}, { headers });
        if (response.status === 200) {
            shareCount[userId] = (shareCount[userId] || 0) + 1;
            bot.sendMessage(chatId, `Share thành công: ${id_share}, Số lần: ${shareCount[userId]}`);
        } else {
            bot.sendMessage(chatId, `Lỗi share: status code ${response.status}`);
        }
    } catch (error) {
        bot.sendMessage(chatId, `Lỗi share: ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, delayTime * 1000));
};

const startShare = async (chatId, bot, cookieFile, idShare, delayTime, totalShare) => {
    stopRequested[chatId] = false;
    shareCount[chatId] = 0;
    try {
        if (shareInProgress[chatId]) {
            bot.sendMessage(chatId, "Đang có tiến trình share khác chạy. Vui lòng đợi tiến trình hiện tại kết thúc.");
            return;
        }
        shareInProgress[chatId] = true;

        const allTokens = await getTokens(cookieFile);
        if (allTokens.length === 0) {
            bot.sendMessage(chatId, "Không tìm thấy token hợp lệ trong file cookie.");
            shareInProgress[chatId] = false;
            return;
        }
        let stt = 0;
        while (true) {
            for (const tach of allTokens) {
                if (stopRequested[chatId]) {
                    bot.sendMessage(chatId, "Tiến trình share đã được dừng.");
                    shareInProgress[chatId] = false;
                    return;
                }
                stt++;
                share(tach, idShare, chatId, delayTime, bot);
                if (stt >= totalShare) {
                    break;
                }
            }
            if (stt >= totalShare) {
                break;
            }
        }
        bot.sendMessage(chatId, "Hoàn thành quá trình share.");

    } catch (error) {
        bot.sendMessage(chatId, `Có lỗi xảy ra: ${error.message}`);
    } finally {
        shareInProgress[chatId] = false;
        if (activeThreads[chatId]) {
            activeThreads[chatId].status = 'stopped';
        }
    }
};


// --- BOT COMMAND HANDLERS ---
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Xin chào! Bot đã sẵn sàng hoạt động. Sử dụng /help để xem hướng dẫn.");
});


bot.onText(/\/help/, (msg) => {
    const helpText = `
**Hướng Dẫn Sử Dụng Bot Share:**
Sử dụng các lệnh sau:

*${START_COMMAND}*: Bắt đầu bot.
*${HELP_COMMAND}*: Xem hướng dẫn sử dụng.
*${SHARE_COMMAND}*: Bắt đầu quá trình share.
*${STOP_COMMAND}*: Dừng tiến trình share đang chạy.
*${STATUS_COMMAND}*: Xem trạng thái của tiến trình share.

**Lệnh Share:**
Để sử dụng lệnh share bạn cần làm theo các bước sau:
1. Gửi lệnh: ${SHARE_COMMAND}.
2. Gửi một file chứa cookie (mỗi cookie 1 dòng).
3. Gửi id facebook cần share.
4. Gửi delay time mỗi lần share (giây).
5. Gửi số lượng share.
`;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
    const userId = msg.chat.id;
    if (activeThreads[userId]) {
        const status = activeThreads[userId].status;
        const count = shareCount[userId] || 0;
        bot.sendMessage(userId, `Trạng thái: ${status}, Đã share ${count} lần.`);
    } else {
        bot.sendMessage(userId, "Không có tiến trình share nào đang chạy.");
    }
});

bot.onText(/\/stop/, (msg) => {
    const userId = msg.chat.id;
    if (activeThreads[userId]) {
        stopRequested[userId] = true;
        bot.sendMessage(userId, "Đã yêu cầu dừng tiến trình share.");
    } else {
        bot.sendMessage(userId, "Không có tiến trình share nào đang chạy để dừng.");
    }
});

bot.onText(/\/share/, async (msg) => {
    if (shareInProgress[msg.chat.id]) {
        bot.sendMessage(msg.chat.id, "Đang có tiến trình share khác chạy. Vui lòng đợi tiến trình hiện tại kết thúc.");
        return;
    }

    bot.sendMessage(msg.chat.id, "Vui lòng gửi file chứa cookie (mỗi cookie trên 1 dòng).");
    bot.on('message', async (msg1) => {
        if (msg1.document) {
            try {
                const fileId = msg1.document.file_id;
                const fileLink = await bot.getFileLink(fileId);
                const response = await axios.get(fileLink, { responseType: 'arraybuffer' });
                fs.writeFileSync('temp_cookies.txt', Buffer.from(response.data));
                bot.sendMessage(msg1.chat.id, "Vui lòng nhập ID bài viết hoặc trang bạn muốn share.");

                bot.once('message', async (msg2) => {
                    const idShare = msg2.text.trim();
                    bot.sendMessage(msg2.chat.id, "Vui lòng nhập thời gian delay giữa các lần share (giây).");
                    bot.once('message', async (msg3) => {
                        const delayTime = parseInt(msg3.text.trim());
                        if (delayTime < 0 || isNaN(delayTime)) {
                            bot.sendMessage(msg3.chat.id, "Giá trị không hợp lệ: Delay time phải là số dương.");
                            return;
                        }
                        bot.sendMessage(msg3.chat.id, "Vui lòng nhập số lượng share bạn muốn thực hiện.");
                        bot.once('message', async (msg4) => {
                            const totalShare = parseInt(msg4.text.trim());
                            if (totalShare < 1 || isNaN(totalShare)) {
                                bot.sendMessage(msg4.chat.id, "Giá trị không hợp lệ: Số lượng share phải lớn hơn 0.");
                                return;
                            }
                            bot.sendMessage(msg4.chat.id, "Bắt đầu share...");
                            startShare(msg4.chat.id, bot, 'temp_cookies.txt', idShare, delayTime, totalShare)
                        })
                    });
                });


            } catch (error) {
                bot.sendMessage(msg1.chat.id, `Có lỗi xảy ra khi xử lý file: ${error.message}`);
            }
            bot.removeAllListeners('message')
        }

    });
});


// --- MAIN FUNCTION ---
console.log('Bot is running...');