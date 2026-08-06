const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

// ============================================================
//  CREDENTIALS & CONFIG — You can edit these!
// ============================================================
const USERNAME = "student1";
const PASSWORD = "student@123";
const LOGIN_URL = "http://192.168.200.1:8090/httpclient.html";

// ============================================================
//                       TIMING KNOBS
// ============================================================
const FAST_POLL = 2000; // 2s  — poll interval when offline
const SLOW_POLL = 10000; // 10s — poll interval when stable
const KEEP_ALIVE_MS = 30000; // 30s — keep-alive ping interval
const PRE_REFRESH_MS = 8 * 60 * 1000; // 8min — re-login before session expires (was mismatched with the 3min value before)
const MAX_RETRIES = 5; // attempts per login burst
const BACKOFF_BASE_MS = 2000; // base delay between retries within a burst
const BACKOFF_CAP_MS = 60 * 1000; // cap on inter-burst backoff during sustained outages

const PROBE_URLS = [
  "http://clients3.google.com/generate_204",
  "http://connectivitycheck.gstatic.com/generate_204",
  "http://detectportal.firefox.com/success.txt",
];

const LOG_FILE = path.join(__dirname, "wifi-auto-login.log");

// ============================================================
//                        HTTP CLIENT
// ============================================================
const jar = new CookieJar();
const client = wrapper(
  axios.create({
    timeout: 10000,
    jar,
    withCredentials: true,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      Connection: "keep-alive",
    },
  }),
);

let lastKeepAlive = 0;
let lastLogin = 0;
let consecutiveFails = 0;
let pollSpeed = SLOW_POLL;
let isLoggingIn = false;

const ts = () => new Date().toLocaleTimeString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const log = (msg) => {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line.replace(/\x1b\[[0-9;]*m/g, "") + "\n");
  } catch {
    /* logging failures shouldn't crash the script */
  }
};

const isOnline = async () => {
  for (const url of PROBE_URLS) {
    try {
      const resp = await client.get(url, {
        timeout: 4000,
        maxRedirects: 0,
        validateStatus: () => true,
      });
      if (resp.status === 204) return true;
      if (
        resp.status === 200 &&
        typeof resp.data === "string" &&
        resp.data.trim().toLowerCase() === "success"
      )
        return true;
    } catch {}
  }
  return false;
};

const scrapeHiddenFields = async () => {
  try {
    const res = await client.get(LOGIN_URL, { timeout: 8000 });
    const $ = cheerio.load(res.data);
    const fields = {};
    $("input[type=hidden]").each((_, el) => {
      const name = $(el).attr("name");
      const value = $(el).attr("value") || "";
      if (name) fields[name] = value;
    });
    return fields;
  } catch {
    return {};
  }
};

const tryLogin = async () => {
  try {
    const hiddenFields = await scrapeHiddenFields();

    const payload = new URLSearchParams({
      mode: "191",
      username: USERNAME,
      password: PASSWORD,
      producttype: "0",
      ...hiddenFields,
      a: Date.now().toString(), // Cache-buster
    });

    const resp = await client.post(LOGIN_URL, payload, {
      timeout: 10000,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Referer: LOGIN_URL,
        Origin: new URL(LOGIN_URL).origin,
      },
      validateStatus: () => true,
    });

    if (resp.status >= 400) {
      log(`   ⚠ Portal responded ${resp.status} on login POST`);
    }

    return true;
  } catch (err) {
    log(`   ⚠ Login POST error: ${err.message}`);
    return false;
  }
};

const loginBurst = async (reason = "OFFLINE") => {
  if (isLoggingIn) return false;
  isLoggingIn = true;

  if (reason === "DISCONNECTED" || reason === "STARTUP") {
    await jar.removeAllCookies();
  }

  log(`\n⚡ LOGIN ATTEMPT — reason: ${reason}`);

  for (let i = 1; i <= MAX_RETRIES; i++) {
    log(`   → Try ${i}/${MAX_RETRIES}...`);

    const sent = await tryLogin();
    if (sent) {
      await sleep(1500); // Give portal a moment to process
      if (await isOnline()) {
        log(`✅ Connected! Session is live.`);
        lastLogin = Date.now();
        lastKeepAlive = Date.now();
        consecutiveFails = 0;
        isLoggingIn = false;
        return true;
      }
    }

    if (i < MAX_RETRIES) await sleep(BACKOFF_BASE_MS);
  }

  consecutiveFails += 1;
  log(
    `❌ All ${MAX_RETRIES} tries failed. (${consecutiveFails} burst(s) failed in a row)`,
  );

  await jar.removeAllCookies();
  isLoggingIn = false;
  return false;
};

const loop = async () => {
  const now = Date.now();
  const online = await isOnline();

  if (online) {
    pollSpeed = SLOW_POLL;

    if (now - lastKeepAlive > KEEP_ALIVE_MS) {
      lastKeepAlive = now;
      await client.get(PROBE_URLS[0], { timeout: 4000 }).catch(() => {});
      log(`💓 Keep-alive`);
    }

    if (lastLogin && now - lastLogin > PRE_REFRESH_MS) {
      log(`🔁 Pre-emptive session refresh...`);
      lastLogin = now;
      await loginBurst("PRE-REFRESH");
    }
  } else {
    pollSpeed =
      consecutiveFails > 0
        ? Math.min(
            FAST_POLL * Math.pow(2, consecutiveFails - 1),
            BACKOFF_CAP_MS,
          )
        : FAST_POLL;

    log(
      `🔴 Offline — re-logging in... (next poll in ${pollSpeed / 1000}s if this fails)`,
    );
    await loginBurst("DISCONNECTED");
  }
};

process.on("SIGINT", () => {
  log("👋 Shutting down (Ctrl+C).");
  process.exit(0);
});

(async () => {
  log("║           WIFI-Auto Login-Active  v3.1              ║");
  log(`  Portal  : ${LOGIN_URL}`);
  log(`  User    : ${USERNAME}`);
  log(
    `  Polling : ${SLOW_POLL / 1000}s (online) / ${FAST_POLL / 1000}s (offline, backs off up to ${BACKOFF_CAP_MS / 1000}s)`,
  );
  log(`  Refresh : every ${PRE_REFRESH_MS / 60000} min\n`);

  await loginBurst("STARTUP");

  while (true) {
    await loop();
    await sleep(pollSpeed);
  }
})();
