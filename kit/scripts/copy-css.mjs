import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

for (const fileName of ["styles.css", "charts.css", "interaction.css"]) {
  const source = resolve("src", fileName);
  const target = resolve("dist", fileName);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
