import { useCallback, useRef, useState } from 'react';

export const BROADCAST_KEY = 'iga_order_broadcast_enabled';

// 播放新订单提示音（循环），返回停止函数；需用户点击启用（浏览器自动播放策略）
export function useOrderAlertSound() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  const playBeep = useCallback(() => {
    try {
      const AudioContextConstructor = window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const ctx = ctxRef.current || new AudioContextConstructor();
      if (ctx.state === 'suspended') ctx.resume();
      ctxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio is best-effort; unsupported or blocked contexts should not break order polling.
    }
  }, []);

  const play = useCallback(() => {
    playBeep();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(playBeep, 1000);
  }, [playBeep]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const [enabled, setEnabled] = useState(() => typeof window !== 'undefined' && localStorage.getItem(BROADCAST_KEY) === '1');
  const enable = useCallback(() => {
    playBeep();
    stop();
    localStorage.setItem(BROADCAST_KEY, '1');
    setEnabled(true);
  }, [playBeep, stop]);

  return { play, stop, enable, isEnabled: enabled };
}
