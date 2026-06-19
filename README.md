# 🚨 COLD CHAIN ALERTS SYSTEM - README

**Version**: 1.0  
**Status**: ✅ PRODUCTION READY  
**Last Updated**: January 15, 2024

---

## 🎯 WHAT IS THIS?

This is a **Real-Time Alert/Warning System** added to your Cold Chain MQTT Dashboard.

The system automatically monitors incoming sensor data from ESP32 devices and **creates alerts when temperature, humidity, or gas levels exceed your configured thresholds**.

### ✨ Key Capabilities
- ⚡ **Real-Time Monitoring**: Alerts created instantly as data arrives
- 🎯 **Configurable Thresholds**: Set different WARNING and CRITICAL levels
- 📊 **Live Statistics**: See alert counts and trends
- 📍 **Location Tracking**: Know exactly where each alert occurred
- 🗺️ **Map Navigation**: Click to view alert location on map
- 💾 **Database Persistence**: All alerts saved for historical analysis
- 🔔 **Instant Notifications**: Socket.io live updates (no page refresh needed)

---

## 🚀 QUICK START (5 Minutes)

### 1. Open Dashboard
```
Browser: http://localhost:3000
```

### 2. Select Vehicle
- Pick a device from the vehicle list on the left

### 3. Click Alert Tab
- Look for the **4th tab**: "🚨 Cảnh báo"

### 4. Configure (Optional)
- Adjust threshold values if desired
- Click "💾 Lưu ngưỡng" to save

### 5. Monitor
- Real-time alerts appear in the table
- Statistics update automatically
- Map available for location details

---

## 📚 DOCUMENTATION

| File | Purpose | Read Time |
|------|---------|-----------|
| **README.md** | This file - Overview | 5 min |
| **DELIVERY_SUMMARY.md** | What was delivered | 15 min |
| **ALERTS_QUICK_REFERENCE.md** | How to use & test | 10 min |
| **ALERTS_FEATURE_COMPLETE.md** | Full documentation | 30 min |
| **ALERTS_CODE_REFERENCE.md** | Code listings | 30 min |
| **ARCHITECTURE_DIAGRAMS.md** | System diagrams | 20 min |
| **DOCUMENTATION_INDEX.md** | All docs indexed | 5 min |

**→ Start with: [DELIVERY_SUMMARY.md](DELIVERY_SUMMARY.md)**

---

## 🎮 USER INTERFACE

### The Alert Tab Has 3 Sections:

#### 1️⃣ Settings Panel (Left Side)
```
⚙️ Cài đặt ngưỡng (Alert Settings)
├─ 🌫️ Gas Warning (ppm): 1000
├─ 🌫️ Gas Critical (ppm): 2000
├─ 🌡️ Temp Warning (°C): 28
├─ 🌡️ Temp Critical (°C): 32
├─ 💧 Humidity Warning (%): 80
├─ [💾 Lưu ngưỡng] - Save button
└─ [↺ Khôi phục mặc định] - Reset button
```

#### 2️⃣ Statistics Panel (Right Side)
```
📊 Thống kê cảnh báo hôm nay (Today's Statistics)
├─ [Total: 42] [Gas: 12] [Temp: 25] [Humidity: 5]
└─ Pie Chart showing distribution
```

#### 3️⃣ Alert History Table (Bottom)
```
Thời gian | Type | Sensor | Value | Threshold | Severity | Address | [📍 Bản đồ]
----------|------|--------|-------|-----------|----------|---------|----------
10:35:12  | ⚠️   | Temp   | 33.4  | 32        | CRITICAL | Address | [Map]
10:34:55  | ⚠️   | Gas    | 1250  | 1000      | WARNING  | Address | [Map]
```

---

## 🔧 HOW IT WORKS

### Simple Version
1. **ESP32** sends sensor data via MQTT
2. **Server** receives and checks thresholds
3. **If exceeded** → Creates alert record
4. **Emits event** → Browser updates in real-time
5. **You see it** → Alert appears in table

### Threshold Levels

```
🌫️ GAS:
  If gas ≥ 2000 ppm → CRITICAL alert (🔴 Red)
  If gas ≥ 1000 ppm → WARNING alert (🟠 Orange)

🌡️ TEMPERATURE:
  If temp ≥ 32°C → CRITICAL alert (🔴 Red)
  If temp ≥ 28°C → WARNING alert (🟠 Orange)

💧 HUMIDITY:
  If humidity ≥ 80% → WARNING alert (🟠 Orange)
  (No critical level for humidity)
```

---

## ✅ WHAT WAS BUILT

### Backend Changes
- ✅ 2 new database tables (alert_settings, alerts)
- ✅ Threshold checking function
- ✅ 4 REST API endpoints
- ✅ Real-time Socket.io events

### Frontend Changes
- ✅ New "🚨 Cảnh báo" tab (4th tab)
- ✅ Settings configuration panel
- ✅ Statistics display with pie chart
- ✅ Full alert history table
- ✅ Map navigation from alerts

### System Features
- ✅ Real-time alert creation
- ✅ Database persistence
- ✅ Multi-device support
- ✅ Location tracking
- ✅ Historical analysis

---

## 🧪 VERIFY IT'S WORKING

### 1. Check Server Status
```bash
# You should see console output like:
✅ Database schema initialized
   - Alert Settings table: thresholds per device
   - Alerts table: alert events

✅ Web Server running: http://localhost:3000
```

### 2. Check Live Alerts
```bash
# Watch server console for:
🚨 ALERT [CRITICAL] truck_01 - temperature: 33.4 (threshold: 32)
🚨 ALERT [WARNING] truck_01 - gas: 1250 (threshold: 1000)
```

### 3. Test in Browser
```
1. Open http://localhost:3000
2. Select any device
3. Go to 🚨 Cảnh báo tab
4. View real-time alerts
5. Click 📍 Bản đồ to see location
```

### 4. Test Settings
```
1. Modify threshold values
2. Click 💾 Lưu ngưỡng
3. Refresh page
4. Values should be restored (saved in database)
```

---

## 🆘 TROUBLESHOOTING

### No alerts appearing?
→ Lower the thresholds using the settings panel  
→ Check server console for error messages  
→ Verify MQTT data is flowing (look for 📨 MQTT messages)

### Pie chart not showing?
→ Make sure at least one alert exists  
→ Hard refresh browser (Ctrl+F5)  
→ Check browser console for JavaScript errors (F12)

### Settings not saving?
→ Check that device_id is "truck_01"  
→ Look at server console for errors  
→ Try refreshing the page

### More issues?
→ Read: [ALERTS_QUICK_REFERENCE.md](ALERTS_QUICK_REFERENCE.md#-troubleshooting)

---

## 📊 DATABASE

### Alert Settings Table
- Stores your threshold configurations
- One entry per device
- Auto-updated when you click "Lưu ngưỡng"

### Alerts Table
- Records all alert events
- Includes: timestamp, value, threshold, severity, location
- Used for history and analysis

### Data Persistence
- Data saved to `telemetry.db`
- Survives server restarts
- Queryable with SQL

---

## 🔌 API ENDPOINTS

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/alert-settings/:deviceId` | GET | Fetch current thresholds |
| `/api/alert-settings/:deviceId` | PUT | Update thresholds |
| `/api/alerts/:deviceId` | GET | Fetch alert history |
| `/api/alert-stats/:deviceId` | GET | Fetch statistics |

Example:
```bash
curl http://localhost:3000/api/alert-stats/truck_01?days=1

# Returns:
# {
#   "total_alerts": 42,
#   "by_type": [
#     {"sensor_type": "temperature", "count": 25},
#     {"sensor_type": "gas", "count": 12},
#     {"sensor_type": "humidity", "count": 5}
#   ]
# }
```

---

## 🎓 LEARN MORE

### For System Overview
→ [DELIVERY_SUMMARY.md](DELIVERY_SUMMARY.md)

### For Daily Operations
→ [ALERTS_QUICK_REFERENCE.md](ALERTS_QUICK_REFERENCE.md)

### For Technical Details
→ [ALERTS_FEATURE_COMPLETE.md](ALERTS_FEATURE_COMPLETE.md)

### For Code Details
→ [ALERTS_CODE_REFERENCE.md](ALERTS_CODE_REFERENCE.md)

### For Architecture
→ [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)

### For All Docs
→ [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)

---

## 🎯 NEXT STEPS

### Recommended Actions
1. [ ] Read [DELIVERY_SUMMARY.md](DELIVERY_SUMMARY.md) for overview
2. [ ] Open http://localhost:3000 and explore the tab
3. [ ] Adjust thresholds to match your requirements
4. [ ] Configure MQTT devices to start sending data
5. [ ] Monitor real-time alerts as data arrives

### Optional Enhancements
- Email notifications for CRITICAL alerts
- Alert acknowledgment/review tracking
- Quiet hours scheduling (8 PM - 6 AM)
- Trend analysis and predictive alerts
- Alert export to reports

---

## 📝 SYSTEM REQUIREMENTS

| Component | Requirement |
|-----------|-------------|
| **Server** | Node.js 14+ |
| **Database** | SQLite3 (auto-created) |
| **Browser** | Any modern browser (Chrome, Firefox, Edge) |
| **Network** | MQTT broker connectivity (broker.emqx.io) |

---

## 💡 TIPS & TRICKS

### Tip 1: Use Default Thresholds
If you're not sure what values to use, the defaults work well:
- Gas: 1000 (warn), 2000 (critical)
- Temperature: 28°C (warn), 32°C (critical)
- Humidity: 80% (warn)

### Tip 2: Lower Thresholds for Testing
To quickly generate alerts:
1. Set gas_warning to 50 (very low)
2. Set temp_warning to 20 (very low)
3. Click Save
4. Alerts will trigger immediately

### Tip 3: Check Browser Console
Press F12 to open browser console and see real-time alerts:
```
🚨 New alert: {device_id: "truck_01", alerts: [...]}
```

### Tip 4: Use Map Navigation
Click "📍 Bản đồ" in any alert row to instantly see that location on the map.

### Tip 5: Export Data
Alert data is stored in SQLite database. You can export via:
```bash
sqlite3 telemetry.db "SELECT * FROM alerts" > alerts.csv
```

---

## 📞 SUPPORT

### Common Questions

**Q: Why is the pie chart empty?**  
A: You need at least one alert first. Lower thresholds to generate test alerts.

**Q: Can I delete old alerts?**  
A: Yes, run: `DELETE FROM alerts WHERE timestamp < datetime('now', '-30 days');`

**Q: How do I reset all settings to defaults?**  
A: Click "↺ Khôi phục mặc định" button in the settings panel.

**Q: Can multiple devices have different thresholds?**  
A: Yes! Each device has its own settings stored in alert_settings table.

**Q: Does the system work offline?**  
A: No, it requires MQTT broker connection for incoming data.

---

## 🎉 YOU'RE ALL SET!

The Alert System is **ready to use**. 

1. Open the dashboard: http://localhost:3000
2. Select a device
3. Click "🚨 Cảnh báo" tab
4. Start monitoring!

For detailed information, see the documentation files listed above.

---

## 📋 FINAL CHECKLIST

- [x] System installed and running
- [x] Alert tables created in database
- [x] UI tab visible and functional
- [x] Real-time alerts working
- [x] Settings persistence working
- [x] Statistics updating correctly
- [x] Map navigation functional
- [x] Documentation provided (2,650+ lines)
- [x] Ready for production use

---

**Status**: ✅ COMPLETE  
**Date**: January 15, 2024  
**System**: Cold Chain MQTT Dashboard v5.1 with Alerts

---

## 📖 DOCUMENTATION ROADMAP

```
README.md (You are here)
    ↓
    ├─→ DELIVERY_SUMMARY.md (Overview)
    ├─→ ALERTS_QUICK_REFERENCE.md (How to use)
    ├─→ ALERTS_FEATURE_COMPLETE.md (Complete guide)
    ├─→ ALERTS_CODE_REFERENCE.md (Code)
    ├─→ ARCHITECTURE_DIAGRAMS.md (Diagrams)
    └─→ DOCUMENTATION_INDEX.md (Full index)
```

**Start with**: [DELIVERY_SUMMARY.md](DELIVERY_SUMMARY.md)

