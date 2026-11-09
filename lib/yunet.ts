// YuNet, the face service's own detector (face/app.py), on the phone: framing hints only ("move closer",
// "too dark"). The server judges from the pictures it gets, so nothing here is trusted or required: until it
// loads, or on a phone that can't run it, the check simply goes without hints.
// The ONNX runtime's WebAssembly (~3.8 MB compressed) comes from jsDelivr at the installed version and is
// cached by the browser after the first time; the 230 KB model is ours (public/models).

type Ort = typeof import("onnxruntime-web/wasm");
type Session = import("onnxruntime-web/wasm").InferenceSession;

const SIZE = 640; // the model's fixed input; the 3:4 picture is drawn at 480 x 640 in its top-left corner
const PW = 480;
const MIN_SCORE = 0.6;

// x, y, w, h as shares of the 3:4 picture (unmirrored, like what's sent); light: mean brightness 0-255.
export type Seen = { face: { x: number; y: number; w: number; h: number } | null; light: number };

let loading: Promise<{ ort: Ort; session: Session } | null> | undefined;

export function loadYunet() {
  loading ??= import("onnxruntime-web/wasm")
    .then(async (ort) => {
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
      return { ort, session: await ort.InferenceSession.create("/models/yunet.onnx", { executionProviders: ["wasm"] }) };
    })
    .catch(() => null);
  return loading;
}

let canvas: HTMLCanvasElement | undefined;
const input = new Float32Array(3 * SIZE * SIZE);

// The biggest-scoring face in the video's 3:4 centre (what the oval frames), or null. Never throws.
export async function look(v: HTMLVideoElement): Promise<Seen | null> {
  const y = await loadYunet();
  if (!y || v.readyState < 2) return null;
  canvas ??= Object.assign(document.createElement("canvas"), { width: SIZE, height: SIZE });
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  const sw = Math.min(v.videoWidth, (v.videoHeight * 3) / 4);
  const sh = Math.min(v.videoHeight, (v.videoWidth * 4) / 3);
  ctx.drawImage(v, (v.videoWidth - sw) / 2, (v.videoHeight - sh) / 2, sw, sh, 0, 0, PW, SIZE);
  const px = ctx.getImageData(0, 0, SIZE, SIZE).data;
  // Planar BGR floats 0-255, as OpenCV's blobFromImage feeds YuNet on the server.
  const plane = SIZE * SIZE;
  let light = 0;
  for (let i = 0; i < plane; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    input[i] = b;
    input[plane + i] = g;
    input[2 * plane + i] = r;
    light += r + g + b;
  }
  light /= 3 * (PW * SIZE); // only the picture's part, not the black padding
  try {
    const out = await y.session.run({ input: new y.ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
    return { face: best(out as Record<string, { data: Float32Array }>), light };
  } catch {
    return null;
  }
}

// OpenCV's YuNet decoding (face_detect.cpp), keeping only the best box: hints need no NMS.
function best(out: Record<string, { data: Float32Array }>) {
  let top: Seen["face"] = null;
  let score = MIN_SCORE;
  for (const stride of [8, 16, 32]) {
    const cls = out[`cls_${stride}`].data, obj = out[`obj_${stride}`].data, box = out[`bbox_${stride}`].data;
    const cols = SIZE / stride;
    for (let i = 0; i < cls.length; i++) {
      const s = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
      if (s <= score) continue;
      score = s;
      const cx = ((i % cols) + box[i * 4]) * stride;
      const cy = (Math.floor(i / cols) + box[i * 4 + 1]) * stride;
      const w = Math.exp(box[i * 4 + 2]) * stride;
      const h = Math.exp(box[i * 4 + 3]) * stride;
      top = { x: (cx - w / 2) / PW, y: (cy - h / 2) / SIZE, w: w / PW, h: h / SIZE };
    }
  }
  return top;
}
