let particles;
let targets;
let computeShader;
let displayShader;
let instance;
let cam;
let cameraAngle = 0;
const cameraDistance = 800;
let angles = [];
const numParticles = 360;
const radius = 250;

async function setup() {
    await createCanvas(600, 600, WEBGPU);
    cam = createCamera();
    // cam.lookAt(0, 0, 0);

    // fixed angle assigned to each particle (shuffled so the initial
    // criss-cross into the circle looks nicer)
    for (let i = 0; i < numParticles; i++) {
        angles.push(i / numParticles * TWO_PI);
    }
    angles = shuffle(angles);


    // create particles: only GPU-owned position lives here
    let data = [];
    let initialTargets = [];
    for (let i = 0; i < numParticles; i++) {
        data.push({
            position: createVector(
                random(-width, width),
                random(-height, height),
                random(-width, width)
            ),
        });
        initialTargets.push({ targetPos: createVector(0, 0, 0) });
    }
    particles = createStorage(data);
    targets = createStorage(initialTargets);

    computeShader = buildComputeShader(simulate);
    displayShader = buildMaterialShader(display);
    instance = buildGeometry(drawParticle);
    updateTargets();

}

function drawParticle() {
    sphere(1);
}

function simulate() {
    let posData = uniformStorage(particles);
    let targetData = uniformStorage(targets);
    let idx = index.x; // 1D data index
    let pos = posData[idx].position;
    let target = targetData[idx].targetPos;

    pos = mix(pos, target, 0.05);
    posData[idx].position = pos;
}

function display() {
    let data = uniformStorage(particles);
    worldInputs.begin();
    let pos = data[instanceID()].position; // instanceID() get the index of the current instance.
    worldInputs.position.xyz += pos;
    worldInputs.end();
}

function updateTargets() {

    // // circle's horizontal direction in world space
    // let right = createVector(
    //     cos(cameraAngle),
    //     0, -sin(cameraAngle)
    // );

    // // vertical direction stays the same
    // let up = createVector(0, 1, 0);

    // let newTargets = angles.map((a) => {

    //     let x = cos(a) * radius;
    //     let y = sin(a) * radius;

    //     return {
    //         targetPos: createVector(
    //             right.x * x + up.x * y,
    //             right.y * x + up.y * y,
    //             right.z * x + up.z * y
    //         )
    //     };
    // });

    let newTargets = angles.map((a) => {

        let x = cos(a) * radius;
        let y = sin(a) * radius;

        return {
            targetPos: createVector(
                x, y, 0
            )
        };
    });

    targets.update(newTargets);
}

function draw() {
    // orbitControl();

    // if (mouseIsPressed) {
    //     updateTargets();
    // }

    // let c = _renderer.currentCamera;

    // console.log(
    //     "eye:",
    //     cam.eyeX.toFixed(2),
    //     cam.eyeY.toFixed(2),
    //     cam.eyeZ.toFixed(2)
    // );

    background(245);
    compute(computeShader, numParticles);
    noStroke();
    fill(255);
    lights();
    shader(displayShader);
    model(instance, numParticles);

    // console.log(_renderer.uViewMatrix.mat4);
}

function mouseDragged() {
    // cameraAngle += movedX * 0.01;

    // move camera around Y axis
    // cam.setPosition(
    // 400 * cos(frameCount * 0.01), -400, 800
    // );

    // cam.lookAt(0, 0, 0);

    angles = shuffle(angles);
    updateTargets();
}