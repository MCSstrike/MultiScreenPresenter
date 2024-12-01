# Monkey-patch must happen first
# Monkey-patch must happen first
import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request, redirect, url_for
from flask_socketio import SocketIO, emit

app = Flask(__name__)
socketio = SocketIO(app)

# Shared state to control the number of proxies and the split ratio
view_config = {
    "proxy_count": 2,  # Default to 2 proxies
    "proxy_split": 50,  # Default split: 50% / 50%
    "url1": "http://localhost:5000/timer",  # Default URL for Proxy 1
    "url2": "http://localhost:5000/timer",  # Default URL for Proxy 2
}

# Timer state
timer_state = {
    "time_left": 600,  # Default 10 minutes (600 seconds)
    "running": False   # Timer is paused by default
}

@app.route("/")
def home():
    return redirect(url_for("control"))


@app.route("/view")
def view():
    # Render the viewing page with the number of proxies and the split ratio
    proxy_count = view_config["proxy_count"]
    proxy_split = view_config["proxy_split"]
    url1 = view_config["url1"]
    url2 = view_config["url2"]
    return render_template("view.html", proxy_count=proxy_count, proxy_split=proxy_split, url1=url1, url2=url2)


@app.route("/timer")
def timer():
    """Render the Timer Page."""
    return render_template("timer.html", time_left=timer_state["time_left"])


@app.route("/update_timer", methods=["POST"])
def update_timer():
    """Update the timer state."""
    data = request.get_json()
    timer_state["time_left"] = int(data.get("time_left", timer_state["time_left"]))
    timer_state["running"] = data.get("running", timer_state["running"])

    # Emit the timer state to all connected clients
    socketio.emit("update_timer", timer_state)
    return {"status": "success"}


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
        proxy_split=view_config["proxy_split"]
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

    # Notify clients of the updated split via WebSocket
    socketio.emit("update_split", {"proxy_split": proxy_split, "proxy_count": view_config["proxy_count"]})

    return {"status": "success"}


@app.route("/update_urls", methods=["POST"])
def update_urls():
    data = request.get_json()
    view_config["url1"] = data.get("url1", view_config["url1"])
    view_config["url2"] = data.get("url2", view_config["url2"])

    # Notify clients of updated URLs via WebSocket
    socketio.emit("update_urls", {"url1": view_config["url1"], "url2": view_config["url2"]})
    return {"status": "success"}


if __name__ == "__main__":
    socketio.run(app, debug=True, host="0.0.0.0", port=5000)
