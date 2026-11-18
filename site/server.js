const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(ROOT, "chat-history");
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon", ".gpx": "application/gpx+xml"
};

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, "utf8").split(/\r?\n/).forEach(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  });
}
loadEnv();

function send(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Слишком большой запрос"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); } catch (_) { reject(new Error("Некорректный JSON")); }
    });
    req.on("error", reject);
  });
}
function safeSession(id) {
  return typeof id === "string" && /^[a-zA-Z0-9-]{8,80}$/.test(id) ? id : null;
}
function historyPath(id) {
  return path.join(DATA_DIR, id + ".json");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/api/history") {
    try {
      const body = await readBody(req);
      const id = safeSession(body.sessionId);
      if (!id) return send(res, 400, { error: "Некорректный идентификатор сессии." });
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const messages = Array.isArray(body.messages) ? body.messages : [];
      fs.writeFileSync(historyPath(id), JSON.stringify({ updatedAt: new Date().toISOString(), messages }, null, 2), "utf8");
      return send(res, 200, { saved: true });
    } catch (error) {
      return send(res, 400, { error: error.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const body = await readBody(req);
      if (!process.env.OPENROUTER_API_KEY) {
        return send(res, 500, { error: "Не найден OPENROUTER_API_KEY. Создай файл .env рядом с server.js и добавь туда ключ OpenRouter." });
      }
      const id = safeSession(body.sessionId);
      if (!id) return send(res, 400, { error: "Некорректный идентификатор сессии." });

      const messages = Array.isArray(body.messages) ? body.messages : [];
      const routes = Array.isArray(body.routes) ? body.routes : [];
      const system = [
        "Ты — дружелюбный, грамотный ИИ-консультант сайта «Тропы России». Всегда отвечай на русском языке.",
        "Твоя главная задача — подбирать конкретные пешие маршруты из переданного каталога под запрос человека.",
        "Сначала изучи каталог. Для новичков в первую очередь рассматривай маршруты с лёгкой сложностью и небольшой дистанцией. Учитывай регион, расстояние, длительность, сезон, тип похода и пожелания пользователя, если эти поля присутствуют.",
        "Если пользователь пишет, что он новичок, не выдавай длинную анкету. Кратко объясни, какие маршруты обычно подходят, затем предложи до 3 подходящих маршрутов из каталога с названием, регионом, сложностью, расстоянием и длительностью — только если эти сведения есть в данных.",
        "Если данных о предпочтениях не хватает, задай один-два самых важных уточняющих вопроса, но сначала используй уже известные сведения из истории диалога.",
        "Никогда не говори, что каталог пуст, если в переданном JSON есть маршруты. Не придумывай маршруты, расстояния, время, цены, пропуска, режим работы, координаты и условия.",
        "Если подходящих маршрутов в каталоге нет, честно скажи об этом и предложи уточнить регион или увеличить допустимую дистанцию.",
        "Не утверждай, что информация о погоде, безопасности и состоянии тропы актуальна в реальном времени.",
        "Оформляй ответы красиво и компактно: короткие заголовки, списки, выделяй названия маршрутов и ключевые параметры. Не используй огромные таблицы и не повторяй приветствие в каждом сообщении.",
        "Если пользователь уже сообщил опыт, сезон, длительность или регион, не спрашивай это повторно.",
        "Каталог маршрутов (JSON):",
        JSON.stringify(routes).slice(0, 45000)
      ].join("\n\n");

      const recent = messages.filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string").slice(-30);
      const apiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY,
          "Content-Type": "application/json",
          "HTTP-Referer": "http://localhost:3000",
          "X-Title": "Tropy Rossii"
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free",
          messages: [{ role: "system", content: system }, ...recent],
          temperature: 0.6,
          max_tokens: 3000
        })
      });

      const result = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) {
        const detail = result.error && result.error.message ? result.error.message : "OpenRouter API вернул ошибку.";
        console.error("OpenRouter API:", apiResponse.status, detail);
        return send(res, apiResponse.status, { error: "Ошибка OpenRouter API (" + apiResponse.status + "): " + detail });
      }
      const choice = result.choices && result.choices[0];
      const answer = choice && choice.message && choice.message.content;
      if (!answer) return send(res, 502, { error: "Модель не вернула текст ответа. Проверь журнал сервера." });
      if (choice.finish_reason === "length") {
        console.warn("OpenRouter: ответ достиг лимита токенов; max_tokens=3000.");
      }

      const fullHistory = [...recent, { role: "assistant", content: answer }];
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(historyPath(id), JSON.stringify({ updatedAt: new Date().toISOString(), messages: fullHistory }, null, 2), "utf8");
      return send(res, 200, { answer });
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: "Ошибка локального сервера: " + error.message });
    }
  }

  // Статические файлы сайта
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, "." + pathname);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    res.writeHead(403); return res.end("Forbidden");
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Файл не найден");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log("Сайт запущен: http://localhost:" + PORT);
  console.log("История чата сохраняется в папке chat-history.");
});
