import { useState, useEffect, useRef, useCallback } from "react";
import { SvgCanvasAdapter } from "./svgcanvas/SvgCanvasAdapter";
import type { ImportResult } from "./svgcanvas/SvgCanvasAdapter";
import { inspectSvgForImport } from "./import/inspectSvgForImport";
import type { Diagnostic } from "./import/inspectSvgForImport";
import type {
  CharacterRigV1,
  MotionClipV1,
  MotionKeyframeV1,
  TransformValue,
} from "@ltypet/character-motion";
import { sampleMotionClip } from "@ltypet/character-motion";
import { serializeMotionLibrary } from "@ltypet/character-motion";

// ?raw import: 从仓库 src/assets/ 读取素材
import rawGlaxSvg from "../../../src/assets/小洛宝.glax.svg?raw";

function canonicalize(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").normalize("NFC");
}

async function canonicalFingerprint(text: string): Promise<string> {
  const canonical = canonicalize(text);
  const data = new TextEncoder().encode(canonical);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build a minimal pseudo-rig from adapter import data for sampling */
function buildPseudoRig(
  importResult: ImportResult,
  fingerprint: string,
): CharacterRigV1 {
  return {
    schemaVersion: 1 as const,
    rigId: "xiaoluobao",
    artwork: {
      source: "小洛宝.glax.svg",
      fingerprint: `sha256:${fingerprint}`,
      viewBox: [0, 0, 512, 512],
    },
    renderSlots: ["body", "head", "front"],
    parts: importResult.parts.map((p) => {
      const pivotLocal = importResult.pivotLocal.get(p.partId);
      return {
        id: p.partId,
        sourceBinding: { kind: "inkscapeLabel" as const, value: p.inkscapeLabel },
        logicalParentId: null,
        defaultRenderSlot: "body",
        pivot: {
          x: pivotLocal?.x ?? 0,
          y: pivotLocal?.y ?? 0,
          space: "partLocal" as const,
        },
        bindMatrix: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number],
      };
    }),
  };
}

/** Build a v1 clip from the current edit state */
function buildV1Clip(
  clip: { id: string; partId: string; fps: number; durationFrames: number; keyframes: { frame: number; rotation: number; easing: string }[] },
): MotionClipV1 {
  const keyframes: MotionKeyframeV1[] = clip.keyframes.map((kf) => ({
    frame: kf.frame,
    values: { rotation: kf.rotation },
    easing: kf.easing as any,
  }));

  return {
    id: clip.id,
    fps: clip.fps,
    durationFrames: clip.durationFrames,
    loop: "repeat" as const,
    tracks: [{ partId: clip.partId, keyframes }],
    events: [],
  };
}

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<SvgCanvasAdapter | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameTimeRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fingerprint, setFingerprint] = useState<string>("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [diags, setDiags] = useState<Diagnostic[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [canvasVersion, setCanvasVersion] = useState<string>("");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [rig, setRig] = useState<CharacterRigV1 | null>(null);

  // Clip state
  const [clipId, setClipId] = useState("p0-wave");
  const [clipPartId, setClipPartId] = useState("arm_right");
  const [clipFps] = useState(24);
  const [clipDuration] = useState(24);
  const [clipKeyframes, setClipKeyframes] = useState([
    { frame: 0, rotation: 0, easing: "easeInOut" },
    { frame: 12, rotation: -55, easing: "easeInOut" },
    { frame: 24, rotation: 0, easing: "easeInOut" },
  ]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [pivotLocal, setPivotLocal] = useState<{ x: number; y: number } | null>(null);

  const addLog = (msg: string) => setLog((p) => [...p.slice(-99), msg]);

  useEffect(() => {
    const text = rawGlaxSvg;
    canonicalFingerprint(text).then((fp) => {
      setFingerprint(fp);
      addLog(`[信息] 素材指纹: sha256:${fp}`);
      addLog("[信息] 素材已加载，点击「初始化画布」创建舞台。");
    });
  }, []);

  const handleInit = () => {
    if (!containerRef.current) return;
    const adapter = new SvgCanvasAdapter();
    adapterRef.current = adapter;
    try {
      adapter.mount(containerRef.current);
      setCanvasVersion(adapter.getVersion());
      addLog(`[信息] svgcanvas v${adapter.getVersion()} 初始化完成。`);
    } catch (e: unknown) {
      addLog(`[错误] 画布初始化失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleLoadSample = () => {
    const adapter = adapterRef.current;
    if (!adapter) return;

    try {
      addLog(`[信息] 载入素材 (${rawGlaxSvg.length} 字符)`);
      const insp = inspectSvgForImport(rawGlaxSvg);
      setDiags(insp.diagnostics);
      insp.diagnostics.forEach((d) => addLog(`[${d.severity}] ${d.message}`));

      if (insp.hasError) { addLog("[错误] 安全导入拒绝"); return; }

      const result = adapter.loadSvg(rawGlaxSvg);
      setImportResult(result);
      addLog(`[信息] 导入: ${result.parts.length} 部件, ${result.pivotLocal.size} pivot`);

      const r = buildPseudoRig(result, fingerprint || "00000000");
      setRig(r);

      if (result.parts.length > 0) handleSelectPart(result.parts[0].partId);
    } catch (e: unknown) {
      addLog(`[错误] 载入失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDispose = () => {
    stopAnimation();
    adapterRef.current?.dispose();
    adapterRef.current = null;
    setImportResult(null); setDiags([]); setRig(null);
    setSelectedPart(null); setCanvasVersion("");
    setCurrentFrame(0); setIsPlaying(false);
    addLog("[信息] 画布已销毁。");
  };

  const handleSelectPart = useCallback(
    (partId: string) => {
      const adapter = adapterRef.current;
      if (!adapter) return;
      if (selectedPart && selectedPart !== partId) adapter.restoreBindPose(selectedPart);
      stopAnimation();
      adapter.selectPart(partId);
      setSelectedPart(partId);
      setClipPartId(partId);
      setCurrentFrame(0);

      const pl = adapter.getPivotLocal(partId);
      setPivotLocal(pl);
      if (pl) addLog(`[信息] pivot "${partId}": (${pl.x.toFixed(2)}, ${pl.y.toFixed(2)}) part-local`);
      addLog(`[信息] 选中: ${partId}`);
    },
    [selectedPart],
  );

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    setIsPlaying(false);
    frameTimeRef.current = 0;
    lastTimestampRef.current = 0;
  }, []);

  // Sample clip using shared core and apply to adapter
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !selectedPart || !rig) return;
    if (clipPartId !== selectedPart) return;

    const v1Clip = buildV1Clip({ id: clipId, partId: clipPartId, fps: clipFps, durationFrames: clipDuration, keyframes: clipKeyframes });
    const sampled = sampleMotionClip(v1Clip, currentFrame, rig);

    sampled.transforms.forEach((tf: TransformValue, partId: string) => {
      if (partId === selectedPart) {
        adapter.applyPreviewTransform(partId, {
          x: tf.x, y: tf.y, rotation: tf.rotation,
          scaleX: tf.scaleX, scaleY: tf.scaleY, opacity: tf.opacity,
        });
      }
    });
  }, [currentFrame, clipPartId, clipKeyframes, selectedPart, rig]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying) { if (animationRef.current !== null) { cancelAnimationFrame(animationRef.current); animationRef.current = null; } return; }
    if (lastTimestampRef.current === 0) lastTimestampRef.current = performance.now();

    const fps = clipFps;
    const frameDuration = 1000 / fps;
    const totalFrames = clipDuration;

    const animate = (timestamp: number) => {
      const delta = timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;
      frameTimeRef.current += delta;
      let frame = Math.floor(frameTimeRef.current / frameDuration);
      if (frame >= totalFrames) {
        if (loopEnabled) { frameTimeRef.current = 0; frame = 0; }
        else { setCurrentFrame(totalFrames); setIsPlaying(false); return; }
      }
      setCurrentFrame(frame);
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
    return () => { if (animationRef.current !== null) { cancelAnimationFrame(animationRef.current); animationRef.current = null; } };
  }, [isPlaying, clipFps, clipDuration, loopEnabled]);

  useEffect(() => () => { stopAnimation(); adapterRef.current?.dispose(); }, []);

  const handleFrameSlider = (e: React.ChangeEvent<HTMLInputElement>) => { if (isPlaying) setIsPlaying(false); setCurrentFrame(Number(e.target.value)); };
  const handleTogglePlay = () => {
    if (isPlaying) { setIsPlaying(false); return; }
    frameTimeRef.current = currentFrame * (1000 / clipFps);
    lastTimestampRef.current = 0;
    setIsPlaying(true);
  };

  // Export v1 motions.json
  const handleExport = () => {
    if (!fingerprint || !rig) { addLog("[错误] 请先加载素材"); return; }
    const clip = buildV1Clip({ id: clipId, partId: clipPartId, fps: clipFps, durationFrames: clipDuration, keyframes: clipKeyframes });
    const lib = { schemaVersion: 1 as const, rigId: rig.rigId, clips: [clip] };
    const json = serializeMotionLibrary(lib);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${clip.id}.motions.v1.json`; a.click();
    URL.revokeObjectURL(url);
    addLog(`[信息] 导出 v1: ${clip.id}.motions.v1.json`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") { addLog("[错误] 无法读取文件"); return; }
      try {
        const parsed = JSON.parse(text);
        if (parsed.clips?.[0]) {
          const c = parsed.clips[0];
          setClipId(c.id ?? "imported");
          setClipPartId(c.tracks?.[0]?.partId ?? "arm_right");
          const kfs = c.tracks?.[0]?.keyframes?.map((kf: any) => ({
            frame: kf.frame,
            rotation: kf.values?.rotation ?? 0,
            easing: typeof kf.easing === "string" ? kf.easing : "linear",
          })) ?? [];
          setClipKeyframes(kfs);
          setCurrentFrame(0); setIsPlaying(false); frameTimeRef.current = 0;
          addLog(`[信息] 导入 v1: ${c.id} (${kfs.length} 关键帧)`);
        }
      } catch (err: unknown) {
        addLog(`[错误] 导入失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  useEffect(() => () => { if (adapterRef.current && selectedPart) adapterRef.current.restoreBindPose(selectedPart); }, [selectedPart]);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>小洛宝 Animation Studio — P1</h1>
        <div className="controls">
          <button onClick={handleInit} disabled={!!adapterRef.current}>初始化</button>
          <button onClick={handleLoadSample} disabled={!adapterRef.current}>载入样例</button>
          <button onClick={handleDispose} disabled={!adapterRef.current}>销毁</button>
          <button onClick={handleExport} disabled={!fingerprint}>导出 v1 JSON</button>
          <button onClick={() => fileInputRef.current?.click()}>导入 v1 JSON</button>
          <input ref={fileInputRef} type="file" accept=".json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
        {canvasVersion && <span className="version">svgcanvas v{canvasVersion}</span>}
        {fingerprint && <span className="fingerprint">指纹: sha256:{fingerprint.slice(0, 8)}...</span>}
      </header>

      <main className="stage-area"><div ref={containerRef} className="canvas-container" /></main>

      <aside className="sidebar">
        {importResult && (
          <div className="parts-panel">
            <h2>部件</h2>
            <ul className="parts-list">
              {importResult.parts.map((p) => (
                <li key={p.partId} className={`part-item ${selectedPart === p.partId ? "selected" : ""}`}
                  onClick={() => handleSelectPart(p.partId)}>
                  {p.partId}{importResult.pivotLocal.has(p.partId) && <span className="pivot-badge">●</span>}
                </li>
              ))}
            </ul>
            {selectedPart && pivotLocal && (
              <div className="pivot-info">
                <h3>Pivot</h3>
                <p>{selectedPart}: part-local ({pivotLocal.x.toFixed(2)}, {pivotLocal.y.toFixed(2)})</p>
              </div>
            )}
          </div>
        )}

        {selectedPart && (
          <div className="animation-panel">
            <h2>动作预览</h2>
            <p>{clipId} — {clipPartId} @ {clipFps} fps, {clipDuration} 帧</p>
            <div className="playback-controls">
              <button onClick={handleTogglePlay}>{isPlaying ? "⏸ 暂停" : "▶ 播放"}</button>
              <label><input type="checkbox" checked={loopEnabled} onChange={(e) => setLoopEnabled(e.target.checked)} />循环</label>
            </div>
            <div className="slider-row">
              <span>{currentFrame}/{clipDuration}</span>
              <input type="range" min={0} max={clipDuration} value={currentFrame} onChange={handleFrameSlider} className="frame-slider" />
            </div>
          </div>
        )}

        <h2>诊断</h2>
        {importResult ? (
          <div className="diagnostics">
            <p>部件: {importResult.parts.length} | pivot: {importResult.pivotLocal.size}</p>
            <ul>
              {diags.map((d, i) => (
                <li key={i} className={`diag-${d.severity}`}>[{d.severity}] {d.message}</li>
              ))}
            </ul>
          </div>
        ) : <p className="placeholder">尚未导入</p>}

        <h2>日志</h2>
        <pre className="log">{log.join("\n") || "等待操作..."}</pre>
      </aside>
    </div>
  );
}
