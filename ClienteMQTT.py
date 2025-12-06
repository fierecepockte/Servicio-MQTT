import paho.mqtt.client as mqtt

broker = "localhost"
port = 1883
topic = "casa/piso1/ventanas"
topic2 = "casa/piso1/puertas"

def on_connect(client, userdata, flags, rc):
    print("Conectado con el código de resultado: " + str(rc))
    ventanas = "no closed"
    client.publish(topic, str(ventanas))
    puertas = "closed"
    client.publish(topic2, str(puertas))

client = mqtt.Client()
client.on_connect = on_connect

client.connect(broker, port, 60)

client.loop_forever()
