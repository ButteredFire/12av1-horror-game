import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import * as THREE from "three";
import { CONSTS } from "../Constants.js";
import * as UTILS from "../Utils.js";
import { createServer } from 'http';
import { Server } from 'socket.io';

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Pathfinding } from 'three-pathfinding';


const inDevEnv = (process.env.NODE_ENV === "development");
console.log(`Running in ${(inDevEnv) ? "DEVELOPMENT" : "PRODUCTION"} mode`);

const port = 3000;
const host = "localhost";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let players = {};
let playerCount = 0;

let nextbots = {};

//const nextbotCount = 0;
const botTypes = ["jason", "louis", "dyfuku", "an", "viet", "minh", "khoa", "ductrinh", "jerry"];

for (let bot of botTypes) {
    let sound = "armed-and-dangerous";

    if (bot == "minh")      sound = "thick-of-it";
    if (bot == "louis")     sound = "man-united";
    if (bot == "jerry")     sound = "oggy-and-the-cockroaches";

    nextbots[`${bot}`] = {
        x: UTILS.randRange(-200, 200),
        y: CONSTS.NEXTBOT_HEIGHT,
        z: UTILS.randRange(-200, 200),
        //type: botTypes[randRangeInt(0, botTypes.length - 1)]
        type: bot,
        sound: sound
    };
}


console.log(nextbots);





const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mapPath = path.resolve(__dirname, "../../public/map");
const navPath = path.resolve(mapPath, "SchoolModel_NAV.glb");


const gltfLoader = new GLTFLoader();

const pathfinding = new Pathfinding();
const ZONE = "school";


// 2. Read the file from disk manually
const data = fs.readFileSync(navPath);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

gltfLoader.parse(arrayBuffer, "", (gltf) => {
    const mesh = gltf.scene;

    let geometries = [];

    mesh.traverse((child) => {
        if (child.isMesh) {
            // 1. Get the geometry and ensure it is non-indexed 
            // This prevents the 'getIndex' null error
            let geom = child.geometry.toNonIndexed();

            // 2. Clean up attributes. 
            // mergeGeometries fails if one mesh has 'uv' and another doesn't.
            // For a NavMesh, we ONLY care about 'position'.
            const positionAttr = geom.getAttribute('position');
            geom = new THREE.BufferGeometry();
            geom.setAttribute('position', positionAttr);

            // 3. Since you already normalized transforms in Blender, 
            // you don't need applyMatrix4, but it's safer to keep 
            // if you ever move objects in the Blender Hierarchy.
            geometries.push(geom);
        }
    });

    if (geometries.length > 0) {
        try {
            const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
            const zoneData = Pathfinding.createZone(mergedGeometry, 0.5);
            pathfinding.setZoneData(ZONE, zoneData);

            console.log("NavMesh Groups created:", pathfinding.zones[ZONE].groups.length);

            console.log("NavMesh merged and Pathfinding initialized!");
        } catch (e) {
            console.error("Merge failed:", e);
        }
    }

    console.log("NavMesh loaded successfully on server!");

}, (error) => {
    console.error("Error parsing GLB:", error);
});









io.on("connection", (socket) => {
    console.log("NEW CONNECTION RECEIVED");

    const playerName = socket.handshake.query.playerName || `Ragamuffin #${playerCount + 1}`;

    players[socket.id] = {
        playerName: playerName,
        x: 0,
        y: 0,
        z: 0,
        ry: 0,
        chased: false
    };
    playerCount++;

    // Send the current world state to the new player
    socket.emit("init", {
        playerName: playerName,     // Also pass in player name in case the client sends and keeps an empty name
        id: socket.id,
        players: players,
        nextbots: nextbots
    });

    // Inform others
    socket.broadcast.emit("newPlayer", {
        id: socket.id,
        playerData: players[socket.id]
    });

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].ry = data.ry;
            socket.broadcast.emit("playerMoved", {
                id: socket.id,
                playerData: players[socket.id]
            });
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        playerCount--;

        io.emit("playerDisconnected", socket.id);
    });
});



const BOT_RADIUS = 5.0; // Distance to keep between bots
const BOT_RADIUS_SQ = BOT_RADIUS * BOT_RADIUS;
const SEPARATION_WEIGHT = 0.1; // How strongly they push away

function applySeparation(dt, currentBot, allBots) {
    let pushX = 0;
    let pushZ = 0;

    for (let id in allBots) {
        let other = allBots[id];
        if (other === currentBot) continue; // Don't push against yourself

        let dx = currentBot.x - other.x;
        let dz = currentBot.z - other.z;
        let distSq = dx * dx + dz * dz;

        // If they are closer than the combined radius
        if (distSq < BOT_RADIUS_SQ && distSq > 0) {
            let dist = Math.sqrt(distSq);
            // Inversely proportional push: closer = stronger push
            pushX += (dx / dist) * SEPARATION_WEIGHT;
            pushZ += (dz / dist) * SEPARATION_WEIGHT;
        }
    }
    
    currentBot.x += pushX * dt;
    currentBot.z += pushZ * dt;
}




// AI Logic Loop (60Hz)
const FREQUENCY = 30;
const STOP_DIST_SQ = (CONSTS.NEXTBOT_KILL_DISTANCE + 1.0) * (CONSTS.NEXTBOT_KILL_DISTANCE + 1.0);
const KILL_DIST_SQ = CONSTS.NEXTBOT_KILL_DISTANCE * CONSTS.NEXTBOT_KILL_DISTANCE;
const NEXTBOT_REEVAL_INTV = 30;  // Nextbot closest-player re-evaluation interval (seconds)
let lastTime = Date.now();

const PATH_TICK_RATE = 200; // Recalculate path every 200ms (5Hz)
const botVec = new THREE.Vector3();
const playerVec = new THREE.Vector3();
const targetVec = new THREE.Vector3();

// Initialize bots with staggered update timers
Object.values(nextbots).forEach((bot, index) => {
    bot.nextPathUpdate = Date.now() + (index * 20); // Stagger by 20ms each
    bot.currentPath = [];
});

setInterval(() => {
    const now = Date.now();
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    const playerIds = Object.keys(players);
    if (playerIds.length === 0) return;

    for (let id in nextbots) {
        let bot = nextbots[id];
        
        // 1. Target the closest player (Optimization: Use Squared Distance)
        let closestPlayer = null;
        let closestPlayerID = null;
        let minDistSq = Infinity;

        for (let pId of playerIds) {
            const p = players[pId];
            const dSq = Math.pow(p.x - bot.x, 2) + Math.pow(p.z - bot.z, 2);
            if (dSq < minDistSq) {
                minDistSq = dSq;
                closestPlayer = p;
                closestPlayerID = pId;
            }
        }

        if (closestPlayer) {
            // 2. STAGGERED PATHFINDING (The CPU Saver)
            if (now > (bot.nextPathUpdate || 0)) {
                botVec.set(bot.x, bot.y - CONSTS.NEXTBOT_HEIGHT, bot.z);
                playerVec.set(closestPlayer.x, closestPlayer.y - CONSTS.PLAYER_HEIGHT, closestPlayer.z);

                const groupID = pathfinding.getGroup(ZONE, botVec);
                
                // Only find path if we are on the mesh
                if (groupID !== null) {
                    bot.currentPath = pathfinding.findPath(botVec, playerVec, ZONE, groupID);
                    if (!bot.currentPath) {
                        const closest = pathfinding.getClosestNode(botVec, ZONE, groupID);
                        bot.currentPath = pathfinding.findPath(closest.centroid, playerVec, ZONE, groupID) || [];
                    }
                }
                
                bot.nextPathUpdate = now + PATH_TICK_RATE;
            }

            // 3. MOVEMENT (High Frequency)
            let moveTarget = null;
            if (bot.currentPath && bot.currentPath.length > 0) {
                moveTarget = bot.currentPath[0];
                
                // If we are close to the first waypoint, shift to the next one to smooth corners
                const dNextSq = Math.pow(moveTarget.x - bot.x, 2) + Math.pow(moveTarget.z - bot.z, 2);
                if (dNextSq < 0.5 && bot.currentPath.length > 1) {
                    bot.currentPath.shift();
                    moveTarget = bot.currentPath[0];
                }
            } else {
                // Fallback: move toward player if off-mesh
                moveTarget = closestPlayer;
            }

            if (moveTarget) {
                const dx = moveTarget.x - bot.x;
                const dz = moveTarget.z - bot.z;
                const angle = Math.atan2(dx, dz);

                bot.x += Math.sin(angle) * (CONSTS.NEXTBOT_SPEED * dt);
                bot.z += Math.cos(angle) * (CONSTS.NEXTBOT_SPEED * dt);
                
                // Smoothly interpolate Y to avoid "teleporting" up stairs
                const targetY = (moveTarget.y || 0) + CONSTS.NEXTBOT_HEIGHT;
                bot.y += (targetY - bot.y) * 0.2; 
            }

            // 4. OPTIMIZED SEPARATION (Radius checking)
            for (let otherId in nextbots) {
                if (id === otherId) continue;
                const ob = nextbots[otherId];
                const dx = bot.x - ob.x;
                const dz = bot.z - ob.z;
                const dSq = dx * dx + dz * dz;
                if (dSq < 1.44) { // (1.2m radius squared)
                    const d = Math.sqrt(dSq) || 1;
                    bot.x += (dx / d) * 0.05;
                    bot.z += (dz / d) * 0.05;
                }
            }

            // 5. JUMPSCARE TRIGGER
            if (minDistSq < (CONSTS.NEXTBOT_KILL_DISTANCE ** 2)) {
                io.to(closestPlayerID).emit("jumpscare", { botID: id, bot: bot });
                // Reset bot or handle death logic

                bot.x = 0;
                bot.z = 0;
            }
        }
    }
    
    //io.emit("nextbotsUpdate", nextbots);
}, 1000 / 60);

setInterval(() => {
    io.emit("nextbotsUpdate", nextbots); // (20Hz)
}, 1000 / 90);

httpServer.listen(port, host, () => console.log(`Server is running on http://${host}:${port}`));