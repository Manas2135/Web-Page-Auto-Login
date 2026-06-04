const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

// ============================================================
//       CREDENTIALS & CONFIG — Edit these!
// ============================================================
const USERNAME = "student1";
const PASSWORD = "student@123";
const LOGIN_URL = "http://1.1.1.1/login.html";

const FAST_POLL = 2000;           // 2s  — poll interval when offline
const SLOW_POLL = 10000;          // 10s — poll interval when stable
const KEEP_ALIVE_MS = 30000;          // 30s — keep-alive ping interval
const PRE_REFRESH_MS = 3 * 60 * 1000; // 8min — re-login before session expires
const MAX_RETRIES = 5;              // attempts per login burst

const jar = new CookieJar();
const client = wrapper(axios.create({
    timeout: 10000,
    jar,
    withCredentials: true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Connection': 'keep-alive',
    }
}));

let lastKeepAlive = 0;
let lastLogin = 0;
let consecutiveFails = 0;
let pollSpeed = SLOW_POLL;
let isLoggingIn = false; s

const ts = () => new Date().toLocaleTimeString();
const sleep = ms => new Promise(r => setTimeout(r, ms));


const isOnline = async () => {
    try {
        await client.get("http://clients3.google.com/generate_204", {
            timeout: 4000,
            maxRedirects: 0,
            validateStatus: s => s === 204,
        });
        return true;
    } catch {
        return false;
    }
};


const tryLogin = async () => {
    try {

        await client.get(LOGIN_URL, { timeout: 8000 }).catch(() => { });

        const payload = new URLSearchParams({
            mode: "191",
            username: USERNAME,
            password: PASSWORD,
            producttype: "0",
            a: Date.now().toString(),
        });

        await client.post(LOGIN_URL, payload, {
            timeout: 10000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': LOGIN_URL,
                'Origin': new URL(LOGIN_URL).origin,
            }
        });

        return true;
    } catch {
        return false;
    }
};


const loginBurst = async (reason = "OFFLINE") => {
    if (isLoggingIn) return false;
    isLoggingIn = true;

    if (reason === "DISCONNECTED" || reason === "STARTUP") {
        await jar.removeAllCookies();
    }

    console.log(`\n[${ts()}] ⚡ LOGIN ATTEMPT — reason: ${reason}`);

    for (let i = 1; i <= MAX_RETRIES; i++) {
        console.log(`[${ts()}]   → Try ${i}/${MAX_RETRIES}...`);

        const sent = await tryLogin();
        if (sent) {
            await sleep(1500);
            if (await isOnline()) {
                console.log(`[${ts()}] ✅ Connected! Session is live.`);
                lastLogin = Date.now();
                lastKeepAlive = Date.now();
                consecutiveFails = 0;
                isLoggingIn = false;
                return true;
            }
        }

        if (i < MAX_RETRIES) await sleep(2000);
    }


    console.log(`[${ts()}] ❌ All ${MAX_RETRIES} tries failed. (${consecutiveFails} burst(s) failed in a row)`);


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
            await client.get("http://clients3.google.com/generate_204", { timeout: 4000 }).catch(() => { });
            console.log(`[${ts()}] 💓 Keep-alive`);
        }

        if (lastLogin && (now - lastLogin > PRE_REFRESH_MS)) {
            console.log(`[${ts()}] 🔁 Pre-emptive session refresh...`);
            lastLogin = now;
            await loginBurst("PRE-REFRESH");
        }

    } else {
        pollSpeed = FAST_POLL;
        console.log(`[${ts()}] 🔴 Offline — re-logging in...`);
        await loginBurst("DISCONNECTED");
    }
};

(async () => {

    console.log("║           Web-Page Auto-Login = Active  v3.0              ║");
    console.log(`  Portal  : ${LOGIN_URL}`);
    console.log(`  User    : ${USERNAME}`);
    console.log(`  Polling : ${SLOW_POLL / 1000}s (online) / ${FAST_POLL / 1000}s (offline)`);
    console.log(`  Refresh : every ${PRE_REFRESH_MS / 60000} min\n`);

    await loginBurst("STARTUP");

    while (true) {
        await loop();
        await sleep(pollSpeed);
    }
})();
