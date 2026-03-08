import { io } from "socket.io-client";

export class NetworkManager {
    constructor(urls, scene, playerName) {
        this.urls = urls;
        this.scene = scene;
        this.playerName = playerName;

        this.playerID = null;

        this.currentUrlIdx = 0;
    }


    initSocket() {
        const telemetryServer = document.getElementById("server-joined");
        const disconnectOverlay = document.getElementById("disconnect-overlay");
        const disconnectLog = document.getElementById("disconnect-log");

        const socketData = {
            forceNew: true,
            query: { playerName: this.playerName }
        };
        
        let reconnectionTries = 0;

        this.socket = io(this.urls[this.currentUrlIdx], socketData);


        this.socket.on("connect", () => {
            this.playerID = this.socket.id;

            console.log(`Connected to server as player "${this.playerName}" (${this.playerID})`);

            telemetryServer.innerHTML = this.urls[this.currentUrlIdx];

            const loading = document.getElementById("loading-overlay");
            loading.style.display = "none";

            requestAnimationFrame(() => {
                disconnectOverlay.classList.remove("visible");
                disconnectOverlay.style.display = "none";
            });

            this.currentUrlIdx = 0;
            reconnectionTries = 0;
        });

        
        this.socket.on("connect_error", (err) => {
            requestAnimationFrame(() => {
                disconnectOverlay.classList.add("visible");
                disconnectOverlay.style.display = "flex";
            });


            if (reconnectionTries >= 2) {
                disconnectLog.innerHTML = `Reconnection failed with error: ${err.message}. Switching to next available server...`;

                this.currentUrlIdx = (this.currentUrlIdx + 1) % this.urls.length;
                reconnectionTries = 0;

                this.socket.disconnect();
                
                setTimeout(() => {
                    this.initSocket();
                }, 1000); 
            }
            else {
                disconnectLog.innerHTML = `Attempting to reconnect to ${this.urls[this.currentUrlIdx]}...`;

                reconnectionTries++;
            }
        });
    }


    sendStartCommand() {
        if (this.socket) {
            this.socket.emit("startGame");
        }
    }


    addEvent(eventName, callback) {
        this.socket.on(eventName, callback);
    }


    sync(camPosition, camDirection) {
        let yaw = Math.atan2(camDirection.x, camDirection.z);

        this.socket.emit("move", {
            x: camPosition.x,
            y: camPosition.y,
            z: camPosition.z,
            ry: yaw
        });
    }


    /* Gets the current player ID. */
    get id() {
        return this.socket.id;
    }
}