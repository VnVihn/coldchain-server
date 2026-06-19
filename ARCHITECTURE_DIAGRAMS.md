# 🚨 ALERTS SYSTEM - ARCHITECTURE & DATA FLOW

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                     COLD CHAIN ALERTS SYSTEM                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                         ESP32 DEVICES                            │
│              (Sending MQTT telemetry messages)                   │
└──────────────────────────────────────────────┬───────────────────┘
                                               │
                                               ▼
                    ┌─────────────────────────────────────────┐
                    │  EMQX MQTT BROKER                       │
                    │  broker.emqx.io:1883                    │
                    └──────────────┬──────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────┐
        │                  NODE.JS SERVER                       │
        │              (server.js - Backend)                    │
        │                                                        │
        │  1. Receive MQTT data                                │
        │  2. Resolve address (geocoding)                      │
        │  3. Save to telemetry table                          │
        │  4. ➡️ CHECK THRESHOLDS                              │
        │  5. ➡️ CREATE ALERTS if exceeded                     │
        │  6. ➡️ EMIT via Socket.io                            │
        │  7. Save to Excel                                    │
        └──────────────────────────────────────────────────────┘
                         ▲              │
                         │              │
           ┌─────────────┘              ▼
           │           ┌─────────────────────────────────────┐
           │           │    SQLite3 DATABASE                │
           │           │      (telemetry.db)                 │
           │           │                                     │
           │           │  Tables:                           │
           │           │  ├─ devices                        │
           │           │  ├─ telemetry                      │
           │           │  ├─ location_history               │
           │           │  ├─ address_cache                  │
           │           │  ├─ alert_settings ✨              │
           │           │  └─ alerts ✨                      │
           │           └─────────────────────────────────────┘
           │                        ▲
           │                        │
           │     ┌──────────────────┴──────────────────┐
           │     │                                      │
           ▼     ▼                                      ▼
    ┌──────────────────┐                      ┌──────────────────┐
    │  Socket.io      │                      │  REST APIs      │
    │  (Real-time)    │                      │  (HTTP)         │
    └────────┬─────────┘                      └────────┬─────────┘
             │                                         │
             │  alert:new events                      │
             │                                    4 Endpoints
             ▼                                    GET/PUT
    ┌──────────────────────────────────────────────────────────┐
    │           WEB BROWSER (Frontend)                         │
    │                (public/index.html)                       │
    │                                                          │
    │  Tab 1: Biểu đồ (Charts)                                │
    │  Tab 2: Bản đồ (Map)                                    │
    │  Tab 3: Dữ liệu (Data)                                  │
    │  Tab 4: 🚨 Cảnh báo (Alerts) ✨                         │
    │         ├─ Settings Panel                              │
    │         ├─ Statistics Panel                            │
    │         └─ Alert History Table                         │
    └──────────────────────────────────────────────────────────┘
```

---

## 🔄 ALERT CREATION FLOW

```
INCOMING MQTT MESSAGE
│
├─ Parse JSON telemetry
│  ├─ temperature
│  ├─ humidity
│  ├─ gas
│  ├─ latitude
│  └─ longitude
│
▼
REVERSE GEOCODING
│
├─ Check cache for address
├─ If not cached:
│  └─ Call reverse geocoding API
└─ Save address
│
▼
SAVE TO TELEMETRY TABLE
│
├─ Insert: device_id, temperature, humidity, gas, latitude, longitude, address
├─ Update: last_seen timestamp
└─ Save to location_history table
│
▼
🚨 CHECK ALERT THRESHOLDS ◀─── START HERE (checkAndCreateAlerts)
│
├─ Fetch alert_settings for device_id
├─ If not exist: Create with defaults
│
├─ CHECK GAS:
│  ├─ if gas >= gas_critical
│  │  └─ CREATE ALERT: sensor_type='gas', severity='CRITICAL', threshold=gas_critical
│  ├─ else if gas >= gas_warning
│  │  └─ CREATE ALERT: sensor_type='gas', severity='WARNING', threshold=gas_warning
│  └─ else: no alert
│
├─ CHECK TEMPERATURE:
│  ├─ if temp >= temp_critical
│  │  └─ CREATE ALERT: sensor_type='temperature', severity='CRITICAL', threshold=temp_critical
│  ├─ else if temp >= temp_warning
│  │  └─ CREATE ALERT: sensor_type='temperature', severity='WARNING', threshold=temp_warning
│  └─ else: no alert
│
├─ CHECK HUMIDITY:
│  ├─ if humidity >= humidity_warning
│  │  └─ CREATE ALERT: sensor_type='humidity', severity='WARNING', threshold=humidity_warning
│  └─ else: no alert
│
▼
SAVE ALERTS TO DATABASE
│
├─ For each alert created:
│  ├─ INSERT into alerts table
│  │  ├─ device_id
│  │  ├─ alert_type ('warning' or 'critical')
│  │  ├─ sensor_type ('gas', 'temperature', or 'humidity')
│  │  ├─ value (actual sensor reading)
│  │  ├─ threshold (threshold that was exceeded)
│  │  ├─ severity ('WARNING' or 'CRITICAL')
│  │  ├─ latitude & longitude
│  │  ├─ address
│  │  └─ timestamp
│  └─ Log to console: 🚨 ALERT [CRITICAL] device - sensor: value (threshold: X)
│
▼
EMIT REAL-TIME EVENT
│
├─ Socket.io emit: 'alert:new'
├─ Payload:
│  ├─ device_id
│  ├─ alerts (array of all alerts just created)
│  ├─ telemetry (current sensor values)
│  └─ address
│
├─ All connected browsers receive event
├─ If viewing alert tab:
│  └─ Auto-refresh alert data
│
▼
COMPLETE
│
└─ Loop continues on next MQTT message
```

---

## 📊 DATABASE SCHEMA RELATIONSHIPS

```
DEVICES TABLE
│
├─ device_id (PRIMARY KEY)
├─ name
├─ status
└─ last_seen
   │
   ├─ ┌─────────────────────────────────────┐
   │  │ (1:1 relationship)                  │
   │  ▼                                     │
   │  ALERT_SETTINGS TABLE                 │
   │  ├─ id                                │
   │  ├─ device_id (UNIQUE FOREIGN KEY) ◀──┘
   │  ├─ gas_warning                       │
   │  ├─ gas_critical                      │
   │  ├─ temp_warning                      │
   │  ├─ temp_critical                     │
   │  ├─ humidity_warning                  │
   │  └─ updated_at                        │
   │
   └─ ┌──────────────────────────────────────┐
      │ (1:Many relationship)                │
      ▼                                      │
      ALERTS TABLE                          │
      ├─ id                                 │
      ├─ device_id (FOREIGN KEY) ◀──────────┘
      ├─ alert_type ('warning'/'critical')
      ├─ sensor_type (gas/temperature/humidity)
      ├─ value (actual reading)
      ├─ threshold (threshold exceeded)
      ├─ severity (WARNING/CRITICAL)
      ├─ latitude
      ├─ longitude
      ├─ address
      ├─ timestamp
      └─ resolved_at
```

---

## 🎯 ALERT DECISION TREE

```
                    MQTT MESSAGE RECEIVED
                           │
                           ▼
                   ┌────────────────┐
                   │ GET SETTINGS   │
                   │ for device_id  │
                   └────────┬───────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Check GAS    │
                     └──────┬───────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
         gas >= crit    gas >= warn    no alert
              │             │             │
              ▼             ▼             ▼
         CRITICAL       WARNING          ✓
         ALERT          ALERT
              │             │             │
              └─────────────┼─────────────┘
                            │
                            ▼
                   ┌────────────────┐
                   │Check TEMP      │
                   └──────┬─────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
       temp >= crit   temp >= warn  no alert
            │             │             │
            ▼             ▼             ▼
       CRITICAL       WARNING          ✓
       ALERT          ALERT
            │             │             │
            └─────────────┼─────────────┘
                          │
                          ▼
                 ┌────────────────┐
                 │Check HUMIDITY  │
                 └──────┬─────────┘
                        │
           ┌────────────┼────────────┐
           │            │            │
      hum >= warn   no alert         │
           │            │            │
           ▼            ▼            ▼
       WARNING         ✓            ✓
       ALERT
           │            │            │
           └────────────┼────────────┘
                        │
                        ▼
              ┌──────────────────┐
              │ SAVE TO DATABASE │
              │ (If any alerts)  │
              └──────┬───────────┘
                     │
                     ▼
            ┌────────────────────┐
            │ EMIT SOCKET.IO     │
            │ 'alert:new' event  │
            └────────────────────┘
```

---

## 📱 FRONTEND DATA FLOW

```
USER OPENS BROWSER
│
▼
"🚨 Cảnh báo" TAB CLICKED
│
▼
selectVehicle() override triggered
│
▼
loadAlertData() called
│
├─ loadAlertSettings()
│  ├─ Fetch: GET /api/alert-settings/:deviceId
│  ├─ Parse JSON
│  └─ Populate input fields (gas_warning, gas_critical, etc)
│
├─ loadAlertStats()
│  ├─ Fetch: GET /api/alert-stats/:deviceId?days=1
│  ├─ Parse JSON (total_alerts, by_type, by_severity)
│  ├─ Update stat cards with counts
│  └─ Call updateAlertPieChart([gasCount, tempCount, humCount])
│     └─ Create/update Chart.js doughnut
│
└─ loadAlertsHistory()
   ├─ Fetch: GET /api/alerts/:deviceId?limit=100&days=1
   ├─ Store in global alertsData array
   └─ Call renderAlertsTable()
      └─ Loop through alerts and populate HTML table

▼
REAL-TIME EVENT LISTENER
│
└─ socket.on('alert:new', (data) => {
     ├─ if device_id matches current vehicle:
     │  ├─ Log to console
     │  ├─ Show notification (optional)
     │  └─ If on Alert tab:
     │     └─ Auto-refresh: loadAlertData()
     └─ })

▼
USER INTERACTIONS:
│
├─ Changes settings values
│  └─ Click "💾 Lưu ngưỡng"
│     ├─ Read input values
│     ├─ Send: PUT /api/alert-settings/:deviceId
│     ├─ Show success/error alert
│     └─ Settings persisted to database
│
├─ Click "↺ Khôi phục mặc định"
│  └─ Reset all inputs to defaults
│
├─ Click "📍 Bản đồ" button in alert row
│  ├─ Call goToAlertLocation(lat, lng)
│  ├─ Switch to Map tab
│  ├─ Center map on coordinates
│  ├─ Move car marker to location
│  └─ Open marker popup
│
└─ Auto-refresh when new alerts arrive via Socket.io
```

---

## 🔌 API REQUEST/RESPONSE CYCLES

### 1. LOAD SETTINGS
```
Frontend Action: Click Tab or Change Device

REQUEST:
GET /api/alert-settings/truck_01

BACKEND:
├─ Query: SELECT * FROM alert_settings WHERE device_id = ?
├─ If not found: Return defaults
└─ Return JSON

RESPONSE (200):
{
  "id": 1,
  "device_id": "truck_01",
  "gas_warning": 1000,
  "gas_critical": 2000,
  "temp_warning": 28,
  "temp_critical": 32,
  "humidity_warning": 80,
  "updated_at": "2024-01-15T10:30:00Z"
}

Frontend:
└─ Populate input fields with values
```

### 2. SAVE SETTINGS
```
Frontend Action: Click "💾 Lưu ngưỡng" Button

REQUEST:
PUT /api/alert-settings/truck_01
Content-Type: application/json
{
  "gas_warning": 900,
  "gas_critical": 1800,
  "temp_warning": 25,
  "temp_critical": 30,
  "humidity_warning": 75
}

BACKEND:
├─ Check if settings exist
├─ If exists: UPDATE alert_settings SET ...
├─ If not: INSERT INTO alert_settings VALUES ...
└─ Return success JSON

RESPONSE (200):
{
  "success": true,
  "device_id": "truck_01",
  "gas_warning": 900,
  "gas_critical": 1800,
  "temp_warning": 25,
  "temp_critical": 30,
  "humidity_warning": 75
}

Frontend:
└─ Show: "✅ Lưu ngưỡng cảnh báo thành công"
```

### 3. LOAD STATISTICS
```
Frontend Action: Tab Load / Real-time Update

REQUEST:
GET /api/alert-stats/truck_01?days=1

BACKEND:
├─ Calculate cutoff: now - 1 day
├─ Query: COUNT(*) WHERE timestamp >= cutoff
├─ Query: GROUP BY sensor_type
├─ Query: GROUP BY severity
└─ Return statistics JSON

RESPONSE (200):
{
  "total_alerts": 42,
  "by_type": [
    {"sensor_type": "temperature", "count": 25},
    {"sensor_type": "gas", "count": 12},
    {"sensor_type": "humidity", "count": 5}
  ],
  "by_severity": [
    {"severity": "CRITICAL", "count": 28},
    {"severity": "WARNING", "count": 14}
  ]
}

Frontend:
├─ Update stat cards: totalAlertsCount, gasAlertsCount, tempAlertsCount, humidityAlertsCount
└─ Update pie chart with [25, 12, 5] data
```

### 4. LOAD ALERT HISTORY
```
Frontend Action: Tab Load / Auto-refresh

REQUEST:
GET /api/alerts/truck_01?limit=100&days=1

BACKEND:
├─ Calculate cutoff: now - 1 day
├─ Query: SELECT * FROM alerts WHERE device_id=? AND timestamp>=? 
│          ORDER BY timestamp DESC LIMIT 100
└─ Return alert records array

RESPONSE (200):
[
  {
    "id": 142,
    "device_id": "truck_01",
    "alert_type": "critical",
    "sensor_type": "temperature",
    "value": 33.4,
    "threshold": 32,
    "severity": "CRITICAL",
    "latitude": 10.81989,
    "longitude": 106.59922,
    "address": "Hẻm 51 Bùi Dương Lịch, Phường Bình Tân, Thành phố Hồ Chí Minh",
    "timestamp": "2024-01-15T10:35:12.000Z",
    "resolved_at": null
  },
  ...
]

Frontend:
├─ Store in alertsData array
└─ Render HTML table with 8 columns per alert
```

---

## ⚡ REAL-TIME SOCKET.IO FLOW

```
BACKEND (Node.js):
│
├─ Receive MQTT message
├─ Parse telemetry
├─ Call checkAndCreateAlerts()
│  └─ If alerts created:
│     └─ io.emit('alert:new', {
│        device_id: "truck_01",
│        alerts: [{severity, sensor_type, value, threshold}, ...],
│        telemetry: {temperature, humidity, gas, latitude, longitude, address}
│      })
│
▼ Socket.io broadcasts to all connected clients

FRONTEND (Browser):
│
└─ socket.on('alert:new', (data) => {
   ├─ console.log('🚨 New alert:', data)
   ├─ if (currentVehicleId === data.device_id):
   │  ├─ Loop through data.alerts
   │  ├─ Print each alert to console
   │  │  └─ "🚨 CRITICAL: temperature = 33.4"
   │  └─ If viewing alert tab:
   │     └─ Auto-refresh: loadAlertData()
   │        ├─ loadAlertSettings()
   │        ├─ loadAlertStats()
   │        └─ loadAlertsHistory()
   │
   └─ Update all UI elements in real-time
})

RESULT:
├─ User sees new alerts in table instantly
├─ Stat cards update automatically
├─ Pie chart re-renders with new data
└─ No page refresh needed
```

---

## 📈 THRESHOLD CHECKING LOGIC

```
INCOMING VALUE vs THRESHOLDS:

Gas Example:
  value = 1250 ppm
  gas_warning = 1000
  gas_critical = 2000

  if (value >= 2000):
      create CRITICAL alert ✓
  else if (value >= 1000):
      create WARNING alert ✓  ◀─ This one matches (1250 >= 1000)
  else:
      no alert

Temperature Example:
  value = 33.4°C
  temp_warning = 28
  temp_critical = 32

  if (value >= 32):
      create CRITICAL alert ✓  ◀─ This one matches (33.4 >= 32)
  else if (value >= 28):
      create WARNING alert ✓
  else:
      no alert

Humidity Example:
  value = 85%
  humidity_warning = 80
  (no critical level)

  if (value >= 80):
      create WARNING alert ✓  ◀─ This one matches (85 >= 80)
  else:
      no alert
```

---

## 🎨 UI STATE DIAGRAM

```
┌─────────────────────────────────────────┐
│         ALERT TAB UI STATES              │
└─────────────────────────────────────────┘

START: No Device Selected
│
▼
USER SELECTS DEVICE
├─ loadAlertData() called
│
├─ STATE 1: LOADING
│  ├─ Settings Panel: Inputs empty/grayed
│  ├─ Stats Panel: All zeros
│  └─ Table: "Loading..." or empty
│
▼
DATA LOADED FROM API
│
├─ STATE 2: DISPLAYING DATA
│  ├─ Settings Panel: Shows current thresholds
│  │  └─ User can modify values
│  ├─ Stats Panel: Shows counts
│  │  └─ Pie chart populated
│  └─ Table: Shows alert history
│     └─ User can click 📍 Bản đồ
│
▼
REAL-TIME UPDATES (Socket.io 'alert:new' event)
│
├─ STATE 3: AUTO-REFRESHING
│  ├─ If on Alert tab:
│  │  ├─ loadAlertStats() (updates counts)
│  │  ├─ loadAlertsHistory() (adds new rows)
│  │  └─ Pie chart updates
│  └─ If not on Alert tab:
│     └─ No refresh (save bandwidth)
│
▼
USER CLICKS "💾 Lưu ngưỡng"
│
├─ STATE 4: SAVING
│  ├─ Button disabled
│  └─ Show loading indicator (optional)
│
▼
STATE 5: SAVED
├─ Show success: "✅ Lưu ngưỡng cảnh báo thành công"
├─ Settings persisted to database
└─ Return to STATE 2: DISPLAYING DATA
```

---

## 🔍 DEBUGGING TIPS

### Check Alert Creation
```bash
# Monitor server console for:
🚨 ALERT [CRITICAL] truck_01 - temperature: 33.4 (threshold: 32)

# Or query database:
sqlite3 telemetry.db "SELECT * FROM alerts ORDER BY id DESC LIMIT 5;"
```

### Check Settings Persistence
```bash
# Query alert_settings table:
sqlite3 telemetry.db "SELECT * FROM alert_settings WHERE device_id='truck_01';"
```

### Monitor Socket.io
```javascript
# In browser console, add:
socket.on('alert:new', (data) => {
  console.log('🚨 RAW EVENT:', JSON.stringify(data, null, 2));
});
```

### Check API Response
```bash
# Test each endpoint:
curl http://localhost:3000/api/alert-settings/truck_01 | jq .
curl http://localhost:3000/api/alert-stats/truck_01?days=1 | jq .
curl http://localhost:3000/api/alerts/truck_01?limit=5&days=1 | jq .
```

---

**Visual Architecture Complete** ✅  
**All system flows documented and illustrated**

