import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";


export class MapManager {
    constructor(world, scene, gltfLoader) {
        this.world = world;
        this.scene = scene;
        this.gltfLoader = gltfLoader;
    }


    async load(url) {
        const gltf = await this.gltfLoader.loadAsync(url);
        const mesh = gltf.scene;
    
        mesh.traverse((child) => {
            console.log(child.name);
            if (child.isMesh) {
                child.receiveShadow = true;
                child.castShadow = true;
                child.material.side = THREE.DoubleSide;

                if (child.name.startsWith("UCX")) {
                    child.visible = false;
                }

                const vertices = child.geometry.attributes.position.array;
                const indices = child.geometry.index.array;

                const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices, indices);
                this.world.createCollider(colliderDesc);
            }

            else if (child.name.startsWith("LIGHT")) {
                console.log("LIGHT");
                const light = new THREE.SpotLight(0xffffff, 10, 20, Math.PI / 3, 0.5, 1);
                light.castShadow = true;
                light.position.copy(child.position);
                light.rotation.copy(child.rotation);

                this.scene.add(light);
            }
        });

    
        this.scene.add(mesh);
    }


    toggleDebugColliders(collidersVisible, lightingAffectsWireframe) {
        const wireColor = 0xff0000;
        let wireMat = null;

        if (lightingAffectsWireframe)
            wireMat = new THREE.MeshStandardMaterial({
                color: wireColor,
                wireframe: true
            });
        else
            wireMat = new THREE.MeshBasicMaterial({
                color: wireColor,
                wireframe: true
            });


        //this.colliders.forEach(mesh => {
        //    mesh.visible = collidersVisible;
        //    mesh.receiveShadow = lightingAffectsWireframe;
        //    
        //    if (mesh.material)
        //        mesh.material = wireMat;
        //});
    }
}