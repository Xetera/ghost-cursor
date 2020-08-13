import { Page } from "puppeteer";
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

export const createCursor = (page: Page, start: Vector = origin) => {
  // this is kind of arbitrary, not a big fan but it seems to work
  const overshootSpread = 10;
  const overshootRadius = 120;
  let previous: Vector = start;
  const tracePath = async (vectors: Iterable<Vector>) => {
    for (const { x, y } of vectors) {
      await page.mouse.move(x, y);
    }
  };
  const actions = {
    async click(selector?: string) {
      if (selector) {
        await actions.move(selector);
      }
      return page.mouse.down().then(() => page.mouse.up());
    },
    async move(selector: string) {
      const elem = await page.$(selector);
      if (!elem) {
        throw new Error(
          `Could not find element with selector "${selector}", make sure you're waiting for the elements with "puppeteer.waitForSelector"`
        );
      }
      const box = await elem.boundingBox();
      if (!box) {
        throw new Error(
          "Could not find the dimensions of the element you're clicking on, this might be a bug?"
        );
      }
      const { height, width } = box;
      const destination = getRandomBoxPoint(box);
      const dimensions = { height, width };
      const overshooting = shouldOvershoot(previous, destination);
      const to = overshooting
        ? overshoot(destination, overshootRadius)
        : destination;
      await tracePath(path(previous, to));

      if (overshooting) {
        const correction = path(
          to,
          { ...dimensions, ...destination },
          overshootSpread
        );

        await tracePath(correction);
      }
      previous = destination;
    }
  };
  return actions;
};
