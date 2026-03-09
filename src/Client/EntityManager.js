import * as THREE from "three";
import { CONSTS } from "../Constants";
import * as UTILS from "../Utils";
import RAPIER from "@dimforge/rapier3d-compat";

import { Pathfinding, PathfindingHelper } from 'three-pathfinding';


export class EntityManager {
    constructor(world, scene, listener, texLoader, gltfLoader, audioLoader) {
        this.world = world;
        this.scene = scene;
        this.listener = listener;

        this.remotePlayers = new Map();
        this.nextbots = new Map();
        this.coins = [];
    
        this.texLoader = texLoader;
        this.gltfLoader = gltfLoader;
        this.audioLoader = audioLoader;

        this.mannequinTemplate = null;
        this.mannequin = null;
        this.cnt = 0;
        
        this.localCoins = new Map();
    }


    update(dt) {
        // Calculate a frame-rate independent alpha
        // Higher dt = larger alpha (to catch up)
        const alpha = 1 - Math.pow(1 - CONSTS.LERP_FACTOR, dt * CONSTS.TARGET_FPS);

        // UPDATE PLAYERS
        this.remotePlayers.forEach((player) => {
            // Position Lerp
            player.mesh.position.lerp(player.targetPos, alpha);
            
            // Rotation Lerp (Using lerp logic for the Y axis)
            const rotDiff = player.targetRot - player.mesh.rotation.y;
            player.mesh.rotation.y += rotDiff * alpha;


            // Flashlight
            const lightPos = new THREE.Vector3(player.mesh.position.x, player.mesh.position.y, player.mesh.position.z);
            player.flashlight.position.copy(lightPos);
            player.flashlight.position.y += CONSTS.PLAYER_HEIGHT;

            const vector = new THREE.Vector3(0, 0, 1);
            vector.applyQuaternion(player.mesh.quaternion);
            player.flashlight.target.position.copy(lightPos).add(vector);
        });


        


        // UPDATE NEXTBOTS
        this.nextbots.forEach((bot) => {
            bot.sprite.position.lerp(bot.targetPos, alpha);
        });
    }


    reset() {
        for (const [id, _] of this.remotePlayers)
            this.removeRemotePlayer(id);

        for (const [id, _] of this.nextbots)
            this.removeNextbot(id);

        this.remotePlayers.clear();
        this.remotePlayers = new Map();
        
        this.nextbots.clear();
        this.nextbots = new Map();
    }
    
    
    async loadAssets() {
        try {
            const gltf = await this.gltfLoader.loadAsync("/mannequin.glb");
            this.mannequinTemplate = gltf.scene;
            // Traverse to ensure shadows/materials are set if needed
            this.mannequinTemplate.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    this.mannequin = child;
                }
            });

            console.log("Mannequin model loaded.");
        } catch (error) {
            console.error("Error loading model:", error);
        }
    }


    createNameplate(name) {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        const fontSize = 32;
        ctx.font = `bold ${fontSize}px Arial`;

        const textMetrics = ctx.measureText(name);
        const textWidth = textMetrics.width;
        const padding = 20;

        canvas.width = textWidth + padding;
        canvas.height = fontSize + padding;

        ctx.font = `bold ${fontSize}px Arial`;  // NOTE: Re-setting canvas dimensions clears the context for some reason
    
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        
        // Convert pixels to 3D world units
        const worldScale = 0.01; 
        sprite.scale.set(
            canvas.width * worldScale, 
            canvas.height * worldScale, 
            1
        );

        sprite.position.y = CONSTS.PLAYER_HEIGHT + 0.75; 
        
        return sprite;
    }


    createPlayerLabel(isHost, player, name) {
        const div = document.createElement('div');
        div.className = 'player-label';
        div.textContent = name;
        div.style.color = '#0f0'; // Tactical Green
        div.style.fontFamily = 'monospace';
        div.style.fontSize = '24px';
        div.style.padding = '2px 10px';
        div.style.background = 'rgba(0, 50, 0, 0.8)';
        div.style.border = '1px solid #0f0';
    
        const label = new CSS2DObject(div);
        label.position.set(0, 90, 0);
        player.mesh.add(label);

        label.visible = this.isHost;
    }


    addRemotePlayer(isHost, id, data) {
        if (data.isHost)
            return;

        if (!this.mannequinTemplate) {
            console.error("PROGRAMMER ERROR: Mannequin asset has not finished loading yet!");
            return;
        }

        const group = new THREE.Group();
        const model = this.mannequinTemplate.clone();
        const nameplate = this.createNameplate(data.playerName);
        const flashlight = new THREE.SpotLight(0xffffff, 10, 30, Math.PI / 4, 0.5, 1);

        flashlight.castShadow = true;
        flashlight.shadow.mapSize.width = 512;
        flashlight.shadow.mapSize.height = 512;
        flashlight.shadow.camera.near = 0.5;
        flashlight.shadow.camera.far = 25;


        group.add(model);
        group.add(nameplate);
        group.position.set(data.x, data.y - CONSTS.PLAYER_HEIGHT, data.z);

        this.scene.add(group);
        this.scene.add(flashlight);
        this.scene.add(flashlight.target);
        
        this.remotePlayers.set(id, {
            mesh: group,
            flashlight: flashlight,
            targetPos: new THREE.Vector3(data.x, 0, data.z),
            //targetPos: group.position,
            //targetRot: data.ry || 0
            targetRot: data.ry
        });

        this.createPlayerLabel(isHost, this.remotePlayers.get(id), data.playerName || "Ragamuffin");

        this.updateRemotePlayer(id, data);
    }

    updateRemotePlayer(id, data) {
        const player = this.remotePlayers.get(id);
        if (player) {
            player.targetPos.set(data.x, data.y - CONSTS.PLAYER_HEIGHT, data.z);
            

            // Prevent player mesh spinning full-circle due to Math.atan2 resetting from PI to -PI or vice versa
            let delta = data.ry - player.targetRot;
                // Normalize the delta to stay within [-PI, PI]
            if (delta > Math.PI) delta -= Math.PI * 2;
            if (delta < -Math.PI) delta += Math.PI * 2;

            const turnSpeed = 0.1; // Adjust for "snappiness"
            player.targetRot += delta * turnSpeed;
        }
    }

    removeRemotePlayer(id) {
        const player = this.remotePlayers.get(id);
        if (player) {
            this.scene.remove(player.mesh);
            this.remotePlayers.delete(id);
        }
    }


    updateNextbots(nextbotsData) {
        for (let id in nextbotsData) {
            const data = nextbotsData[id];
            
            if (!this.nextbots.has(id)) {
                this.spawnNextbot(id, data);
            } else {
                const bot = this.nextbots.get(id);

                bot.targetPos.set(data.x, data.y, data.z);
                //bot.sprite.position.lerp(new THREE.Vector3(data.x, data.y, data.z), CONSTS.LERP_FACTOR);

                //bot.bot.onServerUpdate(data);

                // OPTIONAL: Update a "Sensor" or "Ghost Collider" here 
                // if you want the player to physically bump into the bot.
                //if (bot.ghostCollider) {
                //    bot.ghostCollider.setTranslation({ x: data.x, y: data.y, z: data.z });
                //}
            }
            
            //const bot = this.nextbots.get(id);
            //bot.sprite.position.lerp(new THREE.Vector3(data.x, data.y, data.z), CONSTS.LERP_FACTOR);
        }
    }

    spawnNextbot(id, nextbot) {
        // Sprite
        const map = this.texLoader.load(`/nextbots/${nextbot.type}.png`);
        const material = new THREE.SpriteMaterial({ map: map });
        const sprite = new THREE.Sprite(material);
        
        sprite.scale.set(5, 5, 1);
        this.scene.add(sprite);

        // Sounds
        const sound = new THREE.PositionalAudio(this.listener);
        
        this.audioLoader.load(`/sfx/${nextbot.sound}.mp3`, (buffer) => {
            sound.setBuffer(buffer);
            sound.setRefDistance(3);   // Distance where volume starts dropping
            sound.setMaxDistance(10);  // Distance where it becomes silent
            sound.setLoop(true);
            sound.setVolume(1.0);
            sound.play();
        });

        sprite.add(sound);


        const pathHelper = new PathfindingHelper();
        this.scene.add(pathHelper);


        this.nextbots.set(id, {
            sprite: sprite,
            sound: sound,
            targetPos: new THREE.Vector3(nextbot.x, nextbot.y, nextbot.z),
            pathfindingHelper: pathHelper
        });
    }


    visualize(data, camPos) {
        const bot = this.nextbots.get(data.id);

        const botVec = new THREE.Vector3(data.bot.x, data.bot.y - CONSTS.NEXTBOT_HEIGHT, data.bot.z);
        const playerVec = new THREE.Vector3(camPos.x, camPos.y - CONSTS.PLAYER_HEIGHT, camPos.z);


        bot.pathfindingHelper.reset();
        bot.pathfindingHelper.setPlayerPosition(botVec);
        bot.pathfindingHelper.setTargetPosition(playerVec);
        bot.pathfindingHelper.setPath(data.currentPath);
    }


    removeNextbot(id) {
        const bot = this.nextbots.get(id);
        if (bot) {
            bot.sound.stop();
            this.scene.remove(bot.sound);
            this.scene.remove(bot.sprite);
            this.nextbots.delete(id);
        }
    }


    // Replace/Update in EntityManager.js
    spawnCoinsFromServer(coinData) {
        const geo = new THREE.SphereGeometry(0.4, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        

        coinData.forEach(c => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(c.x, c.y, c.z);
            this.scene.add(mesh);
            this.localCoins.set(c.id, mesh);
        });
    }

    removeCoin(coinId) {
        const mesh = this.localCoins.get(coinId);
        if (mesh) {
            this.scene.remove(mesh);
            this.localCoins.delete(coinId);
        }
    }

    // Update your checkCollisions for coins
    checkCoinCollisions(playerPos, socket) {
        this.localCoins.forEach((mesh, id) => {
            if (playerPos.distanceTo(mesh.position) < 3.0) {
                socket.emit("collectCoin", id);
                this.removeCoin(id); // Optimistic removal
            }
        });
    }


    checkCollisions(playerPos) {
        // Coin collision
        for (let i = this.coins.length - 1; i >= 0; i--) {
            if (playerPos.distanceTo(this.coins[i].position) < 1.0) {
                this.scene.remove(this.coins[i]);
                this.coins.splice(i, 1);
                return { type: "COIN" };
            }
        }
        // Nextbot collision
        //if (this.nextbot && playerPos.distanceTo(this.nextbot.position) < 1.5) {
        //    return { type: "GAME_OVER" };
        //}

        return null;
    }
}
