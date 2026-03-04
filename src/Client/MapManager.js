import * as THREE from "three";
import { StaticGeometryGenerator, computeBoundsTree, disposeBoundsTree, acceleratedRaycast, SAH } from 'three-mesh-bvh';

// Add extension functions to the prototypes
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;


export class MapManager {
    constructor(scene, gltfLoader) {
        this.scene = scene;
        this.gltfLoader = gltfLoader;

        this.colliders = [];
        this.colliderMesh = null;
    }


    async loadZone(url) {
        const gltf = await this.gltfLoader.loadAsync(url);
        const scene = gltf.scene;

    
        scene.traverse((child) => {
            if (child.isMesh) {
                //child.visible = false;
                this.colliders.push(child); 

                if (child.name.startsWith("LIGHT")) {
                    const light = new THREE.SpotLight(0xffffff, 10, 20, Math.PI / 3, 0.5, 1);
                    light.castShadow = true;
                    light.position = child.position;
                    light.rotation = child.rotation;

                    console.log(light);

                    this.scene.add(light);
                }
            }
        });
    
        this.scene.add(scene);
    }


    toggleDebugColliders() {
        this.colliders.forEach(mesh => {
            console.log(mesh);
            // Toggle visibility
            mesh.visible = !mesh.visible;
            
            // Make them wireframe and bright red so they stand out
            if (mesh.material) {
                mesh.material.wireframe = true;
                mesh.material.color.set(0xff0000);
                mesh.material.opacity = 1.0;
                mesh.material.transparent = true;
            }
        });
    }
}