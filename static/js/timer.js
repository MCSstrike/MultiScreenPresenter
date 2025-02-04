document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    const timerDisplay = document.getElementById("timerDisplay");
    const modeElement = document.getElementById("mode");

    // Initialize variables from initialTimerState
    let duration = initialTimerState.duration;
    let running = initialTimerState.running;
    let mode = initialTimerState.mode;
    let start_time = initialTimerState.start_time;

    // Initialize Particles.js
    particlesJS("particles-js", {
        particles: {
            number: { value: 100, density: { enable: true, value_area: 800 } },
            color: { value: ["#00ff00", "#00ffff", "#ff0000"] },
            shape: { type: "circle" },
            opacity: { value: 0.5 },
            size: { value: 4 },
            line_linked: { enable: true, distance: 150, color: "#ffffff", opacity: 0.4, width: 1 },
            move: { enable: true, speed: 3 },
        },
        interactivity: {
            events: { onhover: { enable: true, mode: "repulse" } },
            modes: { repulse: { distance: 100, duration: 0.4 } },
        },
    });

    // Initialize with the mode passed from the server
    let timerInterval;

    // Listen for mode updates from the server
    socket.on("update_mode", (data) => {
        mode = data.mode;
        updateDisplayMode();
        document.body.classList.remove("timer-intense");
        timerDisplay.classList.remove("timer-intense");
    });

    // Listen for timer updates from the server
    socket.on("update_timer", (data) => {
        duration = data.duration;
        running = data.running;
        start_time = data.start_time;

        updateDisplay();
    });

    // Update the display mode based on the current mode
    function updateDisplayMode() {
        if (mode === "clock") {
            modeElement.textContent = "Clock";
        } else if (mode === "countup") {
            modeElement.textContent = "Stopwatch";
        } else if (mode === "countdown") {
           modeElement.textContent = "Timer";
        }
        updateDisplay();
    }

    // Function to update the display for the timer
    function updateDisplay() {
        clearInterval(timerInterval);

        document.body.classList.remove("timer-intense");
        timerDisplay.classList.remove("timer-intense");

        if (mode === "clock") {
            startClock();
        } else if (mode === "countup") {
            startCountUp();
        } else if (mode === "countdown") {
            startCountDown();

            // Increase intensity as the timer approaches zero
            const interval = setInterval(() => {
                if (duration <= 10) {
                    document.body.classList.add("timer-intense");
                    timerDisplay.classList.add("timer-intense");
                }
                if (duration <= 0) {
                    clearInterval(interval);
                    // stop the flahing effect
                    document.body.classList.remove("timer-intense");
                }
            }, 1000);
        }
    }

    // Function to start the clock and update it every second
    function startClock() {
        const updateClock = () => {
            const currentTime = new Date();
            timerDisplay.textContent = formatTime(
                currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds()
            );
        };

        // Update the display immediately
        updateClock();

        // Set interval to continue updating every second
        timerInterval = setInterval(updateClock, 1000);
    }

    // Function to start counting up
    function startCountUp() {
        if (running === false) {
            timerDisplay.textContent = formatTime(duration);
        } else {
            let timeSinceStart = (Date.now() / 1000 - start_time) - 0.5;
            let elapsedTime = duration + Math.round(timeSinceStart);

            // Update display immediately
            timerDisplay.textContent = formatTime(elapsedTime);

            // Set interval to continue updating every second
            timerInterval = setInterval(() => {
                elapsedTime++;
                timerDisplay.textContent = formatTime(elapsedTime);
            }, 1000); // Update every second
        }
    }

    // Function to start counting down
    function startCountDown() {
        if (start_time != 0) {
            duration = duration - Math.round((Date.now() / 1000 - start_time) - 0.5);
        }

        if (duration < 0) {
            duration = 0;
        }

        if (running === false) {
            timerDisplay.textContent = formatTime(duration);
        } else {
            // Update the display immediately
            timerDisplay.textContent = formatTime(duration);

            timerInterval = setInterval(() => {
                if (duration > 0) {
                    duration--;
                    timerDisplay.textContent = formatTime(duration);
                } else {
                    clearInterval(timerInterval);
                }
            }, 1000); // Update every second
        }
    }

    // Function to format time in HH:MM:SS.MM format
    function formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (mode === "clock") {
            return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
        } else {
            const formattedTime = `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
            return hours > 0 ? `${String(hours)}:${formattedTime}` : formattedTime;
        }
    }

    // Initial call to update the display
    updateDisplayMode();
});
