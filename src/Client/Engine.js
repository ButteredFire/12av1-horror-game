import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Howl } from "howler";

import { CONSTS } from "../Constants";
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
        await RAPIER.init();
        await this.init();
        this.startLoop();
    }


    /* Engine Initialization */
    async init() {
        this.initGraphics();
        this.initPhysWorld();

        const PROD_SERVERS = ["https://api.oriviet.org", "https://win-api.oriviet.org"];
        const DEV_SERVERS = ["http://localhost:3000"];

        this.texLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();

        this.dracoLoader = new DRACOLoader();
        this.dracoLoader.setDecoderPath("/draco/");
        this.gltfLoader.setDRACOLoader(this.dracoLoader);

        this.audioLoader = new THREE.AudioLoader();

        this.network = new NetworkManager(PROD_SERVERS, this.scene, this.playerName);
        this.controls = new PlayerController(this.world, this.camera, this.renderer.domElement);
        this.entityManager = new EntityManager(this.world, this.scene, this.listener, this.texLoader, this.gltfLoader, this.audioLoader);
        this.mapManager = new MapManager(this.world, this.scene, this.gltfLoader);

        await this.entityManager.loadAssets();  // Wait for all assets to load 
        await this.mapManager.load("/map/school.glb"); 
        //await this.mapManager.load("/map/Stairs.glb");

        this.initScene();
        this.initNetworking();
        
        this.loop = this.loop.bind(this);   // NOTE: This binds the loop so `this` remains the Engine instance

        this.posTelemetry = document.getElementById("player-pos");

        this.mapManager.toggleDebugColliders(true, false);
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
            volume: 0.5
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
        this.world.step();

        //this.updateDebug();

        this.camera.getWorldDirection(this.worldDirection);
        this.network.sync(this.camera.position, this.worldDirection);

        this.controls.update(dt);
        this.entityManager.update(dt);

        this.updatePlayer(dt);
        this.updateUI();
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