import { useEffect, useRef } from 'react';
import { audioEngine } from '../utils/audioEngine';

interface AudioVisualizerProps {
  isPlaying: boolean;
  height?: number;
}

export function AudioVisualizer({ isPlaying, height = 24 }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, width, h);

      const freqData = audioEngine.getAnalyserData();
      const barCount = 14;
      const barWidth = 2;
      const gap = (width - barCount * barWidth) / (barCount - 1);

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        let barHeight = 2;
        if (isPlaying && freqData.length > 0) {
          const raw = freqData[i % freqData.length];
          barHeight = Math.max(3, (raw / 255) * h);
        } else {
          barHeight = 2 + Math.sin(Date.now() * 0.004 + i * 0.5) * 1;
        }

        const y = h - barHeight;

        // Vercel monochrome precision styling
        ctx.fillStyle = isPlaying ? '#ffffff' : '#3f3f46';
        ctx.fillRect(x, y, barWidth, barHeight);
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={height}
      className="shrink-0 pointer-events-none"
    />
  );
}
