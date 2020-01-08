import type { Page } from "puppeteer";
import {
  Vector,
  bezierCurve,
  overshoot,
  origin,
  direction,
  magnitude
} from "./math";

/**
 * Calculate the amount of time needed to move from (x1, y1) to (x2, y2)
 * given the width of the element being clicked on
 * https://en.wikipedia.org/wiki/Fitts%27s_law
 */
const fitts = (distance: number, width: number) => {
  const a = 0;
  const b = 2;
  const id = Math.log2(distance / width + 1);
  return a + b * id;
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const getRandomBoxPoint = ({ x, y, width, height }: Box): Vector => ({
  x: x + Math.random() * width,
  y: y + Math.random() * height
});

const isBox = (a: any): a is Box => "width" in a;

export function path(point: Vector, target: Vector, spreadOverride?: number);
export function path(point: Vector, target: Box, spreadOverride?: number);
export function path(
  start: Vector,
  end: Box | Vector,
  spreadOverride?: number
): Vector[] {
  const defaultWidth = 100;
  const minSteps = 25;
  const width = isBox(end) ? end.width : defaultWidth;
  const curve = bezierCurve(start, end, spreadOverride);
  const length = curve.length() * 0.8;
  const baseTime = Math.random() * minSteps;
  const steps = Math.ceil((Math.log2(fitts(length, width) + 1) + baseTime) * 3);
  const re = curve.getLUT(steps);
  return clampPositive(re);
}
const steps = [
  {
    selector: ".emailAddress input",
    value: "sirbezier@test.com"
  },
  {
    selector: ".password input",
    value: "1234QWEasd"
  },
  {
    selector: ".firstName input",
    value: "asd"
  },
  {
    selector: ".lastName input",
    value: "asd"
  },
  {
    selector: ".dateOfBirth input",
    value: "1989-12-03"
  },
  {
    selector: ".gender ul li input"
  },
  {
    selector: ".joinSubmit input"
  }
];

const clampPositive = (vectors: Vector[]): Vector[] => {
  const clamp0 = (elem: number) => Math.max(0, elem);
  return vectors.map(vector => {
    return {
      x: clamp0(vector.x),
      y: clamp0(vector.y)
    };
  });
};

const overshootThreshold = 500;
const shouldOvershoot = (a: Vector, b: Vector) =>
  magnitude(direction(a, b)) > overshootThreshold;

const createCursor = (page: Page, start: Vector = origin) => {
  const overshootRadius = 120;
  // this is kind of arbitrary, not a big fan
  let previous: Vector = start;
  return {
    click: () => page.mouse.down().then(() => page.mouse.up()),
    move: async (selector: string) => {
      const elem = await page.$(selector);
      if (!elem) {
        throw new Error(
          `Could not find element with selector "${selector}", make sure you're waiting for the elements with "puppeteer.waitForSelector"`
        );
      }
      const box = await elem.boundingBox();
      if (!box) {
        throw new Error(
          "Could not find dimensions of the element you're clicking on, this might be a bug?"
        );
      }
      const { height, width } = box;
      const destination = getRandomBoxPoint(box);
      const dimensions = { height, width };
      const overshooting = shouldOvershoot(previous, destination);
      const to = overshooting
        ? overshoot(destination, overshootRadius)
        : destination;
      for (const { x, y } of path(previous, to)) {
        await page.mouse.move(x, y);
      }
      if (overshooting) {
        for (const { x, y } of path(
          to,
          { ...dimensions, ...destination },
          10
        )) {
          await page.mouse.move(x, y);
        }
      }
      previous = destination;
    }
  };
};

// (async () => {
//   console.log("Launching browser.");
//   const options = {
//     height: 600,
//     width: 1200
//   };
//   const browser = await puppeteer.launch({
//     headless: false,
//     args: ["--start-maximized"]
//   });

//   const page = await browser.newPage();
//   await page.setViewport({ width: 1920, height: 1080 });
//   await installMouseHelper(page);
//   const url = "https://nike.com";
//   const loginButton = "#AccountNavigationContainer";
//   await page.goto(url);
//   // await page.evaluate(mountForm, accCreateForm);
//   console.log("waiting for login");
//   await page.waitForSelector(loginButton);
//   await page.waitFor(500);
//   const pointer = createCursor(page, { x: 0, y: 700 });
//   console.log("found button");
//   await pointer.move(loginButton);
//   await pointer.click();
//   await page.waitForSelector(".loginJoinLink a");
//   await page.waitFor(500);
//   await pointer.move(".loginJoinLink a");
//   await pointer.click();
//   for (const step of steps) {
//     await pointer.move(step.selector);
//     await pointer.click();
//     if (step.value) {
//       page.evaluate(
//         // @ts-ignore
//         step => (document.querySelector(step.selector).value = step.value),
//         step
//       );
//     }
//   }
// })();

// const height = 850;
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
//     p5.stroke(255);
//     p5.noFill();
//     p5.beginShape();
//     const start = { x: 10, y: 10 };
//     const end = { x: 1200, y: 700 };
//     const stop = overshoot(end, 100);
//     console.log("stop", stop);
//     const [bez, anchors] = bezierCurve(start, stop);
//     console.log(bez.length());
//     const steps = fitts(start, end, 100);
//     console.log(steps);
//     console.log(Math.log2(steps));
//     const points = bez.getLUT();
//     for (const point of points) {
//       p5.vertex(point.x, point.y);
//     }
//     p5.endShape();
//     p5.beginShape();
//     const [bez2, anchors2] = bezierCurve(stop, end);
//     console.log(bez.length());
//     const steps2 = fitts(start, end, 100);
//     console.log(steps);
//     console.log(Math.log2(steps));
//     const points2 = bez2.getLUT();
//     for (const point of points2) {
//       p5.vertex(point.x, point.y);
//     }
//     for (const anchor of anchors) {
//       p5.circle(anchor.x, anchor.y, 10);
//     }
//     // for (const point of points2) {
//     //   p5.vertex(point.x, point.y);
//     // }
//     p5.endShape();
//   };
// };

// const p5 = new p(s);
//
