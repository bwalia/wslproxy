import uuid
from flask import Flask
import socket
import consul

sock = socket.socket()
sock.bind(("", 0))
PORT = sock.getsockname()[1]
sock.close()

service_id = uuid.uuid4().hex
app = Flask(__name__)
consul = consul.Consul(host="localhost", port="8500")
consul.agent.service.register(
    "flask-app", service_id=service_id, port=PORT, tags=["master"]
)


@app.route("/")
def get_pid():
    return f"Service ID: {service_id}"


if __name__ == "__main__":
    app.run(port=PORT, host="0.0.0.0")
    consul.agent.service.deregister(service_id)