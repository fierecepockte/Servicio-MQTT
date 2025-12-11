const mqtt = require('mqtt')

// Conectamos al puerto TCP (Local)
const client = mqtt.connect('mqtt://localhost:1883')

let estadoPuerta = 'CERRADA'
let estadoVentana = 'CERRADA'

client.on('connect', () => {
    console.log("🧠 Cerebro conectado y vigilando...")
    client.subscribe(['casa/puertas', 'casa/ventanas'])
})

client.on('message', (topic, message) => {
    const msg = message.toString().toUpperCase()
    console.log(`📩 Recibido [${topic}]: ${msg}`)

    if (topic === 'casa/puertas') estadoPuerta = msg
    if (topic === 'casa/ventanas') estadoVentana = msg

    tomarDecision()
})

function tomarDecision() {
    // Regla de Seguridad
    if (estadoPuerta === 'ABIERTA' && estadoVentana === 'ABIERTA') {
        console.log("🔴 PELIGRO: Casa vulnerable.")
        client.publish('casa/alarma', 'ACTIVADA: CIERRE TODO AHORA')
    } else {
        console.log("🟢 Estado seguro.")
        client.publish('casa/alarma', 'DESACTIVADA')
    }
}