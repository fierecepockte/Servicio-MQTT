const express = require('express');
const http = require('http');
const ws = require('websocket-stream');
const aedes = require('aedes')();
const app = express();

// Configuración de Middlewares
app.use(express.json());
app.use(express.text({ type: '*/*' })); // Acepta texto de cualquier tipo para mayor compatibilidad
app.use(express.static('public'));

const port = process.env.PORT || 8888;
const httpServer = http.createServer(app);

// Crear el servidor WebSocket para MQTT (usado por la web)
ws.createServer({ server: httpServer }, aedes.handle);

// --- VARIABLES DE ESTADO ---
let modoSeguridad = false;
let estadoAlarma = false;

// --- UTILIDAD: Publicar en MQTT ---
function publicarEstado(topic, payload) {
    const mensaje = {
        topic: topic,
        payload: Buffer.from(payload), // Aedes prefiere buffers
        qos: 0,
        retain: true
    };
    aedes.publish(mensaje, (err) => {
        if (err) console.error('Error publicando:', err);
    });
}

// --- ENDPOINTS PARA EL ESP32 (Vía HTTP) ---

// 1. El ESP32 consulta si debe sonar
app.get('/api/alarma', (req, res) => {
    res.send(estadoAlarma ? 'ON' : 'OFF');
});

// 2. Manejo de Puerta y Ventana (Simplificado en una ruta dinámica o separadas)
app.post('/api/:dispositivo', (req, res) => {
    const dispositivo = req.params.dispositivo; // 'puerta' o 'ventana'
    const estado = req.body.toString().trim().toUpperCase();
    
    console.log(`Recibido HTTP: ${dispositivo} -> ${estado}`);

    if (dispositivo === 'puerta' || dispositivo === 'ventana') {
        const topic = `casa/${dispositivo}s`; // casa/puertas o casa/ventanas
        publicarEstado(topic, estado);

        // Lógica de Alarma
        if (modoSeguridad && estado === 'ABIERTA') {
            estadoAlarma = true;
            publicarEstado('sistema/estado/alarma', 'ON');
            console.log(`!!! ALARMA DISPARADA POR ${dispositivo.toUpperCase()} !!!`);
        }
    }

    res.send('ok');
});

// --- LÓGICA MQTT (Para la Web y ESP32 si usa MQTT) ---

// Escuchar todo lo que se publica en el broker
aedes.on('publish', function (packet, client) {
    if (client) { // Solo si el mensaje viene de un cliente (no del servidor interno)
        const topic = packet.topic;
        const mensaje = packet.payload.toString().trim().toUpperCase();

        console.log(`MQTT In: [${topic}] -> ${mensaje}`);

        // Control de Seguridad
        if (topic === 'sistema/control/seguridad') {
            modoSeguridad = (mensaje === 'ACTIVAR');
            publicarEstado('sistema/estado/seguridad', modoSeguridad ? 'ACTIVADO' : 'DESACTIVADO');
        }

        // Control de Alarma
        if (topic === 'sistema/control/alarma' && mensaje === 'APAGAR') {
            estadoAlarma = false;
            publicarEstado('sistema/estado/alarma', 'OFF');
        }
    }
});

httpServer.listen(port, function () {
    console.log('--- SERVIDOR INICIADO ---');
    console.log(`Puerto: ${port}`);
    console.log(`Rutas HTTP listas: /api/puerta y /api/ventana`);
});