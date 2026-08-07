"""Chuông cửa — theo dõi cảm biến chuông, gửi thông báo + ghi nhật ký + panel sidebar.

- Theo dõi 1 binary_sensor (từ ESPHome). Khi chuyển sang 'on' (có người bấm):
    · ghi 1 mốc thời gian (kèm SỐ XUNG nếu có sensor số xung) vào nhật ký,
    · gửi thông báo "Có người đang bấm chuông" tới điện thoại,
      bấm vào thông báo -> mở panel "Chuông cửa".
- Panel "Chuông cửa": liệt kê các lần bấm; mỗi dòng có nút "Báo ảo" để gán nhãn,
  và phần tổng hợp phân bố số xung (thật vs ảo) -> dùng để hiệu chỉnh ngưỡng lọc.
"""
import logging
import os

import voluptuous as vol

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback, Event
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    CONF_SENSOR,
    CONF_NOTIFY,
    CONF_MESSAGE,
    CONF_SIGNAL_SENSOR,
    DEFAULT_MESSAGE,
    MAX_LOG,
    DEBOUNCE_SECONDS,
)

_LOGGER = logging.getLogger(__name__)

PANEL_URL = "/chuong_cua/panel.js"
PANEL_VER = "2"  # tăng mỗi lần sửa panel để chống cache
PANEL_URL_V = f"{PANEL_URL}?v={PANEL_VER}"
PANEL_PATH = "chuong-cua"


def _read_pulses(hass: HomeAssistant, signal_sensor: str | None) -> int | None:
    """Đọc số xung của khung vừa kích hoạt (từ sensor số xung của ESP), nếu có."""
    if not signal_sensor:
        return None
    st = hass.states.get(signal_sensor)
    if st is None or st.state in (None, "", "unknown", "unavailable"):
        return None
    try:
        return int(float(st.state))
    except (ValueError, TypeError):
        return None


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    panel_js = os.path.join(os.path.dirname(__file__), "panel.js")

    store = Store(hass, 1, DOMAIN)
    data = hass.data.setdefault(DOMAIN, {})
    data["store"] = store
    data["log"] = (await store.async_load()) or {"events": []}

    # Phục vụ file JS của panel (chỉ 1 lần / phiên HA)
    if not data.get("static_registered"):
        data["static_registered"] = True
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_URL, panel_js, False)]
        )

    # Panel trên sidebar
    if PANEL_PATH not in hass.data.get(frontend.DATA_PANELS, {}):
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_PATH,
            webcomponent_name="chuong-cua-panel",
            module_url=PANEL_URL_V,
            sidebar_title="Chuông cửa",
            sidebar_icon="mdi:bell-ring",
            require_admin=False,
            config={},
        )

    # Lệnh WebSocket cho panel (chỉ đăng ký 1 lần)
    if not data.get("ws_registered"):
        data["ws_registered"] = True
        websocket_api.async_register_command(hass, ws_get_log)
        websocket_api.async_register_command(hass, ws_clear_log)
        websocket_api.async_register_command(hass, ws_mark)

    # Cấu hình hiệu lực = data (lúc cài) chồng bởi options (sửa sau qua Configure)
    conf = {**entry.data, **entry.options}
    sensor_id = conf.get(CONF_SENSOR)
    notify_service = conf.get(CONF_NOTIFY)
    message = conf.get(CONF_MESSAGE) or DEFAULT_MESSAGE
    signal_sensor = conf.get(CONF_SIGNAL_SENSOR)

    async def _handle_press() -> None:
        # Chống dội: 2 lần bấm liên tục dưới DEBOUNCE_SECONDS -> chỉ tính 1 lần
        now = dt_util.utcnow()
        last = data.get("last_press")
        if last is not None and (now - last).total_seconds() < DEBOUNCE_SECONDS:
            _LOGGER.debug("Chuông cửa: bỏ qua lần bấm trùng (trong %ss)", DEBOUNCE_SECONDS)
            return
        data["last_press"] = now

        ev = {"time": now.isoformat()}
        pulses = _read_pulses(hass, signal_sensor)
        if pulses is not None:
            ev["pulses"] = pulses

        events = data["log"].setdefault("events", [])
        events.insert(0, ev)
        del events[MAX_LOG:]
        await store.async_save(data["log"])
        _LOGGER.info("Chuông cửa: có người bấm lúc %s (xung=%s)", ev["time"], pulses)

        if notify_service:
            svc = notify_service.split(".")[-1]  # 'notify.mobile_app_x' -> 'mobile_app_x'
            try:
                await hass.services.async_call(
                    "notify",
                    svc,
                    {
                        "message": message,
                        "title": "🔔 Chuông cửa",
                        "data": {
                            # Android + iOS: bấm thông báo -> mở panel "Chuông cửa"
                            "clickAction": f"/{PANEL_PATH}",
                            "url": f"/{PANEL_PATH}",
                            "tag": "chuong-cua",
                        },
                    },
                    blocking=False,
                )
            except Exception as err:  # noqa: BLE001
                _LOGGER.warning("Chuông cửa: gửi thông báo lỗi: %s", err)

    @callback
    def _on_state(event: Event) -> None:
        new = event.data.get("new_state")
        old = event.data.get("old_state")
        if new is None:
            return
        if new.state == "on" and (old is None or old.state != "on"):
            hass.async_create_task(_handle_press())

    if sensor_id:
        entry.async_on_unload(
            async_track_state_change_event(hass, [sensor_id], _on_state)
        )

    # Sửa tùy chọn (Configure) -> nạp lại entry để áp dụng ngay
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))

    _LOGGER.info(
        "Chuông cửa: theo dõi '%s', thông báo qua '%s', sensor số xung '%s'",
        sensor_id,
        notify_service,
        signal_sensor,
    )
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


@websocket_api.websocket_command({vol.Required("type"): "chuong_cua/get_log"})
@websocket_api.async_response
async def ws_get_log(hass: HomeAssistant, connection, msg) -> None:
    data = hass.data.get(DOMAIN, {})
    connection.send_result(msg["id"], data.get("log", {"events": []}))


@websocket_api.websocket_command(
    {
        vol.Required("type"): "chuong_cua/mark",
        vol.Required("time"): str,
        vol.Required("false"): bool,
    }
)
@websocket_api.async_response
async def ws_mark(hass: HomeAssistant, connection, msg) -> None:
    """Đánh dấu 1 lần bấm là báo ảo (hoặc bỏ đánh dấu), theo mốc thời gian."""
    data = hass.data.get(DOMAIN, {})
    log = data.get("log", {"events": []})
    changed = False
    for ev in log.get("events", []):
        if ev.get("time") == msg["time"]:
            ev["false"] = msg["false"]
            changed = True
            break
    if changed:
        store: Store = data.get("store")
        if store:
            await store.async_save(log)
    connection.send_result(msg["id"], {"ok": changed})


@websocket_api.websocket_command({vol.Required("type"): "chuong_cua/clear_log"})
@websocket_api.async_response
async def ws_clear_log(hass: HomeAssistant, connection, msg) -> None:
    data = hass.data.get(DOMAIN, {})
    data["log"] = {"events": []}
    store: Store = data.get("store")
    if store:
        await store.async_save(data["log"])
    connection.send_result(msg["id"], {"ok": True})


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if PANEL_PATH in hass.data.get(frontend.DATA_PANELS, {}):
        frontend.async_remove_panel(hass, PANEL_PATH)
    return True
