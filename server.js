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
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send(estadoAlarma ? 'ON' : 'OFF');
});

// 2. El ESP32 avisa: "¡Cambié el estado de la PUERTA!"
app.post('/api/puerta', (req, res) => {
  const estado = (typeof req.body === 'string' ? req.body : '').trim();
  console.log('ESP32 reporta puerta:', estado);

  // Avisamos a la web por MQTT
  if (estado) {
    publicarEstado('casa/puertas', estado);
  }

  // Lógica de seguridad
  if (modoSeguridad && estado === 'ABIERTA') {
    estadoAlarma = true;
    publicarEstado('sistema/estado/alarma', 'ON');
    console.log("!!! ALARMA DISPARADA POR PUERTA !!!");
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send('ok');
});

// 3. El ESP32 avisa: "¡Cambié el estado de la VENTANA!" (NUEVO)
app.post('/api/ventana', (req, res) => {
  const estado = (typeof req.body === 'string' ? req.body : '').trim();
  console.log('ESP32 reporta ventana:', estado);

  // Avisamos a la web por MQTT
  if (estado) {
    publicarEstado('casa/ventanas', estado);
  }

  // Lógica de seguridad
  if (modoSeguridad && estado === 'ABIERTA') {
    estadoAlarma = true;
    publicarEstado('sistema/estado/alarma', 'ON');
    console.log("!!! ALARMA DISPARADA POR VENTANA !!!");
  }

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.send('ok');
});

// --- LÓGICA MQTT (Para la Web) ---
aedes.on('publish', (packet, client) => {
  const topic = packet.topic;
  // payload es un buffer, lo pasamos a string
  const mensaje = packet.payload.toString().trim(); 

  // Activar/Desactivar el sistema de seguridad desde la web
  if (topic === 'sistema/control/seguridad') {
    modoSeguridad = (mensaje === 'ACTIVAR');
    publicarEstado('sistema/estado/seguridad', modoSeguridad ? 'ACTIVADO' : 'DESACTIVADO');
    console.log('Modo seguridad:', modoSeguridad);
  }

  // Apagar la alarma manualmente desde la web
  if (topic === 'sistema/control/alarma' && mensaje === 'APAGAR') {
    estadoAlarma = false;
    publicarEstado('sistema/estado/alarma', 'OFF');
    console.log('Alarma apagada manualmente');
  }
});

function publicarEstado(topic, payload) {
  // qos: 0, retain: true para que si recargas la página veas el último estado
  aedes.publish({ topic, payload, qos: 0, retain: true }, () => {});
}

httpServer.listen(port, function () {
  console.log('Servidor Híbrido LISTO en puerto', port);
  console.log('Esperando datos de Puerta y Ventana...');
});