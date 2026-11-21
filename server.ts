import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { handleApi, type ApiRequest } from "./server/api.ts";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb", verify(req, _res, buf) { if (req.url?.startsWith("/api/whatsapp/webhook")) (req as any).rawBody = buf.toString("utf8"); } }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Route all /api requests to handleApi
app.use("/api", async (req, res) => {
  const url = new URL(req.originalUrl || req.url, `http://${req.headers.host || "localhost"}`);
  const pathPart = url.pathname.replace(/^\/api\/?/, "");

  const cookies: Record<string, string> = {};
  const cookieHeader = req.headers.cookie || "";
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name) cookies[name] = decodeURIComponent(value.join("="));
  }

  const apiRequest: ApiRequest = {
    method: req.method,
    path: pathPart,
    query: Object.fromEntries(url.searchParams.entries()),
    body: req.body,
    rawBody: (req as any).rawBody,
    cookies,
    headers: req.headers,
  };

  try {
    const result = await handleApi(apiRequest);

    if (result.cookie) {
      res.cookie(result.cookie.name, result.cookie.value, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: result.cookie.maxAge * 1000,
      });
    }
    if (result.clearCookie) {
      res.clearCookie(result.clearCookie, { path: "/" });
    }

    if (result.headers) {
      for (const [k, v] of Object.entries(result.headers)) {
        res.setHeader(k, v);
      }
    }

    res.status(result.status);
    if (result.body === null) {
      res.end();
    } else {
      res.json(result.body);
    }
  } catch (error: any) {
    console.error("API error:", error);
    const unavailable = error?.name === "DatabaseUnavailableError";
    res.status(unavailable ? 503 : 500).json({
      error: error?.message || "Unexpected server error.",
      database: unavailable ? false : undefined,
    });
  }
});

async function startServer() {
  // Bind port 3000 immediately so the platform health check succeeds without waiting for Vite compilation
  let viteMiddleware: any = null;
  let viteReadyPromise: Promise<void> | null = null;

  if (process.env.NODE_ENV !== "production") {
    viteReadyPromise = createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    }).then((vite) => {
      viteMiddleware = vite.middlewares;
    });

    app.use(async (req, res, next) => {
      if (!viteMiddleware && viteReadyPromise) {
        await viteReadyPromise;
      }
      if (viteMiddleware) {
        return viteMiddleware(req, res, next);
      }
      next();
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`EritreaVisit Operations Suite running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
