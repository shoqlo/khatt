# Putting Khatt online

Khatt is a set of static files, with no server and no database. Every customer's projects stay on their own phone or computer. That means:

- Hosting can be free: Cloudflare Pages, GitHub Pages and Netlify all work.
- You don't pay per customer, and you don't hold anyone's data.
- After the first visit, the app works offline.

## 1. Publish the website (about 10 minutes, free)

Build the site once (or use the ready-made `khatt-website.zip`):

```bash
npm install
npm run build        # creates the folder dist/
```

### Option A: Cloudflare Pages (recommended)

Cloudflare Pages is free with unlimited traffic, and Cloudflare has servers across the Gulf, Egypt and North Africa, so the app loads quickly there.

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Go to **Workers & Pages → Create → Pages → Upload assets**.
3. Name the project (for example `khatt`). Drag in the contents of the `dist/` folder, or the unzipped `khatt-website.zip`.
4. Click **Deploy**. Your link will look like `https://khatt.pages.dev`.
5. Optional: add your own domain under **Custom domains**.

To update the site later, build again and upload the new `dist/` to the same project.

### Option B: GitHub Pages (updates automatically)

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages → Source: GitHub Actions**.
3. The included workflow (`.github/workflows/pages.yml`) builds and publishes the site every time you push to `main`. Your link will be `https://<your-name>.github.io/<repo>/`.

### Option C: any other web host

Upload the contents of `dist/`. The only requirement is **HTTPS**, because phones only allow "install" and offline mode on secure sites. All the hosts listed above give you HTTPS automatically.

## 2. Connect Pixabay, Unsplash and Pexels (optional, free)

All three services need an API key from **your** accounts. The app is a public website, so keys must not go into it, where anyone could copy them. Instead, one small free "middleman" on Cloudflare holds all three keys in secret, answers only your site, and follows each service's rules.

**Step 1: get the keys you want (any or all)**

| Service | Where | What to copy | Good to know |
|---|---|---|---|
| **Pixabay** (illustrations, vectors, photos) | Log in, then open <https://pixabay.com/api/docs/> | the value next to `key` | Searches are cached for 24 hours (their rule) |
| **Unsplash** (photos) | Log in at <https://unsplash.com/oauth/applications> → **New Application**, accept the API guidelines, name it "Khatt" | the **Access Key** (never the Secret key) | New apps start in "demo" mode with a low hourly limit. Ask for production access from the same page when ready. Unsplash checks that the app credits photographers, uses Unsplash's own photo links and reports when a photo is used, and Khatt does all three. Because of that rule, Unsplash photos need internet to display. |
| **Pexels** (photos) | Log in, then open <https://www.pexels.com/api/> → **Your API Key** | the key | 200 searches an hour and 20,000 a month by default. Pexels gives unlimited use for free if you email api@pexels.com showing your credits. |

**Step 2: the middleman on Cloudflare: the quick way (one button)**

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shoqlo/khatt/tree/main/cloudflare)

1. Tap the button above, or open <https://deploy.workers.cloudflare.com/?url=https://github.com/shoqlo/khatt/tree/main/cloudflare>.
2. Sign up or log in to Cloudflare (free). If it asks, connect your GitHub account; Cloudflare keeps its own copy of the middleman's code there.
3. Paste your Pixabay key into **PIXABAY_KEY**. Your site address is already filled in. Then tap **Create and deploy**.
4. When it finishes, it shows the worker's link (`https://khatt-pixabay.YOURNAME.workers.dev`). Add Unsplash or Pexels keys later under the worker's **Settings → Variables and Secrets**.

**Step 2 (alternative): by hand**
1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. Go to **Workers & Pages → Create → Worker**, name it `khatt-pixabay` (any name works), then click **Deploy**.
3. Click **Edit code**. Replace everything with [`cloudflare/pixabay-worker.js`](https://raw.githubusercontent.com/shoqlo/khatt/main/cloudflare/pixabay-worker.js) and click **Deploy**.
4. Open **Settings → Variables and Secrets** and add only the keys you have:
   - **Secret** `PIXABAY_KEY`
   - **Secret** `UNSPLASH_ACCESS_KEY`
   - **Secret** `PEXELS_API_KEY`
   - **Text** `ALLOWED_ORIGINS` = `https://shoqlo.github.io`

   Then click **Deploy**.
5. Open the worker's link (something like `https://khatt-pixabay.YOURNAME.workers.dev`). It shows which services are switched on, for example `{"ok":true,"services":{"pixabay":true,"unsplash":true,"pexels":false}}`.

**Step 3: switch it on in the app.** Send the worker link (**never the keys**) to whoever maintains the app. Or edit [`public/config.json`](https://github.com/shoqlo/khatt/edit/main/public/config.json) on GitHub yourself:

```json
{ "middleman": "https://khatt-pixabay.YOURNAME.workers.dev" }
```

The app asks the middleman which keys are set and shows those services first in the **Open images** tab. Adding another key later needs no change to the app. The script wizard also uses Pixabay for scenes the built-in drawings can't illustrate. Unsplash and Pexels are photo libraries without drawings, so the app sketches their photos first and then colours them in.

**Good to know**
- **Cost:** nothing. All three APIs are free, and Cloudflare's free plan allows 100,000 requests a day. If that were ever reached, the worker would simply stop for the day; it can't charge you.
- **Who can use it:** browsers on other websites are refused. A determined person could still call the link from a script (no website can fully prevent that), but they never see your keys. The worst case is that a limit gets used up.
- **Each service's rules are followed:**
  - **Pixabay:** results are cached for 24 hours and images are saved on the device instead of hotlinked.
  - **Unsplash:** photos load from Unsplash's own links, each use is reported to Unsplash, and the photographer is credited.
  - **Pexels:** "Photos provided by Pexels" is shown with the results and photographers are credited.

  Credits for Unsplash and Pexels photographers are added automatically to the export screen's "Credits for your video description".

## 3. How customers install it on their phone

Send them the link. The text below can be pasted into WhatsApp:

> **Android (Chrome):** افتح الرابط ← اضغط القائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
> **iPhone (Safari):** افتح الرابط ← اضغط زر المشاركة ⬆︎ ← «إضافة إلى الشاشة الرئيسية».
>
> **Android (Chrome):** open the link → menu ⋮ → "Install app" / "Add to Home screen".
> **iPhone (Safari):** open the link → Share ⬆︎ → "Add to Home Screen".

Once installed, it gets its own icon (خ), opens full screen, and works offline. The app's own menu also has an "Install app" entry.

## 4. App stores: do you need them?

Probably not at first. The installed web app is a real app on the phone, and you skip store fees, reviews and update delays. If you later want a listing in a store:

| Store | What it takes | Notes |
|---|---|---|
| **Google Play** | Wrap the hosted site as a "Trusted Web Activity", for example with the free tool at <https://www.pwabuilder.com>. A Play developer account costs US$25 once. | New *personal* developer accounts must run a closed test with 12 testers for 14 days before the app can go public. *Organisation* accounts are exempt. |
| **Apple App Store** | A Mac with Xcode, an Apple Developer account (US$99 a year), and Apple's review. | Apple sometimes rejects apps that are "just a website". On iPhone, "Add to Home Screen" gives the same result for free. |

## 5. Phone requirements

| | Fast video export | Video with sound | Offline |
|---|---|---|---|
| Android, Chrome 94 or newer | ✅ | ✅ | ✅ |
| iPhone, iOS 26 or newer | ✅ | ✅ | ✅ |
| iPhone, iOS 16.4 to 18 | Records in real time (takes as long as the video) | ✅ (real-time recording) | ✅ |
| Any browser | GIF export | — | ✅ |

The app checks what the phone can do and picks the right method automatically. **The export screen must stay open** until the video is finished. The app keeps the screen awake where the phone allows it.

## 6. Image sources and licences

- **Built-in drawings (12,963):** Tabler Icons (MIT), IconPark (Apache 2.0), Fluent Emoji (MIT), Healthicons (MIT), and Streamline Freehand (CC BY 4.0). They are bundled in the app and work offline. Licences are listed in the app under Menu → Licences.
- **Open images:** Wikimedia Commons and Openverse are searched directly from each customer's phone, with no API key. Only CC0, public-domain and CC BY images are shown, so they can be used in commercial videos. Share-alike, non-commercial and no-derivatives images are filtered out.
- **Credits:** CC BY material (including Streamline Freehand drawings) must be credited. The export screen lists the required credits with a **Copy** button so they can be pasted into the video description.
- **Pixabay, Unsplash, Pexels (optional, section 2):** searched live through your own middleman. Their images are never bundled into the app's library. Pixabay's licence forbids redistributing images as standalone files, and Unsplash requires its photos to be shown from its own links. Using them in your videos is allowed.
