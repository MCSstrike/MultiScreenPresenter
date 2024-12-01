from flask import Flask, render_template, request, redirect, url_for

app = Flask(__name__)

# Shared state to control the number of proxies and the split ratio
view_config = {
    "proxy_count": 2,  # Default to 2 proxies
    "proxy_split": 50  # Default split: 50% / 50%
}


@app.route("/")
def home():
    return redirect(url_for("control"))


@app.route("/view")
def view():
    # Render the viewing page with the number of proxies and the split ratio
    proxy_count = view_config["proxy_count"]
    proxy_split = view_config["proxy_split"]
    return render_template("view.html", proxy_count=proxy_count, proxy_split=proxy_split)


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


if __name__ == "__main__":
    app.run(debug=True)