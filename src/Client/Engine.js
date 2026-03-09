import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Howl } from "howler";

import { CONSTS } from "../Constants";
import * as UTILS from "../Utils";
import { NetworkManager } from "./NetworkManager";
import { PlayerController } from "./PlayerController";
import { EntityManager } from "./EntityManager";
import { MapManager } from "./MapManager";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';


export class Engine {
    constructor(playerName) {
        this.playerName = playerName;

        this.timer = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
    }


    /* Engine Entry Point */
    async start() {
        const loading = document.getElementById("loading-overlay");
        loading.style.display = "flex";

        this.isHost = false;

        await RAPIER.init();
        await this.init();

        this.startLoop();
    }


    /* Engine Initialization */
    async init() {
        this.initGraphics();
        this.initPhysWorld();

        const PROD_SERVERS = ["https://api.oriviet.org"];
        const DEV_SERVERS = ["http://localhost:3000"];

        this.texLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();

        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath("/draco/");
        this.gltfLoader.setDRACOLoader(this.dracoLoader);

        this.audioLoader = new THREE.AudioLoader();

        this.network = new NetworkManager(DEV_SERVERS, this.scene, this.playerName);
        this.controls = new PlayerController(this.world, this.camera, this.renderer.domElement);
        this.entityManager = new EntityManager(this.world, this.scene, this.listener, this.texLoader, this.gltfLoader, this.audioLoader);
        this.mapManager = new MapManager(this.world, this.scene, this.gltfLoader);

        this.controls.init();
        this.playerStartPos = this.controls.defaultSpawnPos;

        await this.entityManager.loadAssets();  // Wait for all assets to load 
        await this.mapManager.load("/map/Backrooms.glb"); 
        //await this.mapManager.loadNavMesh("/map/SchoolModel_NAV.glb"); 
        //await this.mapManager.loadNavMesh("/map/school_2_nav.glb"); 
        //await this.mapManager.load("/map/Stairs.glb");

        this.initScene();
        this.initNetworking();
        
        this.loop = this.loop.bind(this);   // NOTE: This binds the loop so `this` remains the Engine instance

        this.posTelemetry = document.getElementById("player-pos");
    }


    /* Renderer Initialization */
    initGraphics() {
        // Renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Projection matrix
        const FOV = 75, NEAR_CLIP = 0.1, FAR_CLIP = 10000;
        this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR_CLIP, FAR_CLIP);
        this.camera.position.y = CONSTS.PLAYER_HEIGHT;
        this.camera.rotation.order = "YXZ";  // Change rotation order to avoid gimbal lock with the yaw as the Y-axis
        
        this.playerFallVelocity = 0;

        // Audio
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
    }


    initPhysWorld() {
        this.world = new RAPIER.World({ x: 0.0, y: -15.0, z: 0.0 }); // Gravity: -9.81 on the Y-axis

        this.debugMesh = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({ color: 0xff0000 })
        );
        this.scene.add(this.debugMesh);
    }


    /* Scene Initialization */
    initScene() {
        // Environment
        this.scene.background = new THREE.Color(0x111111); // 0x111111 = Dark grey

        const ambient = new THREE.AmbientLight(0x050505); 
        this.scene.add(ambient);

        //const grid = new THREE.GridHelper(500, 500);
        //const light = new THREE.DirectionalLight(0xffffff, 0.76);

        //this.scene.add(grid);
        //this.scene.add(light);


        // Planes
            // Mathematical plane for raycasting
        this.worldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        this.worldDirection = new THREE.Vector3();

            // Geometry
        //const PlaneGeometry = new THREE.PlaneGeometry(100, 100, 1, 1);
        //const material = new THREE.MeshBasicMaterial({ 
        //    color: 0x548764, 
        //    side: THREE.DoubleSide // Useful for seeing both sides of the plane
        //});
        
        //const planeMesh = new THREE.Mesh(PlaneGeometry, material);
        //planeMesh.receiveShadow = true;
        //planeMesh.rotation.x = -Math.PI / 2;  // By default, planes are created in the X-Y plane. To make it a floor (X-Z plane), we must rotate it
        //this.scene.add(planeMesh);


        
        
        // Flashlight
        this.flashlight = new THREE.SpotLight(0xffffff, 20, 30, Math.PI / 3, 0.5, 1);
        this.flashlight.castShadow = true;

            // Shadow settings for mobile optimization
        this.flashlight.shadow.mapSize.width = 512;
        this.flashlight.shadow.mapSize.height = 512;
        this.flashlight.shadow.camera.near = 0.5;
        this.flashlight.shadow.camera.far = 75;

        this.scene.add(this.flashlight);
        this.scene.add(this.flashlight.target);

        // Atmospheric fog
        this.scene.fog = new THREE.FogExp2(0x111111, 0.01);


        // Entities
        //this.entityManager.spawnCoins(15);


        // Audio
        this.ambience = new Howl({
            src: "/sfx/ambience.mp3",
            autoplay: false,
            loop: true
        });

        this.hostMusic = new Howl({
            src: "/sfx/host-music.mp3",
            autoplay: false,
            loop: true
        });

        this.jumpscareSound = new Howl({
            src: "/sfx/lobotomy.mp3",
            autoplay: false,
            loop: false,
            volume: 1.0
        });

        this.mockSound = new Howl({
            src: "/sfx/laughing-cat.mp3",
            autoplay: false,
            loop: false,
            volume: 1.25
        });


        this.victory = new Howl({
            src: "/sfx/victory.mp3",
            autoplay: false,
            loop: false,
            volume: 1.0
        });
    }


    initNetworking() {
        this.network.initSocket();

        // HOST
        this.network.addEvent("assignHost", () => {
            this.labelRenderer = new CSS2DRenderer();
            this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
            this.labelRenderer.domElement.style.position = 'absolute';
            this.labelRenderer.domElement.style.top = '0px';
            //this.labelRenderer.domElement.style.pointerEvents = 'none'; // Critical: allows clicking through labels
            document.body.appendChild(this.labelRenderer.domElement);

            const pipContainer = document.getElementById("pip-container");
            const pipWidth = (pipContainer.style.width * window.innerWidth) / 100;
            const pipHeight = (pipContainer.style.height * window.innerHeight) / 100;

            this.pipRenderer = new THREE.WebGLRenderer({ antialias: false }); // Low res for perf
            this.pipRenderer.setSize(pipWidth, pipHeight);
            this.pipRenderer.setClearColor(0x111111);

            pipContainer.appendChild(this.pipRenderer.domElement);
            pipContainer.style.display = "block";
        
            this.pipCamera = new THREE.PerspectiveCamera(75, pipWidth / pipHeight, 0.1, 1000);
            this.pipCamera.up.set(0, 0, -1);

            this.currentPipTargetId = null;
            this.pipCycleInterval = 1000; // 10 seconds per player

            setInterval(() => {
                this.cyclePipTarget();
            }, this.pipCycleInterval);
        });


        // GLOBAL EVENTS
        this.network.addEvent("init", (data) => {
            this.isHost = data.isHost;
            document.getElementById("player-name").innerHTML = data.playerName;


            // Retrieve world information on player join
            this.playerName = data.playerName;
            this.network.playerName = this.playerName;

            this.entityManager.reset();

                // Render other players
            for (const id in data.players) {
                if (id !== this.network.playerID)
                    this.entityManager.addRemotePlayer(this.isHost, id, data.players[id]);
            }


            const lobbyUI = document.getElementById("lobby-ui");
            if (data.gameState === "LOBBY") {
                lobbyUI.style.display = "flex";
            }
            else {
                lobbyUI.style.display = "none";

                if (data.isHost) {
                    this.hostMusic.play();
                }
                else {
                    this.ambience.play();
                }
            }


            if (!data.isHost) {
                this.setupPlayer(data);
            }
            else {
                this.isHost = true;
                this.setupHost();
            }


            if (data.coins) {
                this.entityManager.spawnCoinsFromServer(data.coins);
            }
        });

        this.network.addEvent("newPlayer", (data) => {
            this.entityManager.addRemotePlayer(this.isHost, data.id, data.playerData);
        });
        
        this.network.addEvent("playerMoved", (data) => {
            if (data.id === this.network.playerID) return; // DON'T LERP YOURSELF

            this.entityManager.updateRemotePlayer(data.id, data.playerData);
        });
        
        this.network.addEvent("playerDisconnected", (id) => {
            this.entityManager.removeRemotePlayer(id);
        });

        this.network.addEvent("nextbotsUpdate", (nextbots) => {
            this.entityManager.updateNextbots(nextbots);
        });


        
        this.network.addEvent("gameStarted", (data) => {
            document.getElementById("lobby-ui").style.display = "none";

            if (!this.isHost) {
                this.controls.teleportPlayer(this.playerStartPos);
                this.ambience.play();
            }
            else {
                this.hostMusic.play();
            }
            
            this.entityManager.spawnCoinsFromServer(data.coins);
        });
        
        this.network.addEvent("coinCollected", (data) => {
            this.entityManager.removeCoin(data.coinId);
        });


        this.network.addEvent("updateScores", (playerList) => {
            if (!this.isHost) {
                const player = playerList.players[this.network.playerID];
                document.getElementById("local-coin-count").innerText = player.score || 0;
            }

            this.refreshLeaderboards(playerList);
        });



        // PLAYER-SPECIFIC EVENTS
        this.alive = true;

        this.network.addEvent("jumpscare", (data) => {
            if (this.alive) {
                this.alive = false;
                this.triggerJumpscare(data.bot.type);

                this.controls.teleportPlayer({ x: -50, y: -50, z: -50 });
                //this.alive = true;


                const overlay = document.getElementById("death-countdown-overlay");
                const timerNum = document.getElementById("death-timer-num");

                        // Prepping the overlay
                overlay.classList.remove("trigger");
                void overlay.offsetWidth;

                
                let timeLeft = data.respawnDelay;

                // 1. "Gray-out" the world
                this.renderer.domElement.style.filter = "grayscale(1) brightness(0.7)";

                const sfxIntv = setInterval(() => {
                    this.mockSound.play();

                    overlay.style.display = "flex";
                    overlay.classList.add("trigger");
                    
                    clearInterval(sfxIntv);
                }, 1000);

                const interval = setInterval(() => {
                    timeLeft--;
                    timerNum.innerText = timeLeft;

                    if (timeLeft <= 0) {
                        clearInterval(interval);
                        overlay.style.display = "none";
                        this.renderer.domElement.style.filter = "none";
                        
                        console.log(data.respawnPoint);
                        this.controls.teleportPlayer(data.respawnPoint);
                        
                        // 3. Notify server we are back in action
                        this.network.socket.emit("playerRespawned");

                        this.alive = true;
                    }
                }, 1000);
            }
        });


        this.network.addEvent("timerUpdate", (seconds) => {
            this.updateTimerUI(seconds);
        });
        
        this.network.addEvent("gameOver", (results) => {
            this.showEndScreen(results);
        });


        // Window resizing necessitates updating the camera projection matrix to be compatible with the new screen space
        window.addEventListener("resize", () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();

            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(window.devicePixelRatio); // Sharpens display on mobile retina screens

            const root = document.getElementById("root");
            void root.offsetWidth;
        });
    }


    setupHost() {
        // 1. Disable normal controls
        if (this.controls) this.controls.enableControls = false;
        
        this.mapManager.hideXrayGeometry();

        // 2. Position camera high above the school
        this.camera.position.set(0, 150, 0); 
        this.camera.lookAt(0, 0, 0);

        document.getElementById("host-tactical-hud").style.display = "block";
        document.getElementById("player-hud").style.display = "none";
        document.getElementById("telemetry").style.display = "none";
    
        // 3. Show the Host Start Button
        const startBtn = document.getElementById("host-start-btn");
        startBtn.style.display = "block";

        startBtn.addEventListener("click", () => {
            this.network.sendStartCommand();
        });


        // 1. DISABLE FOG for the Host
        this.scene.fog = null;

        // 2. NIGHT VISION: Add a global Ambient Light that only the host sees
        // In Three.js, you can't easily restrict light to one camera, 
        // so we just crank up the global brightness and turn off the "Darkness" overlay.
        const nightVision = new THREE.AmbientLight(0xffffff, 1.5); 
        //this.scene.add(nightVision);
        this.renderer.setClearColor(0, 1);

        // 3. TOP-DOWN CAMERA
        this.camera.position.set(0, 200, 0); // High altitude
        this.camera.lookAt(0, 0, 0);
        //this.camera.up.set(0, 0, -1); // Fix orientation for top-down

        // 2. Kill the Darkness (Flashlight and dark AmbientLight)
        this.scene.traverse((child) => {
            if (child instanceof THREE.AmbientLight || child instanceof THREE.DirectionalLight) {
                child.intensity = 2.0; // High brightness
            }

            if (child.isMesh) {
                if (child.name.includes("XR")) {
                    child.visible = false;
                }
    
                const wireColor = 0xff0000;
                child.material = new THREE.MeshBasicMaterial({
                    color: wireColor,
                    wireframe: true
                });
            }
        });

        // 4. Night Vision Tint
        // You can add a subtle green overlay in CSS or a Three.js ColorTransform
        document.body.style.filter = "contrast(1.2) brightness(1.1) sepia(0.5) hue-rotate(80deg)";

        // 5. SHOW UI
        document.getElementById("host-hud").style.display = "block";


        window.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            // Set the anchor point immediately so the first delta is 0
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        window.addEventListener('mouseup', () => this.isDragging = false);
        
        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging || !this.isHost) {
                // Even if not dragging, keep updating position to track the "pre-click" mouse
                this.previousMousePosition = { x: e.clientX, y: e.clientY };
                return;
            }
        
            const deltaX = e.clientX - this.previousMousePosition.x;
            const deltaY = e.clientY - this.previousMousePosition.y;
        
            this.camera.position.x -= deltaX * 0.2;
            this.camera.position.z -= deltaY * 0.2;
        
            this.previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('wheel', (event) => {
            this.camera.position.y += event.deltaY * 0.2;
        });
        
    }


    setupPlayer(data) {
        const player = data.players[data.id];

        this.playerStartPos = { x: player.x, y: player.y, z: player.z };
        if (data.gameState !== "LOBBY") {
            this.controls.teleportPlayer(this.playerStartPos);
        }

        document.getElementById("player-hud").style.display = "block";
    }


    updateTimerUI(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // Update the timer element (add this to your HTML)
        const timerEl = document.getElementById("timer-display");
        if (timerEl) {
            timerEl.innerText = timeStr;
            // Turn red if under 30 seconds
            if (seconds < 30) timerEl.style.color = "#ff0000";
        }
    }
    
    showEndScreen(results) {
        // 1. Stop the game loop
        this.running = false; 

        this.scene.clear();

        this.ambience.stop();
        this.hostMusic.stop();
        this.mockSound.stop();

        this.victory.play();

        
        // 2. Show the overlay
        const endOverlay = document.getElementById("end-screen");
        const list = document.getElementById("final-scores");
        endOverlay.style.display = "flex";

        const res = Object.values(results.players).sort((a, b) => (b.score || 0) - (a.score || 0));

        console.log(res);
    
        // 3. Populate results
        list.innerHTML = res.map((p, i) => `
            <div style="margin-bottom:5px;">
                [${i+1}] ${p.playerName}: 
                <span style="float:right">${p.score || 0} 🪙 | ${p.killed || 0} 💀</span>
            </div>
        `).join('');
    }


    refreshLeaderboards(playerList) {
        const activePlayers = playerList.players;
        delete activePlayers[playerList.hostPlayerID];
        
        // Sort all players by score descending
        const sorted = Object.values(activePlayers).sort((a, b) => (b.score || 0) - (a.score || 0));
    
        if (this.isHost) {
            // FULL LIST for the Host
            const container = document.getElementById("host-leaderboard-full");
            container.innerHTML = sorted.map((p, i) => 
            `<div style="margin-bottom:5px;">
                    #${i+1} | ${p.playerName.substring(0,30).toUpperCase()}
                    <span style="float:right">${p.score || 0} 🪙 | ${p.killed || 0} 💀</span>
                </div>`
            ).join('');
        } else {
            // TOP 3 for the Players
            const container = document.getElementById("player-leaderboard-mini");
            const top3 = sorted.slice(0, 3);
            container.innerHTML = top3.map((p, i) => 
                `<div style="font-size:14px;">#${i+1} | ${p.playerName}: ${p.score || 0} 🪙 | ${p.killed || 0} 💀</div>`
            ).join('');
        }
    }


    triggerJumpscare(botType) {
        const overlay = document.getElementById("jumpscare-overlay");
        const img = document.getElementById("jumpscare-image");
        
        // Prepping the overlay
        overlay.classList.remove("trigger-animation");
        img.classList.remove("trigger-animation");
        img.src = `/nextbots/${botType}.png`;
        img.style.display = "block";

        void overlay.offsetWidth;   // Neat little trick that forces the browsers to recalculate styles instantly

        // Begin flashbang
        this.jumpscareSound.play();
        overlay.classList.add("trigger-animation");
        img.classList.add("trigger-animation");
        setTimeout(() => {
            img.style.display = "none";
        }, 2500);
    }


    startLoop() {
        this.loop();
    }

    loop() {
        requestAnimationFrame(this.loop);
        
        const dt = this.timer.getDelta();
        
        this.world.step();
        
        this.update(dt);
        
        
        this.renderer.render(this.scene, this.camera);

        if (this.isHost) {
            if (this.labelRenderer) {
                this.labelRenderer.render(this.scene, this.camera);
            }
                
            if (this.pipRenderer && this.currentPipTargetId) {
                this.updatePipCamera();
                this.pipRenderer.render(this.scene, this.pipCamera);
            }
        }
    }


    update(dt) {
        this.mapManager.update(dt, this.camera.position);
        this.controls.update(dt, this.isHost);
        this.entityManager.update(dt);

        if (!this.isHost) {
            this.entityManager.checkCoinCollisions(this.camera.position, this.network.socket, this.isHost);

            this.camera.getWorldDirection(this.worldDirection);
            this.network.sync(this.camera.position, this.worldDirection);

            this.updatePlayer(dt);
            this.updateUI();
        }
    }


    updatePipCamera() {
        const players = Array.from(this.entityManager.remotePlayers.values());
        const target = players[0];

        if (target && target.mesh) {
            // Use a temp vector to grab the absolute world position
            const worldPos = new THREE.Vector3();
            target.mesh.getWorldPosition(worldPos);

            this.pipCamera.position.set(
                worldPos.x, 
                worldPos.y + 1.5, // Eye level
                worldPos.z
            );

            // Ensure the camera follows the rotation
            const worldDir = new THREE.Vector3();
            target.mesh.getWorldDirection(worldDir);
            const lookTarget = new THREE.Vector3().copy(this.pipCamera.position).add(worldDir);
            this.pipCamera.lookAt(lookTarget);
        }
    }


    cyclePipTarget() {
        const players = Array.from(this.entityManager.remotePlayers.keys());
        if (players.length === 0) return;
    
        // Logic: Find the player with the highest score, or just cycle linearly
        const currentIndex = players.indexOf(this.currentPipTargetId);
        const nextIndex = (currentIndex + 1) % players.length;
        
        this.currentPipTargetId = players[nextIndex];
        
        const targetData = this.entityManager.remotePlayers.get(this.currentPipTargetId);
        document.getElementById("pip-player-name").innerText = `PERSPECTIVE: ${targetData.playerName}`;
    }


    updateDebug() {
        const { vertices, colors } = this.world.debugRender();
        this.debugMesh.geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
        this.debugMesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
    }


    updatePlayer(dt) {
        // Flashlight
        this.flashlight.position.copy(this.camera.position);
        const vector = new THREE.Vector3(0, 0, -1);
        vector.applyQuaternion(this.camera.quaternion);
        this.flashlight.target.position.copy(this.camera.position).add(vector);
    }


    updateUI() {
        const precision = 3;
        const roundedX = this.camera.position.x.toFixed(precision);
        const roundedY = this.camera.position.y.toFixed(precision);
        const roundedZ = this.camera.position.z.toFixed(precision);
        this.posTelemetry.innerHTML = `(${roundedX}, ${roundedY}, ${roundedZ})`;
    }
}