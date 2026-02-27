const PORT = process.env.PORT || 3001;

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const { v4: uuidv4 } = require("uuid");
const Tesseract = require("tesseract.js");
const Jimp = require("jimp");
const path = require("path");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(__dirname));

const sessions = {};


// ---------- Обработка картинки для лучшего OCR ----------
async function preprocessCaptcha(imageBuffer) {
    try {
        const image = await Jimp.read(imageBuffer);

        image
            .greyscale()          // чёрно-белое
            .contrast(1)          // максимальный контраст
            .normalize()          // нормализация яркости
            .scale(3);            // увеличиваем x3 для лучшего OCR

        return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (err) {
        console.log("Jimp error:", err.message);
        return imageBuffer; // если ошибка — возвращаем оригинал
    }
}

// ---------- Получение капчи ----------
app.get("/api/captcha", async (req, res) => {
    try {
        const sessionId = uuidv4();
        const jar = new tough.CookieJar();

        const client = wrapper(axios.create({
            jar,
            responseType: "arraybuffer",
            headers: { "User-Agent": "Mozilla/5.0" }
        }));

        const captchaResp = await client.get(
            "https://www.imei.tj/Captcha/session.php"
        );

        sessions[sessionId] = { jar };

        const imageBuffer = Buffer.from(captchaResp.data);
        const imageBase64 = imageBuffer.toString("base64");

        // Предобработка и OCR
        const processedBuffer = await preprocessCaptcha(imageBuffer);

        const { data: { text } } = await Tesseract.recognize(
            processedBuffer,
            "eng",
            {
                tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
                tessedit_pageseg_mode: "8",   // режим одного слова
                tessedit_ocr_engine_mode: "1" // нейросетевой движок
            }
        );

        const solvedPhrase = text.trim().replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "");
        console.log("Капча решена:", solvedPhrase);

        res.json({
            sessionId,
            image: imageBase64,
            solvedPhrase: solvedPhrase || null
        });

    } catch (err) {
        console.log("Captcha error:", err.message);
        res.status(500).send("Ошибка получения капчи");
    }
});

// ---------- Получение цены по IMEI ----------
app.get("/api/getPrice", async (req, res) => {
    try {
        const { imei1, lang } = req.query;

        const response = await axios.get(
            "https://www.imei.tj/price/getPrice.php",
            {
                params: { imei1, lang },
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": "https://www.imei.tj/price/checkform.php"
                }
            }
        );

        res.send(response.data);

    } catch (err) {
        console.log("getPrice error:", err.message);
        res.status(500).send("Ошибка получения цены");
    }
});

// ---------- Проверка модели ----------
app.post("/api/model", async (req, res) => {
    try {
        const { model, phrase, sessionId } = req.body;

        if (!sessions[sessionId]) {
            return res.status(400).send("Сессия не найдена");
        }

        const jar = sessions[sessionId].jar;
        const client = wrapper(axios.create({ jar }));

        const response = await client.post(
            "https://www.imei.tj/price/getPrice_model.php",
            new URLSearchParams({
                imei_model: model,
                lang: "rus",
                phrase: phrase
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": "https://www.imei.tj/price/checkform.php",
                    "Origin": "https://www.imei.tj"
                }
            }
        );

        res.send(response.data);

    } catch (err) {
        console.log("Model error:", err.response?.data || err.message);
        res.status(500).send("Ошибка проверки модели");
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
});