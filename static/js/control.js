document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    const slider = document.getElementById('proxySplit');
    const sliderValue = document.getElementById("sliderValue");

    // Fetch the current slider value from the server when the page loads
    fetch("/get_current_split")
        .then(response => response.json())
        .then(data => {
            slider.value = data.proxy_split;
            handleSliderInteraction(slider);
        })
        .catch(error => console.error("Error fetching current proxy split:", error
    ));

    // Fetch the current URLs from the server when the page loads
    fetch("/get_current_urls")
        .then(response => response.json())
        .then(data => {
            setDropdownValue("url1", data.url1);
            setDropdownValue("url2", data.url2);
        })
        .catch(error => console.error("Error fetching current URLs:", error
    ));

    startButton.addEventListener("click", () => {
        fetch("/control_timer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ action: "start" })
        });
    });

    // Function to set the timer
    function setTimer(event) {
        event.preventDefault(); // Prevent form submission
        const timeInput = document.getElementById("setTimerInput");
        const timeInSeconds = parseInt(timeInput.value, 10);
        socket.emit("control_timer", { action: "set", time: timeInSeconds });
    }

    // Event listener for the set timer button
    const setTimerButton = document.getElementById("setTimerButton");
    setTimerButton.addEventListener("click", setTimer);

    // Function to set the mode
    function setMode(event) {
        const modeSelect = document.getElementById("modeSelect");
        const selectedMode = modeSelect.value;
        socket.emit("control_mode", { mode: selectedMode });
    }

    // Event listener for the mode dropdown
    const modeSelect = document.getElementById("modeSelect");
    modeSelect.addEventListener("change", setMode);

    // Listen for refresh URL 1 event
    socket.on("refresh_url1", (data) => {
        const iframe1 = document.querySelector(".dual-proxy iframe:nth-child(1)");
        if (iframe1) {
            iframe1.src = data.url1;
        }
    });

    // Listen for refresh URL 2 event
    socket.on("refresh_url2", (data) => {
        const iframe2 = document.querySelector(".dual-proxy iframe:nth-child(3)");
        if (iframe2) {
            iframe2.src = data.url2;
        }
    });

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

const websites = [
    { name: "Match Maker", value: "matchMaker", url: "http://localhost:5000/matchMaker" },
    { name: "Timer", value: "timer", url: "http://localhost:5000/timer" },
    { name: "BAP Tender", value: "baptender", url: "http://baptender.com" },
    { name: "BAP Tender Graph", value: "baptendergraph", url: "http://baptender.com/graph" },
    { name: "Google", value: "google", url: "http://google.com" },
    { name: "Custom", value: "custom", url: "" }
];

function populateDropdowns() {
    const dropdown1 = document.getElementById("url1-dropdown");
    const dropdown2 = document.getElementById("url2-dropdown");

    websites.forEach(site => {
        const option1 = document.createElement("option");
        option1.value = site.value;
        option1.textContent = site.name;
        dropdown1.appendChild(option1);

        const option2 = document.createElement("option");
        option2.value = site.value;
        option2.textContent = site.name;
        dropdown2.appendChild(option2);
    });
}

function refreshUrl(urlNumber) {
    const socket = io(); // Initialize WebSocket connection

    if (urlNumber === 1) {
        socket.emit("refresh_url", { url: "url1" });
    } else if (urlNumber === 2) {
        socket.emit("refresh_url", { url: "url2" });
    }
}

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
    } else if (selectedValue === "baptender") {
        input.value = "http://baptender.com"; // Clear the input for custom entry
    } else if (selectedValue === "baptendergraph") {
        input.value = "http://baptender.com/graph"; // Clear the input for custom entry
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

function setDropdownValue(urlNumber, url) {
    const dropdown = document.getElementById(`url${urlNumber}-dropdown`);
    const input = document.getElementById(`url${urlNumber}-input`);

    const site = websites.find(site => site.url === url);
    if (site) {
        dropdown.value = site.value;
        input.value = site.url;
        input.disabled = site.value !== "custom";
    } else {
        dropdown.value = "custom";
        input.value = url;
        input.disabled = false;
    }
}