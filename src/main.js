import { Engine } from "./Client/Engine"


window.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById("start-button");
    const input = document.getElementById("username-input");
    const screen = document.getElementById("login-screen");

    startBtn.addEventListener("click", () => {
        const name = input.value || "Hedgeborn";
        screen.style.display = "none";
        
        const engine = new Engine(name); // Pass the name here
        engine.start();
    });
});






/**
import * as THREE from 'three';
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';

// 1. Networking (Connect to your local Node server)
const socket = io('http://localhost:3000');

// 2. Scene Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); // Dark grey

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 1.6; // Human eye level (meters)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 3. Visual Landmarks (So you know you're moving)
const grid = new THREE.GridHelper(100, 100);
scene.add(grid);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const flashlight = new THREE.PointLight(0xffffff, 1, 15);
scene.add(flashlight);



// Jason Nextbot
const loader = new THREE.TextureLoader();
const faceTex = loader.load('/jason.jpg'); // Ensure your file is in /public/face.png
const nextbotMaterial = new THREE.SpriteMaterial({ map: faceTex });
const nextbot = new THREE.Sprite(nextbotMaterial);

nextbot.scale.set(2, 2, 1); // Make it 2 meters tall
nextbot.position.set(20, 1.5, 0); // Start it away from the player
scene.add(nextbot);

// Listen for the server's AI updates
socket.on('nextbotUpdate', (pos) => {
    nextbot.position.set(pos.x, 1.5, pos.z);
});



// 4. Controls Setup
const controls = new PointerLockControls(camera, document.body);

// Instructions overlay click logic
const instructions = document.getElementById('instructions');
document.addEventListener('click', () => {
    controls.lock();
});

controls.addEventListener('lock', () => {
    instructions.style.display = 'none';
});

controls.addEventListener('unlock', () => {
    instructions.style.display = 'block';
});

// 5. Input Handling
const keys = {};
document.addEventListener('keydown', (e) => keys[e.code] = true);
document.addEventListener('keyup', (e) => keys[e.code] = false);



const coins = [];
//const coinGeo = new THREE.SphereGeometry(0.3, 16, 16);
//const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0x554400 });
const coinTex = loader.load('/coin.png');
const coinMat = new THREE.SpriteMaterial({ map: coinTex });

function spawnCoins(count) {
    for (let i = 0; i < count; i++) {
        //const coin = new THREE.Mesh(coinGeo, coinMat);
        const coin = new THREE.Sprite(coinMat);
        coin.position.set(
            (Math.random() - 0.5) * 40, 
            0.5, 
            (Math.random() - 0.5) * 40
        );
        scene.add(coin);
        coins.push(coin);
    }
}
spawnCoins(15);




// 6. The Render Loop (The "Heartbeat")
function animate() {
    requestAnimationFrame(animate);

    if (controls.isLocked) {
        const speed = 0.15;
        if (keys['KeyW']) controls.moveForward(speed);
        if (keys['KeyS']) controls.moveForward(-speed);
        if (keys['KeyA']) controls.moveRight(-speed);
        if (keys['KeyD']) controls.moveRight(speed);
    }


    // Sync flashlight to player
    flashlight.position.copy(camera.position);

    // Send position to server
    socket.emit('move', {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
    });


    renderer.render(scene, camera);
}

animate();

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
 */