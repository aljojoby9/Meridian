/**
 * Seat point-of-view + camera motion mathematics.
 *
 * This module is the single source of truth for:
 *  - WHERE the eye sits for a given seat (per seat, never shared)
 *  - WHAT it looks at (the true screen centre, at screenHeightM / 2)
 *  - the FIELD OF VIEW (invariant across devices, aspect aware)
 *  - the AERIAL FLIGHT PATH (C1/C2 continuous - no jerk, no kink)
 *  - the CRITICALLY DAMPED SPRING used for follow moves (no lag, no overshoot)
 *
 * Everything is pure so it can be unit tested without a renderer.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface SeatPoint {
  x: number;
  y: number;
  z: number;
}

export interface ScreenGeometry {
  screenWidthM: number;
  screenHeightM: number;
  hallDepthM: number;
}

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/**
 * Human horizontal field of view used for every seat preview (device independent).
 * 100 deg is wide enough to keep the rows in front of you in frame - that is
 * what makes a front row visibly different from a back row instead of every
 * seat showing the same wall of screen.
 */
export const EYE_H_FOV_DEG = 100;
/** Never exceed this vertical field of view (portrait devices). */
export const MAX_V_FOV_DEG = 92;
export const MIN_V_FOV_DEG = 40;

export function clamp(n: number, min: number, max: number) {
  return n < min ? min : n > max ? max : n;
}

/**
 * Coordinate system (identical to the seeded hall + the 3D scene):
 *  - screen plane at z = 0, spanning y = 0 .. screenHeightM, centred on x = 0
 *  - seats at z > 0 (distance from the screen), facing -z
 *  - x = horizontal offset from the centreline, y = eye height
 */
export function screenCenter(screen: ScreenGeometry): Vec3 {
  return { x: 0, y: screen.screenHeightM / 2, z: 0 };
}

/** The eye of a person sitting in this seat. */
export function eyePosition(seat: SeatPoint): Vec3 {
  return { x: seat.x, y: seat.y, z: seat.z };
}

/** What the viewer looks at: the true centre of the screen. */
export function lookTargetForSeat(seat: SeatPoint, screen: ScreenGeometry): Vec3 {
  return screenCenter(screen);
}

/** Normalised direction from the eye to the screen centre. */
export function viewDirection(seat: SeatPoint, screen: ScreenGeometry): Vec3 {
  const c = screenCenter(screen);
  const e = eyePosition(seat);
  const dx = c.x - e.x;
  const dy = c.y - e.y;
  const dz = c.z - e.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

/**
 * Yaw (deg, + = right of centreline) and pitch (deg, + = up) of the view.
 * A dead-centre seat has yaw 0; every other seat differs - this is what makes
 * the preview genuinely seat specific.
 */
export function viewAngles(seat: SeatPoint, screen: ScreenGeometry) {
  const d = viewDirection(seat, screen);
  const yawDeg = Math.atan2(d.x, -d.z) * DEG;
  const pitchDeg = Math.asin(clamp(d.y, -1, 1)) * DEG;
  return { yawDeg, pitchDeg };
}

/**
 * Angles subtended by the screen from this seat. These are geometric facts
 * that differ per seat (near = wider, side = skewed) and are exactly what the
 * UI reports.
 */
export function screenSubtendedAngles(seat: SeatPoint, screen: ScreenGeometry) {
  const halfW = screen.screenWidthM / 2;
  const e = eyePosition(seat);
  const left = Math.atan2(-halfW - e.x, e.z);
  const right = Math.atan2(halfW - e.x, e.z);
  const top = Math.atan2(screen.screenHeightM - e.y, e.z);
  const bottom = Math.atan2(0 - e.y, e.z);
  return {
    horizontalDeg: Math.abs(right - left) * DEG,
    verticalDeg: Math.abs(top - bottom) * DEG,
    distanceM: e.z,
  };
}

/**
 * Field of view for a given canvas aspect.
 *
 * The HORIZONTAL field of view is the invariant (90 deg of human vision), so
 * a phone in portrait and a 27" monitor in landscape judge the screen width
 * identically. The vertical field of view follows from the aspect and is
 * clamped so portrait devices do not turn into a fisheye.
 */
export function fovForAspect(aspect: number) {
  const a = Math.max(0.3, aspect);
  const vIdeal = 2 * Math.atan(Math.tan((EYE_H_FOV_DEG / 2) * RAD) / a) * DEG;
  const verticalFovDeg = clamp(vIdeal, MIN_V_FOV_DEG, MAX_V_FOV_DEG);
  const horizontalFovDeg = 2 * Math.atan(Math.tan((verticalFovDeg / 2) * RAD) * a) * DEG;
  return { verticalFovDeg, horizontalFovDeg };
}

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

/** Smootherstep: C2 continuous - zero velocity AND zero acceleration at the ends. */
export function smootherstep(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

/**
 * Centripetal Catmull-Rom interpolation (alpha = 0.5).
 * Unlike the uniform variant it cannot overshoot or self-intersect, which is
 * what keeps the camera free of jitter on tight paths.
 */
export function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number): Vec3 {
  const alpha = 0.5;
  const knot = (pa: Vec3, pb: Vec3, ti: number) => {
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y, pb.z - pa.z);
    return ti + Math.pow(Math.max(d, 1e-5), alpha);
  };
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const tt = t1 + (t2 - t1) * clamp(t, 0, 1);

  const a1 = mixBetween(p0, p1, (t1 - t0) === 0 ? 0 : (tt - t0) / (t1 - t0));
  const a2 = mixBetween(p1, p2, (t2 - t1) === 0 ? 0 : (tt - t1) / (t2 - t1));
  const a3 = mixBetween(p2, p3, (t3 - t2) === 0 ? 0 : (tt - t2) / (t3 - t2));
  const b1 = mixBetween(a1, a2, (t2 - t0) === 0 ? 0 : (tt - t0) / (t2 - t0));
  const b2 = mixBetween(a2, a3, (t3 - t1) === 0 ? 0 : (tt - t1) / (t3 - t1));
  return mixBetween(b1, b2, (t2 - t1) === 0 ? 0 : (tt - t1) / (t2 - t1));
}

function mixBetween(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

export interface FlightWaypoint {
  pos: Vec3;
  look: Vec3;
}

/**
 * The aerial flight - seat-specific, and always inside the room.
 *
 *   rise → settle behind the seat → ease toward its side → dive into the eye
 *
 * A neighbour reseat uses a low, short arc. A cross-hall move climbs higher
 * (deeper rows highest) but stays under the wall line, so the shot never
 * punches into the void above the hall. The camera stays BEHIND the seat and
 * looks at the screen, a little toward that seat's side during the middle of
 * the flight. It never looks straight down: a vertical lookAt rolls the
 * camera ~170°.
 *
 * Waypoints 2..4 are the establishing arc. Their x extent favours the side
 * of the hall the seat is on.
 */
export function aerialWaypoints(
  from: Vec3,
  fromLook: Vec3,
  seat: SeatPoint,
  screen: ScreenGeometry,
): FlightWaypoint[] {
  const center = screenCenter(screen);
  const eye = eyePosition(seat);
  const depth = clamp(eye.z / Math.max(screen.hallDepthM, 1), 0, 1);
  const side = eye.x >= 0 ? 1 : -1;
  const travel = Math.hypot(eye.x - from.x, eye.y - from.y, eye.z - from.z);
  const hop = travel < 1.8;

  // Wall tops in the scene sit near 5.85m. Stay under them.
  const ceiling = 5.35;
  const lift = hop ? 0.9 : 2.35 + depth * 1.4;
  const apexY = Math.min(ceiling, Math.max(from.y, eye.y) + lift);
  const behind = hop ? 0.55 : 1.25 + depth * 0.85;
  const lateral = (hop ? 0.42 : 0.95 + depth * 0.7) * side;

  // On the screen plane, shifted toward this seat so the cruise already
  // previews that seat's angle. The dive hands the aim back to dead centre.
  const seatAim: Vec3 = { x: eye.x * 0.35, y: center.y, z: 0 };
  const screenLook: Vec3 = { ...center };
  const mixLook = (a: Vec3, b: Vec3, t: number): Vec3 => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  });

  const rise: Vec3 = {
    x: from.x + (eye.x - from.x) * 0.28,
    y: from.y + (apexY - from.y) * 0.58,
    z: from.z + (eye.z + behind - from.z) * 0.34,
  };
  const establish: Vec3 = {
    x: eye.x + lateral * 0.25,
    y: apexY,
    z: eye.z + behind,
  };
  const over: Vec3 = {
    x: eye.x + lateral * 0.45,
    y: apexY - (hop ? 0.05 : 0.12),
    z: eye.z + behind * 0.72,
  };
  const reveal: Vec3 = {
    x: eye.x + lateral,
    y: apexY - (hop ? 0.2 : 0.38),
    z: eye.z + behind * 0.5,
  };
  const approach: Vec3 = {
    x: eye.x + lateral * 0.18,
    y: eye.y + (hop ? 0.32 : 0.7),
    z: eye.z + (hop ? 0.16 : 0.38),
  };

  return [
    { pos: { ...from }, look: { ...fromLook } },
    { pos: rise, look: mixLook(fromLook, seatAim, 0.7) },
    { pos: establish, look: seatAim },
    { pos: over, look: seatAim },
    { pos: reveal, look: mixLook(seatAim, screenLook, 0.55) },
    { pos: approach, look: mixLook(seatAim, screenLook, 0.85) },
    { pos: { ...eye }, look: screenLook },
  ];
}

/** Idle angle: centreline, a little above eye height, screen filling the view. */
export function overviewPose(screen: ScreenGeometry): { pos: Vec3; look: Vec3 } {
  const look = screenCenter(screen);
  return {
    pos: {
      x: 0,
      y: clamp(look.y * 0.82, 1.8, 3.1),
      z: clamp(screen.hallDepthM * 0.66, 8, 15),
    },
    look,
  };
}

/** Ease back to the idle angle. Same upright rule as the seat flight. */
export function overviewWaypoints(from: Vec3, fromLook: Vec3, screen: ScreenGeometry): FlightWaypoint[] {
  const end = overviewPose(screen);
  const lift: Vec3 = {
    x: (from.x + end.pos.x) * 0.5,
    y: Math.max(from.y, end.pos.y) + 0.65,
    z: (from.z + end.pos.z) * 0.5,
  };
  return [
    { pos: { ...from }, look: { ...fromLook } },
    { pos: lift, look: { ...end.look } },
    { pos: { ...end.pos }, look: { ...end.look } },
  ];
}

/**
 * Seconds for a scripted move. Longer paths get more time; a one-seat hop
 * stays under a second and a half. Clamped so a tab stall cannot request
 * a multi-second crawl or a snap.
 */
export function flightDuration(waypoints: FlightWaypoint[]): number {
  let length = 0;
  for (let i = 1; i < waypoints.length; i++) {
    const a = waypoints[i - 1]!.pos;
    const b = waypoints[i]!.pos;
    length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return clamp(length / 6.4, 0.85, 2.7);
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Seated glance. Pointer +x is the right of the screen, pointer +y is the top.
 * Yaw is a world-up rotation: negative yaw turns the camera toward world +x
 * (look right). Pitch is a rotation about the camera's right: positive pitch
 * raises the view. Roll stays 0.
 *
 * Check: forward (0,0,-1), rotation +θ about +x sends that forward toward +y.
 */
export function seatGlance(pointerX: number, pointerY: number, amount: number) {
  const k = clamp(amount, 0, 1);
  return {
    yaw: clamp(-pointerX * 0.14 * k, -0.18, 0.18),
    pitch: clamp(pointerY * 0.08 * k, -0.1, 0.1),
  };
}

function quatMul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) };
}

function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

/** Camera right (world +x rotated by q). q must be a unit quaternion. */
function cameraRight(q: Quat): Vec3 {
  const { x, y, z, w } = q;
  return {
    x: 1 - 2 * (y * y + z * z),
    y: 2 * (x * y + w * z),
    z: 2 * (x * z - w * y),
  };
}

/** Apply yaw then pitch on an upright look. Roll stays 0. */
function applyYawPitch(look: Quat, yaw: number, pitch: number): Quat {
  if (yaw === 0 && pitch === 0) return look;
  const yawed = quatNormalize(quatMul(quatFromAxisAngle({ x: 0, y: 1, z: 0 }, yaw), look));
  const right = cameraRight(yawed);
  return quatNormalize(quatMul(quatFromAxisAngle(right, pitch), yawed));
}

/** Apply the seated glance on top of an upright look quaternion. */
export function withSeatGlance(look: Quat, pointerX: number, pointerY: number, amount: number): Quat {
  const { yaw, pitch } = seatGlance(pointerX, pointerY, amount);
  return applyYawPitch(look, yaw, pitch);
}

/** Average adult interpupillary distance. Both VR eyes are this far apart. */
export const VR_IPD_M = 0.064;
/** Comfort limits for a seated cinema headset: you can scan the screen, not spin around. */
export const VR_YAW_LIMIT = 0.62;
export const VR_PITCH_LIMIT = 0.36;

/** Clamp a head pose. Yaw is about world up; pitch is about camera right. */
export function vrHeadAngles(yaw: number, pitch: number) {
  return {
    yaw: clamp(yaw, -VR_YAW_LIMIT, VR_YAW_LIMIT),
    pitch: clamp(pitch, -VR_PITCH_LIMIT, VR_PITCH_LIMIT),
  };
}

/**
 * Where the head looks from the pointer.
 * Pointer +x is the right of the canvas and looks right (negative yaw).
 * Pointer +y is the top of the canvas and looks up (positive pitch).
 */
export function vrPointerAngles(pointerX: number, pointerY: number) {
  return vrHeadAngles(-pointerX * VR_YAW_LIMIT, pointerY * VR_PITCH_LIMIT);
}

/**
 * Drag deltas in CSS pixels. Dragging right looks right. Dragging down looks down.
 * The returned pose is clamped, so a long drag cannot roll or look behind the seat.
 */
export function vrDragAngles(yaw: number, pitch: number, deltaX: number, deltaY: number) {
  return vrHeadAngles(yaw - deltaX * 0.0045, pitch - deltaY * 0.0035);
}

/**
 * Device orientation, degrees. Tilting the device to the viewer's right
 * (positive gamma) looks right. Tipping it forward (positive beta) looks down.
 */
export function vrOrientationAngles(gammaDeg: number, betaDeg: number, baseGammaDeg: number, baseBetaDeg: number) {
  return vrHeadAngles(-(gammaDeg - baseGammaDeg) * RAD, -(betaDeg - baseBetaDeg) * RAD);
}

/** Head pose on an upright look, clamped to the cinema comfort range. */
export function withHeadPose(look: Quat, yaw: number, pitch: number): Quat {
  const pose = vrHeadAngles(yaw, pitch);
  return applyYawPitch(look, pose.yaw, pose.pitch);
}

/** Samples the flight spline at u in [0, 1]. */
export function sampleFlightPath(waypoints: FlightWaypoint[], u: number): { pos: Vec3; look: Vec3 } {
  const n = waypoints.length;
  if (n === 0) return { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: -1 } };
  if (n === 1) return { pos: { ...waypoints[0]!.pos }, look: { ...waypoints[0]!.look } };

  const clamped = clamp(u, 0, 1);
  const segs = n - 1;
  const scaled = clamped * segs;
  let i = Math.floor(scaled);
  if (i > segs - 1) i = segs - 1;
  const localT = scaled - i;

  const w = (k: number) => waypoints[clamp(k, 0, n - 1)]!;
  const p0 = w(i - 1);
  const p1 = w(i);
  const p2 = w(i + 1);
  const p3 = w(i + 2);

  return {
    pos: catmullRom(p0.pos, p1.pos, p2.pos, p3.pos, localT),
    look: catmullRom(p0.look, p1.look, p2.look, p3.look, localT),
  };
}

export interface SpringState {
  value: number;
  velocity: number;
}

/**
 * EXACT analytic solution of a critically damped spring
 *   x'' = -2w x' - w^2 (x - target)
 *
 * Properties that matter for a camera:
 *  - closed form, so it is EXACT for any dt (no discretisation drift, fully
 *    frame-rate independent)
 *  - critically damped, so it converges monotonically: never overshoots,
 *    never bounces, never jitters
 *  - unconditionally stable for any dt (a tab-switch spike cannot explode it)
 */
export function springStep(state: SpringState, target: number, omega: number, dt: number): SpringState {
  const h = Math.max(dt, 0);
  if (h === 0) return state;
  const a = state.value - target;
  const b = state.velocity + omega * a;
  const decay = Math.exp(-omega * h);
  return {
    value: target + (a + b * h) * decay,
    velocity: (state.velocity - omega * b * h) * decay,
  };
}

/** Frame-rate independent smoothing factor for a given time constant (seconds). */
export function smoothingAlpha(dt: number, tau: number): number {
  return 1 - Math.exp(-Math.max(dt, 0) / Math.max(tau, 1e-4));
}
