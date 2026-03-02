import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";


export class EntityManager {
    constructor(scene, listener) {
        this.scene = scene;
        this.listener = listener;

        this.remotePlayers = new Map();
        this.nextbots = new Map();
        this.coins = [];
    
        this.texLoader = new THREE.TextureLoader();
        this.gltfLoader = new GLTFLoader();
        this.mannequinTemplate = null;

        this.audioLoader = new THREE.AudioLoader();
    }


    update(dt) {
        // Linear interpolation on player positions
        const lerpFactor = 0.15; 
        this.remotePlayers.forEach((player) => {
            player.mesh.position.lerp(player.targetPos, lerpFactor);
            
            player.mesh.rotation.y += (player.targetRot - player.mesh.rotation.y) * lerpFactor;
        });
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
        canvas.width = 256;
        canvas.height = 64;
    
        // Background
        ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    
        // Text Style
        ctx.font = "bold 32px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(name, canvas.width / 2, canvas.height / 2);
    
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMat);
        
        // Position nameplate above the player model
        sprite.scale.set(2, 0.5, 1);
        sprite.position.y = 3; 
        
        return sprite;
    }


    addRemotePlayer(id, data) {
        if (!this.mannequinTemplate) return;

        const group = new THREE.Group(); // Model + nameplate group
        const model = this.mannequinTemplate.clone();
        const nameplate = this.createNameplate(data.playerName || "Ragamuffin");

        group.add(model);
        group.add(nameplate);
        group.position.set(data.x, 0, data.z);

        this.scene.add(group);
        
        this.remotePlayers.set(id, {
            mesh: group,
            targetPos: new THREE.Vector3(data.x, 0, data.z),
            targetRot: -data.ry || 0
        });
    }

    updateRemotePlayer(id, data) {
        const player = this.remotePlayers.get(id);
        if (player) {
            player.targetPos.set(data.x, 0, data.z);
            if (data.ry !== undefined)
                player.targetRot = -data.ry;
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
                this.spawnNextbot(id, `/${botData.type}.png`);
                
            // Update Position (Lerp here for smoothness)
            const bot = this.nextbots.get(id);
            bot.sprite.position.lerp(new THREE.Vector3(botData.x, 3.5, botData.z), 0.2);
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
        
        this.audioLoader.load(`/thick-of-it.mp3`, (buffer) => {
            sound.setBuffer(buffer);
            sound.setRefDistance(10);   // Distance where volume starts dropping
            sound.setMaxDistance(50);  // Distance where it becomes silent
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