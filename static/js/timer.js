document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    // Initialize with the mode passed from the server
    const initialMode = document.getElementById("mode").textContent;
    let currentMode = initialMode;

    // Listen for mode updates from the server
    socket.on("update_mode", (data) => {
        currentMode = data.mode;
        updateDisplay();
    });

    // Listen for timer updates from the server
    socket.on("update_timer", (data) => {
        const timerDisplay = document.getElementById("timerDisplay");
        timerDisplay.textContent = formatTime(data.time_left);
    });

    // Function to update the display based on the current mode
    function updateDisplay(timeLeft = 0) {
        const timerDisplay = document.getElementById("timerDisplay");
        const modeElement = document.getElementById("mode");
        if (currentMode === "clock") {
            mode.textContent = "Clock";
            fetchOnlineTime();
        } else if (currentMode === "countup") {
            mode.textContent = "Count Up";
            timerDisplay.textContent = formatTime(timeLeft);
        } else if (currentMode === "countdown") {
            mode.textContent = "Count Down";
            timerDisplay.textContent = formatTime(timeLeft);
        }
    }

    // Function to fetch the current time from an online clock
    async function fetchOnlineTime() {
        try {
            const response = await fetch("http://worldtimeapi.org/api/timezone/Etc/UTC");
            const data = await response.json();
            const dateTime = new Date(data.datetime);
            const timerDisplay = document.getElementById("timerDisplay");
            timerDisplay.textContent = formatTime(dateTime.getUTCHours() * 3600 + dateTime.getUTCMinutes() * 60 + dateTime.getUTCSeconds(), dateTime.getUTCMilliseconds());
        } catch (error) {
            console.error("Error fetching online time:", error);
        }
    }

    // Function to format time in HH:MM:SS.MM format
    function formatTime(seconds, milliseconds = 0) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;
        const ms = Math.floor(milliseconds / 10); // Convert milliseconds to two digits

        if (currentMode === "clock") {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
        } else {
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
            return hours > 0 ? `${String(hours).padStart(2, '0')}:${formattedTime}` : formattedTime;
        }
    }

    // Initial call to update the display
    updateDisplay();
});
