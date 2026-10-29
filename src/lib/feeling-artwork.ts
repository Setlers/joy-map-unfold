// A generic globe, not a screenshot of the map. The export accepts no location
// or user message and uses no remote assets, so its canvas cannot be tainted.
export async function createFeelingArtwork(copy: {
  emoji: string;
  statement: string;
  prompt: string;
  hostname: string;
  color: string;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export unavailable");
  ctx.fillStyle = "#080d19";
  ctx.fillRect(0, 0, 1080, 1350);
  const glow = ctx.createRadialGradient(540, 420, 10, 540, 420, 650);
  glow.addColorStop(0, copy.color + "55");
  glow.addColorStop(1, "#080d1900");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#ffffff55";
  for (let i = 0; i < 70; i++) {
    ctx.beginPath();
    ctx.arc((i * 173 + 41) % 1080, (i * 281 + 19) % 1350, (i % 3) + 1, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.strokeStyle = copy.color + "66";
  ctx.lineWidth = 2;
  for (const width of [260, 180, 85]) {
    ctx.beginPath();
    ctx.ellipse(540, 420, width, 260, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
  for (const height of [85, 180]) {
    ctx.beginPath();
    ctx.ellipse(540, 420, 260, height, 0, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#d8e1ec";
  ctx.font = "500 30px sans-serif";
  ctx.fillText("F E E L  T H E  W O R L D", 540, 95);
  ctx.font = '160px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText(copy.emoji, 540, 475);

  const wrap = (text: string, y: number, font: string, lineHeight: number) => {
    ctx.font = font;
    let line = "";
    for (const word of text.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > 880) {
        ctx.fillText(line, 540, y);
        y += lineHeight;
        line = word;
      } else line = next;
    }
    ctx.fillText(line, 540, y);
    return y + lineHeight;
  };
  ctx.fillStyle = "#ffffff";
  const bottom = wrap(copy.statement, 810, "600 65px sans-serif", 83);
  ctx.fillStyle = "#b9c5d6";
  wrap(copy.prompt, Math.max(1050, bottom + 70), "400 40px sans-serif", 55);
  ctx.fillStyle = copy.color;
  ctx.font = "500 32px sans-serif";
  ctx.fillText(copy.hostname, 540, 1260);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Image export unavailable"))),
      "image/png",
    ),
  );
}

export const SHARE_COLORS = {
  joy: "#edce53",
  calm: "#41a9dc",
  sadness: "#7461c9",
  anger: "#ed6156",
  anxiety: "#e99d4c",
  hope: "#51c98c",
};
