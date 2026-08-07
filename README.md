# 🔔 Chuông cửa — Thông báo & Nhật ký (Home Assistant / HACS)

Tích hợp Home Assistant cho **chuông cửa**: theo dõi một `binary_sensor` (thường từ thiết bị
ESPHome bắt sóng chuông), rồi:

- **Gửi thông báo** về điện thoại: *"Có người đang bấm chuông"*.
- **Bấm vào thông báo** → mở thẳng màn hình **"Chuông cửa"** trong app HA.
- **Màn hình "Chuông cửa"** trên sidebar: liệt kê tất cả lần bấm kèm **thời gian** (lưu ở server,
  đồng bộ mọi máy/điện thoại).

> Đi kèm dự án phần cứng bắt sóng chuông: **ESP32 + CC1101** chạy ESPHome
> (repo firmware: `l3th2nh/doorbell-notify`). Tích hợp này là **phần Home Assistant**.

## Cài đặt (qua HACS — khuyên dùng)
1. HACS → menu **⋮** → **Custom repositories** → thêm URL repo này, category **Integration**.
2. Tìm **"Chuông cửa"** → **Download**.
3. **Khởi động lại Home Assistant**.
4. **Settings → Devices & Services → Add Integration** → tìm **"Chuông cửa"**.
5. Chọn:
   - **Cảm biến chuông**: `binary_sensor` của chuông (vd `binary_sensor.chuong_cua` từ ESPHome).
   - **Dịch vụ thông báo**: `notify.mobile_app_<điện_thoại>`.
   - (tùy chọn) **Nội dung thông báo** — mặc định *"Có người đang bấm chuông"*.
6. Xong! Mục **"Chuông cửa"** xuất hiện trên sidebar. Bấm chuông thử → điện thoại kêu, bấm vào
   thông báo mở màn hình nhật ký.

## Cập nhật
Có bản mới → HACS báo **Update** (hoặc `git pull` nếu chép tay). Không cần cấu hình lại.

## Cách hoạt động
- Lắng nghe `binary_sensor` đã chọn; khi chuyển `off → on` = có người bấm:
  - ghi mốc thời gian vào nhật ký (`.storage`, tối đa 300 lần gần nhất),
  - gọi dịch vụ `notify` với `clickAction`/`url = /chuong-cua` (mở panel khi bấm thông báo).
- Panel đọc nhật ký qua WebSocket `chuong_cua/get_log`; nút **Xóa lịch sử** gọi `chuong_cua/clear_log`.

## Cấu trúc
```
custom_components/chuong_cua/
├── __init__.py       # theo dõi cảm biến + thông báo + panel + WebSocket
├── config_flow.py    # chọn cảm biến + kênh thông báo
├── const.py
├── manifest.json
├── panel.js          # màn hình nhật ký (Web Component)
├── strings.json + translations/
hacs.json
```
