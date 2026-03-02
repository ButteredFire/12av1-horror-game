import { io } from "socket.io-client";

export class NetworkManager {
    constructor(urls, scene, playerName) {
        this.urls = urls;
        this.scene = scene;
        this.playerName = playerName;

        this.currentUrlIdx = 0;
        this.initSocket();
    }


    initSocket() {
        const disconnectOverlay = document.getElementById("disconnect-overlay");
        const disconnectLog = document.getElementById("disconnect-log");

        const socketData = {
            forceNew: true,
            query: { playerName: this.playerName }
        };
        
        let reconnectionTries = 0;

        this.socket = io(this.urls[this.currentUrlIdx], socketData);


        this.socket.on("connect", () => {
            console.log("Successfully connected to the server.");

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


    addEvent(eventName, callback) {
        this.socket.on(eventName, callback);
    }


    sync(camPosition, camRotation) {
        this.socket.emit("move", {
            x: camPosition.x,
            y: camPosition.y,
            z: camPosition.z,
            ry: camRotation.y // Y-axis rotation (yaw) for the player model to face the right way
        });
    }


    /* Gets the current player ID. */
    get id() {
        return this.socket.id;
    }
}