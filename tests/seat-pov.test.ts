import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  aerialWaypoints,
  catmullRom,
  eyePosition,
  flightDuration,
  fovForAspect,
  lookTargetForSeat,
  overviewPose,
  overviewWaypoints,
  sampleFlightPath,
  screenCenter,
  screenSubtendedAngles,
  seatGlance,
  smootherstep,
  smoothingAlpha,
  springStep,
  viewAngles,
  VR_IPD_M,
  VR_PITCH_LIMIT,
  VR_YAW_LIMIT,
  vrDragAngles,
  vrHeadAngles,
  vrOrientationAngles,
  vrPointerAngles,
  withHeadPose,
  withSeatGlance,
  type ScreenGeometry,
} from "@/lib/seat-pov";

const SCREEN: ScreenGeometry = { screenWidthM: 12, screenHeightM: 5.2, hallDepthM: 18 };

// Hall 1 geometry (matches prisma/seed.ts)
const EYE = 1.18;
const FIRST_ROW = 3.2;
const ROW_SPACING = 1.05;
const SEAT_SPACING = 0.58;
const SEATS_PER_ROW = 12;

function seat(row: number, col: number) {
  return {
    x: (col - (SEATS_PER_ROW - 1) / 2) * SEAT_SPACING,
    y: EYE,
    z: FIRST_ROW + row * ROW_SPACING,
  };
}

describe("per-seat point of view", () => {
  it("puts the eye exactly at the seat", () => {
    const s = seat(3, 5);
    expect(eyePosition(s)).toEqual(s);
  });

  it("looks at the TRUE screen centre (screenHeightM / 2)", () => {
    const target = lookTargetForSeat(seat(0, 0), SCREEN);
    expect(target).toEqual({ x: 0, y: SCREEN.screenHeightM / 2, z: 0 });
    expect(target.y).toBeCloseTo(2.6, 6);
    expect(screenCenter(SCREEN)).toEqual(target);
  });

  it("gives every seat a DISTINCT view (never the same everywhere)", () => {
    const seats = [seat(0, 0), seat(0, 6), seat(0, 11), seat(4, 3), seat(8, 7)];
    const views = seats.map((s) => {
      const a = viewAngles(s, SCREEN);
      return `${a.yawDeg.toFixed(4)}/${a.pitchDeg.toFixed(4)}`;
    });
    expect(new Set(views).size).toBe(seats.length);

    const positions = seats.map((s) => `${s.x.toFixed(3)},${s.z.toFixed(3)}`);
    expect(new Set(positions).size).toBe(seats.length);
  });

  it("yaws towards the centreline from a side seat and stays centred in the middle", () => {
    const left = viewAngles(seat(4, 0), SCREEN);
    const right = viewAngles(seat(4, SEATS_PER_ROW - 1), SCREEN);
    const middle = viewAngles({ x: 0, y: EYE, z: FIRST_ROW + 4 * ROW_SPACING }, SCREEN);

    expect(left.yawDeg).toBeGreaterThan(0); // left seat looks to the right
    expect(right.yawDeg).toBeLessThan(0); // right seat looks to the left
    expect(Math.abs(middle.yawDeg)).toBeLessThan(0.01); // centre seat is straight on
    expect(left.yawDeg).not.toBeCloseTo(right.yawDeg, 3);
  });

  it("changes the subtended screen angle per seat (near = wider, side = narrower)", () => {
    const near = screenSubtendedAngles(seat(0, 5), SCREEN);
    const far = screenSubtendedAngles(seat(8, 5), SCREEN);
    expect(near.horizontalDeg).toBeGreaterThan(far.horizontalDeg);
    expect(near.distanceM).toBeLessThan(far.distanceM);
    // Off-axis, a flat screen subtends a SMALLER angle (classic off-axis view).
    const side = screenSubtendedAngles(seat(4, 0), SCREEN);
    const centre = screenSubtendedAngles(seat(4, 5), SCREEN);
    expect(side.horizontalDeg).toBeLessThan(centre.horizontalDeg);
  });
});

describe("field of view", () => {
  it("keeps the horizontal FOV invariant across aspect ratios (device independent)", () => {
    const wide = fovForAspect(16 / 9);
    const desktop = fovForAspect(16 / 10);
    const tall = fovForAspect(9 / 16);
    // Landscape: the horizontal eye FOV is the invariant (100 deg).
    expect(wide.horizontalFovDeg).toBeCloseTo(100, 1);
    expect(desktop.horizontalFovDeg).toBeCloseTo(100, 1);
    // Portrait / square: the vertical FOV is capped so it never fisheyes,
    // and the horizontal FOV degrades gracefully rather than exploding.
    expect(tall.verticalFovDeg).toBeLessThanOrEqual(92);
    expect(tall.horizontalFovDeg).toBeLessThanOrEqual(100.001);
    const square = fovForAspect(1);
    expect(square.verticalFovDeg).toBeCloseTo(92, 1);
    expect(square.horizontalFovDeg).toBeLessThanOrEqual(100.001);
  });

  it("never produces a fisheye on portrait devices", () => {
    const tall = fovForAspect(9 / 19.5);
    expect(tall.verticalFovDeg).toBeLessThanOrEqual(92);
    expect(tall.verticalFovDeg).toBeGreaterThanOrEqual(40);
  });
});

describe("motion quality", () => {
  it("smootherstep has zero velocity AND zero acceleration at the ends", () => {
    const h = 1e-4;
    expect(smootherstep(0)).toBe(0);
    expect(smootherstep(1)).toBe(1);
    const d0 = (smootherstep(h) - smootherstep(0)) / h;
    const d1 = (smootherstep(1) - smootherstep(1 - h)) / h;
    expect(d0).toBeLessThan(1e-3);
    expect(d1).toBeLessThan(1e-3);
  });

  it("catmull-rom stays on the segment (no overshoot / no jitter)", () => {
    const p0 = { x: 0, y: 0, z: 0 };
    const p1 = { x: 1, y: 1, z: 1 };
    const p2 = { x: 2, y: 0, z: 2 };
    const p3 = { x: 3, y: 1, z: 3 };
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const p = catmullRom(p0, p1, p2, p3, t);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(3);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1.2);
    }
  });

  it("builds a continuous aerial path that starts at the current view and ends at the seat", () => {
    const from = { x: 0, y: 1.4, z: 12 };
    const fromLook = { x: 0, y: 2.6, z: 0 };
    const s = seat(4, 6);
    const path = aerialWaypoints(from, fromLook, s, SCREEN);

    const start = sampleFlightPath(path, 0);
    expect(start.pos.x).toBeCloseTo(from.x, 6);
    expect(start.pos.z).toBeCloseTo(from.z, 6);

    const end = sampleFlightPath(path, 1);
    expect(end.pos.x).toBeCloseTo(s.x, 6);
    expect(end.pos.y).toBeCloseTo(s.y, 6);
    expect(end.pos.z).toBeCloseTo(s.z, 6);
    expect(end.look.y).toBeCloseTo(SCREEN.screenHeightM / 2, 6);

    // C1 continuity: the per-step delta never jumps.
    let prevStep: number | null = null;
    let maxJump = 0;
    let prev = sampleFlightPath(path, 0).pos;
    for (let u = 0.005; u <= 1.0001; u += 0.005) {
      const p = sampleFlightPath(path, u).pos;
      const step = Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
      if (prevStep !== null) maxJump = Math.max(maxJump, Math.abs(step - prevStep));
      prevStep = step;
      prev = p;
    }
    expect(prev).toBeTruthy();
    expect(maxJump).toBeLessThan(0.12); // no velocity kink between waypoints
  });

  it("climbs to an aerial vantage inside the hall before descending into the seat", () => {
    const path = aerialWaypoints({ x: 0, y: 1.4, z: 12 }, { x: 0, y: 2.6, z: 0 }, seat(4, 6), SCREEN);
    let apex = -Infinity;
    let minZ = Infinity;
    for (let u = 0; u <= 1.0001; u += 0.005) {
      const p = sampleFlightPath(path, u).pos;
      apex = Math.max(apex, p.y);
      minZ = Math.min(minZ, p.z);
    }
    // Above head height, under the wall tops (~5.85m), and never through the screen.
    expect(apex).toBeGreaterThan(4);
    expect(apex).toBeLessThan(5.7);
    expect(minZ).toBeGreaterThan(0.4);
  });

  it("gives a neighbour reseat a shorter, lower arc than a cross-hall move", () => {
    const from = seat(4, 6);
    const fromLook = { x: 0, y: SCREEN.screenHeightM / 2, z: 0 };
    const hop = aerialWaypoints(from, fromLook, seat(4, 7), SCREEN);
    const tour = aerialWaypoints(from, fromLook, seat(8, 0), SCREEN);
    const apex = (w: typeof hop) => {
      let y = -Infinity;
      for (let u = 0; u <= 1.0001; u += 0.02) y = Math.max(y, sampleFlightPath(w, u).pos.y);
      return y;
    };
    expect(flightDuration(hop)).toBeLessThan(flightDuration(tour));
    expect(flightDuration(hop)).toBeLessThan(1.6);
    expect(apex(tour)).toBeGreaterThan(apex(hop));
  });

  it("keeps the cruise behind the seat and aimed at the screen, not straight down", () => {
    const from = { x: 0, y: 1.4, z: 12 };
    const fromLook = { x: 0, y: SCREEN.screenHeightM / 2, z: 0 };
    const s = seat(4, 0);
    const path = aerialWaypoints(from, fromLook, s, SCREEN);
    const mid = sampleFlightPath(path, 0.45);
    expect(mid.pos.z).toBeGreaterThan(s.z);
    expect(mid.pos.y).toBeGreaterThan(s.y + 1.5);
    const dx = mid.look.x - mid.pos.x;
    const dy = mid.look.y - mid.pos.y;
    const dz = mid.look.z - mid.pos.z;
    const len = Math.hypot(dx, dy, dz);
    const pitch = Math.asin(dy / len) * (180 / Math.PI);
    expect(pitch).toBeGreaterThan(-55);
    expect(pitch).toBeLessThan(25);
    expect(mid.look.z).toBeLessThan(mid.pos.z);
  });

  it("parks the idle camera on the centreline, looking at the screen", () => {
    const pose = overviewPose(SCREEN);
    expect(pose.pos.x).toBe(0);
    expect(pose.pos.y).toBeGreaterThan(1.6);
    expect(pose.pos.z).toBeGreaterThan(8);
    expect(pose.look).toEqual(screenCenter(SCREEN));

    const back = overviewWaypoints(seat(2, 3), pose.look, SCREEN);
    const end = sampleFlightPath(back, 1);
    expect(end.pos).toEqual(pose.pos);
    expect(end.look).toEqual(pose.look);
  });

  it("glances right and up without rolling", () => {
    expect(seatGlance(1, 0, 1).yaw).toBeLessThan(0);
    expect(seatGlance(-1, 0, 1).yaw).toBeGreaterThan(0);
    expect(seatGlance(0, 1, 1).pitch).toBeGreaterThan(0);
    expect(seatGlance(0, -1, 1).pitch).toBeLessThan(0);
    expect(seatGlance(1, 1, 0).yaw).toBeCloseTo(0, 8);
    expect(seatGlance(1, 1, 0).pitch).toBeCloseTo(0, 8);

    const up = new THREE.Vector3(0, 1, 0);
    const mat = new THREE.Matrix4();
    const base = new THREE.Quaternion();
    const eye = new THREE.Vector3(0.4, 1.18, 8);
    const look = new THREE.Vector3(0, SCREEN.screenHeightM / 2, 0);
    mat.lookAt(eye, look, up);
    base.setFromRotationMatrix(mat);

    const apply = (px: number, py: number) => {
      const q = withSeatGlance({ x: base.x, y: base.y, z: base.z, w: base.w }, px, py, 1);
      const cam = new THREE.PerspectiveCamera();
      cam.position.copy(eye);
      cam.quaternion.set(q.x, q.y, q.z, q.w);
      cam.updateMatrixWorld();
      const dir = new THREE.Vector3();
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      cam.getWorldDirection(dir);
      return { dir, camUp };
    };

    const straight = apply(0, 0);
    const right = apply(1, 0);
    const upGlance = apply(0, 1);
    expect(right.dir.x).toBeGreaterThan(straight.dir.x + 0.02);
    expect(upGlance.dir.y).toBeGreaterThan(straight.dir.y + 0.01);
    expect(right.camUp.y).toBeGreaterThan(0.95);
    expect(upGlance.camUp.y).toBeGreaterThan(0.95);
    expect(Math.abs(right.camUp.x)).toBeLessThan(0.05);
  });

  it("produces a DIFFERENT flight per seat (seat-specific choreography)", () => {
    const from = { x: 0, y: 1.4, z: 12 };
    const fromLook = { x: 0, y: 2.6, z: 0 };
    const frontLeft = aerialWaypoints(from, fromLook, seat(1, 1), SCREEN);
    const backRight = aerialWaypoints(from, fromLook, seat(7, 10), SCREEN);
    const key = (w: typeof frontLeft) =>
      w.map((p) => `${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)},${p.pos.z.toFixed(3)}`).join("|");

    expect(key(frontLeft)).not.toBe(key(backRight));

    const apex = (w: typeof frontLeft) => Math.max(...w.map((p) => p.pos.y));
    // A deeper row climbs higher and orbits wider - visibly different motion.
    expect(apex(backRight)).toBeGreaterThan(apex(frontLeft));

    // The orbit favours the side of the hall the seat is on (waypoints 2..4
    // are the orbit itself: behind -> above -> offset to the seat's side).
    const leftSeat = seat(4, 0); // x < 0
    const rightSeat = seat(4, SEATS_PER_ROW - 1); // x > 0
    const leftPath = aerialWaypoints(from, fromLook, leftSeat, SCREEN);
    const rightPath = aerialWaypoints(from, fromLook, rightSeat, SCREEN);
    const orbitX = (w: typeof leftPath) => w.slice(2, 5).map((p) => p.pos.x);
    expect(Math.min(...orbitX(leftPath))).toBeLessThan(leftSeat.x);
    expect(Math.max(...orbitX(rightPath))).toBeGreaterThan(rightSeat.x);
  });

  it("keeps the camera upright and aimed at the screen for the whole flight", () => {
    const from = { x: 0, y: 1.4, z: 12 };
    const fromLook = { x: 0, y: SCREEN.screenHeightM / 2, z: 0 };
    const up = new THREE.Vector3(0, 1, 0);
    const mat = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const prev = new THREE.Quaternion();
    const camUp = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const cam = new THREE.PerspectiveCamera();

    for (const s of [seat(0, 0), seat(4, 0), seat(4, 6), seat(8, 11)]) {
      const path = aerialWaypoints(from, fromLook, s, SCREEN);
      let maxStep = 0;
      for (let u = 0; u <= 1.0001; u += 0.01) {
        const sample = sampleFlightPath(path, u);
        const eye = new THREE.Vector3(sample.pos.x, sample.pos.y, sample.pos.z);
        const look = new THREE.Vector3(sample.look.x, sample.look.y, sample.look.z);
        mat.lookAt(eye, look, up);
        q.setFromRotationMatrix(mat);
        camUp.set(0, 1, 0).applyQuaternion(q);
        expect(camUp.y).toBeGreaterThan(0.45);
        if (u > 0) maxStep = Math.max(maxStep, prev.angleTo(q));
        prev.copy(q);
      }
      expect(maxStep).toBeLessThan(THREE.MathUtils.degToRad(35));

      const end = sampleFlightPath(path, 1);
      const eye = new THREE.Vector3(end.pos.x, end.pos.y, end.pos.z);
      const look = new THREE.Vector3(end.look.x, end.look.y, end.look.z);
      mat.lookAt(eye, look, up);
      cam.position.copy(eye);
      cam.quaternion.setFromRotationMatrix(mat);
      cam.updateMatrixWorld();
      cam.getWorldDirection(dir);
      const want = look.clone().sub(eye).normalize();
      expect(dir.dot(want)).toBeGreaterThan(0.999);
      expect(cam.position.distanceTo(new THREE.Vector3(s.x, s.y, s.z))).toBeLessThan(1e-4);
    }
  });

  it("the critically damped spring converges without overshoot (no bounce, no jitter)", () => {
    let state = { value: 0, velocity: 0 };
    const target = 10;
    let overshoot = 0;
    for (let i = 0; i < 600; i++) {
      state = springStep(state, target, 9.5, 1 / 60);
      overshoot = Math.max(overshoot, state.value - target);
    }
    expect(overshoot).toBeLessThan(1e-6); // critically damped: never overshoots
    expect(state.value).toBeCloseTo(target, 3);
    expect(Math.abs(state.velocity)).toBeLessThan(0.01);
  });

  it("the spring is frame-rate independent (same result at 30fps and 144fps)", () => {
    const run = (dt: number, steps: number) => {
      let s = { value: 0, velocity: 0 };
      for (let i = 0; i < steps; i++) s = springStep(s, 5, 9.5, dt);
      return s.value;
    };
    const at30 = run(1 / 30, 30);
    const at144 = run(1 / 144, 144);
    expect(Math.abs(at30 - at144)).toBeLessThan(0.05);
  });

  it("turns the head within comfort limits and keeps the same signs as a glance", () => {
    expect(vrHeadAngles(2, 2).yaw).toBeCloseTo(VR_YAW_LIMIT, 8);
    expect(vrHeadAngles(2, 2).pitch).toBeCloseTo(VR_PITCH_LIMIT, 8);
    expect(vrHeadAngles(-2, -2).yaw).toBeCloseTo(-VR_YAW_LIMIT, 8);
    expect(vrHeadAngles(-2, -2).pitch).toBeCloseTo(-VR_PITCH_LIMIT, 8);

    // Pointer +x (right of the canvas) looks right. Pointer +y (top) looks up.
    expect(vrPointerAngles(1, 0).yaw).toBeCloseTo(-VR_YAW_LIMIT, 8);
    expect(vrPointerAngles(0, 1).pitch).toBeCloseTo(VR_PITCH_LIMIT, 8);
    expect(vrPointerAngles(-1, 0).yaw).toBeGreaterThan(0);
    expect(vrPointerAngles(0, -1).pitch).toBeLessThan(0);

    // Drag right looks right. Drag down looks down.
    expect(vrDragAngles(0, 0, 20, 0).yaw).toBeLessThan(0);
    expect(vrDragAngles(0, 0, -20, 0).yaw).toBeGreaterThan(0);
    expect(vrDragAngles(0, 0, 0, 20).pitch).toBeLessThan(0);
    expect(vrDragAngles(0, 0, 0, -20).pitch).toBeGreaterThan(0);
    expect(vrDragAngles(0, 0, 10_000, 10_000).yaw).toBeCloseTo(-VR_YAW_LIMIT, 8);
    expect(vrDragAngles(0, 0, 10_000, 10_000).pitch).toBeCloseTo(-VR_PITCH_LIMIT, 8);

    // Tilt toward the viewer's right looks right. Tip forward looks down.
    expect(vrOrientationAngles(20, 0, 0, 0).yaw).toBeLessThan(0);
    expect(vrOrientationAngles(-20, 0, 0, 0).yaw).toBeGreaterThan(0);
    expect(vrOrientationAngles(0, 15, 0, 0).pitch).toBeLessThan(0);
    expect(vrOrientationAngles(0, -15, 0, 0).pitch).toBeGreaterThan(0);

    const up = new THREE.Vector3(0, 1, 0);
    const mat = new THREE.Matrix4();
    const base = new THREE.Quaternion();
    const eye = new THREE.Vector3(-0.29, 1.18, 8.45);
    const look = new THREE.Vector3(0, SCREEN.screenHeightM / 2, 0);
    mat.lookAt(eye, look, up);
    base.setFromRotationMatrix(mat);

    const pose = (yaw: number, pitch: number) => {
      const q = withHeadPose({ x: base.x, y: base.y, z: base.z, w: base.w }, yaw, pitch);
      const cam = new THREE.PerspectiveCamera();
      cam.position.copy(eye);
      cam.quaternion.set(q.x, q.y, q.z, q.w);
      cam.updateMatrixWorld();
      const dir = new THREE.Vector3();
      const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      cam.getWorldDirection(dir);
      return { dir, camUp, camRight, q };
    };

    const straight = pose(0, 0);
    expect(straight.q.x).toBeCloseTo(base.x, 8);
    expect(straight.q.y).toBeCloseTo(base.y, 8);
    expect(straight.q.z).toBeCloseTo(base.z, 8);
    expect(straight.q.w).toBeCloseTo(base.w, 8);

    const right = pose(-VR_YAW_LIMIT, 0);
    const raised = pose(0, VR_PITCH_LIMIT);
    const both = pose(-VR_YAW_LIMIT, VR_PITCH_LIMIT);
    expect(right.dir.x).toBeGreaterThan(straight.dir.x + 0.05);
    expect(raised.dir.y).toBeGreaterThan(straight.dir.y + 0.05);
    // Yaw stays upright. Pitch leans the head back, so up.y falls, but it
    // stays clearly upward. Roll would tip camera-right off the horizon.
    expect(right.camUp.y).toBeGreaterThan(0.95);
    expect(raised.camUp.y).toBeGreaterThan(0.8);
    expect(both.camUp.y).toBeGreaterThan(0.8);
    expect(Math.abs(right.camRight.y)).toBeLessThan(0.05);
    expect(Math.abs(raised.camRight.y)).toBeLessThan(0.05);
    expect(Math.abs(both.camRight.y)).toBeLessThan(0.05);
  });

  it("separates the eyes by one IPD and puts the screen at zero parallax", () => {
    const eye = new THREE.Vector3(-0.29, 1.18, 8.45);
    const look = new THREE.Vector3(0, SCREEN.screenHeightM / 2, 0);
    const cam = new THREE.PerspectiveCamera(64, 16 / 9, 0.05, 120);
    cam.position.copy(eye);
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    cam.focus = eye.distanceTo(look);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    const stereo = new THREE.StereoCamera();
    stereo.eyeSep = VR_IPD_M;
    stereo.aspect = 0.5;
    stereo.update(cam);

    const left = stereo.cameraL;
    const right = stereo.cameraR;
    left.matrixWorldInverse.copy(left.matrixWorld).invert();
    right.matrixWorldInverse.copy(right.matrixWorld).invert();
    left.projectionMatrixInverse.copy(left.projectionMatrix).invert();
    right.projectionMatrixInverse.copy(right.projectionMatrix).invert();

    const leftPos = new THREE.Vector3().setFromMatrixPosition(left.matrixWorld);
    const rightPos = new THREE.Vector3().setFromMatrixPosition(right.matrixWorld);
    const camRight = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const sep = rightPos.clone().sub(leftPos);
    expect(sep.length()).toBeCloseTo(VR_IPD_M, 4);
    expect(sep.normalize().dot(camRight)).toBeGreaterThan(0.999);

    // getWorldDirection() rebuilds matrixWorld from the local matrix. These
    // eye cameras keep matrixAutoUpdate off, so that call would replace the
    // stereo pose with identity. Read the columns StereoCamera wrote.
    const forwardOf = (m: THREE.Matrix4) => new THREE.Vector3(-m.elements[8]!, -m.elements[9]!, -m.elements[10]!).normalize();
    const leftDir = forwardOf(left.matrixWorld);
    const rightDir = forwardOf(right.matrixWorld);
    const headDir = new THREE.Vector3();
    cam.getWorldDirection(headDir);
    expect(leftDir.dot(rightDir)).toBeGreaterThan(0.999);
    expect(leftDir.dot(headDir)).toBeGreaterThan(0.999);

    const leftUp = new THREE.Vector3().setFromMatrixColumn(left.matrixWorld, 1);
    const rightUp = new THREE.Vector3().setFromMatrixColumn(right.matrixWorld, 1);
    expect(leftUp.y).toBeGreaterThan(0.95);
    expect(rightUp.y).toBeGreaterThan(0.95);

    const leftNdc = look.clone().project(left);
    const rightNdc = look.clone().project(right);
    expect(Math.abs(leftNdc.x - rightNdc.x)).toBeLessThan(0.02);
    expect(leftNdc.z).toBeGreaterThan(-1);
    expect(leftNdc.z).toBeLessThan(1);

    const forward = new THREE.Vector3();
    cam.getWorldDirection(forward);
    const nearPoint = eye.clone().addScaledVector(forward, 1);
    const nearLeft = nearPoint.clone().project(left);
    const nearRight = nearPoint.clone().project(right);
    expect(nearLeft.x).toBeGreaterThan(nearRight.x + 0.01);
  });

  it("smoothing alpha is frame-rate independent", () => {
    const a = 1 - Math.exp(-1 / 60 / 0.075);
    const b = 1 - Math.exp(-1 / 120 / 0.075);
    expect(smoothingAlpha(1 / 60, 0.075)).toBeCloseTo(a, 9);
    expect(smoothingAlpha(1 / 120, 0.075)).toBeCloseTo(b, 9);
    // Two half steps ~= one full step (exponential smoothing property)
    expect(1 - (1 - a) * (1 - a)).toBeCloseTo(1 - Math.exp(-(2 / 60) / 0.075), 6);
  });
});
