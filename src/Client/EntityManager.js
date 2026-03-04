import * as THREE from "three";
import { CONSTS } from "./Constants";


export class EntityManager {
    constructor(scene, listener, texLoader, gltfLoader, audioLoader) {
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
    }


    update(dt) {
        // Linear interpolation on player positions
        this.remotePlayers.forEach((player) => {
            player.mesh.position.lerp(player.targetPos, CONSTS.LERP_FACTOR);
            
            player.mesh.rotation.y += (player.targetRot - player.mesh.rotation.y) * CONSTS.LERP_FACTOR;
        });
    }


    reset() {
        for (const [id, _] of this.remotePlayers)
            this.removeRemotePlayer(id);

        this.remotePlayers.clear();
        this.remotePlayers = new Map();
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


    addRemotePlayer(id, data) {
        if (!this.mannequinTemplate) {
            console.error("PROGRAMMER ERROR: Mannequin asset has not finished loading yet!");
            return;
        }

        const group = new THREE.Group();
        const model = this.mannequinTemplate.clone();
        const nameplate = this.createNameplate(data.playerName);

        group.add(model);
        group.add(nameplate);
        group.position.set(data.x, data.y - CONSTS.PLAYER_HEIGHT, data.z);

        this.scene.add(group);
        
        this.remotePlayers.set(id, {
            mesh: group,
            targetPos: new THREE.Vector3(data.x, 0, data.z),
            //targetPos: group.position,
            //targetRot: data.ry || 0
            targetRot: data.ry
        });
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


    updateNextbots(nextbots) {
        //if (this.nextbots[id]) this.nextbots[id].position.set(pos.x, 1.5, pos.z);
        for (let id in nextbots) {
            const botData = nextbots[id];
            
            // Create new Nextbot if it doesn't exist
            if (!this.nextbots.has(id))
                this.spawnNextbot(id, `/nextbots/${botData.type}.png`);
                
            // Update Position (Lerp here for smoothness)
            const bot = this.nextbots.get(id);
            bot.sprite.position.lerp(new THREE.Vector3(botData.x, 3.5, botData.z), CONSTS.LERP_FACTOR);
        }
    }

    spawnNextbot(id, texturePath) {
        // Sprite
        const map = this.texLoader.load(texturePath);
        const material = new THREE.SpriteMaterial({ map: map });
        const sprite = new THREE.Sprite(material);
        
        sprite.scale.set(5, 5, 1);
        this.scene.add(sprite);

        // Sound
        const sound = new THREE.PositionalAudio(this.listener);
        
        this.audioLoader.load("/sfx/armed-and-dangerous.mp3", (buffer) => {
            sound.setBuffer(buffer);
            sound.setRefDistance(5);   // Distance where volume starts dropping
            sound.setMaxDistance(15);  // Distance where it becomes silent
            sound.setLoop(true);
            sound.setVolume(1.0);
            sound.play();
        });

        sprite.add(sound);


        this.nextbots.set(id, { sprite, sound });
    }


    spawnCoins(count) {
        const loader = new THREE.TextureLoader();
        const coinTex = loader.load("/coin.png");
        const coinMat = new THREE.SpriteMaterial({ map: coinTex });

        for (let i = 0; i < count; i++) {
            const coin = new THREE.Sprite(coinMat);
            coin.position.set((Math.random() - 0.5) * 40, 0.5, (Math.random() - 0.5) * 40);
            this.scene.add(coin);
            this.coins.push(coin);
        }
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
        if (this.nextbot && playerPos.distanceTo(this.nextbot.position) < 1.5) {
            return { type: "GAME_OVER" };
        }
        return null;
    }
}