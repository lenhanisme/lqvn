const admin = require("firebase-admin");

// Khởi tạo Firebase Admin (Chỉ khởi tạo 1 lần để tránh lỗi rò rỉ bộ nhớ)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // Xử lý lỗi xuống dòng của Private Key trên Vercel
            privateKey: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
        }),
        databaseURL: "https://lqvn-772cf-default-rtdb.asia-southeast1.firebasedatabase.app" //[cite: 1]
    });
}

const db = admin.database();

// Dùng module.exports thay vì export default để tương thích 100% với Vercel Node.js
module.exports = async function handler(req, res) {
    // 1. Kiểm tra nếu là GET request (Dùng để test API trên trình duyệt)
    if (req.method === 'GET') {
        return res.status(200).send('Webhook Telegram LQVN đang chạy NGON LÀNH!');
    }

    // 2. Xử lý POST request từ Telegram gửi về
    if (req.method === 'POST') {
        const body = req.body;

        if (body.callback_query) {
            const callback = body.callback_query;
            const data = callback.data; 
            const chatId = callback.message.chat.id;
            const messageId = callback.message.message_id;
            const botToken = process.env.TELEGRAM_BOT_TOKEN;

            const parts = data.split('_');
            const action = parts[0]; 
            const uid = parts[1];
            const reqId = parts[2];
            const menhGia = parseInt(parts[3] || 0);

            try {
                let status = "";
                let replyText = "";

                if (action === "D") {
                    status = "Thành công";
                    replyText = "✅ ĐÃ DUYỆT VÀ CỘNG TIỀN CHO KHÁCH!";
                    
                    const userRef = db.ref(`users/${uid}`);
                    await userRef.update({
                        balance: admin.database.ServerValue.increment(menhGia),
                        totalNap: admin.database.ServerValue.increment(menhGia)
                    });
                } else if (action === "T") {
                    status = "Thẻ sai";
                    replyText = "❌ ĐÃ TỪ CHỐI THẺ (THẺ SAI/LỖI)";
                }

                await db.ref(`napthe_requests/${uid}/${reqId}`).update({ status: status });

                // Trả lời Telegram để TẮT HIỆU ỨNG XOAY của nút
                await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callback.id, text: `Đã xử lý: ${status}` })
                });

                // Cập nhật lại tin nhắn để xóa nút bấm
                await fetch(`https://api.telegram.org/bot${botToken}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text: callback.message.text + `\n\n----------------\n${replyText}`
                    })
                });

                return res.status(200).json({ success: true });
            } catch (error) {
                console.error("Firebase Error:", error);
                // Báo lỗi cho Telegram để nó tắt vòng xoay
                await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ callback_query_id: callback.id, text: `Lỗi: Không thể kết nối Firebase!`, show_alert: true })
                });
                return res.status(500).json({ error: "Lỗi Server Firebase" });
            }
        }
        return res.status(200).send('OK');
    }
};
