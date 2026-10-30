// ระบบสร้างเสียงแจ้งเตือนด้วย Web Audio API (ทำงานได้ 100% แม้ไม่มีอินเทอร์เน็ตและไม่ต้องโหลดไฟล์เสียงภายนอก)

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * เสียงติ๊ดสั้นๆ เมื่อสแกนบาร์โค้ดพบสินค้าสำเร็จ
 */
export function playScanSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1350, ctx.currentTime);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  } catch (e) {
    console.warn('Audio play failed:', e);
  }
}

/**
 * เสียงสัญญาณเตือนภัย (Error Buzzer 3 จังหวะ) เมื่อสแกนบาร์โค้ดไม่พบสินค้า
 */
export function playBarcodeNotFoundAlarm() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const beeps = [
      { start: 0, duration: 0.14, freq: 300 },
      { start: 0.18, duration: 0.14, freq: 240 },
      { start: 0.36, duration: 0.25, freq: 190 },
    ];

    beeps.forEach(({ start, duration, freq }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.35, now + start);
      gain.gain.exponentialRampToValueAtTime(0.01, now + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + duration);
    });
  } catch (e) {
    console.warn('Audio alarm failed:', e);
  }
}

