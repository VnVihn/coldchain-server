# 🚨 ALERTS SYSTEM - COMPLETE CODE REFERENCE

## 📍 LOCATION OF ALL CHANGES

### Backend Changes (server.js)

#### 1. Database Schema Creation
**Location**: Lines 454-490
**Creates**: `alert_settings` and `alerts` tables with proper indexes

#### 2. Alert Checking Function
**Location**: Lines 191-320
**Name**: `checkAndCreateAlerts(deviceId, telemetryData, address)`
**Triggers**: Threshold checking and alert creation

#### 3. Integration with MQTT Handler
**Location**: Line 660
**Call**: `await checkAndCreateAlerts(deviceId, telemetryData, address);`
**Timing**: After address resolution, before Excel export

#### 4. REST API Endpoints
**Location**: Lines 960-1100
**Endpoints**:
- `GET /api/alert-settings/:deviceId` - Line 960
- `PUT /api/alert-settings/:deviceId` - Line 983
- `GET /api/alerts/:deviceId` - Line 1018
- `GET /api/alert-stats/:deviceId` - Line 1059

### Frontend Changes (public/index.html)

#### 1. New Tab Button
**Location**: Line 642
**Code**: `<div class="tab" onclick="switchTab(3, this)">🚨 Cảnh báo</div>`

#### 2. Alert Tab HTML Structure
**Location**: Lines 711-855
**Sections**:
- Alert Settings Panel
- Alert Statistics Panel with Pie Chart
- Alert History Table

#### 3. Alert JavaScript Functions
**Location**: Lines 1529-1730
**Functions**:
- loadAlertSettings()
- saveAlertSettings()
- resetAlertSettings()
- loadAlertStats()
- updateAlertPieChart()
- loadAlertsHistory()
- renderAlertsTable()
- goToAlertLocation()
- Socket.io listener for 'alert:new'
- selectVehicle override

---

## 💾 SQL SCHEMA - ALERT TABLES

### Alert Settings Table
```sql
CREATE TABLE IF NOT EXISTS alert_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT UNIQUE NOT NULL,
  gas_warning REAL DEFAULT 1000,
  gas_critical REAL DEFAULT 2000,
  temp_warning REAL DEFAULT 28,
  temp_critical REAL DEFAULT 32,
  humidity_warning REAL DEFAULT 80,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);
```

### Alerts Table
```sql
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  sensor_type TEXT NOT NULL,
  value REAL NOT NULL,
  threshold REAL NOT NULL,
  severity TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  address TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);
```

### Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_alert_device ON alerts(device_id);
CREATE INDEX IF NOT EXISTS idx_alert_timestamp ON alerts(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alert_type ON alerts(sensor_type);
```

---

## 🔧 BACKEND - COMPLETE FUNCTIONS

### Function: checkAndCreateAlerts()
```javascript
async function checkAndCreateAlerts(deviceId, telemetryData, address) {
  try {
    // Get alert settings for device
    let settings = await getAsync(
      `SELECT * FROM alert_settings WHERE device_id = ?`,
      [deviceId]
    );

    // Create default settings if not exist
    if (!settings) {
      await runAsync(
        `INSERT INTO alert_settings (device_id, gas_warning, gas_critical, temp_warning, temp_critical, humidity_warning) 
         VALUES (?, 1000, 2000, 28, 32, 80)`,
        [deviceId]
      );
      settings = {
        gas_warning: 1000,
        gas_critical: 2000,
        temp_warning: 28,
        temp_critical: 32,
        humidity_warning: 80
      };
    }

    const alerts = [];
    const timestamp = new Date().toISOString();

    // Check Gas
    if (telemetryData.gas != null) {
      if (telemetryData.gas >= settings.gas_critical) {
        alerts.push({
          alert_type: 'critical',
          sensor_type: 'gas',
          value: telemetryData.gas,
          threshold: settings.gas_critical,
          severity: 'CRITICAL'
        });
      } else if (telemetryData.gas >= settings.gas_warning) {
        alerts.push({
          alert_type: 'warning',
          sensor_type: 'gas',
          value: telemetryData.gas,
          threshold: settings.gas_warning,
          severity: 'WARNING'
        });
      }
    }

    // Check Temperature
    if (telemetryData.temperature != null) {
      if (telemetryData.temperature >= settings.temp_critical) {
        alerts.push({
          alert_type: 'critical',
          sensor_type: 'temperature',
          value: telemetryData.temperature,
          threshold: settings.temp_critical,
          severity: 'CRITICAL'
        });
      } else if (telemetryData.temperature >= settings.temp_warning) {
        alerts.push({
          alert_type: 'warning',
          sensor_type: 'temperature',
          value: telemetryData.temperature,
          threshold: settings.temp_warning,
          severity: 'WARNING'
        });
      }
    }

    // Check Humidity
    if (telemetryData.humidity != null) {
      if (telemetryData.humidity >= settings.humidity_warning) {
        alerts.push({
          alert_type: 'warning',
          sensor_type: 'humidity',
          value: telemetryData.humidity,
          threshold: settings.humidity_warning,
          severity: 'WARNING'
        });
      }
    }

    // Save alerts to database
    for (const alert of alerts) {
      try {
        await runAsync(
          `INSERT INTO alerts (device_id, alert_type, sensor_type, value, threshold, severity, latitude, longitude, address, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            deviceId,
            alert.alert_type,
            alert.sensor_type,
            alert.value,
            alert.threshold,
            alert.severity,
            telemetryData.latitude,
            telemetryData.longitude,
            address,
            timestamp
          ]
        );
        console.log(`🚨 ALERT [${alert.severity}] ${deviceId} - ${alert.sensor_type}: ${alert.value} (threshold: ${alert.threshold})`);
      } catch (alertErr) {
        console.error(`❌ Alert save error:`, alertErr.message);
      }
    }

    // Emit alerts via socket.io
    if (alerts.length > 0) {
      io.emit('alert:new', {
        device_id: deviceId,
        alerts: alerts,
        telemetry: {
          temperature: telemetryData.temperature,
          humidity: telemetryData.humidity,
          gas: telemetryData.gas,
          latitude: telemetryData.latitude,
          longitude: telemetryData.longitude,
          address: address
        }
      });
    }

    return alerts;
  } catch (error) {
    console.error(`❌ Alert check error for ${deviceId}:`, error.message);
    return [];
  }
}
```

---

## 📱 FRONTEND - COMPLETE JAVASCRIPT

### Function: loadAlertSettings()
```javascript
async function loadAlertSettings() {
    if (!currentVehicleId) return;
    try {
        const response = await fetch(`/api/alert-settings/${currentVehicleId}`);
        const settings = await response.json();
        document.getElementById('gasWarning').value = settings.gas_warning;
        document.getElementById('gasCritical').value = settings.gas_critical;
        document.getElementById('tempWarning').value = settings.temp_warning;
        document.getElementById('tempCritical').value = settings.temp_critical;
        document.getElementById('humidityWarning').value = settings.humidity_warning;
    } catch (error) {
        console.error('Error loading alert settings:', error);
    }
}
```

### Function: saveAlertSettings()
```javascript
async function saveAlertSettings() {
    if (!currentVehicleId) {
        alert('Vui lòng chọn thiết bị trước');
        return;
    }

    const settings = {
        gas_warning: parseFloat(document.getElementById('gasWarning').value),
        gas_critical: parseFloat(document.getElementById('gasCritical').value),
        temp_warning: parseFloat(document.getElementById('tempWarning').value),
        temp_critical: parseFloat(document.getElementById('tempCritical').value),
        humidity_warning: parseFloat(document.getElementById('humidityWarning').value)
    };

    try {
        const response = await fetch(`/api/alert-settings/${currentVehicleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const result = await response.json();
        if (result.success) {
            alert('✅ Lưu ngưỡng cảnh báo thành công');
        }
    } catch (error) {
        alert('❌ Lỗi: ' + error.message);
    }
}
```

### Function: loadAlertStats()
```javascript
async function loadAlertStats() {
    if (!currentVehicleId) return;
    try {
        const response = await fetch(`/api/alert-stats/${currentVehicleId}?days=1`);
        const stats = await response.json();

        document.getElementById('totalAlertsCount').textContent = stats.total_alerts;

        // Count by type
        let gasCount = 0, tempCount = 0, humCount = 0;
        stats.by_type.forEach(item => {
            if (item.sensor_type === 'gas') gasCount = item.count;
            else if (item.sensor_type === 'temperature') tempCount = item.count;
            else if (item.sensor_type === 'humidity') humCount = item.count;
        });

        document.getElementById('gasAlertsCount').textContent = gasCount;
        document.getElementById('tempAlertsCount').textContent = tempCount;
        document.getElementById('humidityAlertsCount').textContent = humCount;

        // Update pie chart
        updateAlertPieChart([gasCount, tempCount, humCount]);
    } catch (error) {
        console.error('Error loading alert stats:', error);
    }
}
```

### Function: updateAlertPieChart()
```javascript
function updateAlertPieChart(data) {
    const ctx = document.getElementById('alertPieChart');
    if (!ctx) return;

    if (alertPieChart) {
        alertPieChart.data.datasets[0].data = data;
        alertPieChart.update();
    } else {
        alertPieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['🌫️ Gas', '🌡️ Nhiệt độ', '💧 Độ ẩm'],
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#FFA726',
                        '#EF5350',
                        '#29B6F6'
                    ],
                    borderColor: 'white',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            font: { size: 12 },
                            padding: 15
                        }
                    }
                }
            }
        });
    }
}
```

### Function: renderAlertsTable()
```javascript
function renderAlertsTable() {
    const tableBody = document.getElementById('alertsTableBody');
    tableBody.innerHTML = '';

    if (alertsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">Không có cảnh báo</td></tr>';
        return;
    }

    alertsData.forEach(alert => {
        const tr = document.createElement('tr');
        const timestamp = new Date(alert.timestamp).toLocaleTimeString('vi-VN');
        const sensorName = alert.sensor_type === 'gas' ? '🌫️ Gas' : 
                           alert.sensor_type === 'temperature' ? '🌡️ Nhiệt độ' : '💧 Độ ẩm';
        const severityColor = alert.severity === 'CRITICAL' ? '#FF6B6B' : '#FFA726';
        const severityBg = alert.severity === 'CRITICAL' ? '#FFE0E0' : '#FFF3E0';

        tr.innerHTML = `
            <td style="font-size: 11px;">${timestamp}</td>
            <td><span style="background: ${severityBg}; color: ${severityColor}; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">${alert.alert_type.toUpperCase()}</span></td>
            <td>${sensorName}</td>
            <td style="font-weight: 600;">${alert.value.toFixed(1)}</td>
            <td>${alert.threshold.toFixed(1)}</td>
            <td><span style="background: ${severityBg}; color: ${severityColor}; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">${alert.severity}</span></td>
            <td style="font-size: 11px; max-width: 150px; word-break: break-word;">${alert.address || 'N/A'}</td>
            <td><button onclick="goToAlertLocation(${alert.latitude}, ${alert.longitude})" style="background: #667eea; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">📍 Bản đồ</button></td>
        `;
        tableBody.appendChild(tr);
    });
}
```

### Function: goToAlertLocation()
```javascript
function goToAlertLocation(lat, lng) {
    // Switch to map tab
    switchTab(1, document.querySelectorAll('.tab')[1]);
    
    // Wait for map to initialize
    setTimeout(() => {
        if (map) {
            map.setView([lat, lng], 17);
            if (carMarker) {
                carMarker.setLatLng([lat, lng]).openPopup();
            }
        }
    }, 100);
}
```

### Socket.io Listener
```javascript
if (socket) {
    socket.on('alert:new', (data) => {
        console.log('🚨 New alert:', data);
        if (currentVehicleId === data.device_id) {
            // Show notification
            const alerts = data.alerts;
            alerts.forEach(alert => {
                const msg = `🚨 ${alert.severity}: ${alert.sensor_type} = ${data.telemetry[alert.sensor_type.toLowerCase()] || alert.value}`;
                console.log(msg);
            });
            // Reload alerts if on that tab
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab === document.querySelectorAll('.tab-content')[3]) {
                loadAlertData();
            }
        }
    });
}
```

### selectVehicle Override
```javascript
const originalSelectVehicle = selectVehicle;
selectVehicle = function(vehicleId, element) {
    originalSelectVehicle(vehicleId, element);
    loadAlertData();
};
```

---

## 🔌 REST API RESPONSES

### GET /api/alert-settings/truck_01
```json
{
  "id": 1,
  "device_id": "truck_01",
  "gas_warning": 1000,
  "gas_critical": 2000,
  "temp_warning": 28,
  "temp_critical": 32,
  "humidity_warning": 80,
  "updated_at": "2024-01-15T10:30:45.000Z"
}
```

### GET /api/alerts/truck_01?limit=5&days=1
```json
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
  {
    "id": 141,
    "device_id": "truck_01",
    "alert_type": "warning",
    "sensor_type": "gas",
    "value": 1250,
    "threshold": 1000,
    "severity": "WARNING",
    "latitude": 10.81990,
    "longitude": 106.59921,
    "address": "Hẻm 51 Bùi Dương Lịch, Phường Bình Tân, Thành phố Hồ Chí Minh",
    "timestamp": "2024-01-15T10:34:55.000Z",
    "resolved_at": null
  }
]
```

### GET /api/alert-stats/truck_01?days=1
```json
{
  "total_alerts": 42,
  "by_type": [
    { "sensor_type": "temperature", "count": 25 },
    { "sensor_type": "gas", "count": 12 },
    { "sensor_type": "humidity", "count": 5 }
  ],
  "by_severity": [
    { "severity": "CRITICAL", "count": 28 },
    { "severity": "WARNING", "count": 14 }
  ]
}
```

---

## 🎨 HTML STRUCTURE

### Alert Settings Panel
```html
<div style="background: white; padding: 20px; border-radius: 12px; flex: 0 0 35%; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
    <h3>⚙️ Cài đặt ngưỡng</h3>
    <input type="number" id="gasWarning" value="1000">
    <input type="number" id="gasCritical" value="2000">
    <input type="number" id="tempWarning" value="28">
    <input type="number" id="tempCritical" value="32">
    <input type="number" id="humidityWarning" value="80">
    <button onclick="saveAlertSettings()">💾 Lưu ngưỡng</button>
    <button onclick="resetAlertSettings()">↺ Khôi phục mặc định</button>
</div>
```

### Alert Stats Panel
```html
<div style="background: white; padding: 20px; border-radius: 12px; flex: 1;">
    <h3>📊 Thống kê cảnh báo hôm nay</h3>
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
        <div style="background: linear-gradient(135deg, #FF6B6B 0%, #FF5252 100%); color: white; padding: 15px; border-radius: 8px;">
            <div style="font-size: 12px;">Tổng cảnh báo</div>
            <div style="font-size: 28px; font-weight: 700;" id="totalAlertsCount">0</div>
        </div>
        <!-- Similar cards for Gas, Temperature, Humidity -->
    </div>
    <div style="position: relative; height: 250px;">
        <canvas id="alertPieChart"></canvas>
    </div>
</div>
```

### Alert History Table
```html
<table class="data-table">
    <thead>
        <tr>
            <th>Thời gian</th>
            <th>Loại cảnh báo</th>
            <th>Cảm biến</th>
            <th>Giá trị</th>
            <th>Ngưỡng</th>
            <th>Mức độ</th>
            <th>Địa chỉ</th>
            <th>Hành động</th>
        </tr>
    </thead>
    <tbody id="alertsTableBody"></tbody>
</table>
```

---

## ✅ IMPLEMENTATION COMPLETE

All code has been deployed to:
- **Backend**: [server.js](server.js)
- **Frontend**: [public/index.html](public/index.html)
- **Database**: telemetry.db (auto-created)

Status: **TESTED & WORKING** ✅

