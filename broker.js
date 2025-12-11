const aedes = require('aedes')()
const server = require('net').createServer(aedes.handle)
const httpServer = require('http').createServer()
const ws = require('websocket-stream')
const port = 1883
const wsPort = 8888

// 1. Crear servidor TCP (Estándar MQTT)
server.listen(port, function () {
  console.log('✅ Broker MQTT corriendo en puerto TCP:', port)
})

// 2. Crear servidor WebSocket (Para el navegador)
ws.createServer({ server: httpServer }, aedes.handle)
httpServer.listen(wsPort, function () {
  console.log('✅ Broker MQTT (WebSockets) corriendo en puerto:', wsPort)
})

// Eventos informativos
aedes.on('client', function (client) {
  console.log('Cliente conectado:', client ? client.id : client)
})

aedes.on('publish', function (packet, client) {
  if (client) {
    // console.log('Mensaje:', packet.payload.toString(), 'en topic:', packet.topic)
  }
})