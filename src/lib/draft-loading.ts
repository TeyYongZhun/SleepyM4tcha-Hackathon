/**
 * The page shown in the new tab while the AI draft is being written. The tab is opened blank
 * straight from the click (see components/reply-bar.tsx), so this is written into it by hand:
 * plain HTML and CSS, no app code, colours copied from globals.css. It follows the theme
 * chosen in the app (the <html data-theme> of the page that opened it), not the system's.
 */

const STYLE = `
:root{--paper:#faf7f2;--surface:#fff;--ink:#12172b;--soft:#5b6072;--line:#e4ddd0;--copper:#c1652f;--shimmer:#f1ece3}
:root[data-theme="dark"]{--paper:#0a0a0a;--surface:rgb(255 255 255 / .035);--ink:#f0f0f0;--soft:#a8a8a8;--line:rgb(255 255 255 / .3);--copper:#d9773f;--shimmer:rgb(255 255 255 / .06)}
:root[data-theme="dark"] body{background-image:radial-gradient(70rem 42rem at 50% -22%,rgb(255 255 255 / .022),transparent 60%),radial-gradient(52rem 36rem at 5% 105%,rgb(217 119 63 / .025),transparent 58%);background-attachment:fixed}
:root[data-theme="dark"] .card{background-image:linear-gradient(180deg,rgb(255 255 255 / .035),rgb(255 255 255 / 0) 60%)}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{display:flex;align-items:center;justify-content:center;background:var(--paper);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.card{width:min(400px,calc(100vw - 32px));padding:32px 28px;background:var(--surface);border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 50px -20px rgba(18,23,43,.25);text-align:center;animation:rise .4s ease-out both}
.brand{display:inline-flex;align-items:center;gap:10px;margin-bottom:26px;font-weight:600;font-size:17px}
.mark{display:flex;width:30px;height:30px;align-items:center;justify-content:center;background:var(--copper);border-radius:8px}
.spinner{position:relative;width:64px;height:64px;margin:0 auto 22px}
.spinner::before{content:"";position:absolute;inset:0;border:3px solid var(--line);border-top-color:var(--copper);border-radius:50%;animation:spin .9s linear infinite}
.spinner svg{position:absolute;inset:0;margin:auto;animation:pulse 1.6s ease-in-out infinite}
h1{margin:0 0 6px;font-size:19px;font-weight:600}
p{margin:0;font-size:13.5px;line-height:1.5;color:var(--soft)}
.dots span{display:inline-block;animation:blink 1.2s infinite both}
.dots span:nth-child(2){animation-delay:.2s}
.dots span:nth-child(3){animation-delay:.4s}
.lines{margin-top:26px;display:grid;gap:10px}
.lines i{display:block;height:10px;border-radius:5px;background:linear-gradient(90deg,var(--shimmer) 25%,var(--line) 50%,var(--shimmer) 75%);background-size:200% 100%;animation:shimmer 1.4s linear infinite}
.lines i:nth-child(1){width:38%}
.lines i:nth-child(2){width:100%}
.lines i:nth-child(3){width:92%}
.lines i:nth-child(4){width:64%}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{transform:scale(.9);opacity:.7}50%{transform:scale(1.1);opacity:1}}
@keyframes blink{0%,80%,100%{opacity:.2}40%{opacity:1}}
@keyframes shimmer{to{background-position:-200% 0}}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
`;

const BODY = `
<main class="card" role="status" aria-live="polite">
  <div class="brand">
    <span class="mark">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>
    </span>
    WayBoxAI
  </div>
  <div class="spinner">
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--copper)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z"/></svg>
  </div>
  <h1>Drafting your reply</h1>
  <p>Reading the email and writing a response<span class="dots"><span>.</span><span>.</span><span>.</span></span></p>
  <div class="lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
</main>
`;

/** Fill a freshly opened blank tab with the loading page, in the app's current theme. */
export function showDraftLoading(tab: Window) {
  const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  tab.document.documentElement.dataset.theme = theme;
  tab.document.title = "Drafting reply…";
  tab.document.head.innerHTML = `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${STYLE}</style>`;
  tab.document.body.innerHTML = BODY;
}
