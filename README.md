# Ghost Cursor

<img src="https://media2.giphy.com/media/26ufp2LYURTvL5PRS/giphy.gif" width="100" align="right">

Generate realistic, human-like mouse movement data between coordinates or navigate between elements with puppeteer
like the definitely-not-robot you are.

> Oh yeah? Could a robot do _**this?**_

## Installation

```sh
yarn add ghost-cursor
```

or with npm

```sh
npm install ghost-cursor
```

## Usage

Generating movement data between 2 coordinates.

```js
import { path } from "ghost-cursor";

const from = { x: 100, y: 100 };
const to = { x: 600, y: 700 };

const route = path(from, to);

/**
 * [
 *   { x: 100, y: 100, timestamp: 1640158937890 },
 *   { x: 126.70079722115054, y: 106.31184259284494, timestamp: 1640158939620 },
 *   { x: 151.74738386288035, y: 112.34993715686089, timestamp: 1640158939565 },
 *   { x: 175.33112687647585, y: 118.45478710608484, timestamp: 1640158939763 },
 *   { x: 197.6433932132232, y: 124.96689585455373, timestamp: 1640158939408 },
 *   ... and so on
 * ]
 */
```

Usage with puppeteer:

```js
import { createCursor } from "ghost-cursor";
import puppeteer from "puppeteer";

const run = async (url) => {
  const selector = "#sign-up button";
  const browser = await puppeteer.launch({ headless: false });
  const page = browser.newPage();
  const cursor = createCursor(page);
  await page.goto(url);
  await page.waitForSelector(selector);
  await cursor.click(selector);
  // shorthand for
  // await cursor.move(selector)
  // await cursor.click()
};
```

### Puppeteer-specific behavior

- `cursor.move()` will automatically overshoot or slightly miss and re-adjust for elements that are too far away
  from the cursor's starting point.
- When moving over objects, a random coordinate that's within the element will be selected instead of
  hovering over the exact center of the element.
- The speed of the mouse will take the distance and the size of the element you're clicking on into account.

<br>

![ghost-cursor in action](https://cdn.discordapp.com/attachments/418699380833648644/664110683054538772/acc_gen.gif)

> Ghost cursor in action on a form

## How does it work

Bezier curves do almost all the work here. They let us create an infinite amount of curves between any 2 points we want
and they look quite human-like. (At least moreso than alternatives like perlin or simplex noise)

![](https://mamamoo.xetera.dev/😽🤵👲🧦👵.png)

The magic comes from being able to set multiple points for the curve to go through. This is done by picking
2 coordinates randomly in a limited area above and under the curve.

<img src="https://mamamoo.xetera.dev/🧣👎😠🧟✍.png" width="400">

However, we don't want wonky looking cubic curves when using this method because nobody really moves their mouse
that way, so only one side of the line is picked when generating random points.

<img src="http://simonwallner.at/ext/fitts/shannon.png" width="250" align="right">
When calculating how fast the mouse should be moving we use <a href="https://en.wikipedia.org/wiki/Fitts%27s_law">Fitts's Law</a>
to determine the amount of points we should be returning relative to the width of the element being clicked on and the distance
between the mouse and the object.
