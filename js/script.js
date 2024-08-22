import * as THREE from 'https://cdn.skypack.dev/three@0.128.0';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.128.0/examples/jsm/controls/OrbitControls.js';

// Setup scene, camera, and renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit controls
const orbit = new OrbitControls(camera, renderer.domElement);
camera.position.set(10, 15, -22);
orbit.update();

// Plane (for mouse interaction) and grid
const planeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        visible: false
    })
);
planeMesh.rotateX(-Math.PI / 2);
scene.add(planeMesh);

const grid = new THREE.GridHelper(20, 20);
scene.add(grid);

// Highlight tile
const highlightMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        color: 0xffffff,
        opacity: 0.5
    })
);
highlightMesh.rotateX(-Math.PI / 2);
highlightMesh.position.set(0.5, 0, 0.5);
scene.add(highlightMesh);

// Tile colors and storage
const tileColors = { start: 0x00ff00, end: 0xff0000 };
const tiles = {};
let startTile = null;
let endTile = null;

// Initialize grid and place tiles
function getRandomPosition() {
    return {
        x: Math.floor(Math.random() * 20),
        z: Math.floor(Math.random() * 20)
    };
}

function placeTile(color, type) {
    let position;
    do {
        position = getRandomPosition();
    } while (tiles[`${position.x}-${position.z}`]); // Ensure tile is not already placed

    const tileMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
            side: THREE.DoubleSide,
            color: color,
            transparent: true,
            opacity: 0.5
        })
    );
    tileMesh.rotateX(-Math.PI / 2);
    tileMesh.position.set(position.x - 10 + 0.5, 0, position.z - 10 + 0.5); // Center within the grid
    scene.add(tileMesh);

    tiles[`${position.x}-${position.z}`] = tileMesh;

    if (type === 'start') startTile = position;
    if (type === 'end') endTile = position;
}

// Place the start and end tiles
placeTile(tileColors.start, 'start');
placeTile(tileColors.end, 'end');

// Raycaster for mouse picking
const raycaster = new THREE.Raycaster();
const mousePosition = new THREE.Vector2();
let intersects;

// Array to store objects (obstacles)
const objects = [];

// Function to create a simple building
function createBuilding() {
    const buildingGeometry = new THREE.BoxGeometry(1, 2, 1); // Width, Height, Depth
    const buildingMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green color
    const buildingMesh = new THREE.Mesh(buildingGeometry, buildingMaterial);
    return buildingMesh;
}

// Function to create a simple bridge
function createBridge() {
    const bridgeGeometry = new THREE.BoxGeometry(2, 0.5, 1); // Width, Height, Depth
    const bridgeMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff }); // Blue color
    const bridgeMesh = new THREE.Mesh(bridgeGeometry, bridgeMaterial);
    return bridgeMesh;
}

// Mouse move event listener to highlight tile
window.addEventListener('mousemove', function (e) {
    mousePosition.x = (e.clientX / window.innerWidth) * 2 - 1;
    mousePosition.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mousePosition, camera);
    intersects = raycaster.intersectObject(planeMesh);

    if (intersects.length > 0) {
        const intersect = intersects[0];
        const highlightPos = new THREE.Vector3().copy(intersect.point).floor().addScalar(0.5);
        highlightMesh.position.set(highlightPos.x, 0, highlightPos.z);

        const objectExist = objects.find(object =>
            object.position.x === highlightMesh.position.x &&
            object.position.z === highlightMesh.position.z
        );

        highlightMesh.material.color.setHex(objectExist ? 0xff0000 : 0xffffff);
    }
});

// Mouse click event listener to place objects
window.addEventListener('mousedown', function (e) {
    const objectExist = objects.find(object =>
        Math.round(object.position.x) === Math.round(highlightMesh.position.x) &&
        Math.round(object.position.z) === Math.round(highlightMesh.position.z)
    );

    if (!objectExist && intersects.length > 0) {
        const gridPosition = highlightMesh.position.clone();
        gridPosition.x = Math.round(gridPosition.x);
        gridPosition.z = Math.round(gridPosition.z);

        if (e.button === 2) { // Right-click to place a building
            const buildingMesh = createBuilding();
            buildingMesh.position.copy(gridPosition);
            buildingMesh.position.y = 1; // Adjust height so the building is above the ground
            scene.add(buildingMesh);
            objects.push(buildingMesh);
            highlightMesh.material.color.setHex(0xff0000); // Red for occupied tile
        } else if (e.button === 0) { // Left-click to place a bridge
            const bridgeMesh = createBridge();
            bridgeMesh.position.copy(gridPosition);
            bridgeMesh.position.y = 0.25; // Adjust height so the bridge is above the ground
            scene.add(bridgeMesh);
            objects.push(bridgeMesh);
            highlightMesh.material.color.setHex(0xff0000); // Red for occupied tile
        }
    }
});

// Prevent context menu from appearing on right-click
window.addEventListener('contextmenu', function (e) {
    e.preventDefault();
});

// Find path button event listener
document.getElementById('findPathBtn').addEventListener('click', function () {
    if (startTile && endTile) {
        // Remove any previous path from the scene
        scene.children.forEach(child => {
            if (child.material && child.material.color && child.material.color.getHex() === 0x0000ff) {
                scene.remove(child);
            }
        });

        const path = findPath(startTile, endTile);
        drawPath(path);
    } else {
        alert('Please ensure both start and end tiles are placed.');
    }
});

// Pathfinding logic (A* algorithm, no diagonal moves)
function findPath(start, end) {
    const openList = [];
    const closedList = [];
    const startNode = { x: start.x, z: start.z, g: 0, h: 0, f: 0, parent: null };
    const endNode = { x: end.x, z: end.z };
    openList.push(startNode);

    while (openList.length > 0) {
        const currentNode = openList.reduce((prev, curr) => prev.f < curr.f ? prev : curr);
        openList.splice(openList.indexOf(currentNode), 1);
        closedList.push(currentNode);

        if (currentNode.x === endNode.x && currentNode.z === endNode.z) {
            const path = [];
            let curr = currentNode;
            while (curr) {
                path.push({ x: curr.x, z: curr.z });
                curr = curr.parent;
            }
            return path.reverse();
        }

        const neighbors = getNeighbors(currentNode);
        neighbors.forEach(neighbor => {
            if (!closedList.find(node => node.x === neighbor.x && node.z === neighbor.z)) {
                const gScore = currentNode.g + 1;

                let neighborNode = openList.find(node => node.x === neighbor.x && node.z === neighbor.z);

                if (!neighborNode) {
                    neighborNode = {
                        x: neighbor.x,
                        z: neighbor.z,
                        g: gScore,
                        h: heuristic(neighbor, endNode),
                        f: gScore + heuristic(neighbor, endNode),
                        parent: currentNode
                    };
                    openList.push(neighborNode);
                } else if (gScore < neighborNode.g) {
                    neighborNode.g = gScore;
                    neighborNode.f = gScore + neighborNode.h;
                    neighborNode.parent = currentNode;
                }
            }
        });
    }

    return [];
}

function getNeighbors(node) {
    const directions = [
        { x: -1, z: 0 }, { x: 1, z: 0 }, // Left, Right
        { x: 0, z: -1 }, { x: 0, z: 1 }  // Down, Up
    ];
    return directions.map(dir => ({
        x: node.x + dir.x,
        z: node.z + dir.z
    })).filter(pos =>
        pos.x >= 0 && pos.x < 20 && pos.z >= 0 && pos.z < 20 &&
        !objects.find(object => object.position.x === pos.x - 10 + 0.5 && object.position.z === pos.z - 10 + 0.5)
    );
}

function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

function drawPath(path) {
    path.forEach(tile => {
        const pathTile = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                side: THREE.DoubleSide,
                color: 0x0000ff,
                transparent: true,
                opacity: 0.5
            })
        );
        pathTile.rotateX(-Math.PI / 2);
        pathTile.position.set(tile.x - 10 + 0.5, 0.01, tile.z - 10 + 0.5); // Slightly above the grid to prevent z-fighting
        scene.add(pathTile);
    });
}

// Render loop
function animate() {
    requestAnimationFrame(animate);
    orbit.update(); // Update the orbit controls
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
