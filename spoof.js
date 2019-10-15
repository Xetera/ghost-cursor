import Noise from "simplex-noise"
import p from "p5"

const noise = new Noise()

const height = 650
const width = 300
const r = 8

const s = (p5) => {
  p5.setup = () => {
    p5.resizeCanvas(width, height)
  }

  p5.draw = () => {
    p5.background(51)
    p5.stroke(255)
    p5.noFill()
    p5.beginShape()
    let lastX = width / 2;
    let lastY = height / 2;
    let lastTheta = Math.PI * 2 * 2
    p5.vertex(lastX, lastY)
    for (let i = 0; i < 500; i++) {
      let theta =
        (noise.noise2D(lastX, lastY) / 2) + lastTheta

      if (lastX >= width /* || lastX <= 0 || lastY <= 0 || lastY >= height */) {
        theta = theta + Math.PI / 2 // Math.PI
      }
      if (lastX <= 0) {
        theta = theta - Math.PI / 2
      }
      if (lastY <= 0) {
        theta = -theta //Math.PI / 2
      }
      if (lastY >= height) {
        theta = -theta //Math.PI * 1.5
      }
      const x = r * Math.cos(theta)
      const y = r * Math.sin(theta)
      console.log(x, y)
      p5.vertex(lastX + x, lastY + y)
      lastX += x
      lastY += y
      lastTheta = theta
    }
    p5.endShape()
    // e.forEach(([x, y]) => {
    //   p5.point(x, y)
    // })
  }
}
new p(s)