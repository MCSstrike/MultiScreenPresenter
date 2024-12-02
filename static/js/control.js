document.addEventListener("DOMContentLoaded", () => {
    const slider = document.getElementById('proxySplit');
    handleSliderInteraction(slider);

    const url1Input = document.getElementById("url1-input");
    const url2Input = document.getElementById("url2-input");

    url1Input.addEventListener("input", updateProxyUrls);
    url2Input.addEventListener("input", updateProxyUrls);

    url1Input.addEventListener("change", () => updateUrlInput(1));
    url2Input.addEventListener("change", () => updateUrlInput(2));

    // Initialize the state of URL inputs
    updateUrlInput(1); // Initialize URL 1
    updateUrlInput(2); // Initialize URL 2
});

function handleSliderInteraction(slider) {
    const value = parseInt(slider.value, 10);

    // Prevent slider from moving into invalid ranges
    if (value > 0 && value < 20) {
        slider.value = value < 10 ? 0 : 20; // Snap to 0 or 20
    } else if (value > 80 && value < 100) {
        slider.value = value < 90 ? 80 : 100; // Snap to 80 or 100
    }

    // Update the displayed value
    const sliderValue = document.getElementById("sliderValue");
    sliderValue.innerText = `${slider.value}%`;

    // Position the value display dynamically
    const percentage = (slider.value - slider.min) / (slider.max - slider.min);
    const offset = percentage * slider.offsetWidth - slider.offsetWidth / 2;
    sliderValue.style.left = `${slider.offsetWidth / 1.9 + offset}px`;

    // Change color dynamically in invalid ranges
    if ((value > 0 && value < 20) || (value > 80 && value < 100)) {
        slider.classList.add("gray");
    } else {
        slider.classList.remove("gray");
        lastValidValue = value; // Update last valid value for valid stops
    }

    // Dynamically update the size of the iframes
    const iframe1 = document.querySelector(".dual-proxy iframe:nth-child(1)");
    const iframe2 = document.querySelector(".dual-proxy iframe:nth-child(2)");
    if (iframe1 && iframe2) {
        iframe1.style.width = `${slider.value}%`;
        iframe2.style.width = `calc(100% - ${slider.value}%)`;
    }

    // Send the updated value to the server
    fetch("/update_split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy_split: slider.value }),
    })
        .then((response) => response.json())
        .catch((error) => console.error("Error updating proxy split:", error));
}

function updateUrlInput(urlNumber) {
    const dropdown = document.getElementById(`url${urlNumber}-dropdown`);
    const input = document.getElementById(`url${urlNumber}-input`);
    const selectedValue = dropdown.value;

    if (selectedValue === "matchMaker") {
        input.value = "http://localhost:5000/matchMaker";
        input.disabled = true; // Disable the input
    } else if (selectedValue === "timer") {
        input.value = "http://localhost:5000/timer"; // Clear the input for custom entry
        input.disabled = true; // Enable the input
    } else if (selectedValue === "google") {
        input.value = "http://google.com"; // Clear the input for custom entry
        input.disabled = true; // Enable the input
    } else if (selectedValue === "custom") {
        input.disabled = false; // Enable the input
    }
    updateProxyUrls();
}

function updateProxyUrls() {
    const url1 = document.getElementById("url1-input").value;
    const url2 = document.getElementById("url2-input").value;

    // Send the updated URLs to the server
    fetch("/update_urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url1, url2 }),
    })
        .then((response) => response.json())
        .then((data) => {
            console.log("URLs updated:", data);
            // Refresh the /view page in the iframe
            const viewIframe = document.getElementById("viewIframe");
            if (viewIframe) {
                // Add a cache-busting query parameter to force reload
                const cacheBuster = new Date().getTime();
                viewIframe.src = `/view?embedded=true&cache=${cacheBuster}`;
            }
        })
        .catch((error) => console.error("Error updating URLs:", error));
}

function controlTimer(action) {
    const timeInput = document.getElementById("setTimer");
    let timeLeft = parseInt(document.getElementById("setTimer").value, 10) || 600; // Default to 10 minutes
    let running = false;

    if (action === "start") {
        running = true;
    } else if (action === "pause") {
        running = false;
    } else if (action === "reset") {
        timeLeft = 600; // Reset to default
        running = false;
    }

    console.log("Sending timer state to server:", { time_left: timeLeft, running }); // Debug log

    // Send updated timer state to the server
    fetch("/update_timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_left: timeLeft, running: running }),
    })
        .then((response) => response.json())
        .then((data) => console.log("Timer state updated:", data))
        .catch((error) => console.error("Error updating timer:", error));
}

function setTimer() {
    const timeLeft = parseInt(document.getElementById("setTimer").value, 10) || 600;

    fetch("/update_timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time_left: timeLeft, running: false }),
    }).catch((error) => console.error("Error setting timer:", error));
}