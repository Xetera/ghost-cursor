"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var simplex_noise_1 = __importDefault(require("simplex-noise"));
// import { plot, Plot } from "nodeplotlib";
var noise = new simplex_noise_1.default();
var distance = function (point, elem) {
    return Math.sqrt(Math.pow(elem.x - point.x, 2) + Math.pow(elem.y - point.y, 2));
};
/**
 * Calculate the amount of time needed to move from (x1, y1) to (x2, y2)
 * given the width of the element being clicked on
 * https://en.wikipedia.org/wiki/Fitts%27s_law
 */
var fitts = function (elem, width) { return function (point) {
    var a = 0;
    var b = 0.05;
    var id = Math.log2(distance(elem, point) / width + 1);
    var mt = a + b * id;
    return mt;
}; };
var getRandomBoxPoint = function (_a) {
    var x = _a.x, y = _a.y, width = _a.width, height = _a.height;
    return ({
        x: x + Math.random() * width,
        y: y + Math.random() * height
    });
};
var defaultPathOptions = {
    boxDimensions: undefined
};
function path(point, target, options) {
    var defaultFittsWidth, getTime, randomPoints, targetX, targetY, lastX, lastY, i, getTheta, within, incr, newTheta, time, variation, r, theta, deltaX, deltaY, x, y, withinSmallRadius;
    if (options === void 0) { options = defaultPathOptions; }
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                defaultFittsWidth = 50;
                getTime = fitts({ x: target.x, y: target.y }, target.width || defaultFittsWidth);
                randomPoints = getRandomBoxPoint({
                    x: target.x,
                    y: target.y,
                    width: (_b = (_a = options.boxDimensions) === null || _a === void 0 ? void 0 : _a.width, (_b !== null && _b !== void 0 ? _b : -1)),
                    height: (_d = (_c = options.boxDimensions) === null || _c === void 0 ? void 0 : _c.height, (_d !== null && _d !== void 0 ? _d : -1))
                });
                targetX = options.boxDimensions ? randomPoints.x : target.x;
                targetY = options.boxDimensions ? randomPoints.y : target.y;
                lastX = point.x;
                lastY = point.y;
                i = 1;
                getTheta = function () { return Math.atan2(targetY - lastY, targetX - lastX); };
                within = function (x, y, s) {
                    return Math.pow(x - targetX, 2) + Math.pow(y - targetY, 2) < Math.pow(s, 2);
                };
                return [4 /*yield*/, { x: lastX, y: lastY }];
            case 1:
                _e.sent();
                incr = (Math.random() + 0.5) * 15;
                _e.label = 2;
            case 2:
                if (!true) return [3 /*break*/, 6];
                newTheta = getTheta();
                time = getTime({ x: lastX, y: lastY });
                variation = noise.noise2D(lastX, lastY) * time;
                r = within(lastX, lastY, 8) ? Math.min(2, Math.log(i) * i) : incr;
                theta = variation + newTheta;
                deltaX = r * Math.cos(theta);
                deltaY = r * Math.sin(theta);
                x = deltaX + lastX;
                y = deltaY + lastY;
                withinSmallRadius = within(x, y, incr);
                if (!withinSmallRadius) return [3 /*break*/, 4];
                return [4 /*yield*/, { x: targetX, y: targetY }];
            case 3:
                _e.sent();
                return [2 /*return*/];
            case 4:
                if (i > 500) {
                    return [2 /*return*/];
                }
                return [4 /*yield*/, { x: x, y: y }];
            case 5:
                _e.sent();
                lastX = x;
                lastY = y;
                i++;
                return [3 /*break*/, 2];
            case 6: return [2 /*return*/];
        }
    });
}
exports.moveTo = function (page, element, mouse) {
    if (mouse === void 0) { mouse = { x: 0, y: 0 }; }
    return __awaiter(void 0, void 0, void 0, function () {
        var rect, bX, bY, a, r, tX, tY, boxWidth, boxHeight, _a, _b, _c, x_1, y_1, e_1_1, _d, _e, _f, x, y, e_2_1;
        var e_1, _g, e_2, _h;
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0: return [4 /*yield*/, page.evaluate(function (elem) {
                        var _a = elem.getBoundingClientRect(), top = _a.top, left = _a.left, bottom = _a.bottom, right = _a.right;
                        return { top: top, left: left, bottom: bottom, right: right };
                    }, element)];
                case 1:
                    rect = _j.sent();
                    bX = rect.left;
                    bY = rect.top;
                    a = Math.random() * 2 * Math.PI;
                    r = 200 * Math.sqrt(Math.random());
                    tX = r * Math.cos(a) + bX;
                    tY = r * Math.cos(a) + bY;
                    boxWidth = rect.right - rect.left;
                    boxHeight = rect.bottom - rect.top;
                    _j.label = 2;
                case 2:
                    _j.trys.push([2, 7, 8, 9]);
                    _a = __values(path(mouse, { x: tX, y: tY })), _b = _a.next();
                    _j.label = 3;
                case 3:
                    if (!!_b.done) return [3 /*break*/, 6];
                    _c = _b.value, x_1 = _c.x, y_1 = _c.y;
                    return [4 /*yield*/, page.mouse.move(x_1, y_1)];
                case 4:
                    _j.sent();
                    _j.label = 5;
                case 5:
                    _b = _a.next();
                    return [3 /*break*/, 3];
                case 6: return [3 /*break*/, 9];
                case 7:
                    e_1_1 = _j.sent();
                    e_1 = { error: e_1_1 };
                    return [3 /*break*/, 9];
                case 8:
                    try {
                        if (_b && !_b.done && (_g = _a.return)) _g.call(_a);
                    }
                    finally { if (e_1) throw e_1.error; }
                    return [7 /*endfinally*/];
                case 9:
                    _j.trys.push([9, 14, 15, 16]);
                    _d = __values(path({ x: tX, y: tY }, { x: bX, y: bY }, {
                        boxDimensions: {
                            width: boxWidth,
                            height: boxHeight
                        }
                    })), _e = _d.next();
                    _j.label = 10;
                case 10:
                    if (!!_e.done) return [3 /*break*/, 13];
                    _f = _e.value, x = _f.x, y = _f.y;
                    return [4 /*yield*/, page.mouse.move(x, y)];
                case 11:
                    _j.sent();
                    _j.label = 12;
                case 12:
                    _e = _d.next();
                    return [3 /*break*/, 10];
                case 13: return [3 /*break*/, 16];
                case 14:
                    e_2_1 = _j.sent();
                    e_2 = { error: e_2_1 };
                    return [3 /*break*/, 16];
                case 15:
                    try {
                        if (_e && !_e.done && (_h = _d.return)) _h.call(_d);
                    }
                    finally { if (e_2) throw e_2.error; }
                    return [7 /*endfinally*/];
                case 16: return [2 /*return*/, { x: x, y: y }];
            }
        });
    });
};
// (async () => {
//   console.log("Launching browser.");
//   const options = {
//     height: 600,
//     width: 1200
//   };
//   const browser = await puppeteer.launch({
//     headless: false,
//     args: [`--window-size=${options.width},${options.height}`]
//   });
//   console.log("Opening page.");
//   const page = await browser.newPage();
//   page.setViewport({ width: 1200, height: 600 });
//   await installMouseHelper(page);
//   await page.goto("https://scrapethissite.com/pages/simple/");
//   const header = await page.$("a.data-attribution");
//   const last = await moveTo(page, header);
//   console.log(last);
//   const home = await page.$("#nav-homepage a");
//   await moveTo(page, home, last);
// })();
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
