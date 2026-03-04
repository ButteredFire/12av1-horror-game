import * as THREE from "three";
import { Howl } from "howler";

import { CONSTS } from "./Constants";
import { NetworkManager } from "./NetworkManager";
import { PlayerController } from "./PlayerController";
import { EntityManager } from "./EntityManager";
import { MapManager } from "./MapManager";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader";


export class Engine {
    constructor(playerName) {
        this.playerName = playerName;

        this.timer = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
    }


    /* Engine Entry Point */
    async start() {
        await this.init();
        this.startLoop();
    }


    /* Engine Initialization */
    async init() {
        this.initGraphics();

        const PROD_SERVERS = ["https://api.oriviet.org", "https://win-api.oriviet.org"];
        const DEV_SERVERS = ["http://localhost:3000"];

        this.texLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();

        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath("/draco/");
        this.gltfLoader.setDRACOLoader(this.dracoLoader);

        this.audioLoader = new THREE.AudioLoader();

        this.network = new NetworkManager(PROD_SERVERS, this.scene, this.playerName);
        this.controls = new PlayerController(this.camera, this.renderer.domElement);
        this.entityManager = new EntityManager(this.scene, this.listener, this.texLoader, this.gltfLoader, this.audioLoader);
        this.mapManager = new MapManager(this.scene, this.gltfLoader);

        await this.entityManager.loadAssets();  // Wait for all assets to load 
        await this.mapManager.loadZone("/map/Zone.glb");

        this.initScene();
        this.initNetworking();
        
        this.loop = this.loop.bind(this);   // NOTE: This binds the loop so `this` remains the Engine instance

        this.posTelemetry = document.getElementById("player-pos");

        //this.mapManager.toggleDebugColliders();
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


    /* Scene Initialization */
    initScene() {
        // Environment
        this.scene.background = new THREE.Color(0x111111); // 0x111111 = Dark grey

        const ambient = new THREE.AmbientLight(0x050505); 
        this.scene.add(ambient);

        const grid = new THREE.GridHelper(500, 500);
        //const light = new THREE.DirectionalLight(0xffffff, 0.76);

        this.scene.add(grid);
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
        this.flashlight = new THREE.SpotLight(0xffffff, 10, 30, Math.PI / 4, 0.5, 1);
        this.flashlight.castShadow = true;

            // Shadow settings for mobile optimization
        this.flashlight.shadow.mapSize.width = 512;
        this.flashlight.shadow.mapSize.height = 512;
        this.flashlight.shadow.camera.near = 0.5;
        this.flashlight.shadow.camera.far = 25;

        this.scene.add(this.flashlight);
        this.scene.add(this.flashlight.target);

        // Atmospheric fog
        this.scene.fog = new THREE.FogExp2(0x111111, 0.01);


        // Entities
        //this.entityManager.spawnCoins(15);


        // Audio
        this.ambience = new Howl({
            src: "/sfx/night-ambience.mp3",
            autoplay: true,
            loop: true
        });

        this.jumpscareSound = new Howl({
            src: "/sfx/lobotomy.mp3",
            autoplay: false,
            loop: false,
            volume: 0.1
        });
    }


    initNetworking() {
        this.network.initSocket();


        // GLOBAL EVENTS
        this.network.addEvent("init", (data) => {
            // Retrieve world information on player join
            this.playerName = data.playerName;
            this.network.playerName = this.playerName;

            this.entityManager.reset();

            console.log("Reconnected");
            console.log(data);

                // Render other players
            for (const id in data.players) {
                if (id !== this.network.playerID)
                    this.entityManager.addRemotePlayer(id, data.players[id]);
            }

            console.log(this.entityManager.playerData);
        });

        this.network.addEvent("newPlayer", (data) => {
            console.log(data);
            this.entityManager.addRemotePlayer(data.id, data.playerData);
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



        // PLAYER-SPECIFIC EVENTS
        this.alive = true;
        this.network.addEvent("jumpscare", (data) => {
            if (this.alive || true) {
                this.triggerJumpscare(data.type);
                this.alive = false;
            }
        });
    }


    checkCollision(newPos) {
        if (!this.mapManager || this.mapManager.colliders.length === 0) return false;

        const playerRadius = 0.25;
        const maxStepHeight = 1.0;

        const raycaster = new THREE.Raycaster();
        
        // Check collision at three height points (feet, body, head) relative to the world plane
        const feetHeight = newPos.y - CONSTS.PLAYER_HEIGHT;
        const bodyHeight = (feetHeight + newPos.y) / 2.0;
        const headHeight = newPos.y;

        const absHeights = [feetHeight, bodyHeight, headHeight];

        const directions = [
            new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)
        ];
        const downDirection = new THREE.Vector3(0, -1, 0);

        for (let h of absHeights) {
            const origin = newPos.clone();
            origin.y = h;

            for (let dir of directions) {
                raycaster.set(origin, dir);
                raycaster.far = playerRadius;

                const hits = raycaster.intersectObjects(this.mapManager.colliders);
                
                if (hits.length > 0) {
                    const downRaycaster = new THREE.Raycaster();

                    origin.y = headHeight;
                    const downRayPos = origin;
                    
                    for (let dir1 of directions) {
                        downRaycaster.set(downRayPos.add(dir1.multiplyScalar(playerRadius)), downDirection);
                        downRaycaster.far = CONSTS.PLAYER_HEIGHT;
                        
                        const downHits = downRaycaster.intersectObjects(this.mapManager.colliders);
                        
                        if (downHits.length > 0) {
                            const hitPointY = downHits[0].point.y;
                            const heightDiff = hitPointY - feetHeight;
                            console.log(`hitPoint: ${hitPointY} ; heightDiff: ${heightDiff}`);

                            if (heightDiff > 0 && heightDiff <= maxStepHeight) {
                                // Smoothly lift the player
                                this.camera.position.lerp(
                                    new THREE.Vector3(this.camera.position.x,
                                                      this.camera.position.y + heightDiff + 0.1,
                                                      this.camera.position.z),
                                    CONSTS.LERP_FACTOR
                                );

                                return false;
                            }
                        }
                    }


                    return true;
                }
            }
        }
        return false;
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
        }, 1500);
    }


    startLoop() {
        this.loop();

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

    loop() {
        requestAnimationFrame(this.loop);
        
        const dt = this.timer.getDelta();
        
        this.update(dt);
        
        this.renderer.render(this.scene, this.camera);
    }


    update(dt) {
        this.camera.getWorldDirection(this.worldDirection);
        this.network.sync(this.camera.position, this.worldDirection);

        this.entityManager.update(dt);

        this.updateCamera(dt);
        this.updatePlayer(dt);
        
        this.updateUI();
    }


    updateCamera(dt) {
        const oldPos = this.camera.position.clone();
        this.controls.update(dt);
        const newPos = this.camera.position.clone();

        this.camera.position.copy(oldPos);

        this.camera.position.x = newPos.x;
        if (this.checkCollision(this.camera.position)) {
            this.camera.position.x = oldPos.x;
        }

        this.camera.position.z = newPos.z;
        if (this.checkCollision(this.camera.position)) {
            this.camera.position.z = oldPos.z;
        }
    }


    updatePlayer(dt) {
        // Flashlight
        this.flashlight.position.copy(this.camera.position);
        const vector = new THREE.Vector3(0, 0, -1);
        vector.applyQuaternion(this.camera.quaternion);
        this.flashlight.target.position.copy(this.camera.position).add(vector);


        // Falling
        const feetHeight = this.camera.position.y - CONSTS.PLAYER_HEIGHT;
        if (feetHeight <= CONSTS.WORLD_FLOOR_HEIGHT) {
            this.camera.position.y = CONSTS.PLAYER_HEIGHT;
            this.playerFallVelocity = -this.playerFallVelocity * 0.7; // Reverse velocity with 30% energy loss (bounce)
            
            // Stop small jittering when motion is negligible
            if (Math.abs(this.playerFallVelocity) < 0.02)
                this.playerFallVelocity = 0;
        }
        else {
            this.playerFallVelocity += CONSTS.ACCELERATION_PER_FRAME;
            this.camera.position.y -= CONSTS.ACCELERATION_PER_FRAME;
        }


        // Nextbot-Player collision check
        const result = this.entityManager.checkCollisions(this.camera.position);
        if (result && result.type === "GAME_OVER") {
            //alert("JASON CAUGHT YOU!");
            //window.location.reload();
        }
    }


    updateUI() {
        const precision = 3;
        const roundedX = this.camera.position.x.toFixed(precision);
        const roundedY = this.camera.position.y.toFixed(precision);
        const roundedZ = this.camera.position.z.toFixed(precision);
        this.posTelemetry.innerHTML = `(${roundedX}, ${roundedY}, ${roundedZ})`;
    }
}