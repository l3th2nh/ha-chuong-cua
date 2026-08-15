/*
 * Chuông cửa — panel "Nhật ký bấm chuông" (native HA, Shadow DOM).
 * Đấu trực tiếp vào chuông (opto -> GPIO) nên 100% chính xác, không cần gán nhãn nữa.
 * Chỉ hiển thị danh sách các lần bấm kèm thời gian. Dữ liệu qua WebSocket: chuong_cua/get_log.
 */
const STYLE = `
<style>
:host{
  --bg:#14161c;--panel:#1d2029;--panel-2:#242833;--line:rgba(255,255,255,.08);
  --line-strong:rgba(255,255,255,.14);--text:#f2f4f8;--muted:#9aa4b6;--faint:#6b7385;
  --accent:#ffb24c;--bad:#f0888a;--radius:16px;
  --font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--mono:ui-monospace,Menlo,monospace;
  display:block;min-height:100vh;color:var(--text);font-family:var(--font);
  background:radial-gradient(1000px 500px at 80% -10%,rgba(255,178,76,.10),transparent 60%),var(--bg);
}
*{box-sizing:border-box}
.wrap{max-width:820px;margin:0 auto;padding:16px 16px 80px}
.top{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.menu{width:42px;height:42px;border-radius:12px;flex:none;background:var(--panel);border:1px solid var(--line);
  color:var(--muted);font-size:20px;display:grid;place-items:center;cursor:pointer}
.menu:hover{border-color:var(--line-strong);color:var(--text)}
h1{font-weight:700;font-size:20px;margin:0;letter-spacing:-.02em}
.sub{font-size:12px;color:var(--faint)}
.bar{display:flex;align-items:center;gap:10px;margin:0 0 14px;flex-wrap:wrap}
.count{font-size:13.5px;color:var(--muted);margin-right:auto}
.count b{color:var(--accent);font-size:16px}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:11px;font-size:13.5px;font-weight:500;
  cursor:pointer;border:1px solid var(--line-strong);background:var(--panel);color:var(--text);font-family:inherit}
.btn:hover{border-color:var(--accent)}
.btn.danger{color:var(--bad)}
.btn.danger:hover{border-color:var(--bad)}
.list{display:flex;flex-direction:column;gap:8px}
.item{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius);padding:14px 16px}
.item:first-child{border-color:color-mix(in srgb,var(--accent) 40%,var(--line));
  box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent) inset}
.ic{width:40px;height:40px;border-radius:11px;flex:none;display:grid;place-items:center;
  background:color-mix(in srgb,var(--accent) 14%,var(--panel-2));color:var(--accent)}
.ic svg{width:22px;height:22px}
.meta{min-width:0;flex:1}
.time{font-weight:600;font-size:15px}
.rel{font-size:12.5px;color:var(--faint);margin-top:2px;font-family:var(--mono)}
.idx{font-family:var(--mono);font-size:12px;color:var(--faint)}
.empty{text-align:center;padding:60px 20px;color:var(--faint)}
.empty .bell{font-size:44px;opacity:.5}
.empty h3{color:var(--muted);font-weight:600;margin:14px 0 6px;font-size:17px}
.empty p{margin:0;font-size:14px;line-height:1.55}
</style>`;

const BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg>`;

class ChuongCuaPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._built) return;
    if (!this._ready) this._init();
  }
  set narrow(_n) {}
  set route(_r) {}
  set panel(_p) {}

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this._events = [];
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = STYLE + this._shell();
    this._wire();
    if (this._hass) this._init();
  }
  disconnectedCallback() {
    if (this._timer) clearInterval(this._timer);
  }
  $(s) { return this.shadowRoot.querySelector(s); }

  _shell() {
    return `
    <div class="wrap">
      <div class="top">
        <button class="menu" title="Menu">&#9776;</button>
        <div><h1>🔔 Chuông cửa</h1><span class="sub">Nhật ký các lần bấm chuông</span></div>
      </div>
      <div class="bar">
        <span class="count" id="count">—</span>
        <button class="btn" id="refresh">↻ Làm mới</button>
        <button class="btn danger" id="clear">Xóa lịch sử</button>
      </div>
      <div id="view"></div>
    </div>`;
  }

  _wire() {
    this.$(".menu").addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))
    );
    this.$("#refresh").addEventListener("click", () => this._load());
    this.$("#clear").addEventListener("click", () => this._clear());
  }

  async _init() {
    this._ready = true;
    await this._load();
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._load(), 5000); // tự cập nhật
  }

  async _load() {
    try {
      const r = await this._hass.connection.sendMessagePromise({ type: "chuong_cua/get_log" });
      this._events = (r && r.events) || [];
    } catch {
      // lỗi tạm thời -> giữ dữ liệu cũ
    }
    this._render();
  }

  async _clear() {
    if (!confirm("Xóa toàn bộ lịch sử bấm chuông?")) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "chuong_cua/clear_log" });
    } catch {}
    this._events = [];
    this._render();
  }

  _fmt(iso) {
    const d = new Date(iso);
    const two = (n) => String(n).padStart(2, "0");
    return {
      date: `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`,
      time: `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`,
    };
  }
  _rel(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "vừa xong";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
  }

  _render() {
    const view = this.$("#view");
    const ev = this._events;
    const n = ev.length;
    this.$("#count").innerHTML = n ? `Tổng: <b>${n}</b> lần bấm` : "Chưa có lần bấm nào";

    if (!n) {
      view.innerHTML = `<div class="empty"><div class="bell">🔔</div>
        <h3>Chưa có ai bấm chuông</h3>
        <p>Khi có người bấm chuông, các lần bấm sẽ hiện ở đây kèm thời gian.</p></div>`;
      return;
    }

    const rows = ev.map((e, i) => {
      const f = this._fmt(e.time);
      return `<div class="item">
        <div class="ic">${BELL}</div>
        <div class="meta">
          <div class="time">${f.time} · ${f.date}</div>
          <div class="rel">${this._rel(e.time)}</div>
        </div>
        <div class="idx">#${n - i}</div>
      </div>`;
    }).join("");

    view.innerHTML = `<div class="list">${rows}</div>`;
  }
}

if (!customElements.get("chuong-cua-panel")) {
  customElements.define("chuong-cua-panel", ChuongCuaPanel);
}
console.info("%c CHUÔNG CỬA %c panel v6 ", "background:#ffb24c;color:#1a1820;border-radius:4px 0 0 4px;padding:2px 6px",
  "background:#8a5a1a;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px");
