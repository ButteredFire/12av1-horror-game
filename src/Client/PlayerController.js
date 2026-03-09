import * as THREE from "three";
import { CONSTS } from "../Constants";
import RAPIER from "@dimforge/rapier3d-compat";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls";
import nipplejs from "nipplejs";


export class PlayerController {
    constructor(world, camera, domElement) {
        this.world = world;
        this.camera = camera;
        this.domElement = domElement;
        this.controls = new PointerLockControls(this.camera, document.body);

        this.defaultSpawnPos = { x: 0, y: CONSTS.PLAYER_HEIGHT, z: 0 }; // Start 5 meters in the air to avoid stuck-in-floor

        this.playerInitialized = false;
        this.enableControls = true;
    }


    init() {
        this.initPlayer();
        this.initControls();

        this.playerInitialized = true;
    }


    teleportPlayer(spawnPos) {
        this.body.setTranslation({
            x: spawnPos.x,
            y: spawnPos.y + CONSTS.PLAYER_HEIGHT,
            z: spawnPos.z
        }, true);

        this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }


    initPlayer() {
        // 1. Create a Capsule Body (0.6m wide, 1.8m tall)
        let bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        this.body = this.world.createRigidBody(bodyDesc);
        
        const colliderDesc = RAPIER.ColliderDesc.capsule(CONSTS.PLAYER_HEIGHT / 2.0, CONSTS.PLAYER_COLLISION_RADIUS);
        //colliderDesc.setFriction(0);     // Set friction to 0 so the player "slides" over geometry instead of catching on it
        //colliderDesc.setRestitution(0);  // Set restitution (bounciness) to 0 to prevent "jitter-bounce"

        this.collider = this.world.createCollider(colliderDesc, this.body);

        // 2. Create the Controller for Stairs/Autostep
        this.controller = this.world.createCharacterController(0.15);
        //this.controller.enableAutostep(0.5, 0.01, true); // (maxStepHeight, minWidth)
        this.controller.enableSnapToGround(0.1);


        this.body.setTranslation(this.defaultSpawnPos, true);
    }


    initControls() {
        this.moveState = { forward: 0, right: 0 };
        this.lookSensitivity = 0.005;
        this.isMobile = "ontouchstart" in window;

        window.addEventListener("resize", () => {
            if (this.isMobile && this.joystick) {
                // Destroy and recreate joystick to snap to new 'bottom/left' CSS coordinates
                this.joystick.destroy();
                this.initMobile();

                const root = document.getElementById("root");
                void root.offsetWidth;
            }
        });

        this.initDesktop();
        if (this.isMobile) {
            this.initMobile();
        }
    }


    initDesktop() {
        const instructions = document.getElementById("instructions");
        document.addEventListener("click", () => {
            if (!this.isMobile && this.enableControls) this.controls.lock();
        });

        this.keys = {};
        document.addEventListener("keydown", (e) => this.keys[e.code] = true);
        document.addEventListener("keyup", (e) => this.keys[e.code] = false);
    }


    initMobile() {
        this.camera.rotation.order = "YXZ";

        // 1. Setup Joystick for Movement (Left Side)
        const joystickZone = document.getElementById("joystick-zone");
        const joystick = nipplejs.create({
            zone: joystickZone,
            mode: "dynamic",
            position: { left: "80px", bottom: "80px" },
            color: "white"
        });

        joystick.on("move", (evt, data) => {
            this.moveState.forward = data.vector.y;
            this.moveState.right = data.vector.x;
        });

        joystick.on("end", () => {
            this.moveState.forward = 0;
            this.moveState.right = 0;
        });

        // 2. Touch-to-Look Logic (Right Side)
        this.lookTouchId = null; // Track which finger is the "camera finger"
        let lastTouchX = 0;
        let lastTouchY = 0;

        document.addEventListener("touchstart", (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
                
                // If touch starts on the right half, assign it as the 'look' finger
                if (touch.pageX > window.innerWidth / 2 && this.lookTouchId === null) {
                    this.lookTouchId = touch.identifier;
                    this.lastTouchX = touch.pageX;
                    this.lastTouchY = touch.pageY;
                }
            }
        }, { passive: false });

        document.addEventListener("touchmove", (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                const touch = e.changedTouches[i];
    
                // Only process if this is the specific finger we assigned to 'look'
                if (touch.identifier === this.lookTouchId) {
                    const movementX = touch.pageX - this.lastTouchX;
                    const movementY = touch.pageY - this.lastTouchY;
    
                    this.camera.rotation.y -= movementX * this.lookSensitivity;
                    this.camera.rotation.x -= movementY * this.lookSensitivity;
    
                    const PI_2 = Math.PI / 2;
                    this.camera.rotation.x = Math.max(-PI_2, Math.min(PI_2, this.camera.rotation.x));
                    this.camera.rotation.z = 0;
    
                    this.lastTouchX = touch.pageX;
                    this.lastTouchY = touch.pageY;
                }
            }
        }, { passive: false });
        
        document.addEventListener("touchend", (e) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                if (e.changedTouches[i].identifier === this.lookTouchId) {
                    this.lookTouchId = null; // Finger lifted, reset
                }
            }
        });
    }


    update(dt, clientIsHost) {
        const speedDT = CONSTS.PLAYER_SPEED * dt;
        const movement = new THREE.Vector3(0, 0, 0);

        // Calculate desired movement direction (your existing logic)
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(this.camera.up, forward).negate();

        // Sum up the intended move
        if (this.enableControls) {
            if (this.isMobile) {
                movement.addScaledVector(forward, this.moveState.forward * speedDT);
                movement.addScaledVector(right, this.moveState.right * speedDT);
            } else if (this.controls.isLocked) {
                if (this.keys["KeyW"]) movement.addScaledVector(forward, speedDT);
                if (this.keys["KeyS"]) movement.addScaledVector(forward, -speedDT);
                if (this.keys["KeyA"]) movement.addScaledVector(right, -speedDT);
                if (this.keys["KeyD"]) movement.addScaledVector(right, speedDT);
            }
        }
        

        if (!clientIsHost) {
            movement.y = -CONSTS.ACCELERATION_PER_FRAME;

            // 4. ASK RAPIER TO CALCULATE THE MOVE
            this.controller.computeColliderMovement(this.collider, movement);
            const correctedMove = this.controller.computedMovement();

            // 5. Apply the movement to the body and sync camera
            const currentPos = this.body.translation();
            this.body.setNextKinematicTranslation({
                x: currentPos.x + correctedMove.x,
                y: currentPos.y + correctedMove.y,
                z: currentPos.z + correctedMove.z
            });

            this.camera.position.copy(this.body.translation());
            this.camera.position.y += 1.0; // Offset camera to eye-level
        }
    }


    /*
    update(dt) {
        const speedDT = CONSTS.PLAYER_SPEED * dt;

        if (this.isMobile) {
            // Mobile Movement
                // 1. Get the camera's forward direction
            const forward = new THREE.Vector3();
            this.camera.getWorldDirection(forward);
            
            // 2. Project direction onto the ground plane (y = 0) to prevent flying/sinking
            forward.y = 0;
            forward.normalize();

            // 3. Calculate Right vector (Cross product of Up and Forward)
            const right = new THREE.Vector3();
            right.crossVectors(this.camera.up, forward).negate();

            // 4. Apply movement
            this.camera.position.addScaledVector(forward, this.moveState.forward * speedDT);
            this.camera.position.addScaledVector(right, this.moveState.right * speedDT);
        }
        else if (this.controls.isLocked) {
            // Desktop Movement
            if (this.keys["KeyW"]) this.controls.moveForward(speedDT);
            if (this.keys["KeyS"]) this.controls.moveForward(-speedDT);
            if (this.keys["KeyA"]) this.controls.moveRight(-speedDT);
            if (this.keys["KeyD"]) this.controls.moveRight(speedDT);
        }
    }
    */
}