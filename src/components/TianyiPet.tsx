import { useState, useEffect } from "react";

// 天依的核心动画状态
type PetState = "idle" | "blink" | "listen" | "speak" | "sleep" | "drag";

const TianyiPet = () => {
  const [state, setState] = useState<PetState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });

  // idle 动画循环 — 随机眨眼
  useEffect(() => {
    const blinkInterval = setInterval(() => {
      if (state === "idle" || state === "listen") {
        setState("blink");
        setTimeout(() => setState("idle"), 200);
      }
    }, 3000 + Math.random() * 2000);
    return () => clearInterval(blinkInterval);
  }, [state]);

  // 拖拽事件
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - offset.x,
        y: e.clientY - offset.y,
      });
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, offset]);

  // idle 呼吸动画参数
  const breatheY = state === "sleep" ? 0 : Math.sin(Date.now() / 800) * 2;

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: position.x,
        top: position.y,
        cursor: isDragging ? "grabbing" : "grab",
        width: 200,
        height: 340,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <svg width="200" height="340" viewBox="0 0 200 340">
        <g transform={`translate(0, ${breatheY})`}>
          {/* 长发 — 背后的部分 */}
          <ellipse cx="68" cy="120" rx="30" ry="90" fill="#7a849e" opacity="0.6" />
          <ellipse cx="132" cy="120" rx="30" ry="90" fill="#7a849e" opacity="0.6" />

          {/* 身体 — 青色连衣裙 */}
          <ellipse cx="100" cy="235" rx="38" ry="55" fill="#00d4ff" opacity="0.85" />
          {/* 领口装饰 */}
          <path d="M75 195 Q100 210 125 195" stroke="#f5c542" strokeWidth="2" fill="none" />

          {/* 头 */}
          <circle cx="100" cy="110" r="45" fill="#f0e6d3" />

          {/* 刘海 */}
          <path d="M58 95 Q70 75 100 70 Q130 75 142 95" fill="#8892b0" opacity="0.9" />
          <path d="M65 85 Q78 68 100 65 Q122 68 135 85" fill="#7a849e" opacity="0.7" />

          {/* 头发侧边 */}
          <ellipse cx="62" cy="115" rx="18" ry="50" fill="#8892b0" opacity="0.85" />
          <ellipse cx="138" cy="115" rx="18" ry="50" fill="#8892b0" opacity="0.85" />

          {/* 蝴蝶结 */}
          <polygon points="100,62 80,42 100,55 120,42" fill="#f5c542" />
          <circle cx="100" cy="58" r="5" fill="#e8a820" />

          {/* 眼睛 */}
          <g>
            {state === "blink" || state === "sleep" ? (
              <>
                <path d="M77 105 Q85 102 93 105" stroke="#555" strokeWidth="2" fill="none" />
                <path d="M107 105 Q115 102 123 105" stroke="#555" strokeWidth="2" fill="none" />
              </>
            ) : state === "speak" ? (
              <>
                <path d="M75 105 Q85 95 95 105" stroke="#555" strokeWidth="2" fill="none" />
                <path d="M105 105 Q115 95 125 105" stroke="#555" strokeWidth="2" fill="none" />
              </>
            ) : (
              <>
                <ellipse cx="85" cy="105" rx="8" ry="9" fill="white" />
                <circle cx="85" cy="105" r="5" fill="#00d4ff" />
                <circle cx="83" cy="103" r="2" fill="white" />
                <ellipse cx="115" cy="105" rx="8" ry="9" fill="white" />
                <circle cx="115" cy="105" r="5" fill="#00d4ff" />
                <circle cx="113" cy="103" r="2" fill="white" />
              </>
            )}
          </g>

          {/* 嘴巴 */}
          {state === "speak" ? (
            <ellipse cx="100" cy="120" rx="6" ry="5" fill="#c97" />
          ) : state === "sleep" ? (
            <text x="100" y="125" textAnchor="middle" fontSize="14" fill="#c97">zZZ</text>
          ) : (
            <path d="M93 120 Q100 127 107 120" stroke="#c97" strokeWidth="2" fill="none" />
          )}

          {/* 脸红 */}
          <ellipse cx="72" cy="115" rx="8" ry="4" fill="#ffaabb" opacity="0.4" />
          <ellipse cx="128" cy="115" rx="8" ry="4" fill="#ffaabb" opacity="0.4" />

          {/* 手臂 — 随呼吸微微摆动 */}
          <ellipse cx="58" cy="240" rx="10" ry="28" fill="#f0e6d3" transform={`rotate(${Math.sin(Date.now() / 1000) * 3}, 58, 240)`} />
          <ellipse cx="142" cy="240" rx="10" ry="28" fill="#f0e6d3" transform={`rotate(${Math.sin(Date.now() / 1000 + 0.5) * -3}, 142, 240)`} />

          {/* 裙子下摆 */}
          <path d="M62 280 Q80 300 100 295 Q120 300 138 280" fill="#00d4ff" opacity="0.7" />
        </g>
      </svg>
    </div>
  );
};

export default TianyiPet;
