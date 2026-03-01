import { io } from "socket.io-client";

export class NetworkManager {
    constructor(url, scene) {
        this.socket = io(url);
        this.scene = scene;
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