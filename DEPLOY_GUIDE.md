# Deploy Cold Chain Server to Cloudflare + Railway

## ⚠️ Lưu ý quan trọng
Cloudflare **không** hỗ trợ:
- ✗ MQTT (background connections dài hạn)
- ✗ Socket.io (WebSocket dài hạn)
- ✗ SQLite persistence

**Giải pháp:** Deploy lên **Railway.app** (AWS infrastructure, rẻ + đơn giản)

---

## 1. SETUP RAILWAY (2-3 phút)

### Bước 1: Đăng ký Railway
- Vào https://railway.app
- Click "Login with GitHub"
- Cho phép truy cập

### Bước 2: Push code lên GitHub
```bash
git init
git add .
git commit -m "Cold chain server with Docker"
git remote add origin https://github.com/YOUR_USERNAME/coldchain-server.git
git push -u origin main
```

### Bước 3: Create Railway Project
1. Vào https://railway.app/dashboard
2. Click "New Project"
3. Chọn "Deploy from GitHub"
4. Select repo `coldchain-server`
5. Railway sẽ auto detect Dockerfile

### Bước 4: Configure Environment
Vào **Settings** → **Environment** thêm:
```
PORT=3000
NODE_ENV=production
MQTT_BROKER=broker.emqx.io
```

### Bước 5: Deploy
- Click "Deploy" → chờ 2-3 phút
- Xem log: **Deployments** tab
- Public URL: auto generate (vd: `https://coldchain-abc123.railway.app`)

---

## 2. SETUP CUSTOM DOMAIN (tùy chọn)

### Option A: Dùng Railway domain (miễn phí)
- Không cần config, Railway tạo domain tự động

### Option B: Dùng domain của bạn (qua Cloudflare DNS)
1. Vào Railway → **Networking**
2. Copy Railway CNAME: `coldchain-abc123.railway.app`
3. Vào Cloudflare DNS:
   - Type: **CNAME**
   - Name: `api.yourdomain.com`
   - Target: `coldchain-abc123.railway.app`
   - Proxy status: **Proxied** (màu cam)
4. Wait 5 phút → test `https://api.yourdomain.com/health`

---

## 3. VERIFY DEPLOYMENT

### Health Check
```bash
curl https://YOUR_RAILWAY_URL/health
```

Kết quả mong đợi:
```json
{
  "status": "ok",
  "mqtt": "connected",
  "database": "sqlite3",
  "timestamp": "2024-11-20T10:30:00.000Z"
}
```

### Check logs trên Railway
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# View logs
railway logs
```

---

## 4. LOCAL TESTING (không cần deploy)

### Chạy với Docker Compose
```bash
docker compose up --build
```

Truy cập: `http://localhost:3000`

### Chạy trực tiếp (Node.js)
```bash
npm install
npm start
```

---

## 5. ACCESSING SERVER từ ĐIỆN THOẠI

### Local Network
- Tìm IP máy: `ipconfig` (Windows) hoặc `ifconfig` (Mac/Linux)
- Vd: `192.168.1.100`
- Truy cập: `http://192.168.1.100:3000`

### Qua Internet (sau khi deploy)
- Railway URL: `https://coldchain-abc123.railway.app`
- Custom domain: `https://api.yourdomain.com`

---

## 6. PRICING

### Railway
- **Free tier**: $5/month credit (enough cho most apps)
- **Pay-as-you-go**: $0.00625/GB-hour
- Một app Node.js chạy 24/7 ≈ $5-10/tháng

### Cloudflare (Domain + DNS)
- Domain: $10-15/năm (tùy TLD)
- DNS: miễn phí
- CDN: miễn phí

---

## 7. UPDATE CODE (khi có thay đổi)

```bash
git add .
git commit -m "Update features"
git push origin main
```

Railway sẽ tự động redeploy (5 phút).

---

## 8. TROUBLESHOOTING

### Server không start?
```bash
railway logs
```

### Database permission error?
- Railway auto tạo `/app/data` directory
- SQLite sẽ auto create `telemetry.db`

### MQTT không connect?
- Check MQTT broker: `broker.emqx.io:1883` có online không
- Xem logs: `railway logs | grep MQTT`

### Socket.io connection failed?
- Check WebSocket proxy ở Cloudflare → **SSL/TLS** → **Full**
- Hoặc Railway → **Networking** → enable WebSocket

---

**Liên hệ hỗ trợ:**
- Railway: https://railway.app/support
- Cloudflare: https://support.cloudflare.com
