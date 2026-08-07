"""Hằng số cho tích hợp Chuông cửa."""
DOMAIN = "chuong_cua"

CONF_SENSOR = "sensor"                 # entity_id của binary_sensor chuông (từ ESPHome)
CONF_NOTIFY = "notify_service"         # dịch vụ notify, vd: notify.mobile_app_iphone
CONF_MESSAGE = "message"
CONF_SIGNAL_SENSOR = "signal_sensor"   # (tùy chọn) sensor số xung -> ghi kèm nhật ký để lọc báo ảo

DEFAULT_MESSAGE = "Có người đang bấm chuông"
MAX_LOG = 300                   # số lần bấm lưu tối đa
DEBOUNCE_SECONDS = 5            # 2 lần bấm liên tục dưới 5s -> chỉ tính 1 lần
