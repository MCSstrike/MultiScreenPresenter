const socket = io();
let timerInterval;
let currentTime = 600; // Default to 10 minutes

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const formattedTime = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    console.log("Formatted time:", formattedTime); // Debug log
    return formattedTime;
}

// Start the timer
function startTimer(timeLeft) {
    clearInterval(timerInterval); // Clear any existing interval
    currentTime = timeLeft;

    timerInterval = setInterval(() => {
        if (currentTime > 0) {
            currentTime--;
            console.log("Timer counting down:", currentTime); // Debug log
            document.getElementById("timerDisplay").textContent = formatTime(currentTime);
        } else {
            console.log("Timer reached zero, stopping."); // Debug log
            clearInterval(timerInterval); // Stop the interval
        }
    }, 1000);
}

function stopTimer() {
    console.log("Stopping Timer");
    clearInterval(timerInterval);
}

// Listen for timer updates from the server
socket.on("update_timer", (data) => {
    console.log("Timer update received on Timer Page:", data);

    // Update the timer display
    const timerDisplay = document.getElementById("timerDisplay");
    timerDisplay.textContent = formatTime(data.time_left);

    // Start or stop the timer
    if (data.running) {
        console.log("Starting timer with time left:", data.time_left);
        startTimer(data.time_left);
    } else {
        console.log("Pausing/Resetting timer");
        stopTimer();
    }
});