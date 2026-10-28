// api/send.js — серверная функция Vercel (CommonJS, без package.json).
// Рассылает заявку сразу по всем настроенным каналам: Telegram, ВКонтакте, СМС (sms.ru).
// Достаточно, чтобы сработал хотя бы один. Каналы включаются переменными окружения в Vercel:
//   Telegram:    BOT_TOKEN, CHAT_ID
//   ВКонтакте:   VK_TOKEN (ключ доступа сообщества с правом «сообщения»), VK_USER_ID (ваш id, можно несколько через запятую)
//   СМС:         SMSRU_API_ID, SMS_TO (ваш номер, например 79121234567)

const esc = (v) =>
  String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function post(url, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

const tg = (token, method, payload) =>
  post(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

async function sendTelegram({ name, phone, msg }) {
  const text =
    `🌨 <b>Новая заявка с сайта Снегу-Нет43</b>\n\n` +
    `👤 <b>Имя:</b> ${esc(name) || "не указано"}\n` +
    `📞 <b>Телефон:</b> ${esc(phone)}\n` +
    `💬 <b>Комментарий:</b> ${esc(msg) || "без комментария"}`;
  const d = await tg(process.env.BOT_TOKEN, "sendMessage", {
    chat_id: process.env.CHAT_ID,
    text,
    parse_mode: "HTML",
  });
  if (!d.ok) throw new Error(d.description);
}

async function sendVk({ name, phone, msg }) {
  const body = new URLSearchParams({
    user_ids: process.env.VK_USER_ID,
    random_id: String(Date.now() % 2147483647),
    message: `Новая заявка с сайта Снегу-Нет43\nИмя: ${name || "не указано"}\nТелефон: ${phone}\nКомментарий: ${msg || "без комментария"}`,
    access_token: process.env.VK_TOKEN,
    v: "5.199",
  });
  const d = await post("https://api.vk.com/method/messages.send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (d.error) throw new Error(d.error.error_msg);
  // при рассылке на несколько id ошибка может прийти по одному получателю
  if (Array.isArray(d.response) && d.response.every((x) => x.error)) {
    throw new Error(d.response[0].error.description || "VK: не доставлено");
  }
}

async function sendSms({ name, phone, msg }) {
  const text = `Снегу-Нет43: ${name || "-"} ${phone}. ${msg}`.slice(0, 140);
  const body = new URLSearchParams({
    api_id: process.env.SMSRU_API_ID,
    to: process.env.SMS_TO,
    msg: text,
    json: "1",
  });
  const d = await post("https://sms.ru/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (d.status !== "OK") throw new Error(`sms.ru код ${d.status_code}`);
}

function channels() {
  const e = process.env;
  return {
    telegram: !!(e.BOT_TOKEN && e.CHAT_ID),
    vk: !!(e.VK_TOKEN && e.VK_USER_ID),
    sms: !!(e.SMSRU_API_ID && e.SMS_TO),
  };
}

module.exports = async function handler(req, res) {
  const ch = channels();

  // Диагностика: откройте https://ВАШ-САЙТ/api/send в браузере
  if (req.method === "GET") {
    const out = { function: "работает", channels: ch };
    if (ch.telegram) {
      try {
        const me = await tg(process.env.BOT_TOKEN, "getMe", {});
        out.telegram = me.ok ? "бот @" + me.result.username : "ОШИБКА токена: " + me.description;
        if (me.ok) {
          const c = await tg(process.env.BOT_TOKEN, "getChat", { chat_id: process.env.CHAT_ID });
          out.telegram_chat = c.ok ? "доступен" : "ОШИБКА чата: " + c.description;
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

    const lead = {
      name: String(name).slice(0, 100),
      phone: String(phone).slice(0, 30),
      msg: String(msg).slice(0, 1000),
    };

    const jobs = [];
    if (ch.telegram) jobs.push(["Telegram", sendTelegram(lead)]);
    if (ch.vk) jobs.push(["ВКонтакте", sendVk(lead)]);
    if (ch.sms) jobs.push(["СМС", sendSms(lead)]);

    if (!jobs.length) {
      console.error("Не настроен ни один канал: задайте переменные в Vercel → Settings → Environment Variables → Redeploy");
      return res.status(500).json({ error: "на сервере не настроен ни один канал отправки" });
    }

    const results = await Promise.allSettled(jobs.map((j) => j[1]));
    const failed = [];
    let ok = 0;
    results.forEach((r, i) => {
      if (r.status === "fulfilled") ok++;
      else failed.push(`${jobs[i][0]}: ${r.reason && r.reason.message}`);
    });
    if (failed.length) console.error("Каналы с ошибкой:", failed.join(" | "));

    if (!ok) return res.status(502).json({ error: failed.join(" | ") });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "ошибка сервера: " + err.message });
  }
};
