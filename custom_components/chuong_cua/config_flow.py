"""Config flow cho Chuông cửa: chọn cảm biến chuông + kênh thông báo (+ sensor số xung tùy chọn)."""
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    DOMAIN,
    CONF_SENSOR,
    CONF_NOTIFY,
    CONF_MESSAGE,
    CONF_SIGNAL_SENSOR,
    DEFAULT_MESSAGE,
)


def _notify_options(hass) -> list[str]:
    """Danh sách dịch vụ notify hiện có (vd: notify.mobile_app_iphone)."""
    services = sorted((hass.services.async_services().get("notify") or {}).keys())
    return [f"notify.{s}" for s in services]


class ChuongCuaConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Chuông cửa", data=user_input)

        schema = vol.Schema(
            {
                vol.Required(CONF_SENSOR): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="binary_sensor")
                ),
                vol.Required(CONF_NOTIFY): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_notify_options(self.hass),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        custom_value=True,
                    )
                ),
                vol.Optional(CONF_MESSAGE, default=DEFAULT_MESSAGE): selector.TextSelector(),
                vol.Optional(CONF_SIGNAL_SENSOR): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="sensor")
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return ChuongCuaOptionsFlow(config_entry)


class ChuongCuaOptionsFlow(config_entries.OptionsFlow):
    """Cho phép sửa kênh thông báo, nội dung và sensor số xung sau khi đã cài."""

    def __init__(self, config_entry) -> None:
        self._entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            # Bỏ trường rỗng để có thể xóa liên kết sensor số xung.
            cleaned = {k: v for k, v in user_input.items() if v not in (None, "")}
            return self.async_create_entry(title="", data=cleaned)

        cur = {**self._entry.data, **self._entry.options}
        schema = vol.Schema(
            {
                vol.Required(
                    CONF_NOTIFY, default=cur.get(CONF_NOTIFY, "")
                ): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_notify_options(self.hass),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        custom_value=True,
                    )
                ),
                vol.Optional(
                    CONF_MESSAGE, default=cur.get(CONF_MESSAGE, DEFAULT_MESSAGE)
                ): selector.TextSelector(),
                vol.Optional(
                    CONF_SIGNAL_SENSOR,
                    description={"suggested_value": cur.get(CONF_SIGNAL_SENSOR)},
                ): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="sensor")
                ),
            }
        )
        return self.async_show_form(step_id="init", data_schema=schema)
