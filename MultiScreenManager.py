# Monkey-patch must happen first
import eventlet
eventlet.monkey_patch()

# Import flask modules
from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, emit
import time

# Initialise Flask app and SocketIO
app = Flask(__name__)
socketio = SocketIO(app)

# Initialises the view_config options
view_config = {
    "proxy_count": 2,                      # Default to 2 proxies
    "proxy_split": 50,                     # Default split: 50% / 50%
    "url1_name": "timer", # Default URL for Proxy 1
    "url1": "http://localhost:5000/timer", # Default URL for Proxy 1
    "url2_name": "timer",  # Default URL for Proxy 2
    "url2": "http://localhost:5000/timer"  # Default URL for Proxy 2
}

# Default timer state
timer_state = {
    "duration": 600,  # Default 10 minutes (600 seconds)
    "running": False,   # Timer is paused by default
    "mode": "clock"    # Default mode
}

# root URL rules
@app.route("/")
def home():
    """
    Redirects root URL to the control page
    """
    return redirect(url_for("view"))

# /view page rules
@app.route("/view")
def view():
    """
    Renders the view page with the number of proxies, the split ratio, and the URLs.
    """
    proxy_count = view_config["proxy_count"]
    proxy_split = view_config["proxy_split"]
    url1_name = request.args.get("url1_name", view_config["url1_name"])
    url1 = request.args.get("url1", view_config["url1"])
    url2_name = request.args.get("url2_name", view_config["url2_name"])
    url2 = request.args.get("url2", view_config["url2"])

    # Update the view_config with the new URLs and names if provided
    view_config["url1_name"] = url1_name
    view_config["url1"] = url1
    view_config["url2_name"] = url2_name
    view_config["url2"] = url2

    return render_template(
        "view.html",
        proxy_count=proxy_count,
        proxy_split=proxy_split,
        url1_name=url1_name,
        url1=url1,
        url2_name=url2_name,
        url2=url2
    )

# /timer page rules
@app.route("/timer")
def timer():
    """
    Render the Timer Page.
    """
    return render_template(
        "timer.html",
        duration=timer_state["duration"],
        mode=timer_state["mode"],
        running=timer_state["running"],
        start_time=timer_state.get("start_time", 0.0)
    )

# /update_timer page rules
@app.route("/update_timer", methods=["POST"])
def update_timer():
    """
    Update the timer state (time left and running status) based on input data.
    Broadcast the updated state to all connected clients.
    """
    # Emit updated state to all clients
    socketio.emit("update_timer", {
        "duration": timer_state["duration"],
        "running": timer_state["running"]
    })
    print("Timer update emitted via WebSocket")
    return {"status": "success"}


@socketio.on("connect")
def handle_connect():
    print("Client connected")


@socketio.on("disconnect")
def handle_disconnect():
    print("Client disconnected")


@app.route("/control", methods=["GET", "POST"])
def control():
    if request.method == "POST":
        # Get the slider value and update the state
        proxy_split = int(request.form.get("proxy_split", 50))
        view_config["proxy_split"] = proxy_split

        # Adjust the number of proxies based on the slider value
        if proxy_split == 0:
            view_config["proxy_count"] = 1  # Show only the second proxy
        elif proxy_split == 100:
            view_config["proxy_count"] = 1  # Show only the first proxy
        else:
            view_config["proxy_count"] = 2  # Show both proxies with a split

    # Render the control page
    return render_template(
        "control.html",
        proxy_count=view_config["proxy_count"],
        proxy_split=view_config["proxy_split"],
        mode=timer_state["mode"] # Pass the current mode to the template
    )


@app.route("/update_split", methods=["POST"])
def update_split():
    data = request.get_json()
    proxy_split = int(data.get("proxy_split", 50))
    view_config["proxy_split"] = proxy_split

    # Adjust the number of proxies based on the slider value
    if proxy_split == 0:
        view_config["proxy_count"] = 1  # Show only the second proxy
    elif proxy_split == 100:
        view_config["proxy_count"] = 1  # Show only the first proxy
    else:
        view_config["proxy_count"] = 2  # Show both proxies with a split

    # Notify clients of the updated split and URLs via WebSocket
    socketio.emit("update_split", {
        "proxy_split": proxy_split,
        "proxy_count": view_config["proxy_count"],
        "url1": view_config["url1"],
        "url2": view_config["url2"]
    })

    return {"status": "success", "url1": view_config["url1"], "url2": view_config["url2"]}


@app.route("/get_current_split", methods=["GET"])
def get_current_split():
    return {"proxy_split": view_config["proxy_split"]}


@app.route("/update_urls", methods=["POST"])
def update_urls():
    data = request.get_json()
    url1 = data.get("url1")
    url1_name = data.get("url1_name")
    url2 = data.get("url2")
    url2_name = data.get("url2_name")

    view_config["url1_name"] = url1_name
    view_config["url2_name"] = url2_name

    if url1 != view_config["url1"]:
        view_config["url1"] = url1
        socketio.emit("update_urls", {"url1": view_config["url1"]})

    if url2 != view_config["url2"]:
        view_config["url2"] = url2
        socketio.emit("update_urls", {"url2": view_config["url2"]})

    return {"status": "success"}


@socketio.on("refresh_url")
def handle_refresh_url(data):
    url = data.get("url")
    if url == "url1":
        socketio.emit("update_urls", {"url1": view_config["url1"]})
    elif url == "url2":
        socketio.emit("update_urls", {"url2": view_config["url2"]})


@app.route("/get_current_urls", methods=["GET"])
def get_current_urls():
    return {
        "url1": view_config["url1"],
        "url1_name": view_config["url1_name"],
        "url2": view_config["url2"],
        "url2_name": view_config["url2_name"]
    }


@socketio.on("control_timer")
def handle_control_timer(data):
    action = data.get("action")
    if action == "start":
        if not timer_state["running"]:
            timer_state["running"] = True
            timer_state["start_time"] = time.monotonic()
    elif action == "pause":
        if timer_state["running"]:
            elapsed_time = time.monotonic() - timer_state["start_time"]
            timer_state["duration"] -= int(elapsed_time)
            timer_state["running"] = False
    elif action == "reset":
        timer_state["duration"] = 0
        timer_state["running"] = False
        timer_state["start_time"] = 0.0
    elif action == "set":
        timer_state["duration"] = data.get("time", 0)
        timer_state["running"] = False
        timer_state["start_time"] = 0.0

    socketio.emit("update_timer", {
        "duration": timer_state["duration"],
        "running": timer_state["running"]
    })


@socketio.on("control_mode")
def handle_control_mode(data):
    selected_mode = data.get("mode")
    timer_state["mode"] = selected_mode  # Store the selected mode
    socketio.emit("update_mode", {"mode": selected_mode})


@app.route("/get_current_mode", methods=["GET"])
def get_current_mode():
    return {"mode": timer_state["mode"]}


if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)
