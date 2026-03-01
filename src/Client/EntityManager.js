import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";


export class EntityManager {
    constructor(scene) {
        this.scene = scene;
        this.remotePlayers = new Map();
        this.coins = [];
        this.nextbot = null;
    
        this.loader = new GLTFLoader();
        this.mannequinTemplate = null;
    }
    
    
    async loadAssets() {
        try {
            const gltf = await this.loader.loadAsync("/mannequin.glb");
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


    addRemotePlayer(id, pos) {
        if (!this.mannequinTemplate) return;

        // Clone the template so each player is a unique instance
        const mesh = this.mannequinTemplate.clone();
        mesh.position.set(pos.x, 0, pos.z); // Adjust Y based on your model's origin
        
        this.scene.add(mesh);
        this.remotePlayers.set(id, mesh);
    }

    updateRemotePlayer(id, pos) {
        const mesh = this.remotePlayers.get(id);
        if (mesh) {
            mesh.position.set(pos.x, 0, pos.z);
            if (pos.ry !== undefined) {
                mesh.rotation.y = pos.ry;
            }
        }
    }

    removeRemotePlayer(id) {
        const mesh = this.remotePlayers.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this.remotePlayers.delete(id);
        }
    }


    spawnNextbot(texturePath) {
        const loader = new THREE.TextureLoader();
        const faceTex = loader.load(texturePath);
        const mat = new THREE.SpriteMaterial({ map: faceTex });

        this.nextbot = new THREE.Sprite(mat);
        this.nextbot.scale.set(2, 2, 1);
        this.nextbot.position.set(20, 1.5, 0);

        this.scene.add(this.nextbot);
    }


    updateNextbot(pos) {
        if (this.nextbot) this.nextbot.position.set(pos.x, 1.5, pos.z);
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