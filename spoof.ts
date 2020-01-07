import Noise from "simplex-noise";
import puppeteer, { ElementHandle, Page } from "puppeteer";
import { readFileSync } from "fs";
import p from "p5";
import installMouseHelper from "./mouse-helper";
// import { plot, Plot } from "nodeplotlib";

const noise = new Noise();

interface Point {
  x: number;
  y: number;
}
const distance = (point: Point, elem: Point) =>
  Math.sqrt(Math.pow(elem.x - point.x, 2) + Math.pow(elem.y - point.y, 2));

/**
 * Calculate the amount of time needed to move from (x1, y1) to (x2, y2)
 * given the width of the element being clicked on
 * https://en.wikipedia.org/wiki/Fitts%27s_law
 */
const fitts = (elem: Point, width: number) => (point: Point) => {
  const a = 0;
  const b = 0.05;
  const id = Math.log2(distance(elem, point) / width + 1);
  const mt = a + b * id;
  return mt;
};

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getRandomBoxPoint = ({ x, y, width, height }: Box): Point => ({
  x: x + Math.random() * width,
  y: y + Math.random() * height
});

interface PathOptions {
  boxDimensions?: {
    width: number;
    height: number;
  };
}

const defaultPathOptions = {
  boxDimensions: undefined
};

function path(
  point: Point,
  target: { x: number; y: number },
  options?: PathOptions
);
function path(point: Point, target: Box, options: PathOptions);
function* path(
  point: Point,
  target: Box,
  options: PathOptions = defaultPathOptions
) {
  const defaultFittsWidth = 50;
  const getTime = fitts(
    { x: target.x, y: target.y },
    target.width || defaultFittsWidth
  );
  const randomPoints = getRandomBoxPoint({
    x: target.x,
    y: target.y,
    width: options.boxDimensions?.width ?? -1,
    height: options.boxDimensions?.height ?? -1
  });
  const targetX = options.boxDimensions ? randomPoints.x : target.x;
  const targetY = options.boxDimensions ? randomPoints.y : target.y;
  let lastX = point.x;
  let lastY = point.y;
  let i = 1;
  let getTheta = () => Math.atan2(targetY - lastY, targetX - lastX);
  const within = (x: number, y: number, s: number) =>
    Math.pow(x - targetX, 2) + Math.pow(y - targetY, 2) < Math.pow(s, 2);
  yield { x: lastX, y: lastY };
  const incr = (Math.random() + 0.5) * 15;
  while (true) {
    let newTheta = getTheta();
    const time = getTime({ x: lastX, y: lastY });
    const variation = noise.noise2D(lastX, lastY) * time;
    const r = within(lastX, lastY, 2) ? Math.min(2, Math.log(i) * i) : incr;
    let theta = variation + newTheta;
    let deltaX = r * Math.cos(theta);
    let deltaY = r * Math.sin(theta);
    let x = deltaX + lastX;
    let y = deltaY + lastY;
    const withinSmallRadius = within(x, y, incr);
    if (withinSmallRadius) {
      yield { x: targetX, y: targetY };
      return;
    }
    if (i > 500) {
      return;
    }
    yield { x, y };
    lastX = x;
    lastY = y;
    i++;
  }
}

export const moveTo = async (
  page: Page,
  element: ElementHandle,
  mouse: Point = { x: 0, y: 0 }
): Promise<Point> => {
  const rect = await page.evaluate(elem => {
    const { top, left, bottom, right } = elem.getBoundingClientRect();
    return { top, left, bottom, right };
  }, element);
  const bX = rect.left;
  const bY = rect.top;
  const a = Math.random() * 2 * Math.PI;
  const r = 200 * Math.sqrt(Math.random());
  const tX = r * Math.cos(a) + bX;
  const tY = r * Math.cos(a) + bY;
  const boxWidth = rect.right - rect.left;
  const boxHeight = rect.bottom - rect.top;
  for (const { x, y } of path(mouse, { x: tX, y: tY })) {
    await page.mouse.move(x, y);
  }
  // intentionally using var to return its last hoisted value
  for (var { x, y } of path(
    { x: tX, y: tY },
    { x: bX, y: bY },
    {
      boxDimensions: {
        width: boxWidth,
        height: boxHeight
      }
    }
  )) {
    await page.mouse.move(x, y);
  }
  return { x, y };
};

(async () => {
  console.log("Launching browser.");
  const options = {
    height: 600,
    width: 1200
  };
  const browser = await puppeteer.launch({
    headless: false,
    args: [`--window-size=${options.width},${options.height}`]
  });
  console.log("Opening page.");

  const page = await browser.newPage();
  page.setViewport({ width: 1200, height: 600 });
  await installMouseHelper(page);
  const url = "https://nike.com";
  const loginButton = "#AccountNavigationContainer";
  await page.goto(url);
  // await page.evaluate(mountForm, accCreateForm);
  console.log("waiting for login");
  await page.waitForSelector(loginButton);
  await page.waitFor(500);
  const elem = await page.$(loginButton);
  console.log("found button");
  const last = await moveTo(page, elem, { x: 500, y: 600 });
})();

// const height = 750;
// const width = 1500;
// const s = p5 => {
//   p5.setup = () => {
//     p5.resizeCanvas(width, height);
//   };

//   const boxWidth = 50;
//   p5.draw = () => {
//     p5.noLoop();
//     p5.background(51);
//     const s = p5.color("turquoise");
//     p5.noStroke();
//     p5.fill(s);
//     const [bX, bY] = [200, 400];
//     const [sX, sY] = [1250, 650];
//     p5.circle(bX, bY, boxWidth);
//     const bb = p5.color("red");
//     p5.fill(bb);
//     p5.circle(sX, sY, 10);
//     // p5.rect(150, 450, 100, 100, 10, 10);
//     // p5.textColor(p5.color("black"));
//     // p5.text("Buy Shoes", bX, bY, 100, 100);
//     p5.stroke(255);
//     p5.noFill();
//     p5.beginShape();
//     p5.endShape();
//   };
// };
