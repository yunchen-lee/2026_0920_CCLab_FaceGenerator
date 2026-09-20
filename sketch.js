let particles; // GPU-owned: only { position }
let meta; // CPU-assigned, rarely updated: { strokeId, t, seed }
let computeShader;
let displayShader;
let instance;

let controlPoints;

const numLines = 3;
const particlesPerLine = 150;
const numParticles = numLines * particlesPerLine;

// three fixed straight lines, stacked vertically, each ~400px long
// (kept as a float literal — the shader compiler expects f32, not i32)
const LINE_LEN = 400.0;

async function setup() {
    await createCanvas(600, 600, WEBGPU);
    createCamera();

    let posData = [];
    for (let i = 0; i < numParticles; i++) {
        // random starting position so particles fly in on the first frame,
        // same idea as your circle version
        posData.push({
            position: createVector(
                random(-width, width),
                random(-height, height),
                random(-width, width)
            ),
        });
    }

    particles = createStorage(posData);
    meta = createStorage(buildMeta());

    controlPoints = createStorage([
        // TOP
        {
            p0: createVector(-200, -150, 0),
            p1: createVector(-80, -230, 0),
            p2: createVector(80, -70, 0),
            p3: createVector(200, -150, 0)
        },

        // MIDDLE
        {
            p0: createVector(-200, 0, 0),
            p1: createVector(-100, 100, 0),
            p2: createVector(100, -100, 0),
            p3: createVector(200, 0, 0)
        },

        // BOTTOM
        {
            p0: createVector(-200, 150, 0),
            p1: createVector(-100, 70, 0),
            p2: createVector(100, 230, 0),
            p3: createVector(200, 150, 0)
        }
    ]);

    computeShader = buildComputeShader(simulate);
    displayShader = buildMaterialShader(display);
    instance = buildGeometry(drawParticle);
}

// CPU step: decide which line each particle belongs to, and where along
// that line (t) it sits. This is the low-frequency, one-time-per-assignment
// data — the equivalent of "which stroke / which point in the stroke" that
// will later come from k-means + curve fitting.
function buildMeta() {
    let ids = [];
    for (let i = 0; i < numParticles; i++) {
        ids.push(floor(i / particlesPerLine)); // 0,0,0...,1,1,1...,2,2,2...
    }
    ids = shuffle(ids); // shuffle so the fly-in criss-crosses nicely

    return ids.map((strokeId) => ({
        strokeId: strokeId,
        t: random(0, 1),
        seed: random(0, 1000), // CPU-side random() feeds a stable per-particle
        // offset into noise() on the GPU
    }));
}

function drawParticle() {
    sphere(2);
}

function bezierPointGPU(p0, p1, p2, p3, t) {

    let u = 1.0 - t;

    return p0 * (u * u * u) +
        p1 * (3.0 * u * u * t) +
        p2 * (3.0 * u * t * t) +
        p3 * (t * t * t);
}

// GPU step: every frame, for every particle, recompute where it should be
// (base position on its line + a per-style noise offset), then ease the
// GPU-owned position toward that target.
function simulate() {

    let posData = uniformStorage(particles);
    let metaData = uniformStorage(meta);
    let cpData = uniformStorage(controlPoints);

    let idx = index.x;

    let sid = metaData[idx].strokeId;
    let t = metaData[idx].t;

    // 取得 control points
    let p0 = cpData[sid].p0;
    let p1 = cpData[sid].p1;
    let p2 = cpData[sid].p2;
    let p3 = cpData[sid].p3;

    // Cubic Bezier
    let u = 1.0 - t;

    let base =
        p0 * (u * u * u) +
        p1 * (3.0 * u * u * t) +
        p2 * (3.0 * u * t * t) +
        p3 * (t * t * t);

    let target = base;

    let pos = posData[idx].position;

    posData[idx].position =
        mix(pos, target, 0.08);
}

function display() {
    let data = uniformStorage(particles);
    worldInputs.begin();
    let pos = data[instanceID()].position;
    worldInputs.position.xyz += pos;
    worldInputs.end();
}

function draw() {
    background(245);
    compute(computeShader, numParticles);
    noStroke();
    fill(20);
    lights();
    shader(displayShader);
    model(instance, numParticles);
}

function mouseDragged() {
    // re-run the CPU assignment step (stand-in for "re-run k-means") and
    // push it to the GPU; since positions ease toward their target every
    // frame (mix(..., 0.08) above), this animates smoothly into the new
    // assignment instead of popping.
    meta.update(buildMeta());
}