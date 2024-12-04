document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    const timerDisplay = document.getElementById("timerDisplay");
    const modeElement = document.getElementById("mode");

    // Initialize variables from initialTimerState
    let duration = initialTimerState.duration;
    let running = initialTimerState.running;
    let mode = initialTimerState.mode;
    let start_time = initialTimerState.start_time;

    // Initialize with the mode passed from the server
    let timerInterval;

    // Listen for mode updates from the server
    socket.on("update_mode", (data) => {
        mode = data.mode;
        updateDisplayMode();
    });

    // Log the initial timer state to the console
    console.log("Timer Duration:  ", initialTimerState.duration);
    console.log("Timer Running:   ", initialTimerState.running);
    console.log("Timer Mode:      ", initialTimerState.mode);
    console.log("Timer Start Time:", initialTimerState.start_time);

    // Listen for timer updates from the server
    socket.on("update_timer", (data) => {
        duration = data.duration;
        running = data.running;
        start_time = data.start_time;

        console.log("1Timer Duration: ", duration);
        console.log("1Timer Running: ", running);
        console.log("1Timer Start Time: ", start_time);

        updateDisplay();
    });

    // Update the display mode based on the current mode
    function updateDisplayMode() {
        if (mode === "clock") {
            modeElement.textContent = "Clock";
        } else if (mode === "countup") {
            modeElement.textContent = "Count Up";
        } else if (mode === "countdown") {
           modeElement.textContent = "Count Down";
        }
        updateDisplay();
    }

    // Function to update the display for the timer
    function updateDisplay() {
        clearInterval(timerInterval);

        if (mode === "clock") {
            startClock();
        } else if (mode === "countup") {
            startCountUp();
        } else if (mode === "countdown") {
            startCountDown();
        }
    }

    function tezt() {
    /*// Function to update the display based on the current mode
    function updateDisplay() {
        clearInterval(timerInterval);

        if (mode === "clock") {
            modeElement.textContent = "Clock";
            startClock();
        } else if (mode === "countup") {
            modeElement.textContent = "Count Up";
            timerDisplay.textContent = formatTime(duration);
            if (running) {
                startCountUp(duration);
            }
        } else if (mode === "countdown") {
            modeElement.textContent = "Count Down";
            timerDisplay.textContent = formatTime(duration);
            if (running) {
                startCountDown(duration);
            }
        }
    }*/}

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
        console.log("Running: ", running);
        console.log("Duration: ", duration);
        console.log("Start Time: ", start_time);

        if (start_time != 0) {
            duration = duration - Math.round((Date.now() / 1000 - start_time) - 0.5);
        }

        if (running === false) {
            timerDisplay.textContent = formatTime(duration);
        } else {
            // Update the display immediately
            const timerDisplay = document.getElementById("timerDisplay");
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

    /*// Function to start the countdown timer
    function startCountdown(remainingTime) {
        updateDisplay(remainingTime); // Set initial display
        const interval = setInterval(() => {
            if (!running || remainingTime <= 0) {
                clearInterval(interval);
                if (remainingTime <= 0) timerDisplay.textContent = "00:00:00";
                return;
            }
            remainingTime -= 1;
            updateDisplay(remainingTime);
        }, 1000);
    }*/

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
