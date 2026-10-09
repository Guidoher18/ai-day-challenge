import "dotenv/config";
import express from "express";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
