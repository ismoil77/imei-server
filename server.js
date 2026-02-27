const PORT = process.env.PORT || 3001;

const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const sessions = {};

app.get("/", (req, res) => res.send("OK"));

app.get("/api/captcha", async (req, res) => {
    try {
        const sessionId = uuidv4();
        const jar = new tough.CookieJar();
        const client = wrapper(axios.create({
            jar,
            responseType: "arraybuffer",
            headers: { "User-Agent": "Mozilla/5.0" }
        }));

        const captchaResp = await client.get("https://www.imei.tj/Captcha/session.php");
        sessions[sessionId] = { jar };

        res.json({
            sessionId,
            image: Buffer.from(captchaResp.data).toString("base64")
        });
    } catch (err) {
        res.status(500).send("Ошибка");
    }
});

app.get("/api/getPrice", async (req, res) => {
    try {
        const { imei1, lang } = req.query;
        const response = await axios.get("https://www.imei.tj/price/getPrice.php", {
            params: { imei1, lang },
            headers: {
                "User-Agent": "Mozilla/5.0",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": "https://www.imei.tj/price/checkform.php"
            }
        });
        res.send(response.data);
    } catch (err) {
        res.status(500).send("Ошибка");
    }
});

app.post("/api/model", async (req, res) => {
    try {
        const { model, phrase, sessionId } = req.body;
        if (!sessions[sessionId]) return res.status(400).send("Сессия не найдена");

        const jar = sessions[sessionId].jar;
        const client = wrapper(axios.create({ jar }));

        const response = await client.post(
            "https://www.imei.tj/price/getPrice_model.php",
            new URLSearchParams({ imei_model: model, lang: "rus", phrase }),
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
        res.status(500).send("Ошибка");
    }
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));