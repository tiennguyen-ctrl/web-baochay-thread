'use strict';

// ── HIVEMQ CONFIG (from Node-RED flow) ────────────────────────────────────────
const MQTT_HOST     = 'wss://204e1cd42856497598802c289c184353.s1.eu.hivemq.cloud:8884/mqtt';
const MQTT_USERNAME = 'hivemq.webclient.1778922990654';
const MQTT_PASSWORD = '72*hjEd91GyHsWSi?,P&';
const MQTT_TOPIC    = 'sensor/#';

// ── ALERT THRESHOLDS (tính trên nhiệt độ/độ ẩm ĐÃ hiệu chỉnh hiển thị) ────────
const TEMP_WARN = 65;    // °C  – cảnh báo nhiệt độ cao (không còi)
const CO2_WARN  = 2000;  // ppm – cảnh báo CO2 cao (không còi)
const TEMP_FIRE = 70;    // °C  – ngưỡng xác nhận cháy (có còi)
const CO2_FIRE  = 3000;  // ppm – ngưỡng xác nhận cháy (có còi)

// ── HIỆU CHỈNH HIỂN THỊ (bù trừ do chưa có nguồn nhiệt/khói thực tế) ─────────
const TEMP_OFFSET = 30;  // °C  – cộng thêm vào nhiệt độ thực tế trước khi hiển thị
const HUM_OFFSET  = 63;  // %   – trừ đi khỏi độ ẩm thực tế trước khi hiển thị

// ── NODE REGISTRY ─────────────────────────────────────────────────────────────
// Maps MQTT payload.node_id → short element-key used in HTML IDs
const NODE_MAP = {
  'Router_H2':      'h2',
  'Node_ef7:c0c9':  'b6f',
  'Node_ac9d:b03':  'n3',
  'Node_1e2:612b':  'n4',
};

const NODE_KEYS      = ['h2', 'b6f', 'n3', 'n4'];
const MAX_CHART_PTS  = 60;
const OFFLINE_MS     = 10 * 60 * 1000; // 10 min – matches Node-RED trigger nodes

// ── STATE ─────────────────────────────────────────────────────────────────────
const charts      = {};
const lastUpdate  = {};   // key → timestamp (ms)
const latestData  = {};   // key → { temperature, co2 }

// ── CHART FACTORY ─────────────────────────────────────────────────────────────
function makeChart(canvasId) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Nhiệt Độ (°C)',
          data: [],
          borderColor: '#ff6b6b',
          backgroundColor: 'rgba(255, 107, 107, 0.07)',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'yLeft',
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'Độ Ẩm (%)',
          data: [],
          borderColor: '#4fc3f7',
          backgroundColor: 'rgba(79, 195, 247, 0.07)',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'yLeft',
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'CO₂ (ppm)',
          data: [],
          borderColor: '#ce93d8',
          backgroundColor: 'rgba(206, 147, 216, 0.07)',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'yRight',
          pointRadius: 0,
          pointHoverRadius: 5,
        },
        {
          label: 'TVOC (ppb)',
          data: [],
          borderColor: '#ffb74d',
          backgroundColor: 'rgba(255, 183, 77, 0.07)',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'yRight',
          pointRadius: 0,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#6a6a90', font: { size: 11 }, boxWidth: 12, padding: 10 },
        },
      },
      scales: {
        x: {
          ticks: { color: '#555570', maxTicksLimit: 7, font: { size: 10 } },
          grid:  { color: 'rgba(255,255,255,0.04)' },
          border:{ color: 'rgba(255,255,255,0.06)' },
        },
        yLeft: {
          type: 'linear',
          position: 'left',
          min: 0,
          max: 100,
          ticks: { color: '#aaaacc', font: { size: 10 }, stepSize: 20 },
          grid:  { color: 'rgba(255,255,255,0.04)' },
          border:{ color: 'rgba(255,255,255,0.06)' },
          title: { display: true, text: '°C / %', color: '#aaaacc', font: { size: 10 } },
        },
        yRight: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 5000,
          ticks: { color: '#aaaacc', font: { size: 10 }, stepSize: 1000 },
          grid:  { drawOnChartArea: false },
          border:{ color: 'rgba(255,255,255,0.06)' },
          title: { display: true, text: 'ppm / ppb', color: '#aaaacc', font: { size: 10 } },
        },
      },
    },
  });
}

NODE_KEYS.forEach(key => {
  charts[key] = makeChart(`chart-${key}`);
});

// ── CHART UPDATE ──────────────────────────────────────────────────────────────
function pushPoint(key, temp, hum, co2, tvoc) {
  const label = new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const chart = charts[key];
  chart.data.labels.push(label);
  chart.data.datasets[0].data.push(temp);
  chart.data.datasets[1].data.push(hum);
  chart.data.datasets[2].data.push(co2);
  chart.data.datasets[3].data.push(tvoc);

  if (chart.data.labels.length > MAX_CHART_PTS) {
    chart.data.labels.shift();
    chart.data.datasets[0].data.shift();
    chart.data.datasets[1].data.shift();
    chart.data.datasets[2].data.shift();
    chart.data.datasets[3].data.shift();
  }
  chart.update();
}

// ── DOM HELPERS ───────────────────────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function setOnline(key, lastSeen) {
  const badge = el(`badge-${key}`);
  badge.textContent = 'ONLINE';
  badge.className   = 'status-badge online';
  el(`seen-${key}`).textContent = lastSeen || new Date().toLocaleString('vi-VN');
  lastUpdate[key] = Date.now();
}

function setOffline(key) {
  const badge = el(`badge-${key}`);
  badge.textContent = 'OFFLINE';
  badge.className   = 'status-badge offline';
  el(`seen-${key}`).textContent = 'OFFLINE';
  el(`temp-${key}`).textContent = '--';
  el(`hum-${key}`).textContent  = '--';
  el(`co2-${key}`).textContent  = '--';
  el(`tvoc-${key}`).textContent = '--';
  ['temp', 'co2'].forEach(f => {
    el(`${f}-${key}`).classList.remove('alert');
  });
}

// ── AUDIO UNLOCK (màn hình khởi động) ────────────────────────────────────────
let audioUnlocked = false;
const alarmEl     = el('alarm-sound');
const statusEl    = el('system-status');
const statusText  = el('status-text');

el('start-btn').addEventListener('click', () => {
  // Phát rồi dừng ngay để unlock audio context trong trình duyệt
  alarmEl.play().then(() => { alarmEl.pause(); alarmEl.currentTime = 0; }).catch(() => {});
  audioUnlocked = true;
  el('start-overlay').style.display = 'none';
});

function checkAlerts() {
  let maxLevel  = 0;
  let hasLevel1 = false; // có ít nhất 1 node chỉ nhiệt độ cao
  let hasLevel2 = false; // có ít nhất 1 node chỉ CO2 cao

  Object.values(latestData).forEach(d => {
    const t = d.temperature;
    const c = d.co2;
    let nodeLevel = 0;

    if      (t > TEMP_FIRE && c > CO2_FIRE)   nodeLevel = 4;
    else if (t > TEMP_WARN && c > CO2_WARN)   nodeLevel = 3;
    else if (t > TEMP_WARN && c <= CO2_WARN)  nodeLevel = 1;
    else if (c > CO2_WARN  && t <= TEMP_WARN) nodeLevel = 2;

    if (nodeLevel === 1) hasLevel1 = true;
    if (nodeLevel === 2) hasLevel2 = true;
    if (nodeLevel > maxLevel) maxLevel = nodeLevel;
  });

  // Mức 1+2: có node nhiệt độ cao VÀ node CO2 cao nhưng chưa có node mức 3/4
  const combined = (maxLevel <= 2 && hasLevel1 && hasLevel2);

  const STATES = {
    0:  { text: 'HỆ THỐNG AN TOÀN',                   cls: 'safe',      body: '',           sound: false },
    1:  { text: 'CẢNH BÁO: NHIỆT ĐỘ CAO',             cls: 'warn-temp', body: '',           sound: false },
    2:  { text: 'CẢNH BÁO: NỒNG ĐỘ CO₂ CAO',          cls: 'warn-co2',  body: '',           sound: false },
    12: { text: 'CẢNH BÁO: NHIỆT ĐỘ CAO & CO₂ CAO',   cls: 'warn-both', body: '',           sound: false },
    3:  { text: 'CẢNH BÁO: NGUY CƠ CHÁY!',            cls: 'danger',    body: 'risk-alert', sound: true  },
    4:  { text: 'CẢNH BÁO: CÓ CHÁY!',                 cls: 'fire',      body: 'fire-alert', sound: true  },
  };

  const stateKey = combined ? 12 : maxLevel;
  const s = STATES[stateKey];

  statusText.textContent = s.text;
  statusEl.className     = `system-status ${s.cls}`;

  document.body.classList.remove('risk-alert', 'fire-alert');
  if (s.body) document.body.classList.add(s.body);

  if (s.sound) {
    if (audioUnlocked && alarmEl.paused) alarmEl.play().catch(() => {});
  } else {
    if (!alarmEl.paused) { alarmEl.pause(); alarmEl.currentTime = 0; }
  }
}

// ── MQTT CLIENT ───────────────────────────────────────────────────────────────
const connBadge = el('connection-status');

const client = mqtt.connect(MQTT_HOST, {
  clientId:        'webui_' + Math.random().toString(16).slice(2, 10),
  username:        MQTT_USERNAME,
  password:        MQTT_PASSWORD,
  clean:           true,
  reconnectPeriod: 5000,
  connectTimeout:  30000,
});

client.on('connect', () => {
  console.log('[MQTT] Connected to HiveMQ Cloud');
  connBadge.textContent = 'KẾT NỐI';
  connBadge.className   = 'conn-badge connected';
  client.subscribe(MQTT_TOPIC, { qos: 0 }, err => {
    if (err) console.error('[MQTT] Subscribe failed:', err);
    else     console.log('[MQTT] Subscribed:', MQTT_TOPIC);
  });
});

client.on('message', (topic, payload) => {
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    console.warn('[MQTT] Bad JSON on topic:', topic);
    return;
  }

  console.log('[MQTT]', topic, data);

  const key = NODE_MAP[data.node_id];
  if (!key) {
    console.warn('[MQTT] Unknown node_id:', data.node_id);
    return;
  }

  // Hiệu chỉnh hiển thị: nhiệt độ +30°C, độ ẩm -63% (xem TEMP_OFFSET/HUM_OFFSET)
  const temp = parseFloat(((data.temperature || 0) + TEMP_OFFSET).toFixed(1));
  const hum  = parseFloat(((data.humidity    || 0) - HUM_OFFSET).toFixed(1));
  const co2  = Math.round(data.co2  || 0);
  const tvoc = Math.round(data.tvoc || 0);

  // Update metric values
  el(`temp-${key}`).textContent = temp;
  el(`hum-${key}`).textContent  = hum;
  el(`co2-${key}`).textContent  = co2;
  el(`tvoc-${key}`).textContent = tvoc;

  // Highlight ô giá trị khi vượt ngưỡng cảnh báo
  el(`temp-${key}`).classList.toggle('alert', temp > TEMP_WARN);
  el(`co2-${key}`).classList.toggle('alert',  co2  > CO2_WARN);

  // Store latest for alert evaluation
  latestData[key] = { temperature: temp, co2 };

  setOnline(key, data.last_seen);
  pushPoint(key, temp, hum, co2, tvoc);
  checkAlerts();
});

client.on('error',     err => {
  console.error('[MQTT] Error:', err);
  connBadge.textContent = 'LỖI KẾT NỐI';
  connBadge.className   = 'conn-badge error';
});

client.on('reconnect', () => {
  connBadge.textContent = 'Đang kết nối lại...';
  connBadge.className   = 'conn-badge connecting';
});

client.on('offline', () => {
  connBadge.textContent = 'MẤT KẾT NỐI';
  connBadge.className   = 'conn-badge error';
});

// ── OFFLINE WATCHDOG (checks every 30s, threshold = 10 min) ──────────────────
setInterval(() => {
  const now = Date.now();
  NODE_KEYS.forEach(key => {
    if (lastUpdate[key] && now - lastUpdate[key] > OFFLINE_MS) {
      setOffline(key);
      delete latestData[key];
      checkAlerts();
    }
  });
}, 30_000);
