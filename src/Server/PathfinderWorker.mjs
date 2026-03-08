import { Pathfinding } from 'three-pathfinding';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BufferGeometry, BufferAttribute } from 'three';
import { workerData } from 'piscina';
import fs from 'fs';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

let pathfinding;
const { zoneName, navPath } = workerData;

async function initPathfinding() {
    if (pathfinding) return;

    pathfinding = new Pathfinding();
    const loader = new GLTFLoader();
    
    // Read file from disk
    const data = fs.readFileSync(navPath);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

    return new Promise((resolve, reject) => {
        loader.parse(arrayBuffer, '', (gltf) => {
            const geometries = [];
            gltf.scene.traverse((child) => {
                if (child.isMesh) {
                    // 1. Get the geometry and ensure it is non-indexed 
                    // This prevents the 'getIndex' null error
                    let geom = child.geometry.toNonIndexed();

                    // 2. Clean up attributes. 
                    // mergeGeometries fails if one mesh has 'uv' and another doesn't.
                    // For a NavMesh, we ONLY care about 'position'.
                    const positionAttr = geom.getAttribute('position');
                    geom = new THREE.BufferGeometry();
                    geom.setAttribute('position', positionAttr);

                    // 3. Since you already normalized transforms in Blender, 
                    // you don't need applyMatrix4, but it's safer to keep 
                    // if you ever move objects in the Blender Hierarchy.
                    geometries.push(geom);
                }
            });

            if (geometries.length === 0) {
                return reject(new Error("No meshes found in NavMesh GLB"));
            }

            const merged = BufferGeometryUtils.mergeGeometries(geometries);
            const welded = BufferGeometryUtils.mergeVertices(merged, 0.1);
            const zoneData = Pathfinding.createZone(welded, 0.5);
            
            pathfinding.setZoneData(zoneName, zoneData);

            //console.log("NavMesh Groups created:", pathfinding.zones[zoneName].groups.length);

            resolve();
        }, reject);
    });
}

/**
 * Piscina ESM workers use 'export default' as the task handler.
 */
export default async ({ botVec, playerVec }) => {
    await initPathfinding();

    try {
        const groupID = pathfinding.getGroup(zoneName, botVec);
        if (groupID === null || groupID === undefined) return null;

        const startNode = pathfinding.getClosestNode(botVec, zoneName, groupID);
        //const endNode = pathfinding.getClosestNode(playerVec, zoneName, groupID);

        //if (!startNode || !endNode) return null;
        if (!startNode) return null;

        // Returns an array of THREE.Vector3 points
        //console.log("bot:", botVec);
        //console.log("player:", playerVec);
        return pathfinding.findPath(startNode.centroid, playerVec, zoneName, groupID);
    } catch (e) {
        console.error("Worker Pathfinding Error:", e);
        return null;
    }
};