try {
  require("dotenv").config();
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") {
    console.warn("dotenv failed to load:", error.message || error);
  }
}
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Preference } = require("mercadopago");

const app = express();
app.use(express.json());

const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
if (!accessToken) {
  console.warn("Mercado Pago access token is not set. Set MERCADOPAGO_ACCESS_TOKEN to enable checkout.");
}
const mpClient = new MercadoPagoConfig({ accessToken: accessToken || "" });
const preferenceClient = new Preference(mpClient);

app.get("/", (_req, res) => {
  res.send("🚀 Ciclo Market API is running!");
});

app.post("/api/checkout", async (req, res) => {
  try {
    if (!accessToken) {
      return res.status(500).json({ error: "mercadopago_token_missing" });
    }

    const plan = req.body?.plan || "premium";
    const amount = plan === "premium" ? 13000 : 0;

    const frontendBaseUrl = (process.env.FRONTEND_URL || "").split(",")[0] || "";

    const preferencePayload = {
      items: [
        {
          title: `Plan ${plan}`,
          quantity: 1,
          unit_price: amount,
          currency_id: "ARS",
        },
      ],
      back_urls: frontendBaseUrl
        ? {
            success: `${frontendBaseUrl}/checkout/success`,
            failure: `${frontendBaseUrl}/checkout/failure`,
            pending: `${frontendBaseUrl}/checkout/pending`,
          }
        : undefined,
      auto_return: "approved",
      notification_url: `${process.env.SERVER_BASE_URL}/api/webhooks/mercadopago`,
    };

    const preferenceResponse = await preferenceClient.create({ body: preferencePayload });
    const checkoutUrl =
      preferenceResponse.init_point || preferenceResponse.sandbox_init_point;

    res.json({ url: checkoutUrl });
  } catch (error) {
    console.error("Mercado Pago checkout error:", error?.message || error);
    res.status(500).json({ error: "checkout_failed" });
  }
});

app.post("/api/webhooks/mercadopago", (req, res) => {
  console.log("[Mercado Pago webhook]", JSON.stringify(req.body));
  res.sendStatus(200);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 API listening on port ${PORT}`);
});
