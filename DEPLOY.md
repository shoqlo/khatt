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

## 2. How customers install it on their phone

Send them the link. The text below can be pasted into WhatsApp:

> **Android (Chrome):** افتح الرابط ← اضغط القائمة ⋮ ← «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
> **iPhone (Safari):** افتح الرابط ← اضغط زر المشاركة ⬆︎ ← «إضافة إلى الشاشة الرئيسية».
>
> **Android (Chrome):** open the link → menu ⋮ → "Install app" / "Add to Home screen".
> **iPhone (Safari):** open the link → Share ⬆︎ → "Add to Home Screen".

Once installed, it gets its own icon (خ), opens full screen, and works offline. The app's own menu also has an "Install app" entry.

## 3. App stores: do you need them?

Probably not at first. The installed web app is a real app on the phone, and you skip store fees, reviews and update delays. If you later want a listing in a store:

| Store | What it takes | Notes |
|---|---|---|
| **Google Play** | Wrap the hosted site as a "Trusted Web Activity", for example with the free tool at <https://www.pwabuilder.com>. A Play developer account costs US$25 once. | New *personal* developer accounts must run a closed test with 12 testers for 14 days before the app can go public. *Organisation* accounts are exempt. |
| **Apple App Store** | A Mac with Xcode, an Apple Developer account (US$99 a year), and Apple's review. | Apple sometimes rejects apps that are "just a website". On iPhone, "Add to Home Screen" gives the same result for free. |

## 4. Phone requirements

| | Fast video export | Video with sound | Offline |
|---|---|---|---|
| Android, Chrome 94 or newer | ✅ | ✅ | ✅ |
| iPhone, iOS 26 or newer | ✅ | ✅ | ✅ |
| iPhone, iOS 16.4 to 18 | Records in real time (takes as long as the video) | ✅ (real-time recording) | ✅ |
| Any browser | GIF export | — | ✅ |

The app checks what the phone can do and picks the right method automatically. **The export screen must stay open** until the video is finished. The app keeps the screen awake where the phone allows it.

## 5. Image sources and licences

- **Built-in drawings (12,963):** Tabler Icons (MIT), IconPark (Apache 2.0), Fluent Emoji (MIT), Healthicons (MIT), and Streamline Freehand (CC BY 4.0). They are bundled in the app and work offline. Licences are listed in the app under Menu → Licences.
- **Open images:** Wikimedia Commons and Openverse are searched directly from each customer's phone, with no API key. Only CC0, public-domain and CC BY images are shown, so they can be used in commercial videos. Share-alike, non-commercial and no-derivatives images are filtered out.
- **Credits:** CC BY material (including Streamline Freehand drawings) must be credited. The export screen lists the required credits with a **Copy** button so they can be pasted into the video description.
- **Pixabay is not used.** Its licence does not allow its images to be redistributed inside an app's library.
