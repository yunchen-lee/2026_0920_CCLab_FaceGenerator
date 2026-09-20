let particles; // GPU-owned: only { position }
let meta; // CPU-assigned, rarely updated: { strokeId, t, seed }
let computeShader;
let displayShader;
let instance;

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

// GPU step: every frame, for every particle, recompute where it should be
// (base position on its line + a per-style noise offset), then ease the
// GPU-owned position toward that target.
function simulate() {
    let posData = uniformStorage(particles);
    let metaData = uniformStorage(meta);
    let idx = index.x;

    let sid = metaData[idx].strokeId;
    let t = metaData[idx].t;
    let seed = metaData[idx].seed;

    let target = vec3(0.0, 0.0, 0.0);

    // ==========================================
    // TOP — smooth hand-drawn line
    // ==========================================
    if (sid < 0.5) {

        let x = -LINE_LEN / 2.0 + t * LINE_LEN;

        // low frequency → smooth large movement
        let n = noise(t * 3.0, seed) - 0.5;

        let y = -150.0 + n * 50.0;

        target = vec3(x, y, 0.0);


        // ==========================================
        // MIDDLE — crayon / grain
        // ==========================================
    } else if (sid < 1.5) {

        let x = -LINE_LEN / 2.0 + t * LINE_LEN;

        // high frequency → irregular particles
        let nx = noise(t * 30.0, seed) - 0.5;
        let ny = noise(t * 30.0, seed + 100.0) - 0.5;

        x += nx * 15.0;
        let y = ny * 25.0;

        target = vec3(x, y, 0.0);


        // ==========================================
        // BOTTOM — rough / hairy
        // ==========================================
    } else {

        let x = -LINE_LEN / 2.0 + t * LINE_LEN;

        // large slow shape
        let bigNoise =
            noise(t * 20.0, seed) - 0.5;

        // small fast irregularity
        let smallNoise =
            noise(t * 25.0, seed + 200.0) - 0.5;

        let y =
            150.0 +
            bigNoise * 5.0 +
            smallNoise * 2.0;

        x += smallNoise * 15.0;

        target = vec3(x, y, 0.0);
    }


    // ==========================================
    // MOVE PARTICLE
    // ==========================================

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