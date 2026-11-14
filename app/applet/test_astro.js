const Astronomy = require('astronomy-engine');
const time = new Date();
const sunEq = Astronomy.Equator(Astronomy.Body.Sun, time, new Astronomy.Observer(0, 0, 0), true, true);
console.log("Sun:", sunEq.ra, sunEq.dec);
const gst = Astronomy.SiderealTime(time);
console.log("GST:", gst); // GST in hours
