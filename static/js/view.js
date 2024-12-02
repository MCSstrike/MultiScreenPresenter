document.addEventListener("DOMContentLoaded", () => {
    const socket = io(); // Initialize WebSocket connection

    // Listen for updates to proxy URLs
    socket.on("update_urls", (data) => {
        const url1 = data.url1;
        const url2 = data.url2;

        // Dynamically update the iframes
        const iframes = document.querySelectorAll("iframe");
        if (iframes.length === 1) {
            if (url1) {
                iframes[0].src = url1;
            } else if (url2) {
                iframes[0].src = url2;
            }
        } else if (iframes.length === 2) {
            if (url1) {
                iframes[0].src = url1;
            }
            if (url2) {
                iframes[1].src = url2;
            }
        }
    });

    //  Listen for updates to the proxy split
    socket.on("update_split", (data) => {
        const iframe1 = document.querySelector(".dual-proxy iframe:nth-child(1)");
        const iframe2 = document.querySelector(".dual-proxy iframe:nth-child(3)");
        if (iframe1 && iframe2) {
            iframe1.style.width = `${data.proxy_split}%`;
            iframe2.style.width = `calc(100% - ${data.proxy_split}%)`;
        }
    });
});