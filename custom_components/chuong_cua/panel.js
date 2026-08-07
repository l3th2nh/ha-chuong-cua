/*
 * Chuông cửa — panel "Nhật ký bấm chuông" (native HA, Shadow DOM).
 * Mỗi lần bấm hiện đầy đủ đặc trưng tín hiệu: số xung, thời lượng, độ rộng xung/khe.
 * Nút "Báo ảo" để gán nhãn; bảng phân tích (thật vs ảo); nút "Xuất dữ liệu" để copy toàn bộ (kèm timing thô).
 * Dữ liệu qua WebSocket: chuong_cua/get_log, chuong_cua/mark, chuong_cua/clear_log.
 */
const STYLE = `
<style>
:host{
  --bg:#14161c;--panel:#1d2029;--panel-2:#242833;--line:rgba(255,255,255,.08);
  --line-strong:rgba(255,255,255,.14);--text:#f2f4f8;--muted:#9aa4b6;--faint:#6b7385;
  --accent:#ffb24c;--ok:#5fd29a;--bad:#f0888a;--radius:16px;
  --font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--mono:ui-monospace,Menlo,monospace;
  display:block;min-height:100vh;color:var(--text);font-family:var(--font);
  background:radial-gradient(1000px 500px at 80% -10%,rgba(255,178,76,.10),transparent 60%),var(--bg);
}
*{box-sizing:border-box}
.wrap{max-width:820px;margin:0 auto;padding:16px 18px 80px}
.top{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.menu{width:42px;height:42px;border-radius:12px;flex:none;background:var(--panel);border:1px solid var(--line);
  color:var(--muted);font-size:20px;display:grid;place-items:center;cursor:pointer}
.menu:hover{border-color:var(--line-strong);color:var(--text)}
h1{font-weight:700;font-size:21px;margin:0;letter-spacing:-.02em}
.sub{font-size:12.5px;color:var(--faint)}
.bar{display:flex;align-items:center;gap:10px;margin:0 0 14px;flex-wrap:wrap}
.count{font-size:13px;color:var(--muted);margin-right:auto}
.count b{color:var(--accent);font-size:16px}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;border-radius:11px;font-size:13.5px;font-weight:500;
  cursor:pointer;border:1px solid var(--line-strong);background:var(--panel);color:var(--text);font-family:inherit}
.btn:hover{border-color:var(--accent)}
.btn.danger{color:var(--bad)}
.btn.danger:hover{border-color:var(--bad)}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.stat .lbl{font-size:12px;color:var(--faint);display:flex;align-items:center;gap:6px}
.stat .big{font-size:26px;font-weight:700;line-height:1.1;margin:3px 0}
.stat .rng{font-size:12px;color:var(--muted);font-family:var(--mono)}
.stat.real .big{color:var(--ok)}
.stat.fake .big{color:var(--bad)}
.hint{background:color-mix(in srgb,var(--accent) 10%,var(--panel));border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line));
  border-radius:12px;padding:10px 13px;margin:0 0 14px;font-size:13px;color:var(--text);line-height:1.5}
.hint code{font-family:var(--mono);background:rgba(0,0,0,.25);padding:1px 6px;border-radius:5px;color:var(--accent)}
.list{display:flex;flex-direction:column;gap:8px}
.item{display:flex;align-items:center;gap:13px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius);padding:12px 14px}
.item:first-child{border-color:color-mix(in srgb,var(--accent) 40%,var(--line))}
.item.fake{opacity:.62;border-style:dashed}
.item.fake .time{text-decoration:line-through}
.ic{width:38px;height:38px;border-radius:11px;flex:none;display:grid;place-items:center;
  background:color-mix(in srgb,var(--accent) 14%,var(--panel-2));color:var(--accent)}
.item.fake .ic{background:color-mix(in srgb,var(--bad) 14%,var(--panel-2));color:var(--bad)}
.ic svg{width:21px;height:21px}
.meta{min-width:0;flex:1}
.time{font-weight:600;font-size:14.5px}
.rel{font-size:12px;color:var(--faint);margin-top:2px;font-family:var(--mono)}
.sig{font-size:11.5px;color:var(--muted);margin-top:3px;font-family:var(--mono);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pulse{font-family:var(--mono);font-size:12.5px;color:var(--text);background:var(--panel-2);
  border:1px solid var(--line);border-radius:9px;padding:5px 9px;flex:none;white-space:nowrap}
.pulse.na{color:var(--faint)}
.mark{flex:none;cursor:pointer;border-radius:9px;padding:6px 10px;font-size:12.5px;font-family:inherit;
  border:1px solid var(--line-strong);background:transparent;color:var(--muted)}
.mark:hover{border-color:var(--bad);color:var(--bad)}
.item.fake .mark{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,var(--line))}
.item.fake .mark:hover{border-color:var(--ok)}
.empty{text-align:center;padding:60px 20px;color:var(--faint)}
.empty .bell{font-size:44px;opacity:.5}
.empty h3{color:var(--muted);font-weight:600;margin:14px 0 6px;font-size:17px}
.empty p{margin:0;font-size:14px;line-height:1.55}
/* Overlay xuất dữ liệu */
.ovl{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;place-items:center;padding:20px;z-index:50}
.ovl.show{display:grid}
.card{background:var(--panel-2);border:1px solid var(--line-strong);border-radius:16px;padding:16px;
  width:100%;max-width:680px;display:flex;flex-direction:column;gap:12px}
.card h2{margin:0;font-size:17px}
.card p{margin:0;font-size:13px;color:var(--muted)}
.card textarea{width:100%;height:280px;background:var(--bg);color:var(--text);border:1px solid var(--line);
  border-radius:10px;padding:10px;font-family:var(--mono);font-size:12px;resize:vertical}
.card .row{display:flex;gap:10px;justify-content:flex-end}
@media(max-width:520px){.stats{grid-template-columns:1fr}.mark{padding:6px 8px}}
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
        <div><h1>🔔 Chuông cửa</h1><span class="sub">Nhật ký + đặc trưng tín hiệu</span></div>
      </div>
      <div class="bar">
        <span class="count" id="count">—</span>
        <button class="btn" id="export">⬇ Xuất dữ liệu</button>
        <button class="btn" id="refresh">↻ Làm mới</button>
        <button class="btn danger" id="clear">Xóa lịch sử</button>
      </div>
      <div id="view"></div>
    </div>
    <div class="ovl" id="ovl">
      <div class="card">
        <h2>Xuất dữ liệu nghiên cứu</h2>
        <p>Copy toàn bộ nội dung dưới đây (gồm timing thô) rồi gửi cho AI để phân tích & chốt ngưỡng lọc.</p>
        <textarea id="dump" readonly></textarea>
        <div class="row">
          <button class="btn" id="copy">📋 Copy</button>
          <button class="btn" id="close">Đóng</button>
        </div>
      </div>
    </div>`;
  }

  _wire() {
    this.$(".menu").addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))
    );
    this.$("#refresh").addEventListener("click", () => this._load());
    this.$("#clear").addEventListener("click", () => this._clear());
    this.$("#export").addEventListener("click", () => this._openExport());
    this.$("#close").addEventListener("click", () => this.$("#ovl").classList.remove("show"));
    this.$("#copy").addEventListener("click", () => this._copyDump());
    // Ủy quyền click cho các nút "Báo ảo" (danh sách render lại liên tục)
    this.$("#view").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mark]");
      if (b) this._mark(b.getAttribute("data-mark"), b.getAttribute("data-val") === "1");
    });
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
      // lỗi tạm thời -> giữ dữ liệu cũ, không xóa danh sách
    }
    this._render();
  }

  async _mark(time, value) {
    try {
      await this._hass.connection.sendMessagePromise({
        type: "chuong_cua/mark", time, false: value,
      });
    } catch {}
    await this._load();
  }

  async _clear() {
    if (!confirm("Xóa toàn bộ lịch sử bấm chuông?")) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "chuong_cua/clear_log" });
    } catch {}
    this._events = [];
    this._render();
  }

  _openExport() {
    this.$("#dump").value = JSON.stringify(this._events, null, 1);
    this.$("#ovl").classList.add("show");
  }
  async _copyDump() {
    const ta = this.$("#dump");
    try {
      await navigator.clipboard.writeText(ta.value);
      this.$("#copy").textContent = "✓ Đã copy";
      setTimeout(() => (this.$("#copy").textContent = "📋 Copy"), 1500);
    } catch {
      ta.focus(); ta.select();  // fallback: bôi đen để copy tay
    }
  }

  _fmt(iso) {
    const d = new Date(iso);
    const two = (n) => String(n).padStart(2, "0");
    const date = `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()}`;
    const time = `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
    return { date, time };
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
  _dur(us) {
    if (typeof us !== "number") return "";
    return us >= 1000 ? `${(us / 1000).toFixed(1)}ms` : `${us}µs`;
  }
  // Dòng đặc trưng hiển thị dưới mỗi mục
  _sigLine(e) {
    const s = e.sig;
    if (!s) return "";
    const parts = [];
    if (typeof s.us === "number") parts.push(this._dur(s.us));
    if (typeof s.gmin === "number") parts.push(`khe ${s.gmin}–${s.gmax}µs`);
    if (typeof s.pmin === "number") parts.push(`xung ${s.pmin}–${s.pmax}µs`);
    return parts.join(" · ");
  }

  _stats(list) {
    const p = list.map((e) => e.pulses).filter((v) => typeof v === "number");
    if (!p.length) return { n: list.length, withP: 0, min: null, max: null, avg: null };
    const sum = p.reduce((a, b) => a + b, 0);
    return {
      n: list.length, withP: p.length,
      min: Math.min(...p), max: Math.max(...p), avg: Math.round((sum / p.length) * 10) / 10,
    };
  }
  _rngText(s) {
    if (!s.withP) return "chưa có số xung";
    return s.min === s.max ? `xung ${s.min} · TB ${s.avg}` : `xung ${s.min}–${s.max} · TB ${s.avg}`;
  }
  _suggest(real, fake) {
    if (!real.withP || !fake.withP) return "";
    if (fake.min > real.max)
      return `Gợi ý: báo ảo đều <b>nhiều xung hơn</b> → đặt <code>max_pulses: ${real.max}</code> để loại chúng.`;
    if (fake.max < real.min)
      return `Gợi ý: báo ảo đều <b>ít xung hơn</b> → đặt <code>min_pulses: ${real.min}</code> để loại chúng.`;
    return `Số xung thật (${real.min}–${real.max}) và ảo (${fake.min}–${fake.max}) <b>chồng lấn</b> → xem thêm thời lượng/độ rộng khe (Xuất dữ liệu gửi AI).`;
  }

  _render() {
    const view = this.$("#view");
    const ev = this._events;
    const n = ev.length;
    const real = ev.filter((e) => !e.false);
    const fake = ev.filter((e) => e.false);
    this.$("#count").innerHTML = n
      ? `Tổng: <b>${n}</b> · thật ${real.length} · ảo ${fake.length}`
      : "Chưa có lần bấm nào";

    if (!n) {
      view.innerHTML = `<div class="empty"><div class="bell">🔔</div>
        <h3>Chưa có ai bấm chuông</h3>
        <p>Khi có tín hiệu, các lần bấm sẽ hiện ở đây kèm đặc trưng. Bấm "Báo ảo" nếu đó không phải chuông.</p></div>`;
      return;
    }

    const rs = this._stats(real), fs = this._stats(fake);
    const suggest = this._suggest(rs, fs);
    const stats = `
      <div class="stats">
        <div class="stat real"><div class="lbl">✓ Thật</div><div class="big">${rs.n}</div>
          <div class="rng">${this._rngText(rs)}</div></div>
        <div class="stat fake"><div class="lbl">🚫 Báo ảo</div><div class="big">${fs.n}</div>
          <div class="rng">${this._rngText(fs)}</div></div>
      </div>
      ${suggest ? `<div class="hint">${suggest}</div>` : ""}`;

    const rows = ev.map((e, i) => {
      const f = this._fmt(e.time);
      const hasP = typeof e.pulses === "number";
      const isFake = !!e.false;
      const sigLine = this._sigLine(e);
      return `<div class="item${isFake ? " fake" : ""}">
        <div class="ic">${BELL}</div>
        <div class="meta">
          <div class="time">${f.time} · ${f.date}</div>
          <div class="rel">#${n - i} · ${this._rel(e.time)}</div>
          ${sigLine ? `<div class="sig">${sigLine}</div>` : ""}
        </div>
        <span class="pulse${hasP ? "" : " na"}">${hasP ? `${e.pulses} xung` : "—"}</span>
        <button class="mark" data-mark="${e.time}" data-val="${isFake ? "0" : "1"}">
          ${isFake ? "✓ Thật" : "🚫 Báo ảo"}
        </button>
      </div>`;
    }).join("");

    view.innerHTML = stats + `<div class="list">${rows}</div>`;
  }
}

if (!customElements.get("chuong-cua-panel")) {
  customElements.define("chuong-cua-panel", ChuongCuaPanel);
}
console.info("%c CHUÔNG CỬA %c panel v3 ", "background:#ffb24c;color:#1a1820;border-radius:4px 0 0 4px;padding:2px 6px",
  "background:#8a5a1a;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px");
