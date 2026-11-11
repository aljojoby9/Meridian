/**
 * Hall, seat camera, and stereo pair on a plain THREE.WebGLRenderer.
 *
 * Frame (same as seat-pov): screen at z = 0, seats at z > 0 facing −z,
 * camera local forward is −z. Glance, flight, and VR angles stay in
 * src/lib/seat-pov.ts. This file only applies them.
 *
 * The loop is on demand. A frame runs when the flight, the head, the
 * selection pulse, or the screen footage asks for one, and while a trailer
 * is playing. Idle does not keep requesting frames.
 *
 * Stereo is drawn after the camera step. Eye cameras keep matrixAutoUpdate
 * off, so the inverse matrices are rebuilt or the hall is frustum-culled.
 * setViewport / setScissor take CSS pixels. Three multiplies by the pixel ratio.
 */

import * as THREE from "three";
import {
  aerialWaypoints,
  eyePosition,
  flightDuration,
  fovForAspect,
  lookTargetForSeat,
  overviewPose,
  overviewWaypoints,
  sampleFlightPath,
  screenCenter,
  smootherstep,
  smoothingAlpha,
  springStep,
  vrDragAngles,
  vrOrientationAngles,
  vrPointerAngles,
  withHeadPose,
  VR_IPD_M,
  type FlightWaypoint,
  type ScreenGeometry,
  type Vec3,
} from "@/lib/seat-pov";
import { hallColors, screenFrame } from "@/lib/show-visuals";

export type FlightPhase = "rise" | "hold" | "dive";

export interface HallSeat {
  id: string;
  x: number;
  y: number;
  z: number;
  rowLabel?: string;
  number?: number;
  selected?: boolean;
  taken?: boolean;
}

export interface HallViewProps {
  screenWidthM: number;
  screenHeightM: number;
  hallDepthM: number;
  hallWidthM: number;
  seats: HallSeat[];
  selectedSeat: { x: number; y: number; z: number } | null;
  spatial: boolean;
  spatialNonce: number;
  onFlightPhase?: (phase: FlightPhase | null) => void;
  posterUrl?: string | null;
  trailerUrl?: string | null;
  onVideoStateChange?: (playing: boolean) => void;
}

interface VrAnchor {
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

interface ActiveFlight {
  waypoints: FlightWaypoint[];
  t0: number;
  dur: number;
  kind: "seat" | "overview";
}

type MeridianWindow = Window & {
  __meridianEnterXR?: () => void;
  __meridianExitXR?: () => void;
  __meridianVrOrient?: () => void;
  __meridianFreeze?: boolean;
  __meridianCam?: unknown;
  __meridianScene?: unknown;
  __meridianFootage?: unknown;
  __meridianScreen?: unknown;
};

const COLORS = {
  seat: new THREE.Color(hallColors.seatOpen),
  seatTaken: new THREE.Color(hallColors.seatTaken),
  seatSelected: new THREE.Color(hallColors.seatSelected),
};

const FOOTAGE_W = 320;
const FOOTAGE_H = 180;
const FOOTAGE_FPS = 15;

const ROT_TAU = 0.075;
const FOLLOW_OMEGA = 9.5;
const FOV_OMEGA = 7.5;
const SPATIAL_OMEGA = 6.5;

function paintFootage(ctx: CanvasRenderingContext2D, t: number, poster: HTMLCanvasElement | null) {
  const w = FOOTAGE_W;
  const h = FOOTAGE_H;

  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#8ea2d8");
  g.addColorStop(0.5, "#4d629e");
  g.addColorStop(1, "#24345f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (poster) {
    ctx.globalAlpha = 0.82;
    ctx.drawImage(poster, 0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const phase = (t * (0.55 + i * 0.21) + i * 1.7) % 3;
    const x = (phase / 3) * (w + 120) - 60;
    const y = h * (0.22 + 0.56 * (((i * 0.37) % 1) + 0.2));
    const r = 30 + i * 9;
    const rad = ctx.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, `rgba(150, 180, 255, ${0.2 - i * 0.03})`);
    rad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const barY = ((t * 46) % (h + 90)) - 45;
  const bar = ctx.createLinearGradient(0, barY - 20, 0, barY + 20);
  bar.addColorStop(0, "rgba(255,255,255,0)");
  bar.addColorStop(0.5, "rgba(190, 210, 255, 0.08)");
  bar.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = bar;
  ctx.fillRect(0, barY - 20, w, 40);
  ctx.globalCompositeOperation = "source-over";

  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.22, w / 2, h / 2, h * 0.95);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

function copyAnchor(a: VrAnchor): VrAnchor {
  return { x: a.x, y: a.y, z: a.z, qx: a.qx, qy: a.qy, qz: a.qz, qw: a.qw };
}

function poseShifted(a: VrAnchor, b: VrAnchor, posEps: number, angEps: number) {
  const dp = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const dot = Math.abs(a.qx * b.qx + a.qy * b.qy + a.qz * b.qz + a.qw * b.qw);
  const dq = 2 * Math.acos(Math.min(1, Math.max(-1, dot)));
  return dp > posEps || dq > angEps;
}

function makeRowTexture(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(6, 9, 16, 0.82)";
    ctx.beginPath();
    ctx.arc(64, 64, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(214, 178, 94, 0.75)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#f0d089";
    ctx.font = "bold 62px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 64, 68);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class HallView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly stereo = new THREE.StereoCamera();
  private readonly cssSize = new THREE.Vector2();

  private readonly disposables: Array<{ dispose: () => void }> = [];
  private readonly seatGeos: THREE.BufferGeometry[];
  private readonly seatMat: THREE.MeshStandardMaterial;
  private cushion: THREE.InstancedMesh | null = null;
  private back: THREE.InstancedMesh | null = null;
  private arm: THREE.InstancedMesh | null = null;
  private seatCapacity = 0;

  private readonly labels = new THREE.Group();
  private labelKey = "";

  private readonly screenGroup = new THREE.Group();
  private pictureMat: THREE.MeshBasicMaterial | null = null;
  private footageCanvas: HTMLCanvasElement;
  private footageTex: THREE.CanvasTexture;
  private posterCanvas: HTMLCanvasElement | null = null;
  private posterUrl: string | null = null;
  private trailerUrl: string | null = null;
  private video: HTMLVideoElement | null = null;
  private videoTex: THREE.VideoTexture | null = null;
  private videoActive = false;
  private facing = false;
  private footageRaf = 0;

  private readonly marker = new THREE.Group();
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private markerBorn = 0;
  private markerKey = "";

  private floor: THREE.Mesh | null = null;
  private wallL: THREE.Mesh | null = null;
  private wallR: THREE.Mesh | null = null;
  private hallKey = "";

  private screen: ScreenGeometry;
  private seat: { x: number; y: number; z: number } | null = null;
  private flightKey = "";
  private pos: Vec3 = { x: 0, y: 1.4, z: 12 };
  private vel: Vec3 = { x: 0, y: 0, z: 0 };
  private lookPoint: Vec3;
  private readonly quat = new THREE.Quaternion();
  private fovState = { value: 72, velocity: 0 };
  private spatialState = { value: 0, velocity: 0 };
  private flight: ActiveFlight | null = null;
  private flightU = 0;
  private flightPhase: FlightPhase | null = null;
  private settled = false;

  private spatial = false;
  private appliedNonce = 0;
  private headActive = false;
  private headYaw = 0;
  private headPitch = 0;
  private dragHeld = false;
  private dragging = false;
  private dragLast = { x: 0, y: 0 };
  private orientMode = false;
  private orientBase: { gamma: number; beta: number } | null = null;
  private readonly pointer = new THREE.Vector2(0, 0);

  private readonly anchor: VrAnchor = { x: 0, y: 1.4, z: 12, qx: 0, qy: 0, qz: 0, qw: 1 };
  private xrSession: XRSession | null = null;
  private xrSpace: XRReferenceSpace | null = null;
  private xrPlaced: VrAnchor | null = null;
  private xrPending: VrAnchor | null = null;
  private xrStable = 0;
  private xrLoop = false;

  private onFlightPhase: ((phase: FlightPhase | null) => void) | undefined;
  private onVideoStateChange: ((playing: boolean) => void) | undefined;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpLook = new THREE.Vector3();
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpDir = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);

  private alive = true;
  private queued = false;
  private raf = 0;
  private lastNow: number | null = null;
  private viewWidth = 1;
  private viewHeight = 1;
  private pointerAbort: AbortController | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly life = new AbortController();

  constructor(
    private readonly host: HTMLElement,
    props: HallViewProps,
  ) {
    this.screen = {
      screenWidthM: props.screenWidthM,
      screenHeightM: props.screenHeightM,
      hallDepthM: props.hallDepthM,
    };
    this.lookPoint = { x: 0, y: props.screenHeightM / 2, z: 0 };
    this.onFlightPhase = props.onFlightPhase;
    this.onVideoStateChange = props.onVideoStateChange;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x05070d, 1);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
    this.camera.position.set(0, 1.4, 12);
    this.stereo.eyeSep = VR_IPD_M;
    this.stereo.aspect = 0.5;

    this.scene.background = new THREE.Color("#05070d");
    this.scene.fog = new THREE.Fog("#05070d", 9, Math.max(30, props.hallDepthM + 10));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0x9fb0ff, 0x05070d, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(3, 9, 9);
    this.scene.add(sun);
    const spot = new THREE.PointLight(0x8f9dff, 0.4, 26);
    spot.position.set(0, 3.2, 1.6);
    this.scene.add(spot);

    this.seatGeos = [
      new THREE.BoxGeometry(0.46, 0.13, 0.44),
      new THREE.BoxGeometry(0.46, 0.62, 0.1),
      new THREE.BoxGeometry(0.07, 0.17, 0.38),
    ];
    this.seatMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, metalness: 0.15 });
    this.scene.add(this.labels);

    this.footageCanvas = document.createElement("canvas");
    this.footageCanvas.width = FOOTAGE_W;
    this.footageCanvas.height = FOOTAGE_H;
    const boot = this.footageCanvas.getContext("2d");
    if (boot) paintFootage(boot, 0, null);
    this.footageTex = new THREE.CanvasTexture(this.footageCanvas);
    this.footageTex.colorSpace = THREE.SRGBColorSpace;
    this.footageTex.minFilter = THREE.LinearFilter;
    this.footageTex.generateMipmaps = false;
    this.footageTex.needsUpdate = true;

    this.ringMat = new THREE.MeshBasicMaterial({
      color: "#f0d089",
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.5, 40), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    const shaftMat = new THREE.MeshBasicMaterial({
      color: "#f0d089",
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.34, 3, 18, 1, true), shaftMat);
    shaft.position.y = 1.5;
    this.marker.add(this.ring);
    this.marker.add(shaft);
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.scene.add(this.screenGroup);

    this.disposables.push(this.footageTex, this.ringMat, shaftMat, this.ring.geometry, shaft.geometry, this.seatMat);
    for (const geo of this.seatGeos) this.disposables.push(geo);

    this.resize();
    this.syncHall(props);
    this.syncScreenMesh();
    this.syncSeats(props.seats);
    this.syncMarker(props.selectedSeat);
    this.syncPoster(props.posterUrl);
    this.syncTrailer(props.trailerUrl);
    this.seat = props.selectedSeat;
    this.planFlight(props.selectedSeat);
    this.flightKey = this.flightKeyOf(props.selectedSeat);
    this.spatial = props.spatial;
    if (props.spatial) this.attachPointer();
    this.applyNonce(props.spatialNonce);

    const signal = this.life.signal;
    this.renderer.domElement.addEventListener("pointermove", this.onHover, { signal });
    window.addEventListener("resize", this.resize, { signal });
    this.renderer.xr.addEventListener("sessionend", this.onXrSessionEnd);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.bindWindowHooks();
    this.startFootage();
    this.wake();
  }

  update(props: HallViewProps) {
    if (!this.alive) return;
    this.onFlightPhase = props.onFlightPhase;
    this.onVideoStateChange = props.onVideoStateChange;
    this.screen = {
      screenWidthM: props.screenWidthM,
      screenHeightM: props.screenHeightM,
      hallDepthM: props.hallDepthM,
    };
    this.syncHall(props);
    this.syncScreenMesh();
    this.syncSeats(props.seats);
    this.syncMarker(props.selectedSeat);
    this.syncPoster(props.posterUrl);
    this.syncTrailer(props.trailerUrl);

    const key = this.flightKeyOf(props.selectedSeat);
    this.seat = props.selectedSeat;
    if (key !== this.flightKey) {
      this.flightKey = key;
      this.planFlight(props.selectedSeat);
    }
    if (props.spatial !== this.spatial) {
      if (!props.spatial) this.clearHead();
      this.spatial = props.spatial;
      if (props.spatial) this.attachPointer();
      else this.detachPointer();
    }
    this.applyNonce(props.spatialNonce);
    this.wake();
  }

  dispose() {
    if (!this.alive) return;
    this.alive = false;
    this.life.abort();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.detachPointer();
    this.stopOrient();
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.footageRaf);
    this.renderer.setAnimationLoop(null);
    const session = this.xrSession;
    if (session) session.end().catch(() => {});
    this.clearWindowHooks();
    this.renderer.xr.removeEventListener("sessionend", this.onXrSessionEnd);
    this.destroyVideo();
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });
    for (const item of this.disposables) item.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private flightKeyOf(seat: { x: number; y: number; z: number } | null) {
    const seatKey = seat ? `${seat.x},${seat.y},${seat.z}` : "overview";
    return `${seatKey}|${this.screen.screenWidthM},${this.screen.screenHeightM},${this.screen.hallDepthM}`;
  }

  private planFlight(seat: { x: number; y: number; z: number } | null) {
    const from = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    const fromLook = { x: this.lookPoint.x, y: this.lookPoint.y, z: this.lookPoint.z };
    if (!seat) {
      const end = overviewPose(this.screen).pos;
      const dist = Math.hypot(end.x - from.x, end.y - from.y, end.z - from.z);
      if (dist < 0.05) {
        this.flight = null;
        return;
      }
    }
    const waypoints = seat
      ? aerialWaypoints(from, fromLook, seat, this.screen)
      : overviewWaypoints(from, fromLook, this.screen);
    this.flight = {
      waypoints,
      t0: performance.now(),
      dur: flightDuration(waypoints) * 1000,
      kind: seat ? "seat" : "overview",
    };
    this.flightU = 0;
    this.flightPhase = seat ? "rise" : null;
    this.settled = false;
  }

  private syncHall(props: HallViewProps) {
    const floorW = Math.max(props.hallWidthM, props.screenWidthM + 4);
    const floorD = Math.max(props.hallDepthM + 3, 12);
    const key = `${floorW},${floorD},${props.hallDepthM}`;
    const fog = this.scene.fog as THREE.Fog;
    fog.far = Math.max(30, props.hallDepthM + 10);
    if (key === this.hallKey) return;
    this.hallKey = key;

    this.floor?.geometry.dispose();
    (this.floor?.material as THREE.Material | undefined)?.dispose();
    this.wallL?.geometry.dispose();
    (this.wallL?.material as THREE.Material | undefined)?.dispose();
    this.wallR?.geometry.dispose();
    (this.wallR?.material as THREE.Material | undefined)?.dispose();
    if (this.floor) this.scene.remove(this.floor);
    if (this.wallL) this.scene.remove(this.wallL);
    if (this.wallR) this.scene.remove(this.wallR);

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(floorW, floorD),
      new THREE.MeshStandardMaterial({ color: hallColors.floor, roughness: 0.95 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, 0, floorD / 2 - 1);

    const wallMat = () => new THREE.MeshStandardMaterial({ color: hallColors.wall, side: THREE.DoubleSide });
    this.wallL = new THREE.Mesh(new THREE.PlaneGeometry(floorD, 6.5), wallMat());
    this.wallL.position.set(-floorW / 2, 2.6, floorD / 2 - 1);
    this.wallL.rotation.y = Math.PI / 2;
    this.wallR = new THREE.Mesh(new THREE.PlaneGeometry(floorD, 6.5), wallMat());
    this.wallR.position.set(floorW / 2, 2.6, floorD / 2 - 1);
    this.wallR.rotation.y = -Math.PI / 2;
    this.scene.add(this.floor, this.wallL, this.wallR);
  }

  private syncScreenMesh() {
    const width = this.screen.screenWidthM;
    const height = this.screen.screenHeightM;
    const built = this.screenGroup.userData.width === width && this.screenGroup.userData.height === height;
    if (built && this.pictureMat) return;
    this.screenGroup.userData.width = width;
    this.screenGroup.userData.height = height;
    for (const child of [...this.screenGroup.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
      this.screenGroup.remove(child);
    }
    this.pictureMat = null;
    this.screenGroup.position.set(0, height / 2, 0);

    const bezel = new THREE.Mesh(
      new THREE.PlaneGeometry(width + 0.55, height + 0.45),
      new THREE.MeshBasicMaterial({ color: hallColors.bezel }),
    );
    bezel.position.z = -0.06;
    this.pictureMat = new THREE.MeshBasicMaterial({
      map: this.videoTex ?? this.footageTex,
      color: hallColors.screenPicture,
      toneMapped: false,
    });
    const picture = new THREE.Mesh(
      new THREE.PlaneGeometry(width * screenFrame.pictureScale, height * screenFrame.pictureScale),
      this.pictureMat,
    );
    this.screenGroup.add(bezel, picture);
    if (screenFrame.veilInFront && screenFrame.veilOpacity > 0) {
      const veil = new THREE.Mesh(
        new THREE.PlaneGeometry(width, height),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: screenFrame.veilOpacity,
          depthWrite: false,
        }),
      );
      veil.position.z = 0.04;
      this.screenGroup.add(veil);
    }
  }

  private syncSeats(seats: HallSeat[]) {
    const count = Math.max(seats.length, 1);
    const arms = Math.max(seats.length * 2, 2);
    if (!this.cushion || this.seatCapacity < count) {
      if (this.cushion) this.scene.remove(this.cushion);
      if (this.back) this.scene.remove(this.back);
      if (this.arm) this.scene.remove(this.arm);
      const cushionGeo = this.seatGeos[0];
      const backGeo = this.seatGeos[1];
      const armGeo = this.seatGeos[2];
      if (!cushionGeo || !backGeo || !armGeo) return;
      this.cushion = new THREE.InstancedMesh(cushionGeo, this.seatMat, count);
      this.back = new THREE.InstancedMesh(backGeo, this.seatMat, count);
      this.arm = new THREE.InstancedMesh(armGeo, this.seatMat, arms);
      this.cushion.frustumCulled = false;
      this.back.frustumCulled = false;
      this.arm.frustumCulled = false;
      this.seatCapacity = count;
      this.scene.add(this.cushion, this.back, this.arm);
    }
    const cushion = this.cushion;
    const back = this.back;
    const arm = this.arm;
    if (!cushion || !back || !arm) return;
    cushion.count = count;
    back.count = count;
    arm.count = arms;

    const dummy = new THREE.Object3D();
    const armColor = new THREE.Color();
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (!seat) continue;
      const color = seat.selected ? COLORS.seatSelected : seat.taken ? COLORS.seatTaken : COLORS.seat;
      dummy.position.set(seat.x, 0.44, seat.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      cushion.setMatrixAt(i, dummy.matrix);
      cushion.setColorAt(i, color);

      dummy.position.set(seat.x, 0.72, seat.z + 0.2);
      dummy.updateMatrix();
      back.setMatrixAt(i, dummy.matrix);
      back.setColorAt(i, color);

      dummy.position.set(seat.x - 0.25, 0.52, seat.z + 0.02);
      dummy.updateMatrix();
      arm.setMatrixAt(i * 2, dummy.matrix);
      dummy.position.set(seat.x + 0.25, 0.52, seat.z + 0.02);
      dummy.updateMatrix();
      arm.setMatrixAt(i * 2 + 1, dummy.matrix);
      armColor.copy(color).multiplyScalar(0.58);
      arm.setColorAt(i * 2, armColor);
      arm.setColorAt(i * 2 + 1, armColor);
    }
    cushion.instanceMatrix.needsUpdate = true;
    back.instanceMatrix.needsUpdate = true;
    arm.instanceMatrix.needsUpdate = true;
    if (cushion.instanceColor) cushion.instanceColor.needsUpdate = true;
    if (back.instanceColor) back.instanceColor.needsUpdate = true;
    if (arm.instanceColor) arm.instanceColor.needsUpdate = true;
    cushion.computeBoundingSphere();
    back.computeBoundingSphere();
    arm.computeBoundingSphere();

    const rows = new Map<string, { x: number; z: number }>();
    for (const seat of seats) {
      if (!seat.rowLabel) continue;
      const cur = rows.get(seat.rowLabel);
      if (!cur) rows.set(seat.rowLabel, { x: seat.x, z: seat.z });
      else cur.x = Math.min(cur.x, seat.x);
    }
    const labelKey = [...rows.entries()].map(([label, p]) => `${label}:${p.x}:${p.z}`).join("|");
    if (labelKey !== this.labelKey) {
      this.labelKey = labelKey;
      for (const child of [...this.labels.children]) {
        const sprite = child as THREE.Sprite;
        sprite.material.map?.dispose();
        sprite.material.dispose();
        this.labels.remove(sprite);
      }
      for (const [label, p] of rows) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: makeRowTexture(label),
            transparent: true,
            depthTest: false,
            toneMapped: false,
          }),
        );
        sprite.position.set(p.x - 0.85, 0.85, p.z);
        sprite.scale.set(0.5, 0.5, 0.5);
        sprite.renderOrder = 20;
        this.labels.add(sprite);
      }
    }

    (window as MeridianWindow).__meridianScene = {
      seatCount: seats.length,
      rowLabels: new Set(seats.map((s) => s.rowLabel).filter(Boolean)).size,
    };
  }

  private syncMarker(seat: { x: number; z: number } | null) {
    const key = seat ? `${seat.x},${seat.z}` : "";
    if (key === this.markerKey) return;
    this.markerKey = key;
    this.marker.visible = seat != null;
    if (!seat) return;
    this.marker.position.set(seat.x, 0, seat.z);
    this.ring.position.set(0, 0.07, 0);
    this.markerBorn = performance.now();
    this.ring.scale.setScalar(1);
    this.ringMat.opacity = 0.9;
  }

  private syncPoster(url: string | null | undefined) {
    const next = url ?? null;
    if (next === this.posterUrl) return;
    this.posterUrl = next;
    this.posterCanvas = null;
    if (!next) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (this.posterUrl !== next) return;
      const c = document.createElement("canvas");
      c.width = FOOTAGE_W;
      c.height = FOOTAGE_H;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, FOOTAGE_W, FOOTAGE_H);
      this.posterCanvas = c;
    };
    img.src = next;
  }

  private syncTrailer(url: string | null | undefined) {
    const next = url ?? null;
    if (next === this.trailerUrl) return;
    this.trailerUrl = next;
    this.destroyVideo();
    if (!next) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = next;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    this.video = video;
    this.videoTex = tex;

    const onPlaying = () => {
      if (this.video !== video) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;
      this.videoActive = true;
      if (this.pictureMat) this.pictureMat.map = tex;
      (window as MeridianWindow).__meridianScreen = { mode: "video", playing: true };
      this.onVideoStateChange?.(true);
      this.wake();
    };
    const onError = () => {
      if (this.video !== video) return;
      this.onVideoStateChange?.(false);
    };
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    const play = video.play();
    if (play && typeof play.catch === "function") {
      play.catch(() => {
        if (this.video === video) this.onVideoStateChange?.(false);
      });
    }
  }

  private destroyVideo() {
    const video = this.video;
    const tex = this.videoTex;
    this.video = null;
    this.videoTex = null;
    if (this.videoActive) {
      this.videoActive = false;
      if (this.pictureMat) this.pictureMat.map = this.footageTex;
      this.onVideoStateChange?.(false);
    }
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    tex?.dispose();
  }

  private startFootage() {
    let last = 0;
    let t = 0;
    let frames = 0;
    const tick = (now: number) => {
      if (!this.alive) return;
      this.footageRaf = requestAnimationFrame(tick);
      if (now - last < 1000 / FOOTAGE_FPS) return;
      last = now;
      if (document.hidden || this.videoActive) return;
      const ctx = this.footageCanvas.getContext("2d");
      if (!ctx) return;
      t += 1 / FOOTAGE_FPS;
      paintFootage(ctx, t, this.posterCanvas);
      this.footageTex.needsUpdate = true;
      frames += 1;
      const w = window as MeridianWindow;
      w.__meridianFootage = { frames, t: Number(t.toFixed(2)) };
      w.__meridianScreen = { mode: "procedural", frames };
      if (this.facing || frames <= 2) this.wake();
    };
    this.footageRaf = requestAnimationFrame(tick);
  }

  private resize = () => {
    if (!this.alive) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (w < 2 || h < 2) return;
    const dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 1.75);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.viewWidth = w;
    this.viewHeight = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.wake();
  };

  private onHover = (ev: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  };

  private attachPointer() {
    this.detachPointer();
    const ac = new AbortController();
    this.pointerAbort = ac;
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown, { signal: ac.signal });
    window.addEventListener("pointermove", this.onDragMove, { passive: true, signal: ac.signal });
    window.addEventListener("pointerup", this.onUp, { signal: ac.signal });
    el.addEventListener("dblclick", this.onRecenter, { signal: ac.signal });
  }

  private detachPointer() {
    this.pointerAbort?.abort();
    this.pointerAbort = null;
    this.dragging = false;
  }

  private onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (document.body.classList.contains("panel-resizing")) return;
    this.dragging = true;
    this.dragLast = { x: ev.clientX, y: ev.clientY };
  };

  private onDragMove = (ev: PointerEvent) => {
    if (document.body.classList.contains("panel-resizing")) return;
    if (this.dragging) {
      const dx = ev.clientX - this.dragLast.x;
      const dy = ev.clientY - this.dragLast.y;
      this.dragLast = { x: ev.clientX, y: ev.clientY };
      if (dx !== 0 || dy !== 0) {
        const next = vrDragAngles(this.headYaw, this.headPitch, dx, dy);
        this.headYaw = next.yaw;
        this.headPitch = next.pitch;
        this.dragHeld = true;
        this.orientMode = false;
      }
    }
    this.headActive = true;
    this.wake();
  };

  private onUp = () => {
    this.dragging = false;
  };

  private onRecenter = () => {
    this.headYaw = 0;
    this.headPitch = 0;
    this.dragHeld = false;
    this.dragging = false;
    this.orientMode = false;
    this.orientBase = null;
    this.headActive = true;
    this.wake();
  };

  private clearHead() {
    this.stopOrient();
    this.headYaw = 0;
    this.headPitch = 0;
    this.dragHeld = false;
    this.dragging = false;
    this.orientMode = false;
    this.orientBase = null;
  }

  private applyNonce(nonce: number) {
    if (!nonce || nonce === this.appliedNonce) return;
    this.appliedNonce = nonce;
    this.headYaw = 0;
    this.headPitch = 0;
    this.dragHeld = false;
    this.orientMode = false;
    this.orientBase = null;
    this.settled = false;
  }

  private onOrient = (ev: DeviceOrientationEvent) => {
    if (ev.gamma == null || ev.beta == null) return;
    const base = this.orientBase;
    if (!base) {
      this.orientBase = { gamma: ev.gamma, beta: ev.beta };
      return;
    }
    const angles = vrOrientationAngles(ev.gamma, ev.beta, base.gamma, base.beta);
    if (!this.orientMode && Math.abs(angles.yaw) < 0.04 && Math.abs(angles.pitch) < 0.04) return;
    this.orientMode = true;
    this.dragHeld = false;
    this.headYaw = angles.yaw;
    this.headPitch = angles.pitch;
    this.headActive = true;
    this.wake();
  };

  private stopOrient = () => {
    window.removeEventListener("deviceorientation", this.onOrient);
  };

  private bindWindowHooks() {
    const w = window as MeridianWindow;
    w.__meridianVrOrient = () => {
      const ctor = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      const arm = () => {
        this.stopOrient();
        this.orientBase = null;
        this.orientMode = false;
        window.addEventListener("deviceorientation", this.onOrient);
      };
      if (typeof ctor.requestPermission === "function") {
        ctor
          .requestPermission()
          .then((state) => {
            if (state === "granted") arm();
          })
          .catch(() => {});
        return;
      }
      arm();
    };
    w.__meridianEnterXR = () => {
      const xr = navigator.xr;
      if (!xr || this.renderer.xr.isPresenting) return;
      this.renderer.xr.enabled = true;
      this.beginXrLoop();
      xr.requestSession("immersive-vr", { optionalFeatures: ["local-floor", "local"] })
        .then(async (session) => {
          session.addEventListener("end", this.onSessionEnded);
          this.xrSession = session;
          await this.renderer.xr.setSession(session);
          await this.placeXr(session);
        })
        .catch(() => {
          this.renderer.xr.enabled = false;
          this.xrSession = null;
          this.endXrLoop();
        });
    };
    w.__meridianExitXR = () => {
      const session = this.xrSession;
      if (!session) return;
      session.end().catch(() => {});
    };
  }

  private clearWindowHooks() {
    const w = window as MeridianWindow;
    delete w.__meridianEnterXR;
    delete w.__meridianExitXR;
    delete w.__meridianVrOrient;
  }

  private onSessionEnded = () => {
    this.xrSession = null;
    this.xrSpace = null;
    this.xrPlaced = null;
    this.xrPending = null;
    this.xrStable = 0;
    this.renderer.xr.enabled = false;
  };

  private onXrSessionEnd = () => {
    this.endXrLoop();
  };

  private beginXrLoop() {
    if (this.xrLoop) return;
    this.xrLoop = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queued = false;
    this.renderer.setAnimationLoop(this.onXrFrame);
  }

  private endXrLoop() {
    if (!this.xrLoop) return;
    this.xrLoop = false;
    this.renderer.setAnimationLoop(null);
    this.resize();
    this.wake();
  }

  private async placeXr(session: XRSession) {
    if (!this.xrSpace) {
      try {
        this.xrSpace = await session.requestReferenceSpace("local-floor");
      } catch {
        this.xrSpace = await session.requestReferenceSpace("local");
      }
    }
    this.commitXr(this.anchor);
  }

  private commitXr(anchor: VrAnchor) {
    const base = this.xrSpace;
    if (!base || typeof XRRigidTransform === "undefined") return;
    const offset = base.getOffsetReferenceSpace(
      new XRRigidTransform(
        { x: anchor.x, y: anchor.y, z: anchor.z, w: 1 },
        { x: anchor.qx, y: anchor.qy, z: anchor.qz, w: anchor.qw },
      ),
    );
    this.renderer.xr.setReferenceSpace(offset);
    this.xrPlaced = copyAnchor(anchor);
    this.xrPending = copyAnchor(anchor);
    this.xrStable = 3;
  }

  private wake() {
    if (!this.alive || this.xrLoop || this.queued) return;
    this.queued = true;
    this.raf = requestAnimationFrame(this.onFrame);
  }

  private dt(now: number) {
    const prev = this.lastNow;
    this.lastNow = now;
    if (prev == null) return 1 / 60;
    return Math.min((now - prev) / 1000, 1 / 20);
  }

  private onFrame = (now: number) => {
    this.queued = false;
    this.raf = 0;
    if (!this.alive) return;
    const keep = this.step(this.dt(now));
    this.draw();
    if (this.videoActive || keep) this.wake();
  };

  private onXrFrame = (now: number) => {
    if (!this.alive) return;
    this.step(this.dt(now));
    this.draw();
  };

  /** Camera step. Returns true when another frame is required. */
  private step(dt: number): boolean {
    const now = performance.now();
    this.spatialState = springStep(this.spatialState, this.spatial ? 1 : 0, SPATIAL_OMEGA, dt);

    const targetPos: Vec3 = this.seat ? eyePosition(this.seat) : overviewPose(this.screen).pos;
    const targetLook: Vec3 = this.seat ? lookTargetForSeat(this.seat, this.screen) : overviewPose(this.screen).look;
    const active = this.flight;
    let phase: FlightPhase | null = null;
    let posTarget = targetPos;
    let lookTarget = targetLook;

    if (active) {
      const frozen = (window as MeridianWindow).__meridianFreeze === true;
      const rawU = frozen ? this.flightU : Math.min(1, (now - active.t0) / active.dur);
      this.flightU = rawU;
      const warped = smootherstep(rawU);
      const sample = sampleFlightPath(active.waypoints, warped);
      posTarget = sample.pos;
      lookTarget = sample.look;
      if (active.kind === "seat") {
        const pathParam = warped * (active.waypoints.length - 1);
        phase = pathParam < 2 ? "rise" : pathParam < 4 ? "hold" : "dive";
      }
      if (rawU >= 1) {
        this.flight = null;
        this.pos = { x: posTarget.x, y: posTarget.y, z: posTarget.z };
        this.vel = { x: 0, y: 0, z: 0 };
        phase = null;
      }
    }

    if (active) {
      this.pos = { x: posTarget.x, y: posTarget.y, z: posTarget.z };
      this.vel = { x: 0, y: 0, z: 0 };
    } else {
      const sx = springStep({ value: this.pos.x, velocity: this.vel.x }, posTarget.x, FOLLOW_OMEGA, dt);
      const sy = springStep({ value: this.pos.y, velocity: this.vel.y }, posTarget.y, FOLLOW_OMEGA, dt);
      const sz = springStep({ value: this.pos.z, velocity: this.vel.z }, posTarget.z, FOLLOW_OMEGA, dt);
      this.pos = { x: sx.value, y: sy.value, z: sz.value };
      this.vel = { x: sx.velocity, y: sy.velocity, z: sz.velocity };
    }
    this.lookPoint = { x: lookTarget.x, y: lookTarget.y, z: lookTarget.z };

    this.tmpV.set(this.pos.x, this.pos.y, this.pos.z);
    this.tmpLook.set(lookTarget.x, lookTarget.y, lookTarget.z);
    this.tmpMat.lookAt(this.tmpV, this.tmpLook, this.up);
    this.tmpQuat.setFromRotationMatrix(this.tmpMat);

    this.anchor.x = this.pos.x;
    this.anchor.y = this.pos.y;
    this.anchor.z = this.pos.z;
    this.anchor.qx = this.tmpQuat.x;
    this.anchor.qy = this.tmpQuat.y;
    this.anchor.qz = this.tmpQuat.z;
    this.anchor.qw = this.tmpQuat.w;

    const k = this.spatialState.value;
    if (!active && k > 0.002 && !this.renderer.xr.isPresenting) {
      let yaw: number;
      let pitch: number;
      if (this.orientMode || this.dragHeld) {
        yaw = this.headYaw;
        pitch = this.headPitch;
      } else {
        const hover = vrPointerAngles(this.pointer.x, this.pointer.y);
        yaw = hover.yaw;
        pitch = hover.pitch;
      }
      const posed = withHeadPose(
        { x: this.tmpQuat.x, y: this.tmpQuat.y, z: this.tmpQuat.z, w: this.tmpQuat.w },
        yaw * k,
        pitch * k,
      );
      this.tmpQuat.set(posed.x, posed.y, posed.z, posed.w);
    }

    if (active) this.quat.copy(this.tmpQuat);
    else this.quat.slerp(this.tmpQuat, smoothingAlpha(dt, ROT_TAU));

    this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.camera.quaternion.copy(this.quat);
    this.camera.updateMatrixWorld();
    const centre = screenCenter(this.screen);
    this.camera.focus = Math.max(
      0.25,
      Math.hypot(this.pos.x - centre.x, this.pos.y - centre.y, this.pos.z - centre.z),
    );

    const aspect = this.viewWidth / Math.max(this.viewHeight, 1);
    const targetFov = fovForAspect(aspect).verticalFovDeg;
    const fovNext = springStep(this.fovState, targetFov, FOV_OMEGA, dt);
    this.fovState = fovNext;
    if (Math.abs(this.camera.fov - fovNext.value) > 0.01) {
      this.camera.fov = fovNext.value;
      this.camera.updateProjectionMatrix();
    }

    const posErr = Math.hypot(posTarget.x - this.pos.x, posTarget.y - this.pos.y, posTarget.z - this.pos.z);
    const rotErr = this.quat.angleTo(this.tmpQuat);
    const fovErr = Math.abs(targetFov - this.camera.fov);
    const moving = this.flight != null || posErr > 0.0012 || rotErr > 0.0006 || fovErr > 0.02 || this.headActive;
    if (moving) this.headActive = false;
    else if (!this.settled) {
      this.pos = { x: posTarget.x, y: posTarget.y, z: posTarget.z };
      this.vel = { x: 0, y: 0, z: 0 };
      this.quat.copy(this.tmpQuat);
      this.camera.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.camera.quaternion.copy(this.tmpQuat);
      this.camera.updateMatrixWorld();
      this.settled = true;
    }

    this.camera.getWorldDirection(this.tmpDir);
    this.facing = -this.tmpDir.z > 0.3;
    const yawDeg = Math.atan2(this.tmpDir.x, -this.tmpDir.z) * (180 / Math.PI);
    const pitchDeg = Math.asin(Math.max(-1, Math.min(1, this.tmpDir.y))) * (180 / Math.PI);
    (window as MeridianWindow).__meridianCam = {
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      yawDeg,
      pitchDeg,
      fov: this.camera.fov,
      flying: this.flight != null,
      phase,
    };
    if (phase !== this.flightPhase) {
      this.flightPhase = phase;
      this.onFlightPhase?.(phase);
    }

    let markerLive = false;
    if (this.marker.visible) {
      const age = (now - this.markerBorn) / 1000;
      if (age <= 1.6) {
        const pulse = 1 + Math.sin(age * Math.PI * 1.9) * 0.18;
        this.ring.scale.setScalar(pulse);
        this.ringMat.opacity = Math.max(0.15, 0.95 - age * 0.55);
        markerLive = true;
      }
    }
    return moving || markerLive;
  }

  private draw() {
    if (this.renderer.xr.isPresenting) {
      if (this.xrSpace) {
        const pending = this.xrPending;
        if (!pending || poseShifted(this.anchor, pending, 0.008, 0.015)) {
          this.xrPending = copyAnchor(this.anchor);
          this.xrStable = 0;
        } else {
          this.xrStable += 1;
        }
        const placed = this.xrPlaced;
        const needs = !placed || poseShifted(this.anchor, placed, 0.02, 0.03);
        if (needs && this.xrStable >= 3) this.commitXr(this.anchor);
      }
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.renderer.getSize(this.cssSize);
    const w = this.cssSize.x;
    const h = this.cssSize.y;
    if (!this.spatial || w < 2 || h < 2) {
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.stereo.aspect = 0.5;
    this.stereo.eyeSep = VR_IPD_M;
    this.stereo.update(this.camera);
    this.stereo.cameraL.matrixWorldInverse.copy(this.stereo.cameraL.matrixWorld).invert();
    this.stereo.cameraR.matrixWorldInverse.copy(this.stereo.cameraR.matrixWorld).invert();
    this.stereo.cameraL.projectionMatrixInverse.copy(this.stereo.cameraL.projectionMatrix).invert();
    this.stereo.cameraR.projectionMatrixInverse.copy(this.stereo.cameraR.projectionMatrix).invert();

    const half = Math.floor(w / 2);
    this.renderer.setScissorTest(true);
    this.renderer.setViewport(0, 0, half, h);
    this.renderer.setScissor(0, 0, half, h);
    this.renderer.render(this.scene, this.stereo.cameraL);
    this.renderer.setViewport(w - half, 0, half, h);
    this.renderer.setScissor(w - half, 0, half, h);
    this.renderer.render(this.scene, this.stereo.cameraR);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, w, h);
  }
}
