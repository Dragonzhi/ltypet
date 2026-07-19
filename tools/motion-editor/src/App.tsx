import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterRigV1, MotionLibraryV1 } from "@ltypet/character-motion";
import {
  sampleMotionClip,
  serializeMotionLibrary,
  sha256CanonicalText,
  validateMotionLibrary,
} from "@ltypet/character-motion";
import rawGlaxSvg from "../../../src/assets/小洛宝.glax.svg?raw";
import type { Diagnostic, ImportResult } from "./svgcanvas/SvgCanvasAdapter";
import { SvgCanvasAdapter } from "./svgcanvas/SvgCanvasAdapter";
import {
  buildRigFromImport,
  createWaveExample,
  firstPlayableTrack,
  parseMotionLibraryForRig,
} from "./project/v1Project";

const SAMPLE_ARTWORK_NAME = "小洛宝.glax.svg";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<SvgCanvasAdapter | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameTimeRef = useRef(0);
  const lastTimestampRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animatedPartsRef = useRef<Set<string>>(new Set());

  const [fingerprint, setFingerprint] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [canvasVersion, setCanvasVersion] = useState("");
  const [selectedPart, setSelectedPart] = useState<string | null>(null);
  const [pivotLocal, setPivotLocal] = useState<{ x: number; y: number } | null>(null);
  const [rig, setRig] = useState<CharacterRigV1 | null>(null);
  const [motionLibrary, setMotionLibrary] = useState<MotionLibraryV1 | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);

  const activeClip = useMemo(
    () => motionLibrary?.clips.find((clip) => clip.id === activeClipId) ?? null,
    [activeClipId, motionLibrary],
  );

  const addLog = useCallback((message: string) => {
    setLog((previous) => [...previous.slice(-99), message]);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    lastTimestampRef.current = 0;
    setIsPlaying(false);
  }, []);

  const selectPart = useCallback((partId: string) => {
    const adapter = adapterRef.current;
    if (!adapter?.selectPart(partId)) return false;
    setSelectedPart(partId);
    const pivot = adapter.getPivotLocal(partId);
    setPivotLocal(pivot);
    addLog(
      pivot
        ? `[信息] 选中 ${partId}，pivot (${pivot.x.toFixed(4)}, ${pivot.y.toFixed(4)})`
        : `[信息] 选中 ${partId}（无显式 pivot）`,
    );
    return true;
  }, [addLog]);

  const activateLibrary = useCallback((library: MotionLibraryV1, sourceLabel: string) => {
    const playable = firstPlayableTrack(library);
    setMotionLibrary(library);
    setActiveClipId(playable?.clip.id ?? library.clips[0]?.id ?? null);
    setCurrentFrame(0);
    frameTimeRef.current = 0;
    stopAnimation();
    if (playable) selectPart(playable.partId);
    addLog(`[信息] ${sourceLabel}: ${library.clips.length} 个 clip`);
  }, [addLog, selectPart, stopAnimation]);

  useEffect(() => {
    let cancelled = false;
    void sha256CanonicalText(rawGlaxSvg).then((value) => {
      if (cancelled) return;
      setFingerprint(value);
      addLog(`[信息] 样例素材指纹: ${value}`);
    }).catch((error: unknown) => {
      if (!cancelled) addLog(`[错误] 素材指纹计算失败: ${String(error)}`);
    });
    return () => { cancelled = true; };
  }, [addLog]);

  const handleInit = () => {
    if (!containerRef.current || adapterRef.current) return;
    try {
      const adapter = new SvgCanvasAdapter();
      adapter.mount(containerRef.current);
      adapterRef.current = adapter;
      setCanvasVersion(adapter.getVersion());
      addLog(`[信息] svgcanvas v${adapter.getVersion()} 初始化完成`);
    } catch (error: unknown) {
      addLog(`[错误] 画布初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleLoadCharacter = () => {
    const adapter = adapterRef.current;
    if (!adapter || !fingerprint) return;

    try {
      stopAnimation();
      const imported = adapter.loadSvg(rawGlaxSvg);
      setDiagnostics(imported.diagnostics);
      imported.diagnostics.forEach((item) => addLog(`[${item.severity}] ${item.message}`));
      if (imported.diagnostics.some((item) => item.severity === "error")) {
        throw new Error("素材导入存在 error，未建立 rig");
      }

      const nextRig = buildRigFromImport(imported, {
        source: SAMPLE_ARTWORK_NAME,
        fingerprint,
      });
      setImportResult(imported);
      setRig(nextRig);

      if (motionLibrary) {
        const validation = validateMotionLibrary(motionLibrary, nextRig);
        if (!validation.ok) {
          setMotionLibrary(null);
          setActiveClipId(null);
          addLog("[警告] 旧动作与新载入的 rig 不兼容，已从舞台卸载");
        }
      }

      const preferredPart = firstPlayableTrack(motionLibrary ?? { schemaVersion: 1, rigId: nextRig.rigId, clips: [] })?.partId;
      const fallbackPart = imported.parts[0]?.partId;
      if (preferredPart && nextRig.parts.some((part) => part.id === preferredPart)) {
        selectPart(preferredPart);
      } else if (fallbackPart) {
        selectPart(fallbackPart);
      }
      addLog(`[信息] 角色 rig 已建立：${nextRig.parts.length} 个部件`);
    } catch (error: unknown) {
      setImportResult(null);
      setRig(null);
      addLog(`[错误] 载入角色失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleLoadWaveExample = () => {
    if (!rig) return;
    try {
      activateLibrary(createWaveExample(rig), "载入挥手示例");
    } catch (error: unknown) {
      addLog(`[错误] ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleDispose = () => {
    stopAnimation();
    adapterRef.current?.dispose();
    adapterRef.current = null;
    animatedPartsRef.current.clear();
    setCanvasVersion("");
    setImportResult(null);
    setDiagnostics([]);
    setRig(null);
    setMotionLibrary(null);
    setActiveClipId(null);
    setSelectedPart(null);
    setPivotLocal(null);
    setCurrentFrame(0);
    addLog("[信息] 画布、角色和动作已全部卸载");
  };

  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !activeClip || !rig) return;

    const sampled = sampleMotionClip(activeClip, currentFrame, rig);
    const nextParts = new Set(sampled.transforms.keys());
    for (const previousPart of animatedPartsRef.current) {
      if (!nextParts.has(previousPart)) adapter.restoreBindPose(previousPart);
    }
    for (const [partId, transform] of sampled.transforms) {
      adapter.applyPreviewTransform(partId, transform);
    }
    animatedPartsRef.current = nextParts;
  }, [activeClip, currentFrame, rig]);

  useEffect(() => {
    if (!isPlaying || !activeClip) return;
    const frameDuration = 1000 / activeClip.fps;

    const animate = (timestamp: number) => {
      if (lastTimestampRef.current === 0) lastTimestampRef.current = timestamp;
      frameTimeRef.current += timestamp - lastTimestampRef.current;
      lastTimestampRef.current = timestamp;
      let frame = Math.floor(frameTimeRef.current / frameDuration);

      if (frame > activeClip.durationFrames) {
        if (activeClip.loop === "repeat") {
          frameTimeRef.current = 0;
          frame = 0;
        } else {
          setCurrentFrame(activeClip.durationFrames);
          setIsPlaying(false);
          animationRef.current = null;
          return;
        }
      }

      setCurrentFrame(frame);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [activeClip, isPlaying]);

  const handleTogglePlay = () => {
    if (!activeClip) return;
    if (isPlaying) {
      stopAnimation();
      return;
    }
    frameTimeRef.current = currentFrame * (1000 / activeClip.fps);
    lastTimestampRef.current = 0;
    setIsPlaying(true);
  };

  const handleFrameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    stopAnimation();
    setCurrentFrame(Number(event.target.value));
  };

  const handleClipChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value;
    const clip = motionLibrary?.clips.find((candidate) => candidate.id === nextId);
    if (!clip) return;
    stopAnimation();
    setActiveClipId(nextId);
    setCurrentFrame(0);
    frameTimeRef.current = 0;
    const firstTrack = clip.tracks[0];
    if (firstTrack) selectPart(firstTrack.partId);
  };

  const handleExport = () => {
    if (!motionLibrary) return;
    const json = serializeMotionLibrary(motionLibrary);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeClip?.id ?? motionLibrary.rigId}.motions.v1.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    addLog(`[信息] 导出完整 v1 动作库：${motionLibrary.clips.length} 个 clip`);
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !rig) {
      addLog("[错误] 请先载入角色，再导入动作文件");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        addLog("[错误] 无法以文本读取动作文件");
        return;
      }
      try {
        activateLibrary(parseMotionLibraryForRig(reader.result, rig), `导入 ${file.name}`);
      } catch (error: unknown) {
        addLog(`[错误] ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    reader.onerror = () => addLog(`[错误] 读取 ${file.name} 失败`);
    reader.readAsText(file);
  };

  useEffect(() => () => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    adapterRef.current?.dispose();
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>小洛宝 Animation Studio — P1</h1>
        <div className="controls">
          <button onClick={handleInit} disabled={!!adapterRef.current}>1. 初始化画布</button>
          <button onClick={handleLoadCharacter} disabled={!adapterRef.current || !fingerprint}>2. 载入角色样例</button>
          <button onClick={handleLoadWaveExample} disabled={!rig}>3. 载入挥手示例</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={!rig}>导入动作</button>
          <button onClick={handleExport} disabled={!motionLibrary}>导出动作</button>
          <button onClick={handleDispose} disabled={!adapterRef.current}>卸载全部</button>
          <input ref={fileInputRef} type="file" accept=".json" hidden onChange={handleImportFile} />
        </div>
        {canvasVersion && <span className="version">svgcanvas v{canvasVersion}</span>}
        {fingerprint && <span className="fingerprint">{fingerprint.slice(0, 15)}…</span>}
      </header>

      <main className="stage-area"><div ref={containerRef} className="canvas-container" /></main>

      <aside className="sidebar">
        {importResult ? (
          <div className="parts-panel">
            <h2>角色部件</h2>
            <ul className="parts-list">
              {importResult.parts.map((part) => (
                <li
                  key={part.partId}
                  className={`part-item ${selectedPart === part.partId ? "selected" : ""}`}
                  onClick={() => selectPart(part.partId)}
                >
                  {part.partId}
                  {importResult.pivotLocal.has(part.partId) && <span className="pivot-badge">●</span>}
                </li>
              ))}
            </ul>
            {selectedPart && (
              <div className="pivot-info">
                <h3>当前选择</h3>
                <p>{selectedPart}</p>
                <p>{pivotLocal ? `pivot (${pivotLocal.x.toFixed(4)}, ${pivotLocal.y.toFixed(4)})` : "无显式 pivot"}</p>
              </div>
            )}
          </div>
        ) : <p className="placeholder">请依次初始化画布并载入角色</p>}

        {motionLibrary && (
          <div className="animation-panel">
            <h2>动作预览</h2>
            <label>
              Clip
              <select value={activeClipId ?? ""} onChange={handleClipChange}>
                {motionLibrary.clips.map((clip) => <option key={clip.id} value={clip.id}>{clip.id}</option>)}
              </select>
            </label>
            {activeClip ? (
              <>
                <p>{activeClip.fps} fps · {activeClip.durationFrames} 帧 · {activeClip.loop}</p>
                <p>轨道：{activeClip.tracks.map((track) => track.partId).join(", ") || "无"}</p>
                <div className="playback-controls">
                  <button onClick={handleTogglePlay}>{isPlaying ? "⏸ 暂停" : "▶ 播放"}</button>
                </div>
                <div className="slider-row">
                  <span>{currentFrame}/{activeClip.durationFrames}</span>
                  <input
                    type="range"
                    min={0}
                    max={activeClip.durationFrames}
                    value={currentFrame}
                    onChange={handleFrameChange}
                    className="frame-slider"
                  />
                </div>
              </>
            ) : <p>动作库没有可播放 clip</p>}
          </div>
        )}

        <h2>诊断</h2>
        {importResult ? (
          <div className="diagnostics">
            <p>部件: {importResult.parts.length} | pivot: {importResult.pivotLocal.size}</p>
            <ul>{diagnostics.map((item, index) => (
              <li key={`${item.message}-${index}`} className={`diag-${item.severity}`}>
                [{item.severity}] {item.message}
              </li>
            ))}</ul>
          </div>
        ) : <p className="placeholder">尚未载入角色</p>}

        <h2>日志</h2>
        <pre className="log">{log.join("\n") || "等待操作…"}</pre>
      </aside>
    </div>
  );
}
