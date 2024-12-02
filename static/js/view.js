const socket = io(); // Initialize WebSocket connection

// Listen for updates to proxy URLs
socket.on("update_urls", (data) => {
    const url1 = data.url1;
    const url2 = data.url2;

    // Dynamically update the iframes
    const iframes = document.querySelectorAll("iframe");
    if (iframes.length === 1) {
        iframes[0].src = (data.proxy_split === 0) ? url2 : url1;
    } else if (iframes.length === 2) {
        iframes[0].src = url1;
        iframes[1].src = url2;
    }
});

// Listen for updates to the proxy split
socket.on("update_split", (data) => {
    const proxySplit = data.proxy_split;

    // Dynamically update the size of the iframes
    const iframe1 = document.querySelector(".dual-proxy iframe:nth-child(1)");
    const iframe2 = document.querySelector(".dual-proxy iframe:nth-child(2)");
    if (iframe1 && iframe2) {
        iframe1.style.width = `${proxySplit}%`;
        iframe2.style.width = `calc(100% - ${proxySplit}%)`;
    }
});