document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    const slider = document.getElementById('proxySplit');
    const sliderValue = document.getElementById("sliderValue");

    const modeSelect = document.getElementById("modeSelect");
    const setTimerButton = document.getElementById("setTimerButton");
    const startButton = document.getElementById("startButton");
    const pauseButton = document.getElementById("pauseButton");
    const resetButton = document.getElementById("resetButton");
    timeInput = document.getElementById("timeInput");
    timeInput.value = "00:00:00";

    // Fetch the current slider value from the server when the page loads
    fetch("/get_current_split")
        .then(response => response.json())
        .then(data => {
            slider.value = data.proxy_split;
            handleSliderInteraction(slider);
        })
        .catch(error => console.error("Error fetching current proxy split:", error
    ));

    // Fetch the current mode from the server when the page loads
    fetch("/get_current_mode")
        .then(response => response.json())
        .then(data => {
            modeSelect.value = data.mode;
            handleModeChange();
        })
        .catch(error => console.error("Error fetching current mode:", error
    ));

    // Function to set the mode
    function setMode(event) {
        const selectedMode = modeSelect.value;
        socket.emit("control_mode", { mode: selectedMode });
        socket.emit("control_timer", { action: "reset" });
        handleModeChange();
    }

    // Function to handle mode change
    function handleModeChange() {
        const selectedMode = modeSelect.value;
        const isClockMode = selectedMode === "clock";
        const isCountUpMode = selectedMode === "countup";
        const isCountDownMode = selectedMode === "countdown";

        timeInput.disabled = isClockMode || isCountUpMode;
        setTimerButton.disabled = isClockMode || isCountUpMode;
        startButton.disabled = isClockMode;
        pauseButton.disabled = isClockMode;
        resetButton.disabled = isClockMode || isCountDownMode;
    }

    // Event listener for the mode dropdown
    modeSelect.addEventListener("change", setMode);

    // Function to fetch current URLs from the server
    async function fetchCurrentUrls() {
        try {
            const response = await fetch("/get_current_urls");
            const data = await response.json();
            const url1Name = data.url1_name;
            const url1 = data.url1;
            const url2Name = data.url2_name;
            const url2 = data.url2;

            // Set the dropdown values based on the URL names and values
            setDropdownValue(1, url1Name, url1);
            setDropdownValue(2, url2Name, url2);
        } catch (error) {
            console.error("Error fetching current URLs:", error);
        }
    }

    // Fetch current URLs when the page loads
    fetchCurrentUrls();

    startButton.addEventListener("click", (event) => {
        event.preventDefault(); // Prevent form submission
        socket.emit("control_timer", { action: "start" });
    });

    // Function to set the timer
    function setTimer(event) {
        event.preventDefault(); // Prevent form submission

        //const timeInSeconds = convertToSeconds(timeInput.value);

        // Parse the time in HH:MM:SS format into seconds
        const [hours, minutes, seconds] = timeInputValue.split(":").map(Number);
        const timeInSeconds = (hours * 3600) + (minutes * 60) + (seconds || 0);

        socket.emit("control_timer", { action: "set", time: timeInSeconds });
    }

    // Event listener for the set timer button
    setTimerButton.addEventListener("click", setTimer);

    // Event listener for the start button
    startButton.addEventListener("click", (event) => {
        event.preventDefault(); // Prevent form submission
        socket.emit("control_timer", { action: "start" });
    });

    // Event listener for the pause button
    pauseButton.addEventListener("click", (event) => {
        event.preventDefault(); // Prevent form submission
        socket.emit("control_timer", { action: "pause" });
    });

    // Event listener for the reset button
    resetButton.addEventListener("click", (event) => {
        event.preventDefault(); // Prevent form submission
        socket.emit("control_timer", { action: "reset" });
    });

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
    //updateUrlInput(1); // Initialize URL 1
    //updateUrlInput(2); // Initialize URL 2
});

const websites = [
    { name: "Match Maker", value: "matchMaker", url: "http://localhost:5000/matchMaker" },
    { name: "Timer", value: "timer", url: "http://localhost:5000/timer" },
    { name: "BAP Tender", value: "baptender", url: "http://baptender.com" },
    { name: "BAP Tender Graph", value: "baptendergraph", url: "http://baptender.com/graph" },
    { name: "Google", value: "google", url: "http://google.com" },
    { name: "Custom", value: "custom", url: "" }
];

let timeInputValue = "00:00:00";

function formatTimeInput(input) {
    // Get only numeric characters from the input
    let value = input.value.replace(/\D/g, "");

    // Limit to 6 digits (HHMMSS)
    value = value.slice(-6);

    // Pad with leading zeros if necessary
    value = value.padStart(6, "0");

    // Split into hours, minutes, and seconds
    const hours = value.slice(0, 2);
    const minutes = value.slice(2, 4);
    const seconds = value.slice(4, 6);

    // Update the input with formatted HH:MM:SS
    input.value = `${hours}:${minutes}:${seconds}`;
    timeInputValue = input.value;
}

// Function to convert HH:MM:SS to seconds
function convertToSeconds(timeString) {
    const [hours, minutes, seconds] = timeString.split(":").map(Number);
    return (hours * 3600) + (minutes * 60) + (seconds || 0);
}

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
    const url1Name = document.getElementById("url1-dropdown").value;
    const url1 = document.getElementById("url1-input").value;
    const url2Name = document.getElementById("url2-dropdown").value;
    const url2 = document.getElementById("url2-input").value;

    // Send the updated URLs and names to the server
    fetch("/update_urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url1_name: url1Name, url1, url2_name: url2Name, url2 }),
    })
        .then((response) => response.json())
        .then((data) => {
            // Refresh the /view page in the iframe with the updated URLs and names
            const viewIframe = document.getElementById("viewIframe");
            if (viewIframe) {
                // Add a cache-busting query parameter to force reload
                const cacheBuster = new Date().getTime();
                viewIframe.src = `/view?embedded=true&cache=${cacheBuster}&url1_name=${encodeURIComponent(url1Name)}&url1=${encodeURIComponent(url1)}&url2_name=${encodeURIComponent(url2Name)}&url2=${encodeURIComponent(url2)}`;
            }
        })
        .catch((error) => console.error("Error updating URLs:", error));
}

function setDropdownValue(urlNumber, urlName, url) {
    const dropdown = document.getElementById(`url${urlNumber}-dropdown`);
    const input = document.getElementById(`url${urlNumber}-input`);

    dropdown.value = urlName;
    input.value = url;

    if (urlName === "custom") {
        input.disabled = false;
    } else {
        input.disabled = true;
    }
}