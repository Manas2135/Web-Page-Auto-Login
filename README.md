# WiFi Auto-Login

A small Node.js script that detects when your internet connection drops behind a captive portal (the kind of login page colleges, hostels, airports, and cafes use) and automatically logs you back in so you don't have to keep re-entering credentials every time your session times out.

Originally built for a college WiFi portal, but the login logic works for **any** username/password captive portal with minor edits (see [Adapting to a different portal](#adapting-to-a-different-portal) below).

> ⚠️ **Security note:** This script stores your username and password as plain text in `index.js`. If you fork or clone this repo, **do not commit your real credentials**. Either keep your edited `index.js` out of git (add it to `.gitignore`) or move the values into a `.env` file. If you're reading this because you found your own credentials already committed in this repo's history rotate that password now; deleting the file in a later commit does not remove it from git history.

## How it works

- Polls a set of connectivity-check URLs every few seconds to detect when you've been logged out.
- On disconnect, re-submits the login form automatically, retrying with backoff if it fails.
- Pre-emptively refreshes the session before it's expected to expire.
- Sends periodic keep-alive pings while connected.
- Logs everything to `wifi-auto-login.log` so you can see what happened if it misbehaves.

## Requirements

- [Node.js](https://nodejs.org) (LTS version) installed and available on your PATH.
- Windows, if you want to use the included `.bat` launcher. On macOS/Linux, just run the script directly with `node` (see below).

## Setup

1. **Download or clone this repo** to a folder of your choice.
2. **Open `index.js`** and find the `CREDENTIALS & CONFIG` section near the top:
   ```js
   const USERNAME = "your_username";
   const PASSWORD = "your_password";
   const LOGIN_URL = "http://your.portal.ip/login.html";
   ```
   Replace these with your own portal's login URL and your own credentials.
3. **Install dependencies** open a terminal in the project folder and run:
   ```
   npm install
   ```
4. **(Windows only) Edit `wifi-auto-login.bat`** - change this line to match the folder you actually saved the project in:
   ```bat
   cd /d "C:\path\to\your\folder"
   ```
5. **Run it:**
   - Windows: double-click `wifi-auto-login.bat`.
   - macOS/Linux/manual run: `node index.js`
6. Leave the terminal/console window open - closing it stops the script. It auto-restarts itself if it crashes.

## Adapting to a different portal

The connectivity-checking, retry, and keep-alive logic works for any captive portal unchanged. The part that's specific to _your_ portal is the login form itself. To adapt it:

1. Open your portal's login page in a browser, open **DevTools → Network tab**, and log in manually once while watching the network requests.
2. Find the request that fires when you click "Login" (usually a `POST` to the same page or a nearby endpoint). Click it and look at its **form data / payload**.
3. Note every field name and value it sends field names vary a lot by portal vendor (e.g. some send `username`/`password`, others use different names entirely, and some include extra fields like `mode`, `producttype`, or a session token).
4. In `index.js`, update the `payload` object inside `tryLogin()` to match those exact field names.
5. If your portal includes a hidden token or CSRF field that changes on every page load, the script already scrapes `<input type="hidden">` fields from the login page automatically and merges them into the payload so in many cases you won't need to hardcode those.
6. If your portal's connectivity-check behavior differs (e.g. it doesn't respond to a `204` at `generate_204`-style URLs), you can add or swap probe URLs in the `PROBE_URLS` list.

If you get stuck, check `wifi-auto-login.log` after a failed attempt it records the portal's actual HTTP response status, which usually tells you whether the payload or the URL is wrong.

## Configuration reference

| Variable                  | What it controls                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `USERNAME` / `PASSWORD`   | Your portal login credentials                                                                                  |
| `LOGIN_URL`               | Your portal's login page URL                                                                                   |
| `FAST_POLL` / `SLOW_POLL` | How often it checks connectivity when offline vs. online                                                       |
| `KEEP_ALIVE_MS`           | How often it pings while connected, to prevent idle timeout                                                    |
| `PRE_REFRESH_MS`          | How long before expected session expiry it proactively re-logs in adjust to match your portal's actual timeout |
| `MAX_RETRIES`             | Login attempts per burst before giving up and backing off                                                      |
| `PROBE_URLS`              | URLs used to detect whether you're actually online                                                             |

## Disclaimer

Use this only on networks and accounts you're authorized to access. This is a personal automation tool, not a general-purpose exploitation script it logs in exactly the way your browser would, just without you clicking the button.
