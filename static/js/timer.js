document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    // Initialize with the mode passed from the server
    const initialMode = document.getElementById("mode").textContent;
    let currentMode = initialMode;
    let timerInterval;
    let serverUpdateInterval;

    // Listen for mode updates from the server
    socket.on("update_mode", (data) => {
        currentMode = data.mode;
        updateDisplay();
    });

    // Listen for timer updates from the server
    socket.on("update_timer", (data) => {
        const timeLeft = data.duration;
        const isPaused = !data.running;
        updateDisplay(timeLeft, isPaused);
    });

    // Function to update the display based on the current mode
    function updateDisplay(timeLeft = 0, isPaused = true) {
        const timerDisplay = document.getElementById("timerDisplay");
        const modeElement = document.getElementById("mode");
        clearInterval(timerInterval);

        if (currentMode === "clock") {
            modeElement.textContent = "Clock";
            startClock();
        } else if (currentMode === "countup") {
            modeElement.textContent = "Count Up";
            timerDisplay.textContent = formatTime(timeLeft);
            if (!isPaused) {
                startCountUp(timeLeft);
            }
        } else if (currentMode === "countdown") {
            modeElement.textContent = "Count Down";
            timerDisplay.textContent = formatTime(timeLeft);
            if (!isPaused) {
                startCountDown(timeLeft);
            }
        }
    }

    // Function to start the clock and update it every second
    function startClock() {
        timerInterval = setInterval(() => {
            const currentTime = new Date();
            const timerDisplay = document.getElementById("timerDisplay");
            timerDisplay.textContent = formatTime(currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds());
        }, 1000); // Update every second
    }

    // Function to start counting up
    function startCountUp(initialTime) {
        let elapsedTime = initialTime;
        timerInterval = setInterval(() => {
            elapsedTime++;
            const timerDisplay = document.getElementById("timerDisplay");
            timerDisplay.textContent = formatTime(elapsedTime);
        }, 1000); // Update every second
    }

    // Function to start counting down
    function startCountDown(initialTime) {
        let timeLeft = initialTime;
        timerInterval = setInterval(() => {
            if (timeLeft > 0) {
                timeLeft--;
                const timerDisplay = document.getElementById("timerDisplay");
                timerDisplay.textContent = formatTime(timeLeft);
            } else {
                clearInterval(timerInterval);
            }
        }, 1000); // Update every second
    }

    // Function to format time in HH:MM:SS.MM format
    function formatTime(seconds, milliseconds = 0) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (currentMode === "clock") {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
        } else {
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
            return hours > 0 ? `${String(hours)}:${formattedTime}` : formattedTime;
        }
    }

    // Initial call to update the display
    updateDisplay();
});
