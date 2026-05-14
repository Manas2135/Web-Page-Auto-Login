const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

// ============================================================
//  CREDENTIALS & CONFIGURATION - Update these for your portal
// ============================================================
const USERNAME = "student1";
const PASSWORD = "student@123";
// Ensure this URL matches your portal (check if it should be https)
const LOGIN_URL = "http://1.1.1.1/login.html";
const BASE_URL = "http://google.com";

// ============================================================
//                       TIMING KNOBS 
// ============================================================
const FAST_POLL = 1000;   // 1s - frequency when offline[cite: 1]
const SLOW_POLL = 5000;   // 5s - frequency when stable[cite: 1]
const KEEP_ALIVE_MS = 30000;  // 30s - prevents idle logout without spamming[cite: 1]
const PRE_REFRESH_MS = 8 * 60 * 1000; // 8 min refresh[cite: 1]
const MAX_RETRIES = 5;


const jar = new CookieJar();
const client = wrapper(axios.create({
    timeout: 10000,
    jar,
    withCredentials: true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Connection': 'keep-alive',
    }
}));

let lastKeepAlive = 0;
let lastLogin = 0;
let currentSpeed = SLOW_POLL;
let interval;
let consecutiveFails = 0;

const ts = () => new Date().toLocaleTimeString();
const sleep = ms => new Promise(r => setTimeout(r, ms));


const isOnline = async () => {
    try {
        const res = await client.get("http://clients3.google.com/generate_204", { timeout: 3000 });
        return res.status === 204;
    } catch {
        return false;
    }
};

const tryLogin = async () => {
    const payload = new URLSearchParams({
        mode: "191",
        username: USERNAME,
        password: PASSWORD,
        producttype: "0",
        a: Date.now().toString()
    });

    try {
        await client.get(LOGIN_URL).catch(() => { });
        const res = await client.post(LOGIN_URL, payload, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': LOGIN_URL,
                'Origin': new URL(LOGIN_URL).origin,
            }
        });

        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);

        // 3. Check for typical success markers[cite: 1]
        const success = res.status < 400 &&
            (body.includes('Successful') || body.includes('Authentication') || !body.includes('failed'));

        return success;
    } catch (e) {
        return false;
    }
};

const loginBurst = async (reason = "OFFLINE") => {
    console.log(`[${ts()}] LOGIN ATTEMPT — reason: ${reason}`);
    for (let i = 1; i <= MAX_RETRIES; i++) {
        if (await tryLogin()) {
            await sleep(500);
            if (await isOnline()) {
                console.log(`[${ts()}] ✅ Connected! Online session established.`);
                lastLogin = Date.now();
                consecutiveFails = 0;
                return true;
            }
        }
        await sleep(2000);
    }
    consecutiveFails++;
    if (consecutiveFails >= 3) {
        await jar.removeAllCookies();
    }
    return false;
};

const setSpeed = (ms) => {
    if (currentSpeed === ms) return;
    currentSpeed = ms;
    clearInterval(interval);
    interval = setInterval(loop, currentSpeed);
};

const loop = async () => {
    const now = Date.now();
    const online = await isOnline();

    if (online) {
        if (now - lastKeepAlive > KEEP_ALIVE_MS) {
            lastKeepAlive = now;
            await client.get("http://clients3.google.com/generate_204").catch(() => { });
            console.log(`[${ts()}]  Keep-alive sent`);
        }
        if (lastLogin && (now - lastLogin > PRE_REFRESH_MS)) {
            await loginBurst("PRE-REFRESH");
        }
        setSpeed(SLOW_POLL);
    } else {
        console.log(`[${ts()}]  Disconnected — Attempting re-login...`);
        setSpeed(FAST_POLL);
        await loginBurst("DISCONNECTED");
    }
};

// Startup
(async () => {
    console.log(" Web-Page Auto Login v2.5 STARTING...");
    await loginBurst("STARTUP");
    interval = setInterval(loop, currentSpeed);
})();