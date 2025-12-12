const express = require('express');
const http = require('http');
const ws = require('websocket-stream');
const aedes = require('aedes')();
const app = express();

// NECESARIO PARA QUE EL ESP32 PUEDA MANDAR DATOS
app.use(express.json());
app.use(express.text({ type: 'text/plain' })); // <- solo texto plano

const port = process.env.PORT || 8888;
app.use(express.static('public'));

const httpServer = http.createServer(app);
ws.createServer({ server: httpServer }, aedes.handle);

// --- VARIABLES DE ESTADO ---
let modoSeguridad = false;
let estadoAlarma = false;

// --- PUENTE HTTP PARA EL ESP32 ---

// 1. El ESP32 pregunta: "¿Debo sonar la alarma?"
app.get('/api/alarma', (req, res) => {
  // Forzamos respuesta como texto plano SIN saltos de línea
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(estadoAlarma ? 'ON' : 'OFF');
});

// 2. El ESP32 avisa: "¡Cambié el estado de la puerta!"
app.post('/api/puerta', (req, res) => {
  // Aseguramos que sea string limpia
  const estado = (typeof req.body === 'string' ? req.body : '').trim(); // <- quita \n \r espacios

  console.log('ESP32 reporta puerta:', estado);

  // Avisamos a la web por MQTT
  if (estado) {
    publicarEstado('casa/puertas', estado);
  }

  // Lógica de seguridad
  if (modoSeguridad && estado === 'ABIERTA') {
    estadoAlarma = true;
    publicarEstado('sistema/estado/alarma', 'ON');
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send('ok');
});

// --- LÓGICA MQTT (Para la Web) ---
aedes.on('publish', (packet, client) => {
  const topic = packet.topic;
  const mensaje = packet.payload.toString().trim(); // <- limpio por si llega con \n

  if (topic === 'sistema/control/seguridad') {
    modoSeguridad = (mensaje === 'ACTIVAR');
    publicarEstado('sistema/estado/seguridad', modoSeguridad ? 'ACTIVADO' : 'DESACTIVADO');
  }

  if (topic === 'sistema/control/alarma' && mensaje === 'APAGAR') {
    estadoAlarma = false;
    publicarEstado('sistema/estado/alarma', 'OFF');
  }
});

function publicarEstado(topic, payload) {
  aedes.publish({ topic, payload, qos: 0, retain: true }, () => {});
}

httpServer.listen(port, function () {
  console.log('Servidor Híbrido LISTO en puerto', port);
});