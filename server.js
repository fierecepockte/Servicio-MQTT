const express = require('express');
const http = require('http');
const ws = require('websocket-stream');
const aedes = require('aedes')();
const app = express();

// --- CONFIGURACIÓN CLAVE PARA QUE EL ESP32 NO FALLE ---
// Esto obliga al servidor a leer SIEMPRE el cuerpo del mensaje como texto.
// type: '*/*' atrapa cualquier cosa que mande el ESP32.
app.use(express.text({ type: '*/*' })); 
app.use(express.static('public'));

const port = process.env.PORT || 8888;
const httpServer = http.createServer(app);

// Servidor MQTT sobre WebSocket (para tu web)
ws.createServer({ server: httpServer }, aedes.handle);

// --- VARIABLES DE ESTADO ---
let modoSeguridad = false;
let estadoAlarma = false;

// --- FUNCIÓN PARA PUBLICAR EN MQTT ---
function publicarEstado(topic, payload) {
    const mensaje = {
        topic: topic,
        payload: Buffer.from(payload),
        qos: 0,
        retain: true
    };
    aedes.publish(mensaje, (err) => {
        if (err) console.error('Error publicando:', err);
    });
}

// ======================================================
//             RUTAS API (COMUNICACIÓN CON ESP32)
// ======================================================

// 1. EL ESP32 PREGUNTA: ¿Debo sonar la alarma?
app.get('/api/alarma', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(estadoAlarma ? 'ON' : 'OFF');
});

// 2. RUTA MÁGICA: Sirve para PUERTA y VENTANA al mismo tiempo
// El ESP32 manda a: /api/puerta  -> dispositivo = "puerta"
// El ESP32 manda a: /api/ventana -> dispositivo = "ventana"
app.post('/api/:dispositivo', (req, res) => {
    
    // Capturamos el nombre (puerta o ventana)
    const dispositivo = req.params.dispositivo.toLowerCase();
    
    // Capturamos el estado y limpiamos basura (espacios, comillas, etc)
    let estado = req.body;
    if (typeof estado !== 'string') {
        estado = JSON.stringify(estado);
    }
    estado = estado.replace(/"/g, '').trim().toUpperCase(); // Deja solo "ABIERTA" o "CERRADA"

    // LOG PARA VERIFICAR QUE LLEGA EL DATO
    console.log(`[RECIBIDO] Dispositivo: ${dispositivo} | Estado: ${estado}`);

    // Validamos que sea uno de los tuyos
    if (dispositivo === 'puerta' || dispositivo === 'ventana') {
        
        // Creamos el topic automáticamente añadiendo una "s" al final
        // puerta -> casa/puertas
        // ventana -> casa/ventanas
        const topic = `casa/${dispositivo}s`;

        // 1. PUBLICAR A LA WEB
        publicarEstado(topic, estado);
        console.log(`   -> Publicado en topic: ${topic}`);

        // 2. LÓGICA DE SEGURIDAD
        if (modoSeguridad && estado === 'ABIERTA') {
            estadoAlarma = true;
            publicarEstado('sistema/estado/alarma', 'ON');
            console.log(`   !!! ALARMA ACTIVADA POR ${dispositivo.toUpperCase()} !!!`);
        }
    } else {
        console.log(`   [?] Dispositivo desconocido: ${dispositivo}`);
    }

    res.send('ok');
});

// ======================================================
//             LÓGICA MQTT (COMUNICACIÓN CON WEB)
// ======================================================

aedes.on('publish', function (packet, client) {
    if (client) { // Solo mensajes que vienen de clientes externos (la web)
        const topic = packet.topic;
        const mensaje = packet.payload.toString().trim();

        // Activar/Desactivar Seguridad
        if (topic === 'sistema/control/seguridad') {
            modoSeguridad = (mensaje === 'ACTIVAR');
            publicarEstado('sistema/estado/seguridad', modoSeguridad ? 'ACTIVADO' : 'DESACTIVADO');
            console.log(`[SISTEMA] Modo Seguridad: ${modoSeguridad}`);
        }

        // Apagar Alarma Manualmente
        if (topic === 'sistema/control/alarma' && mensaje === 'APAGAR') {
            estadoAlarma = false;
            publicarEstado('sistema/estado/alarma', 'OFF');
            console.log(`[SISTEMA] Alarma apagada manualmente`);
        }
    }
});

httpServer.listen(port, function () {
    console.log('------------------------------------------------');
    console.log('   SERVIDOR LISTO - PUERTO ' + port);
    console.log('   Rutas activas: /api/puerta y /api/ventana');
    console.log('------------------------------------------------');
});