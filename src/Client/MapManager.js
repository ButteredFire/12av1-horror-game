import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Pathfinding, PathfindingHelper } from 'three-pathfinding';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { CONSTS } from "../Constants";


export class MapManager {
    constructor(world, scene, gltfLoader) {
        this.world = world;
        this.scene = scene;
        this.gltfLoader = gltfLoader;

        this.xrayGeom = [];

        this.pathfinding = new Pathfinding();
        this.pathfindingHelper = new PathfindingHelper();
        this.scene.add(this.pathfindingHelper);
        this.zone = null;

        this.origin = new THREE.Vector3(13,0,26);
    }


    update(dt, playerPos) {
        return;
        
        let playerFeetPos = playerPos.clone();
        playerFeetPos.y -= CONSTS.PLAYER_HEIGHT;

        console.log("feet: ", playerFeetPos);

        this.origin = new THREE.Vector3(0,playerFeetPos.y,0);

        let groupID = this.pathfinding.getGroup(this.zone, this.origin);
        const closest = this.pathfinding.getClosestNode(this.origin, this.zone, groupID);

        let navPath = this.pathfinding.findPath(closest.centroid, playerFeetPos, this.zone, groupID);
        if (navPath) {
            this.pathfindingHelper.reset();

            this.pathfindingHelper.setPlayerPosition(this.origin);
            this.pathfindingHelper.setTargetPosition(playerFeetPos);
            this.pathfindingHelper.setPath(navPath);
        }
        else {
            const playerGroup = this.pathfinding.getGroup(this.zone, playerFeetPos);
            console.log(`No navpath detected; Origin = ${groupID}, Player = ${playerGroup}`);
        }
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

                const isCollider = child.name.includes("UCX");
                const isNavmesh = child.name.includes("NAV");
                const isXray = child.name.includes("XR");
                if (isCollider || isNavmesh) {
                    child.visible = false;

                    if (isNavmesh && !isCollider && url.includes("nav")) {
                        child.visible = true;
                        child.material = new THREE.MeshBasicMaterial({
                            color: 0xff0000,
                            wireframe: true
                        });
                    }

                    if (isXray) {
                        this.xrayGeom.push(child);
                    }
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


    async loadNavMesh(url) {
        const gltf = await this.gltfLoader.loadAsync(url);
        const mesh = gltf.scene;

        let geometries = [];

        mesh.traverse((child) => {
            if (!child.isMesh) return;

            child.visible = false;
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


    hideXrayGeometry() {
        this.xrayGeom.forEach(geom => {
            console.log(geom.name);
            geom.material.transparent = true;
        });
    }
}