// api/send.js — серверная функция Vercel (CommonJS, работает без package.json).
// Запрос к Telegram делает сервер, браузер клиента с Telegram не общается.
const esc = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function tg(token, method, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.CHAT_ID;

  // Диагностика: откройте https://ВАШ-САЙТ/api/send в браузере — увидите, что не так
  if (req.method === "GET") {
    const out = { function: "работает", BOT_TOKEN: !!token, CHAT_ID: !!chatId };
    if (token) {
      try {
        const me = await tg(token, "getMe", {});
        out.bot = me.ok
          ? "@" + me.result.username
          : "ОШИБКА токена: " + me.description;
        if (me.ok && chatId) {
          const chat = await tg(token, "getChat", { chat_id: chatId });
          out.chat = chat.ok ? "доступен" : "ОШИБКА чата: " + chat.description;
        }
      } catch (e) {
        out.telegram = "сервер не достучался до Telegram: " + e.message;
      }
    }
    return res.status(200).json(out);
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "метод не разрешён" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const { name = "", phone = "", msg = "", website = "" } = body || {};

    if (website) return res.status(200).json({ success: true }); // ловушка для ботов

    if (String(phone).replace(/\D/g, "").length < 10) {
      return res.status(400).json({ error: "некорректный телефон" });
    }
    if (!token || !chatId) {
      console.error(
        "Нет BOT_TOKEN / CHAT_ID: Vercel → Settings → Environment Variables → Redeploy",
      );
      return res
        .status(500)
        .json({ error: "на сервере не заданы BOT_TOKEN или CHAT_ID" });
    }

    const text =
      `🌨 <b>Новая заявка с сайта Снегу-Нет43</b>\n\n` +
      `👤 <b>Имя:</b> ${esc(String(name).slice(0, 100)) || "не указано"}\n` +
      `📞 <b>Телефон:</b> ${esc(String(phone).slice(0, 30))}\n` +
      `💬 <b>Комментарий:</b> ${esc(String(msg).slice(0, 1000)) || "без комментария"}`;

    const data = await tg(token, "sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
    });
    if (!data.ok) {
      console.error("Telegram API error:", data);
      return res.status(502).json({ error: "Telegram: " + data.description });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "ошибка сервера: " + err.message });
  }
};
