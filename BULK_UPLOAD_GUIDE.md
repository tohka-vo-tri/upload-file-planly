# 📦 Bulk Upload với Pause/Resume - Hướng dẫn sử dụng

## 🎯 Tính năng

Bulk Upload cho phép bạn upload hàng loạt video với các tính năng:

- ✅ **Upload song song** (10 video cùng lúc) - Nhanh gấp ~10 lần
- ⏸️ **Pause/Resume** - Tạm dừng và tiếp tục bất cứ lúc nào
- 💾 **Auto-save Progress** - Tự động lưu tiến trình sau mỗi video
- 🔄 **Retry Logic** - Tự động thử lại 3 lần nếu lỗi
- 📊 **Real-time Progress** - Hiển thị tiến trình chi tiết
- ❌ **Cancel & Resume** - Hủy và tiếp tục lại sau

## 🚀 Cách sử dụng

### Bước 1: Kết nối API
1. Mở app → Step 1
2. Nhập Token và Team ID
3. Click "Kết nối"
4. Sau khi thành công, click nút **⚡ Bulk Upload**

### Bước 2: Cấu hình Upload
1. **Chọn thư mục video**: Click "Chọn folder" → Chọn folder chứa video
2. **Chọn channels**: Tick vào các channel muốn upload (có thể chọn nhiều)
3. **Ngày bắt đầu**: Chọn ngày bắt đầu schedule
4. **Videos/ngày**: Kéo slider để chọn số video mỗi ngày (1-10)
5. **Time slots**: Điều chỉnh giờ upload cho mỗi video trong ngày
6. **Title** (tùy chọn): Nhập title chung, để trống = dùng tên file

### Bước 3: Bắt đầu Upload
Click **"Bắt đầu Upload"** → App sẽ:
- Upload 10 video song song
- Tự động lưu progress sau mỗi video
- Hiển thị real-time progress bar
- Retry 3 lần nếu video nào bị lỗi

### Bước 4: Quản lý Upload

#### ⏸️ Tạm dừng (Pause)
- Click nút **"Tạm dừng"** bất cứ lúc nào
- Progress được lưu tự động
- Video đang upload sẽ hoàn thành trước khi dừng

#### ▶️ Tiếp tục (Resume)
- Click nút **"Tiếp tục"** để upload tiếp
- Chỉ upload những video chưa xong
- Không upload lại video đã thành công

#### ❌ Hủy (Cancel)
- Click nút **"Hủy"** để dừng hoàn toàn
- Progress vẫn được lưu
- Có thể tiếp tục lại sau bằng nút **"Tiếp tục upload"**

## 🔄 Resume từ lần trước

Khi mở app lại, nếu có upload chưa hoàn thành:
- Hiện banner màu vàng với thông tin:
  - Số video đã upload
  - Số video bị lỗi
- 2 lựa chọn:
  1. **"Tiếp tục"** → Upload tiếp từ chỗ dừng
  2. **"Xóa & Bắt đầu lại"** → Xóa progress và upload lại từ đầu

## 📊 Hiển thị Progress

Trong quá trình upload, bạn sẽ thấy:
- **Phase**: "Đang upload video..." hoặc "Đang tạo lịch..."
- **Progress bar**: % hoàn thành (màu xanh)
- **Current video**: Tên video đang upload
- **Stats**: 
  - ✓ Uploaded: X videos
  - ✗ Failed: Y videos

## ⚙️ Kỹ thuật

### Upload Strategy
```
Batch 1: [Video 1-10] → Upload song song
  ↓ (2s delay)
Batch 2: [Video 11-20] → Upload song song
  ↓ (2s delay)
Batch 3: [Video 21-30] → Upload song song
...
```

### Retry Logic
- Mỗi video thử 3 lần
- Delay: 3s (lần 1), 6s (lần 2)
- Exponential backoff

### Progress File
- Lưu tại: `AppData/upload-app/upload-progress.json`
- Auto-save sau mỗi video thành công
- Chứa:
  - Videos đã upload (channelId, mediaId, publishOn)
  - Videos bị lỗi (path, name, error)
  - Phase hiện tại (upload/schedule)

## 📁 Phân bổ Video

App tự động phân bổ video:
- **Theo channel**: Chia đều videos cho các channels
- **Theo ngày**: Mỗi ngày upload N videos (theo config)
- **Theo giờ**: Mỗi video upload ở time slot khác nhau

### Ví dụ:
```
Input:
- 100 videos
- 5 channels
- 2 videos/ngày
- Time slots: [09:00, 15:00]

Output:
Channel 1: 20 videos
  - Day 1: 09:00, 15:00
  - Day 2: 09:00, 15:00
  - ...
  - Day 10: 09:00, 15:00
  
Channel 2: 20 videos
  - Day 1: 09:00, 15:00
  - ...
```

## ⚠️ Lưu ý

1. **Internet connection**: Giữ kết nối ổn định trong quá trình upload
2. **Computer sleep**: Không cho máy sleep khi đang upload
3. **File size**: Videos lớn sẽ upload lâu hơn
4. **Rate limiting**: App tự động delay để tránh bị chặn bởi server
5. **Failed videos**: Kiểm tra log để biết lý do lỗi

## 🐛 Xử lý lỗi

### 520 Cloudflare Error
- App đã tích hợp retry logic
- Upload song song giới hạn 10 videos
- Delay 2s giữa các batch

### Video upload failed
- Retry 3 lần tự động
- Nếu vẫn lỗi → Lưu vào failedVideos
- Tiếp tục upload videos khác

### Schedule creation failed
- Fallback: Tạo từng schedule riêng
- Không làm mất video đã upload

## 📈 Performance

| Số video | Upload tuần tự | Bulk (10 concurrent) | Tiết kiệm |
|----------|---------------|---------------------|-----------|
| 100      | ~100s (1.7 phút) | ~21s (0.35 phút) | **79%** |
| 500      | ~500s (8.3 phút) | ~105s (1.75 phút) | **79%** |
| 1000     | ~1000s (16.7 phút) | ~210s (3.5 phút) | **79%** |

*Lưu ý: Thời gian thực tế phụ thuộc vào tốc độ mạng và kích thước video*

## 🔧 Troubleshooting

### "Không có upload nào đang chạy"
→ Không có upload nào để pause/resume

### "Không tìm thấy video nào trong folder"
→ Chọn folder chứa video (.mp4, .mov, .avi, .mkv, .webm)

### "Phải chọn ít nhất 1 channel"
→ Tick vào ít nhất 1 channel

### Progress bị mất
→ Kiểm tra file: `%APPDATA%/upload-app/upload-progress.json`
→ Nếu bị xóa, phải upload lại từ đầu

---

**Developed by**: Planly Upload Tool Team  
**Version**: 2.0 (with Bulk Upload & Pause/Resume)
