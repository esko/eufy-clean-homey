import sharp from "sharp";
import { mkdir } from "node:fs/promises";
const product = "widgets/clean/public/omni-c20.png";
for (const [size, name] of [
  [75, "small"],
  [500, "large"],
]) {
  await mkdir("drivers/omni/assets/images", { recursive: true });
  await sharp(product)
    .resize(size, size, { fit: "contain", background: "#ffffff" })
    .flatten({ background: "#ffffff" })
    .png()
    .toFile(`drivers/omni/assets/images/${name}.png`);
}
for (const [width, height, name] of [
  [250, 175, "small"],
  [500, 350, "large"],
  [1000, 700, "xlarge"],
]) {
  await mkdir("assets/images", { recursive: true });
  const cutout = await sharp(product)
    .resize(Math.round(width * 0.65), height - 20, { fit: "inside" })
    .toBuffer();
  await sharp({ create: { width, height, channels: 4, background: "#e0efea" } })
    .composite([{ input: cutout, gravity: "centre" }])
    .png()
    .toFile(`assets/images/${name}.png`);
}
for (const theme of ["dark", "light"]) {
  const bg = theme === "dark" ? "#152326" : "#ffffff",
    fg = theme === "dark" ? "#77d5b9" : "#16776d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="72" y="60" width="880" height="904" rx="70" fill="${bg}"/><rect x="135" y="130" width="270" height="30" rx="15" fill="${fg}"/><rect x="630" y="130" width="230" height="220" rx="35" fill="#5d6b6b"/><circle cx="630" cy="335" r="100" fill="#344747"/><circle cx="630" cy="335" r="24" fill="${fg}"/><rect x="135" y="440" width="460" height="90" rx="25" fill="${fg}"/><rect x="625" y="440" width="240" height="90" rx="25" fill="#778e86"/><path d="M145 620H540V580H860V860H520V900H145Z" fill="#c3ded1"/><path d="M380 620V900M540 720H860" stroke="${fg}" stroke-width="9"/><circle cx="700" cy="800" r="22" fill="${fg}"/></svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(`widgets/clean/preview-${theme}.png`);
}
