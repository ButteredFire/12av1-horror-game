import * as THREE from "three";
import { NetworkManager } from "./NetworkManager";
import { PlayerController } from "./PlayerController";
import { EntityManager } from "./EntityManager";


export class Engine {
    constructor() {
        this.timer = new THREE.Clock();
        this.scene = new THREE.Scene();
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
    }


    /* Engine Entry Point */
    start() {
        this.init();
        this.startLoop();
    }


    /* Engine Initialization */
    async init() {
        this.initGraphics();

        this.network = new NetworkManager("http://localhost:3000", this.scene);
        this.controls = new PlayerController(this.camera, this.renderer.domElement);
        this.entityManager = new EntityManager(this.scene);

        

        this.initScene();
        this.initNetworking();
        
        this.loop = this.loop.bind(this);   // NOTE: This binds the loop so `this` remains the Engine instance
    
        await this.entityManager.loadAssets();  // Wait for all assets to load 
    }


    /* Renderer Initialization */
    initGraphics() {
        // Renderer
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        document.body.appendChild(this.renderer.domElement);

        // Projection matrix
        const FOV = 75, NEAR_CLIP = 0.1, FAR_CLIP = 10000;
        this.camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, NEAR_CLIP, FAR_CLIP);
        this.camera.position.y = 2.5;
    }


    /* Scene Initialization */
    initScene() {
        // Environment
        this.scene.background = new THREE.Color(0x111111); // 0x111111 = Dark grey

        const grid = new THREE.GridHelper(100, 100);
        const light = new THREE.DirectionalLight(0xffffff, 0.4);
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);

        this.scene.add(grid);
        this.scene.add(light);
        this.scene.add(ambientLight);
        
        
        // Flashlight
        this.flashlight = new THREE.PointLight(0xffffff, 1, 15);
        this.scene.add(this.flashlight);


        // Entities
        this.entityManager.spawnCoins(15);
        /*
        this.entityManager.spawnNextbot("/jason.jpg");

        this.network.addEvent("nextbotUpdate", (pos) => {
            this.entityManager.updateNextbot(pos);
        });
        */
    }


    initNetworking() {
        this.network.addEvent("init", (data) => {
            // On player join, spawn everyone else who is already there
            for (const id in data.players) {
                if (id !== this.network.id) {
                    this.entityManager.addRemotePlayer(id, data.players[id]);
                }
            }
        });

        this.network.addEvent("newPlayer", (data) => {
            this.entityManager.addRemotePlayer(data.id, data.pos);
        });
        
        this.network.addEvent("playerMoved", (data) => {
            this.entityManager.updateRemotePlayer(data.id, data.pos);
        });
        
        this.network.addEvent("playerDisconnected", (id) => {
            this.entityManager.removeRemotePlayer(id);
        });
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
        });
    }

    loop() {
        requestAnimationFrame(this.loop);
        
        const dt = this.timer.getDelta();
        
        this.update(dt);
        
        this.renderer.render(this.scene, this.camera);
    }


    update(dt) {
        this.controls.update(dt);

        const camRotation = { y: this.camera.rotation.y };
        this.network.sync(this.camera.position, camRotation);
        
        this.flashlight.position.copy(this.camera.position);

        // Nextbot-Player collision check
        const result = this.entityManager.checkCollisions(this.camera.position);
        if (result && result.type === "GAME_OVER") {
            //alert("JASON CAUGHT YOU!");
            //window.location.reload();
        }
    }
}