"""Config flow cho Chuông cửa: chọn cảm biến chuông + kênh thông báo."""
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.helpers import selector

from .const import DOMAIN, CONF_SENSOR, CONF_NOTIFY, CONF_MESSAGE, DEFAULT_MESSAGE


class ChuongCuaConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is not None:
            return self.async_create_entry(title="Chuông cửa", data=user_input)

        # Danh sách dịch vụ notify hiện có (vd: notify.mobile_app_iphone)
        notify_services = sorted(
            (self.hass.services.async_services().get("notify") or {}).keys()
        )
        notify_options = [f"notify.{s}" for s in notify_services]

        schema = vol.Schema(
            {
                vol.Required(CONF_SENSOR): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain="binary_sensor")
                ),
                vol.Required(CONF_NOTIFY): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=notify_options,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        custom_value=True,
                    )
                ),
                vol.Optional(CONF_MESSAGE, default=DEFAULT_MESSAGE): selector.TextSelector(),
            }
        )
        return self.async_show_form(step_id="user", data_schema=schema)
