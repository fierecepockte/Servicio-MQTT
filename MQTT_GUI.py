#!/usr/bin/env python3
import threading
import queue
import time
import tkinter as tk
from tkinter import ttk, messagebox
from tkinter.scrolledtext import ScrolledText

import paho.mqtt.client as mqtt


class MQTTGuiApp:
    def __init__(self, root):
        self.root = root
        self.root.title("MQTT Cliente - GUI")

        self.incoming = queue.Queue()
        self.client = None

        self._build_ui()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.root.after(100, self._process_incoming)

    def _build_ui(self):
        frm = ttk.Frame(self.root, padding=8)
        frm.grid(row=0, column=0, sticky="nsew")
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)

        # Connection frame
        conn = ttk.LabelFrame(frm, text="Conexión")
        conn.grid(row=0, column=0, sticky="ew")

        ttk.Label(conn, text="Broker:").grid(row=0, column=0, sticky="w")
        self.broker_var = tk.StringVar(value="localhost")
        ttk.Entry(conn, textvariable=self.broker_var, width=20).grid(row=0, column=1)

        ttk.Label(conn, text="Puerto:").grid(row=0, column=2, sticky="w")
        self.port_var = tk.IntVar(value=1883)
        ttk.Entry(conn, textvariable=self.port_var, width=6).grid(row=0, column=3)

        ttk.Label(conn, text="Client ID:").grid(row=0, column=4, sticky="w")
        self.clientid_var = tk.StringVar(value="mqtt-gui-client")
        ttk.Entry(conn, textvariable=self.clientid_var, width=18).grid(row=0, column=5)

        self.connect_btn = ttk.Button(conn, text="Conectar", command=self._connect_or_disconnect)
        self.connect_btn.grid(row=0, column=6, padx=6)

        # Subscribe / Publish frame
        sp = ttk.Frame(frm)
        sp.grid(row=1, column=0, sticky="nsew", pady=(8, 0))
        sp.columnconfigure(0, weight=1)
        sp.columnconfigure(1, weight=1)

        # Subscribe column
        subs = ttk.LabelFrame(sp, text="Suscribirse")
        subs.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        ttk.Label(subs, text="Tópico:").grid(row=0, column=0, sticky="w")
        self.sub_topic_var = tk.StringVar(value="#")
        ttk.Entry(subs, textvariable=self.sub_topic_var).grid(row=0, column=1, sticky="ew")
        ttk.Button(subs, text="Suscribir", command=self._subscribe_topic).grid(row=0, column=2, padx=4)

        ttk.Label(subs, text="Tópicos suscritos:").grid(row=1, column=0, columnspan=3, sticky="w", pady=(6, 0))
        self.topics_list = tk.Listbox(subs, height=6)
        self.topics_list.grid(row=2, column=0, columnspan=3, sticky="nsew")

        # Publish column
        pub = ttk.LabelFrame(sp, text="Publicar")
        pub.grid(row=0, column=1, sticky="nsew")
        ttk.Label(pub, text="Tópico:").grid(row=0, column=0, sticky="w")
        self.pub_topic_var = tk.StringVar(value="test/topic")
        ttk.Entry(pub, textvariable=self.pub_topic_var).grid(row=0, column=1, sticky="ew")
        ttk.Label(pub, text="QoS:").grid(row=0, column=2, sticky="w")
        self.qos_var = tk.IntVar(value=0)
        ttk.Combobox(pub, textvariable=self.qos_var, values=[0, 1, 2], width=3, state="readonly").grid(row=0, column=3)

        ttk.Label(pub, text="Mensaje:").grid(row=1, column=0, sticky="nw", pady=(6, 0))
        self.msg_text = tk.Text(pub, height=4, width=40)
        self.msg_text.grid(row=1, column=1, columnspan=3, sticky="ew", pady=(6, 0))
        ttk.Button(pub, text="Enviar", command=self._publish_message).grid(row=2, column=3, sticky="e", pady=(6, 0))

        # Messages area
        msgs = ttk.LabelFrame(frm, text="Mensajes entrantes")
        msgs.grid(row=2, column=0, sticky="nsew", pady=(8, 0))
        msgs.columnconfigure(0, weight=1)
        msgs.rowconfigure(0, weight=1)

        self.msg_area = ScrolledText(msgs, state="disabled", height=15)
        self.msg_area.grid(row=0, column=0, sticky="nsew")

        # Status
        self.status_var = tk.StringVar(value="Desconectado")
        ttk.Label(frm, textvariable=self.status_var).grid(row=3, column=0, sticky="w", pady=(6, 0))

    def _connect_or_disconnect(self):
        if self.client is None:
            self._connect()
        else:
            self._disconnect()

    def _connect(self):
        broker = self.broker_var.get()
        port = int(self.port_var.get())
        client_id = self.clientid_var.get() or None

        self.client = mqtt.Client(client_id=client_id)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect

        try:
            self.client.connect(broker, port, keepalive=60)
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo conectar: {e}")
            self.client = None
            return

        self.client.loop_start()
        self.connect_btn.config(text="Desconectar")
        self.status_var.set(f"Conectando a {broker}:{port}...")

    def _disconnect(self):
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception:
                pass
        self.client = None
        self.connect_btn.config(text="Conectar")
        self.status_var.set("Desconectado")

    # MQTT callbacks
    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.incoming.put(("__sys__", f"Conectado (rc={rc})", time.strftime('%H:%M:%S')))
            self.status_var.set("Conectado")
        else:
            self.incoming.put(("__sys__", f"Conexión fallida (rc={rc})", time.strftime('%H:%M:%S')))

    def _on_disconnect(self, client, userdata, rc):
        self.incoming.put(("__sys__", f"Desconectado (rc={rc})", time.strftime('%H:%M:%S')))
        self.status_var.set("Desconectado")
        self.connect_btn.config(text="Conectar")

    def _on_message(self, client, userdata, msg):
        try:
            payload = msg.payload.decode('utf-8')
        except Exception:
            payload = str(msg.payload)
        self.incoming.put((msg.topic, payload, time.strftime('%H:%M:%S')))

    # UI actions
    def _subscribe_topic(self):
        topic = self.sub_topic_var.get().strip()
        if not topic:
            return
        if self.client is None:
            messagebox.showwarning("Aviso", "Primero conecte al broker")
            return
        try:
            self.client.subscribe(topic)
            self.topics_list.insert(tk.END, topic)
            self.incoming.put(("__sys__", f"Suscrito a {topic}", time.strftime('%H:%M:%S')))
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo suscribir: {e}")

    def _publish_message(self):
        if self.client is None:
            messagebox.showwarning("Aviso", "Primero conecte al broker")
            return
        topic = self.pub_topic_var.get().strip()
        payload = self.msg_text.get("1.0", tk.END).strip()
        qos = int(self.qos_var.get())
        if not topic:
            messagebox.showwarning("Aviso", "Ingrese un tópico para publicar")
            return
        try:
            self.client.publish(topic, payload, qos=qos)
            self.incoming.put(("__sys__", f"Publicado en {topic}", time.strftime('%H:%M:%S')))
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo publicar: {e}")

    def _process_incoming(self):
        updated = False
        while not self.incoming.empty():
            topic, payload, ts = self.incoming.get()
            self.msg_area.config(state="normal")
            if topic == "__sys__":
                self.msg_area.insert(tk.END, f"[{ts}] {payload}\n")
            else:
                self.msg_area.insert(tk.END, f"[{ts}] {topic} -> {payload}\n")
            self.msg_area.see(tk.END)
            self.msg_area.config(state="disabled")
            updated = True
        self.root.after(100, self._process_incoming)

    def _on_close(self):
        if messagebox.askokcancel("Salir", "¿Cerrar la aplicación MQTT?"):
            if self.client:
                try:
                    self.client.loop_stop()
                    self.client.disconnect()
                except Exception:
                    pass
            self.root.destroy()


def main():
    root = tk.Tk()
    app = MQTTGuiApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
