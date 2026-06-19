const express = require('express');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const XLSX = require('xlsx');
const fetch = require('node-fetch');
const fs = require('fs');
require('dotenv').config();

// Create data directory for Excel files
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Created data/ directory for Excel files');
}

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║     COLD CHAIN MQTT DASHBOARD - PERSISTENT STORAGE v5.1      ║');
console.log('║     ESP32 + MQTT + SQLite + Socket.io + Web Dashboard        ║');
console.log('║     With Excel Export (Address Format)                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// SQLITE DATABASE
// ============================================================
const db = new sqlite3.Database(path.join(__dirname, 'telemetry.db'), (err) => {
  if (err) {
    console.error('❌ Database error:', err.message);
  } else {
    console.log('📦 SQLite Database: telemetry.db');
  }
});

// Promise-based database helpers
function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

// Normalize coordinates to 5 decimal places (rounds ~1km)
function normalizeCoordinates(lat, lon) {
  return {
    lat_rounded: Math.round(lat * 100000) / 100000,
    lon_rounded: Math.round(lon * 100000) / 100000
  };
}

// Get address from coordinates using Nominatim with database cache
async function getAddressFromCoordinates(lat, lon, retries = 1) {
  try {
    // Normalize coordinates for caching
    const { lat_rounded, lon_rounded } = normalizeCoordinates(lat, lon);
    
    // Check database cache first
    const cached = await getAsync(
      `SELECT address FROM address_cache WHERE lat_rounded = ? AND lon_rounded = ?`,
      [lat_rounded, lon_rounded]
    );
    
    if (cached) {
      console.log(`✅ Using cached address [${lat_rounded},${lon_rounded}]: ${cached.address}`);
      return cached.address;
    }
    
    // Not in cache, fetch from Nominatim
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
      { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'ColdChainDashboard/1.0'
        }
      }
    );
    
    clearTimeout(timeout);
    
    // Handle 403 and rate limit with retry
    if (response.status === 403) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return getAddressFromCoordinates(lat, lon, retries - 1);
      }
      throw new Error('HTTP 403 - Rate limited');
    }
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const result = await response.json();
    const addr = result.address || {};
    
    // Extract address components
    let fullAddress = '';
    
    // Số đường (street number + road name)
    const streetNum = addr.house_number || '';
    const street = addr.road || addr.street || '';
    let streetAddress = '';
    if (street) {
      streetAddress = street;
      if (streetNum) streetAddress = streetNum + ' ' + street;
    }
    
    // Phường/Xã (ward/suburb/village)
    const ward = addr.suburb || addr.village || addr.residential || '';
    
    // Quận/Huyện (district)
    const district = addr.district || addr.county || '';
    
    // Tỉnh/Thành phố (city/province)
    let city = addr.city || addr.province || '';
    
    // Translate city names to Vietnamese
    if (city) {
      if (city.toLowerCase().includes('ho chi minh')) city = 'Thành phố Hồ Chí Minh';
      else if (city.toLowerCase().includes('hanoi')) city = 'Hà Nội';
      else if (city.toLowerCase().includes('da nang')) city = 'Đà Nẵng';
      else if (city.toLowerCase().includes('binh duong')) city = 'Bình Dương';
    }
    
    // Build address: Số đường, Phường, Quận, Tỉnh
    if (streetAddress) fullAddress = streetAddress;
    if (ward && !fullAddress.includes(ward)) {
      fullAddress = fullAddress ? `${fullAddress}, ${ward}` : ward;
    }
    if (district && !fullAddress.includes(district)) {
      fullAddress = fullAddress ? `${fullAddress}, ${district}` : district;
    }
    if (city && !fullAddress.includes(city)) {
      fullAddress = fullAddress ? `${fullAddress}, ${city}` : city;
    }
    
    // Clean up
    fullAddress = fullAddress.replace(/,\s*,/g, ',').trim();
    if (fullAddress.endsWith(',')) fullAddress = fullAddress.slice(0, -1);
    
    // Save to database cache
    try {
      await runAsync(
        `INSERT OR IGNORE INTO address_cache (lat_rounded, lon_rounded, address) VALUES (?, ?, ?)`,
        [lat_rounded, lon_rounded, fullAddress]
      );
      console.log(`💾 Cached address [${lat_rounded},${lon_rounded}]: ${fullAddress}`);
    } catch (cacheErr) {
      console.warn(`⚠️ Cache save error: ${cacheErr.message}`);
    }
    
    return fullAddress || 'Không xác định';
  } catch (error) {
    console.error(`⚠️ Address fetch error (lat: ${lat}, lon: ${lon}):`, error.message);
    return `GPS: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }
}

// Check for alert conditions and create alert records
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

// Auto-save telemetry data to Excel file for each device
async function saveDeviceToExcel(deviceId, telemetryData, address = 'Không xác định') {
  try {
    const excelPath = path.join(dataDir, `${deviceId}.xlsx`);
    
    // Prepare row data
    const date = new Date(telemetryData.timestamp);
    const dateStr = date.toLocaleDateString('vi-VN');
    const timeStr = date.toLocaleTimeString('vi-VN');
    
    const newRow = {
      'Ngày': dateStr,
      'Giờ': timeStr,
      'Địa chỉ': address,
      'Nhiệt độ (°C)': telemetryData.temperature ? telemetryData.temperature.toFixed(2) : '',
      'Độ ẩm (%)': telemetryData.humidity ? telemetryData.humidity.toFixed(2) : '',
      'Khí gas (ppm)': telemetryData.gas ? Math.round(telemetryData.gas) : ''
    };

    let ws;
    if (fs.existsSync(excelPath)) {
      // Read existing workbook
      const wb = XLSX.readFile(excelPath);
      ws = wb.Sheets['Dữ liệu theo dõi'] || wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      
      // Add new row
      data.push(newRow);
      
      // Update sheet
      ws = XLSX.utils.json_to_sheet(data);
      wb.Sheets['Dữ liệu theo dõi'] = ws;
      
      // Write back
      XLSX.writeFile(wb, excelPath);
    } else {
      // Create new workbook
      ws = XLSX.utils.json_to_sheet([newRow]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dữ liệu theo dõi');
      
      // Set column widths
      ws['!cols'] = [
        { wch: 12 },
        { wch: 12 },
        { wch: 60 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 }
      ];
      
      XLSX.writeFile(wb, excelPath);
    }
    
    console.log(`💾 Saved to: data/${deviceId}.xlsx`);
  } catch (error) {
    console.error(`❌ Excel save error for ${deviceId}:`, error.message);
  }
}

// Initialize database schema
function initializeDatabaseAsync() {
  return new Promise((resolve) => {
    db.serialize(() => {
      // Devices table - Store device metadata
      db.run(`
        CREATE TABLE IF NOT EXISTS devices (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT UNIQUE NOT NULL,
          device_name TEXT NOT NULL,
          mqtt_topic TEXT,
          mqtt_broker TEXT,
          status TEXT DEFAULT 'offline',
          last_seen DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Telemetry table - Store all sensor readings with device isolation
      db.run(`
        CREATE TABLE IF NOT EXISTS telemetry (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          temperature REAL,
          humidity REAL,
          gas REAL,
          latitude REAL,
          longitude REAL,
          address TEXT,
          rssi INTEGER,
          uptime INTEGER,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
      `);

      // Location History table - Store address history for each device
      db.run(`
        CREATE TABLE IF NOT EXISTS location_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          address TEXT,
          temperature REAL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (device_id) REFERENCES devices(device_id)
        )
      `);

      // Address Cache table - Store geocoded addresses with rounded coordinates
      db.run(`
        CREATE TABLE IF NOT EXISTS address_cache (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          lat_rounded REAL NOT NULL,
          lon_rounded REAL NOT NULL,
          address TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(lat_rounded, lon_rounded)
        )
      `);

      // Create performance indexes
      db.run(`CREATE INDEX IF NOT EXISTS idx_device_id ON telemetry(device_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON telemetry(timestamp)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_device_timestamp ON telemetry(device_id, timestamp DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_location_device ON location_history(device_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_location_timestamp ON location_history(device_id, timestamp DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_address_cache ON address_cache(lat_rounded, lon_rounded)`);

      // Alert Settings table - Store alert thresholds per device
      db.run(`
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
        )
      `);

      // Alerts table - Store alert events
      db.run(`
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
        )
      `);

      // Create alert indexes
      db.run(`CREATE INDEX IF NOT EXISTS idx_alert_device ON alerts(device_id)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_alert_timestamp ON alerts(device_id, timestamp DESC)`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_alert_type ON alerts(sensor_type)`, () => {
        console.log('✅ Database schema initialized');
        console.log('   - Devices table: device metadata');
        console.log('   - Telemetry table: sensor readings + address (device-isolated)');
        console.log('   - Location History table: address history with timestamps');
        console.log('   - Address Cache table: geocoded addresses (rounded coords)');
        console.log('   - Alert Settings table: thresholds per device');
        console.log('   - Alerts table: alert events\n');
        console.log('   - Indexes: device_id, timestamp, (device_id, timestamp), location history, alerts\n');
        resolve();
      });
    });
  });
}

// ============================================================
// DEVICE STATUS TRACKING
// ============================================================
const OFFLINE_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const deviceTimers = {};

async function checkDeviceStatus(deviceId) {
  try {
    const device = await getAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    if (!device) return;

    const lastSeen = new Date(device.last_seen).getTime();
    const now = Date.now();
    const isOnline = (now - lastSeen) < OFFLINE_TIMEOUT;
    const newStatus = isOnline ? 'online' : 'offline';

    if (device.status !== newStatus) {
      await runAsync('UPDATE devices SET status = ? WHERE device_id = ?', [newStatus, deviceId]);
      io.emit('device:status', { device_id: deviceId, status: newStatus });
      console.log(`📊 ${deviceId} → ${newStatus.toUpperCase()}`);
    }
  } catch (error) {
    console.error('Error checking device status:', error.message);
  }
}

function setDeviceCheckTimer(deviceId) {
  if (deviceTimers[deviceId]) clearInterval(deviceTimers[deviceId]);
  
  deviceTimers[deviceId] = setInterval(() => {
    checkDeviceStatus(deviceId);
  }, 30 * 1000); // Check every 30 seconds
}

// ============================================================
// MQTT CLIENT
// ============================================================
const mqttClient = mqtt.connect('mqtt://broker.emqx.io:1883', {
  clientId: 'nodejs_backend_' + Math.random().toString(36).substr(2, 9),
  reconnectPeriod: 2000,
  connectTimeout: 15 * 1000,
  keepalive: 60
});

mqttClient.on('connect', () => {
  console.log('✅ MQTT Connected: broker.emqx.io:1883');
  
  mqttClient.subscribe('hethonggiamsatthunghanglanh/+/telemetry', (err) => {
    if (err) {
      console.error('❌ MQTT Subscribe failed:', err);
    } else {
      console.log('✅ MQTT Subscribed: hethonggiamsatthunghanglanh/+/telemetry\n');
    }
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());
    const deviceId = data.device_id;
    
    if (!deviceId) {
      console.error('❌ MQTT: Missing device_id in payload');
      return;
    }

    console.log(`📨 MQTT [${topic}] device_id: ${deviceId}`);

    // Auto-create device if not exists
    const existingDevice = await getAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    if (!existingDevice) {
      await runAsync(
        `INSERT INTO devices (device_id, device_name, mqtt_topic, mqtt_broker, status) 
         VALUES (?, ?, ?, ?, ?)`,
        [deviceId, deviceId, topic, 'broker.emqx.io', 'offline']
      );
      console.log(`✨ Device created: ${deviceId}`);
      
      io.emit('device:created', {
        device_id: deviceId,
        device_name: deviceId,
        status: 'offline'
      });
      
      setDeviceCheckTimer(deviceId);
    }

    // SAVE TELEMETRY TO SQLITE (device-isolated)
    const timestamp = new Date().toISOString();
    const telemetryData = {
      temperature: parseFloat(data.temp) || null,
      humidity: parseFloat(data.hum) || null,
      gas: parseFloat(data.gas) || null,
      latitude: parseFloat(data.lat) || null,
      longitude: parseFloat(data.lon) || null,
      rssi: parseInt(data.rssi) || null,
      uptime: parseInt(data.uptime) || null,
      timestamp: timestamp
    };

    // Resolve address BEFORE saving to telemetry
    let address = 'Không xác định';
    if (telemetryData.latitude != null && telemetryData.longitude != null) {
      address = await getAddressFromCoordinates(telemetryData.latitude, telemetryData.longitude);
    }

    await runAsync(
      `INSERT INTO telemetry 
       (device_id, temperature, humidity, gas, latitude, longitude, address, rssi, uptime, timestamp) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        deviceId,
        telemetryData.temperature,
        telemetryData.humidity,
        telemetryData.gas,
        telemetryData.latitude,
        telemetryData.longitude,
        address,
        telemetryData.rssi,
        telemetryData.uptime,
        timestamp
      ]
    );
    
    telemetryData.address = address;

    // Update device last_seen and status
    await runAsync(
      `UPDATE devices SET status = ?, last_seen = datetime('now'), updated_at = datetime('now') 
       WHERE device_id = ?`,
      ['online', deviceId]
    );

    // SAVE TO LOCATION HISTORY TABLE for historical tracking (device-isolated)
    if (telemetryData.latitude != null && telemetryData.longitude != null) {
      try {
        await runAsync(
          `INSERT INTO location_history 
           (device_id, latitude, longitude, address, temperature, timestamp) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            deviceId,
            telemetryData.latitude,
            telemetryData.longitude,
            address,
            telemetryData.temperature,
            timestamp
          ]
        );
        console.log(`✅ Saved telemetry + location for ${deviceId}: ${address}`);
      } catch (locError) {
        console.error(`❌ Location history error for ${deviceId}:`, locError.message);
      }
    }

    // CHECK FOR ALERTS
    await checkAndCreateAlerts(deviceId, telemetryData, address);
    
    // Save to Excel file asynchronously (non-blocking)
    saveDeviceToExcel(deviceId, telemetryData, address).catch(err => {
      console.error(`❌ Failed to save Excel for ${deviceId}:`, err.message);
    });

    // EMIT REALTIME UPDATE (device-specific)
    io.emit('telemetry:update', {
      device_id: deviceId,
      temp: telemetryData.temperature || 0,
      hum: telemetryData.humidity || 0,
      gas: telemetryData.gas || 0,
      lat: telemetryData.latitude || 0,
      lon: telemetryData.longitude || 0,
      address: address,
      rssi: telemetryData.rssi || 0,
      uptime: telemetryData.uptime || 0,
      timestamp: timestamp
    });

    // Emit online status
    io.emit('device:online', {
      device_id: deviceId,
      last_seen: timestamp
    });

  } catch (error) {
    console.error('❌ MQTT Error:', error.message);
  }
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Connection Error:', error.message);
});

mqttClient.on('offline', () => {
  console.log('⚠️  MQTT Offline');
});

// ============================================================
// EXPRESS MIDDLEWARE
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ============================================================
// SOCKET.IO CONNECTION HANDLER
// ============================================================
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  // Request all devices with latest telemetry
  socket.on('request:devices', async () => {
    try {
      const devices = await allAsync('SELECT * FROM devices ORDER BY created_at DESC');
      
      const devicesWithLatest = await Promise.all(
        devices.map(async (device) => {
          const latest = await getAsync(
            `SELECT * FROM telemetry WHERE device_id = ? ORDER BY timestamp DESC LIMIT 1`,
            [device.device_id]
          );
          return { 
            ...device, 
            latest: latest ? {
              temperature: latest.temperature,
              humidity: latest.humidity,
              gas: latest.gas,
              latitude: latest.latitude,
              longitude: latest.longitude,
              address: latest.address || 'Không xác định',
              rssi: latest.rssi,
              uptime: latest.uptime,
              timestamp: latest.timestamp
            } : null
          };
        })
      );

      socket.emit('devices:list', devicesWithLatest);
      console.log(`📦 Sent ${devicesWithLatest.length} devices to client`);
    } catch (error) {
      console.error('❌ Error fetching devices:', error.message);
      socket.emit('error', { message: 'Failed to fetch devices' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ============================================================
// REST API ENDPOINTS
// ============================================================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// GET all devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await allAsync(
      'SELECT device_id, device_name, mqtt_topic, mqtt_broker, status, last_seen, created_at FROM devices ORDER BY created_at DESC'
    );
    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET telemetry history for SPECIFIC DEVICE (device-isolated query)
app.get('/api/history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 60; // Default to 60 logs only
    
    // Query telemetry directly with address (no JOIN needed)
    const telemetry = await allAsync(
      `SELECT 
        id,
        device_id, 
        temperature, 
        humidity, 
        gas, 
        latitude, 
        longitude, 
        address,
        rssi, 
        uptime, 
        timestamp
       FROM telemetry
       WHERE device_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [deviceId, Math.min(limit, 60)] // Hard limit to 60 max
    );
    
    // Reverse to get ascending order (oldest first for display)
    telemetry.reverse();
    
    console.log(`📊 API: Retrieved ${telemetry.length} recent records for ${deviceId}`);
    res.json(telemetry);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET device-specific stats
app.get('/api/stats/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const stats = await getAsync(
      `SELECT 
        COUNT(*) as total_records,
        AVG(temperature) as avg_temp,
        MIN(temperature) as min_temp,
        MAX(temperature) as max_temp,
        AVG(humidity) as avg_hum,
        MIN(humidity) as min_hum,
        MAX(humidity) as max_hum
       FROM telemetry 
       WHERE device_id = ?`,
      [deviceId]
    );
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET location history for device
app.get('/api/location-history/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 100; // Default to 100 location records
    
    const locationHistory = await allAsync(
      `SELECT 
        id,
        device_id,
        latitude,
        longitude,
        address,
        temperature,
        timestamp
       FROM location_history 
       WHERE device_id = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [deviceId, Math.min(limit, 1000)] // Hard limit to 1000 max
    );
    
    console.log(`📍 API: Retrieved ${locationHistory.length} location records for ${deviceId}`);
    res.json(locationHistory);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// EXPORT to EXCEL with ADDRESS FORMAT
app.get('/api/export/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Get device info
    const device = await getAsync('SELECT * FROM devices WHERE device_id = ?', [deviceId]);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }
    
    // Get all telemetry for this device (with address from database)
    const telemetry = await allAsync(
      `SELECT 
        device_id, 
        temperature, 
        humidity, 
        gas, 
        latitude, 
        longitude, 
        address,
        rssi, 
        uptime, 
        timestamp 
       FROM telemetry 
       WHERE device_id = ? 
       ORDER BY timestamp ASC`,
      [deviceId]
    );
    
    if (telemetry.length === 0) {
      return res.status(400).json({ error: 'No telemetry data found' });
    }
    
    // Format data for Excel with ADDRESS from database (no recalculation)
    const data = [];
    
    for (const row of telemetry) {
      const date = new Date(row.timestamp);
      const dateStr = date.toLocaleDateString('vi-VN');
      const timeStr = date.toLocaleTimeString('vi-VN');
      const address = row.address || 'Không xác định';
      
      data.push({
        'Ngày': dateStr,
        'Giờ': timeStr,
        'Địa chỉ': address,
        'Nhiệt độ (°C)': row.temperature ? row.temperature.toFixed(2) : '',
        'Độ ẩm (%)': row.humidity ? row.humidity.toFixed(2) : '',
        'Khí gas (ppm)': row.gas ? Math.round(row.gas) : ''
      });
    }
    
    // Create workbook with proper column widths and formatting
    const ws = XLSX.utils.json_to_sheet(data);
    
    // Apply formatting for better readability
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_col(C) + '1';
      if (!ws[address]) continue;
      ws[address].s = {
        font: { bold: true },
        fill: { fgColor: { rgb: 'CCCCCC' } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true }
      };
    }
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dữ liệu theo dõi');
    
    // Set column widths
    ws['!cols'] = [
      { wch: 12 },
      { wch: 12 },
      { wch: 60 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 }
    ];
    
    // Generate filename with device name and date
    const fileName = `${device.device_name}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    // Send file with UTF-8 encoding
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    
    console.log(`📥 Xuất ${telemetry.length} bản ghi cho ${fileName}`);
    
  } catch (error) {
    console.error('❌ Export error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET alert settings for device
app.get('/api/alert-settings/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    let settings = await getAsync(
      'SELECT * FROM alert_settings WHERE device_id = ?',
      [deviceId]
    );

    // Return default settings if not exist
    if (!settings) {
      settings = {
        device_id: deviceId,
        gas_warning: 1000,
        gas_critical: 2000,
        temp_warning: 28,
        temp_critical: 32,
        humidity_warning: 80
      };
    }

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update alert settings for device
app.put('/api/alert-settings/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { gas_warning, gas_critical, temp_warning, temp_critical, humidity_warning } = req.body;

    // Check if settings exist
    const existing = await getAsync(
      'SELECT id FROM alert_settings WHERE device_id = ?',
      [deviceId]
    );

    if (existing) {
      await runAsync(
        `UPDATE alert_settings SET gas_warning = ?, gas_critical = ?, temp_warning = ?, temp_critical = ?, humidity_warning = ?, updated_at = datetime('now') 
         WHERE device_id = ?`,
        [gas_warning, gas_critical, temp_warning, temp_critical, humidity_warning, deviceId]
      );
    } else {
      await runAsync(
        `INSERT INTO alert_settings (device_id, gas_warning, gas_critical, temp_warning, temp_critical, humidity_warning) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [deviceId, gas_warning, gas_critical, temp_warning, temp_critical, humidity_warning]
      );
    }

    res.json({ 
      success: true, 
      device_id: deviceId,
      gas_warning, gas_critical, temp_warning, temp_critical, humidity_warning
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET alerts history for device
app.get('/api/alerts/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = parseInt(req.query.limit) || 100;
    const days = parseInt(req.query.days) || 1;

    // Get alerts from last N days
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const alerts = await allAsync(
      `SELECT 
        id,
        device_id,
        alert_type,
        sensor_type,
        value,
        threshold,
        severity,
        latitude,
        longitude,
        address,
        timestamp,
        resolved_at
       FROM alerts
       WHERE device_id = ? AND timestamp >= ?
       ORDER BY timestamp DESC
       LIMIT ?`,
      [deviceId, cutoff, Math.min(limit, 1000)]
    );

    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET alert statistics for device
app.get('/api/alert-stats/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const days = parseInt(req.query.days) || 1;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Total alerts today
    const total = await getAsync(
      `SELECT COUNT(*) as count FROM alerts WHERE device_id = ? AND timestamp >= ?`,
      [deviceId, cutoff]
    );

    // Alerts by sensor type
    const byType = await allAsync(
      `SELECT sensor_type, COUNT(*) as count FROM alerts 
       WHERE device_id = ? AND timestamp >= ?
       GROUP BY sensor_type`,
      [deviceId, cutoff]
    );

    // Alerts by severity
    const bySeverity = await allAsync(
      `SELECT severity, COUNT(*) as count FROM alerts 
       WHERE device_id = ? AND timestamp >= ?
       GROUP BY severity`,
      [deviceId, cutoff]
    );

    res.json({
      total_alerts: total?.count || 0,
      by_type: byType,
      by_severity: bySeverity
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create device manually
app.post('/api/devices', async (req, res) => {
  try {
    const { device_id, device_name, mqtt_broker, mqtt_topic } = req.body;
    
    if (!device_id || !device_name) {
      return res.status(400).json({ error: 'device_id and device_name required' });
    }

    const existing = await getAsync('SELECT * FROM devices WHERE device_id = ?', [device_id]);
    if (existing) {
      return res.status(409).json({ error: 'Device already exists' });
    }

    await runAsync(
      `INSERT INTO devices (device_id, device_name, mqtt_broker, mqtt_topic, status) 
       VALUES (?, ?, ?, ?, ?)`,
      [device_id, device_name, mqtt_broker || '', mqtt_topic || '', 'offline']
    );

    const newDevice = { device_id, device_name, mqtt_broker, mqtt_topic, status: 'offline' };
    io.emit('device:created', newDevice);
    
    setDeviceCheckTimer(device_id);
    res.status(201).json(newDevice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update device name
app.put('/api/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { device_name } = req.body;
    
    if (!device_name) {
      return res.status(400).json({ error: 'device_name required' });
    }

    await runAsync(
      'UPDATE devices SET device_name = ?, updated_at = datetime("now") WHERE device_id = ?',
      [device_name, deviceId]
    );
    
    io.emit('device:updated', { device_id: deviceId, device_name: device_name });
    res.json({ success: true, device_name: device_name });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE device (cascades telemetry)
app.delete('/api/devices/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // Delete all telemetry for this device first
    await runAsync('DELETE FROM telemetry WHERE device_id = ?', [deviceId]);
    
    // Then delete device
    await runAsync('DELETE FROM devices WHERE device_id = ?', [deviceId]);
    
    io.emit('device:deleted', { device_id: deviceId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    mqtt: mqttClient.connected ? 'connected' : 'offline',
    database: 'sqlite3',
    timestamp: new Date().toISOString()
  });
});

// ============================================================
// START SERVER
// ============================================================
(async () => {
  await initializeDatabaseAsync();

  server.listen(PORT, async () => {
    console.log(`✅ Web Server running: http://localhost:${PORT}`);
    console.log(`💬 Socket.io ready for real-time updates`);
    console.log(`📊 Persistent storage: SQLite3 (telemetry.db)`);
    console.log(`📁 Excel Export: /api/export/:deviceId (With ADDRESS format)`);
    console.log(`🔄 Device offline timeout: 2 minutes`);
    console.log(`📱 API Endpoints:`);
    console.log(`   GET  /api/devices              - list all devices`);
    console.log(`   GET  /api/history/:deviceId    - history for device (device-isolated)`);
    console.log(`   GET  /api/stats/:deviceId      - stats for device`);
    console.log(`   GET  /api/export/:deviceId     - export to Excel (địa chỉ format, tên xe_ngày.xlsx)`);
    console.log(`   POST /api/devices              - create device`);
    console.log(`   PUT  /api/devices/:deviceId    - update device`);
    console.log(`   DELETE /api/devices/:deviceId  - delete device\n`);

    // Load all devices on startup
    try {
      const devices = await allAsync('SELECT * FROM devices');
      console.log(`📦 Loaded ${devices.length} device(s) from database`);
      
      // Set status check timers for all devices
      devices.forEach(device => {
        setDeviceCheckTimer(device.device_id);
        checkDeviceStatus(device.device_id);
      });
      
      console.log();
    } catch (error) {
      console.error('Error loading devices:', error.message);
    }
  });
})();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  
  Object.values(deviceTimers).forEach(timer => clearInterval(timer));
  
  server.close(() => {
    mqttClient.end();
    db.close(() => {
      console.log('✅ Database closed');
      process.exit(0);
    });
  });
});
