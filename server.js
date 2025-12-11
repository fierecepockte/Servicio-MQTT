const express = require('express');
const http = require('http');
const ws = require('websocket-stream');
const aedes = require('aedes')();
const app = express();

// 1. Configuración del Servidor Web (Express)
const port = process.env.PORT || 8888;

// Servir los archivos de la carpeta 'public' como página web
app.use(express.static('public'));

const httpServer = http.createServer(app);

// 2. Conectar MQTT sobre WebSockets al mismo servidor HTTP
ws.createServer({ server: httpServer }, aedes.handle);

// --- EL CEREBRO DEL SISTEMA (Variables de Estado) ---
let modoSeguridad = false; // false = Desactivado, true = Activado
let estadoAlarma = false;  // false = Silencio, true = SONANDO

// 3. Lógica del Servidor MQTT
aedes.on('client', (client) => {
  console.log('Cliente conectado:', client ? client.id : client);
});

aedes.on('publish', (packet, client) => {
  const topic = packet.topic;
  const mensaje = packet.payload.toString();

  // Evitar bucles (mensajes del sistema)
  if (topic.startsWith('$SYS')) return;

  console.log(`[Recibido] ${topic}: ${mensaje}`);

  // --- LÓGICA DE CONTROL (El Cerebro) ---
  
  // A) Control desde la Interfaz Web (Usuario cambia modos)
  if (topic === 'sistema/control/seguridad') {
    modoSeguridad = (mensaje === 'ACTIVAR');
    console.log('Modo Seguridad cambiado a:', modoSeguridad);
    // Avisar a todos el nuevo estado
    publicarEstado('sistema/estado/seguridad', modoSeguridad ? 'ACTIVADO' : 'DESACTIVADO');
  }

  if (topic === 'sistema/control/alarma') {
    if (mensaje === 'APAGAR') {
      estadoAlarma = false;
      console.log('Alarma apagada manualmente');
      publicarEstado('sistema/estado/alarma', 'OFF');
    }
  }

  // B) Reacción a Sensores (Puertas/Ventanas)
  if (modoSeguridad && (topic === 'casa/puertas' || topic === 'casa/ventanas')) {
    if (mensaje === 'ABIERTA') {
      console.log('¡INTRUSO DETECTADO! Activando Alarma...');
      estadoAlarma = true;
      publicarEstado('sistema/estado/alarma', 'ON');
    }
  }
});

// Función auxiliar para que el servidor publique mensajes
function publicarEstado(topic, payload) {
  const packet = {
    topic: topic,
    payload: payload,
    qos: 0,
    retain: true // Importante: Retain para que los nuevos conectados sepan el estado
  };
  aedes.publish(packet, (err) => {
    if (err) console.error('Error publicando:', err);
  });
}

httpServer.listen(port, function () {
  console.log('Servidor Híbrido (Web + MQTT) corriendo en puerto', port);
});