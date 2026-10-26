// api/send.js
export default async function handler(req, res) {
  // Разрешаем только POST-запросы и указываем CORS для твоего домена (или '*' для всех)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Метод не разрешен" });
  }

  try {
    const { name, phone, msg } = req.body;

    // Берем токены из переменных окружения (они будут скрыты!)
    const token = process.env.BOT_TOKEN;
    const chatId = process.env.CHAT_ID;

    if (!token || !chatId) {
      return res
        .status(500)
        .json({ error: "Не настроены переменные окружения" });
    }

    const text =
      `🌨 *Новая заявка с сайта Снегу-Нет43*\n\n` +
      `👤 *Имя:* ${name || "Не указано"}\n` +
      `📞 *Телефон:* ${phone}\n` +
      `💬 *Комментарий:* ${msg || "Без комментария"}`;

    // Сервер делает запрос к Telegram (браузер клиента тут не участвует!)
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "Markdown",
        }),
      },
    );

    const data = await response.json();

    if (data.ok) {
      return res.status(200).json({ success: true });
    } else {
      console.error("Telegram API Error:", data);
      return res.status(500).json({ error: "Ошибка Telegram API" });
    }
  } catch (error) {
    console.error("Server Error:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
}
