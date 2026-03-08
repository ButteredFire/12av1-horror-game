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





import Piscina from 'piscina';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZONE = "school";
const workerPath = path.resolve(__dirname, "PathfinderWorker.mjs");
const navPath = path.resolve(__dirname, "../../public/map/SchoolModel_NAV.glb");

// Initialize Piscina
const pathPool = new Piscina({
    filename: workerPath,
    workerData: {
        zoneName: ZONE,
        navPath: navPath // Just pass the string path!
    }
});




let pathfinding = new Pathfinding();
const loader = new GLTFLoader();

// Read file from disk
const data = fs.readFileSync(navPath);
const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

loader.parse(arrayBuffer, '', (gltf) => {
    const geometries = [];
    gltf.scene.traverse((child) => {
        if (child.isMesh) {
            let geom = child.geometry.toNonIndexed();
            const positionAttr = geom.getAttribute('position');
            geom = new THREE.BufferGeometry();
            geom.setAttribute('position', positionAttr);
            geometries.push(geom);
        }
    });

    if (geometries.length === 0) {
        return reject(new Error("No meshes found in NavMesh GLB"));
    }

    const merged = BufferGeometryUtils.mergeGeometries(geometries);
    const welded = BufferGeometryUtils.mergeVertices(merged, 0.1);
    const zoneData = Pathfinding.createZone(welded, 0.5);
    
    pathfinding.setZoneData(ZONE, zoneData);
});




let coins = [];

/*
function spawnCoinsOnNavMesh() {
    coins = [];
    const zone = pathfinding.zones[ZONE]; 
    if (!zone) return console.error("NavMesh not loaded for spawning!");
    
    const triangles = zone.groups[0]; 
    for (let i = 0; i < 40; i++) { // Reveal-ready count
        const tri = triangles[Math.floor(Math.random() * triangles.length)];
        coins.push({
            id: i,
            x: tri.centroid.x,
            y: tri.centroid.y + 0.5, 
            z: tri.centroid.z,
            collected: false
        });
    }
}
*/
function spawnCoinsOnNavMesh() {
    coins = [];
    const zone = pathfinding.zones['school'];
    const triangles = [...zone.groups[0]]; // Clone triangle array
    const MIN_DISTANCE = 8; // Meters between coins

    // Shuffle triangles to ensure variety
    for (let i = triangles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [triangles[i], triangles[j]] = [triangles[j], triangles[i]];
    }

    for (const tri of triangles) {
        if (coins.length >= 200) break;

        const pos = { x: tri.centroid.x, y: tri.centroid.y + 0.8, z: tri.centroid.z };
        
        // Check if this position is too close to any existing coin
        const tooClose = coins.some(c => 
            Math.sqrt((c.x - pos.x)**2 + (c.z - pos.z)**2) < MIN_DISTANCE
        );

        if (!tooClose) {
            coins.push({ id: coins.length, ...pos, collected: false });
        }
    }
    return coins;
}




let gameState = "LOBBY"; 
let hostPlayerID = null;

let gameTimer = 60 * 3;
let timerInterval;
let aiInterval;

io.on("connection", (socket) => {

    const playerName = socket.handshake.query.playerName || `Ragamuffin #${playerCount + 1}`;
    let isHost = false;
    if (playerName === "MDTCO") {
        isHost = true;
        hostPlayerID = socket.id;
        socket.emit("assignHost");
    }
    
    console.log("NEW CONNECTION RECEIVED", (isHost ? "(HOST)" : ""));

    players[socket.id] = {
        isHost: isHost,
        playerName: playerName,
        x: 0,
        y: 0,
        z: 0,
        ry: 0,
        chased: false,
        invincible: false,
        killed: 0
    };
    playerCount++;

    // Send the current world state to the new player
    socket.emit("init", {
        isHost: isHost,
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



    // Send lobby status immediately
    socket.emit("lobbyStatus", { 
        isHost: players[socket.id].isHost,
        gameState: gameState 
    });


    socket.on("startGame", () => {
        if (players[socket.id].isHost && gameState === "LOBBY") {
            gameState = "PLAYING";
            spawnCoinsOnNavMesh();
            startGameLoop();
            startAILoop();
            io.emit("gameStarted", { coins });
        }
    });

    socket.on("collectCoin", (coinId) => {
        const coin = coins.find(c => c.id === coinId && !c.collected);
        if (coin && players[socket.id]) {
            coin.collected = true;
            players[socket.id].score = (players[socket.id].score || 0) + 1;
            io.emit("coinCollected", { 
                coinId, 
                playerId: socket.id, 
                score: players[socket.id].score 
            });
        }
    });

    socket.on("playerRespawned", () => {
        players[socket.id].invincible = false;
    });
});



function startGameLoop() {
    timerInterval = setInterval(() => {
        gameTimer--;
        io.emit("timerUpdate", gameTimer);

        if (gameTimer <= 0) {
            endGame();
        }
    }, 1000);
}



function endGame() {
    clearInterval(timerInterval);
    clearInterval(aiInterval);

    gameState = "ENDED";
    
    // Sort players by score for the final reveal
    delete players[hostPlayerID];

    
    io.emit("gameOver", {players: players});
}






// AI Logic Loop (60Hz)
const FREQUENCY = 30;
const STOP_DIST_SQ = (CONSTS.NEXTBOT_KILL_DISTANCE + 1.0) * (CONSTS.NEXTBOT_KILL_DISTANCE + 1.0);
const KILL_DIST_SQ = CONSTS.NEXTBOT_KILL_DISTANCE * CONSTS.NEXTBOT_KILL_DISTANCE;
const NEXTBOT_REEVAL_INTV = 30;  // Nextbot closest-player re-evaluation interval (seconds)
let lastTime = Date.now();

const PATH_TICK_RATE = 200; // Recalculate path every 200ms (5Hz)


function startAILoop() {
    aiInterval = setInterval(() => {
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;
    
        const playerIds = Object.keys(players);
        if (playerIds.length === 0) return;
    
        
        for (let id in nextbots) {
            const bot = nextbots[id];
    
            // 1. Target the closest player (Optimization: Use Squared Distance)
            let closestPlayer = null;
            let closestPlayerID = null;
            let minDistSq = Infinity;
    
            for (let pId of playerIds) {
                const p = players[pId];

                if (p.isHost || p.invincible) continue;

                const dx = p.x - bot.x;
                //const dy = (p.y - CONSTS.PLAYER_HEIGHT) - (bot.y - CONSTS.NEXTBOT_HEIGHT);
                const dz = p.z - bot.z;
    
                //const dSq = dx * dx + dy * dy + dz * dz;
                const dSq = dx * dx + dz * dz;
                //console.log(p.playerName, "dist:", Math.sqrt(dSq), `(dx, dy, dz) = (${dx.toFixed(3)}, ${dy.toFixed(3)}, ${dz.toFixed(3)})`);
                if (dSq < minDistSq) {
                    minDistSq = dSq;
                    closestPlayer = p;
                    closestPlayerID = pId;
                }
            }
    
    
            if (closestPlayer) {
                if (!bot.isCalculating && (Date.now() - (bot.lastPathUpdate || 0) > PATH_TICK_RATE)) {
                    bot.isCalculating = true;
    
                    // 2. Run the task in the pool
                    calcBotPath(id, bot, closestPlayer);
                }
    
                moveBot(id, dt, bot, closestPlayer, closestPlayerID, minDistSq);
            }
        }
    }, 1000 / 20);
    
    setInterval(() => {
        io.emit("nextbotsUpdate", nextbots);
        io.emit("updateScores", { hostPlayerID: hostPlayerID, players: players });
    }, 1000 / 60);
}


async function calcBotPath(id, bot, player) {
    const newPath = await pathPool.run({
        botVec: { x: bot.x, y: bot.y - CONSTS.NEXTBOT_HEIGHT, z: bot.z },
        playerVec: { x: player.x, y: player.y - CONSTS.PLAYER_HEIGHT, z: player.z }
    });

    if (newPath && newPath.length > 0) {
        // If the first waypoint is closer than 1m, it's probably 
        // a "backstep" to a previous position. Skip it.
        const dSq = Math.pow(newPath[0].x - bot.x, 2) + Math.pow(newPath[0].z - bot.z, 2);
        if (dSq < 1.0 && newPath.length > 1) {
            newPath.shift(); 
        }
        
        bot.currentPath = newPath;
    }
    bot.isCalculating = false;
    bot.lastPathUpdate = Date.now();
}


/**
 * Handles high-frequency movement, gravity, and floor snapping.
 * Runs at 60Hz on the Main Thread.
 */
function moveBot(id, dt, bot, closestPlayer, closestPlayerID, minDistSq) {
    if (!bot.currentPath || bot.currentPath.length < 0) return;
    
    const moveTarget = bot.currentPath[0];
    const botPos = new THREE.Vector3(bot.x, bot.y, bot.z);
    const targetPos = new THREE.Vector3(moveTarget.x, moveTarget.y, moveTarget.z);

    const dist = targetPos.sub(botPos);

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
    else {
        //bot.currentPath.shift();
    }


    /*
    let moveTarget = null;
    if (bot.currentPath && bot.currentPath.length > 0) {
        moveTarget = bot.currentPath[0];
    }
    // DO NOT DEFAULT TO CLOSEST PLAYER (for testing)
    //else {
    //    // Fallback: move toward player if off-mesh
    //    moveTarget = closestPlayer;
    //}

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
    */

    // 5. JUMPSCARE TRIGGER
    if (minDistSq < (CONSTS.NEXTBOT_KILL_DISTANCE ** 2)) {
        closestPlayer.killed++;

        io.to(closestPlayerID).emit("jumpscare", {
            botID: id,
            bot: bot,
            respawnDelay: 5, // 5 second countdown
            spawnPoint: { x: 0, y: 5, z: 0 } // Your school's spawn location
        });
        // Reset bot or handle death logic

        //bot.x = 0;
        //bot.z = 0;
        closestPlayer.status = "ELIMINATED";
        closestPlayer.invincible = true;
        //p.score = Math.max(0, p.score - 5); // Optional: Penalty for dying


        bot.x = UTILS.randRange(-200, 200);
        bot.y = CONSTS.NEXTBOT_HEIGHT;
        bot.z = UTILS.randRange(-200, 200);
    }
}

httpServer.listen(port, host, () => console.log(`Server is running on http://${host}:${port}`));