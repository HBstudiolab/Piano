// Scrolling grand-staff view drawn on the game canvas.
// Notes are placed proportionally in time; the playhead stays fixed and the score scrolls left.
window.ScoreView = (function () {
  const LETTER = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const BLACK = [0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0];
  const dia = (m) => (Math.floor(m / 12) - 1) * 7 + LETTER[m % 12]; // diatonic step index
  const TREBLE_BOTTOM = 30; // E4
  const BASS_BOTTOM = 18;   // G2

  class ScoreView {
    // notes: [{time, dur, midi, play}]  (seconds, already rate-scaled)
    constructor(notes, bars, beatSec) {
      this.notes = notes.slice().sort((a, b) => a.time - b.time);
      this.bars = bars || [];
      this.beatSec = beatSec || 0.5;
      this.idx = 0;
    }

    draw(g, X, Y, W, H, t, alpha) {
      const sp = Math.max(6, Math.min(12, H / 17));        // staff line spacing
      const midY = Y + H / 2 + sp * 0.3;
      const trebleBottom = midY - sp * 1.5;
      const trebleTop = trebleBottom - 4 * sp;
      const bassTop = midY + sp * 1.5;
      const bassBottom = bassTop + 4 * sp;
      const x0 = X + 14, x1 = X + W - 14;
      const clefW = sp * 5;
      const px = x0 + clefW + (x1 - x0 - clefW) * 0.18;     // playhead
      const spx = (x1 - px) / (8 * this.beatSec);           // ~8 beats ahead
      const tMin = t - (px - x0 - clefW) / spx - 0.2, tMax = t + (x1 - px) / spx + 0.2;
      const ink = '#1d1d22';

      g.save();
      g.globalAlpha = alpha;
      g.fillStyle = '#f7f5ee';
      g.beginPath(); g.roundRect ? g.roundRect(X, Y, W, H, 10) : g.rect(X, Y, W, H); g.fill();

      // staff lines + brace bar
      g.strokeStyle = ink; g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        g.moveTo(x0, trebleBottom - i * sp); g.lineTo(x1, trebleBottom - i * sp);
        g.moveTo(x0, bassBottom - i * sp); g.lineTo(x1, bassBottom - i * sp);
      }
      g.moveTo(x0, trebleTop); g.lineTo(x0, bassBottom);
      g.stroke();

      // clefs
      g.fillStyle = ink;
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.font = `${sp * 8}px "Segoe UI Symbol", "Noto Music", "Bravura", serif`;
      g.fillText('\u{1D11E}', x0 + sp * 0.3, trebleBottom + sp * 1.15);
      g.font = `${sp * 4.6}px "Segoe UI Symbol", "Noto Music", "Bravura", serif`;
      g.fillText('\u{1D122}', x0 + sp * 0.5, bassTop + sp * 3.6);
      g.font = `bold ${Math.round(sp * 1.3)}px serif`;
      g.fillText(`♩ = ${Math.round(60 / this.beatSec)}`, x0 + clefW, Y + sp * 2);

      // clip to scrolling area
      g.save();
      g.beginPath(); g.rect(x0 + clefW, Y, x1 - x0 - clefW, H); g.clip();

      // bar lines
      g.strokeStyle = ink; g.lineWidth = 1.2;
      g.beginPath();
      for (const b of this.bars) {
        if (b < tMin || b > tMax) continue;
        const x = px + (b - t) * spx - sp;
        g.moveTo(x, trebleTop); g.lineTo(x, bassBottom);
      }
      g.stroke();

      // notes
      while (this.idx > 0 && this.notes[this.idx - 1].time > tMin - 8) this.idx--;
      while (this.idx < this.notes.length && this.notes[this.idx].time < tMin - 8) this.idx++;
      const rx = sp * 0.62, ry = sp * 0.44;
      for (let i = this.idx; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.time > tMax) break;
        if (n.time + 0.01 < tMin) continue;
        const d = dia(n.midi);
        const treble = n.midi >= 60;
        const y = treble ? trebleBottom - (d - TREBLE_BOTTOM) * sp / 2 : bassBottom - (d - BASS_BOTTOM) * sp / 2;
        const x = px + (n.time - t) * spx;
        const active = n.time <= t + 0.03 && t < n.time + n.dur;
        const col = active ? '#ff8a00' : n.play ? ink : '#8d8d96';
        g.strokeStyle = ink; g.fillStyle = col; g.lineWidth = 1;

        // ledger lines
        g.beginPath();
        if (treble) {
          for (let l = TREBLE_BOTTOM - 2; l >= d; l -= 2) { g.moveTo(x - rx * 1.6, trebleBottom - (l - TREBLE_BOTTOM) * sp / 2); g.lineTo(x + rx * 1.6, trebleBottom - (l - TREBLE_BOTTOM) * sp / 2); }
          for (let l = TREBLE_BOTTOM + 10; l <= d; l += 2) { g.moveTo(x - rx * 1.6, trebleBottom - (l - TREBLE_BOTTOM) * sp / 2); g.lineTo(x + rx * 1.6, trebleBottom - (l - TREBLE_BOTTOM) * sp / 2); }
        } else {
          for (let l = BASS_BOTTOM + 10; l <= d; l += 2) { g.moveTo(x - rx * 1.6, bassBottom - (l - BASS_BOTTOM) * sp / 2); g.lineTo(x + rx * 1.6, bassBottom - (l - BASS_BOTTOM) * sp / 2); }
          for (let l = BASS_BOTTOM - 2; l >= d; l -= 2) { g.moveTo(x - rx * 1.6, bassBottom - (l - BASS_BOTTOM) * sp / 2); g.lineTo(x + rx * 1.6, bassBottom - (l - BASS_BOTTOM) * sp / 2); }
        }
        g.stroke();

        // accidental
        if (BLACK[n.midi % 12]) {
          g.font = `${Math.round(sp * 1.7)}px "Segoe UI Symbol", serif`;
          g.textAlign = 'center';
          g.fillText('♯', x - rx * 2.2, y + sp * 0.55);
        }

        // head
        const beats = n.dur / this.beatSec;
        const hollow = beats >= 1.8;
        g.beginPath();
        g.ellipse(x, y, rx, ry, -0.35, 0, Math.PI * 2);
        if (hollow) { g.strokeStyle = col; g.lineWidth = 1.8; g.stroke(); }
        else g.fill();

        // stem (none for whole notes), flag for short notes
        if (beats < 3.5) {
          const up = d < (treble ? 34 : 22);
          g.strokeStyle = col; g.lineWidth = 1.3;
          g.beginPath();
          const sx = up ? x + rx - 0.6 : x - rx + 0.6;
          const ey = up ? y - sp * 3.3 : y + sp * 3.3;
          g.moveTo(sx, y); g.lineTo(sx, ey);
          if (beats < 0.75) {
            const fl = up ? 1 : -1;
            g.moveTo(sx, ey); g.quadraticCurveTo(sx + sp * 1.1, ey + fl * sp * 1.2, sx + sp * 0.8, ey + fl * sp * 2.2);
            if (beats < 0.375) { g.moveTo(sx, ey + fl * sp * 0.8); g.quadraticCurveTo(sx + sp * 1.1, ey + fl * sp * 2, sx + sp * 0.8, ey + fl * sp * 3); }
          }
          g.stroke();
        }
      }
      g.restore();

      // playhead
      g.fillStyle = 'rgba(255,138,0,0.35)';
      g.fillRect(px - 2, trebleTop - sp * 2, 4, bassBottom - trebleTop + sp * 4);
      g.restore();
    }
  }

  return ScoreView;
})();
