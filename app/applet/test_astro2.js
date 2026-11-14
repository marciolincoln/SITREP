const { inv, multiply, transpose, identity } = require('mathjs');
const Astronomy = require('astronomy-engine');

const inputs = {
  lat0: -23.5,
  lon0: -46.6,
  t1: "2026-06-30T10:00",
  az_sol: 45.0,
  t2: "2026-06-30T18:00",
  ra_s1: 6.75, // Sirius
  dec_s1: -16.7,
  az_s1: 120.0,
  t3: "2026-06-30T18:15",
  ra_s2: 14.25, // Arcturus
  dec_s2: 19.1,
  az_s2: 240.0,
};

try {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  let phi = parseFloat(inputs.lat0);
  let lam = parseFloat(inputs.lon0);

  const d1 = new Date(inputs.t1);
  const d2 = new Date(inputs.t2);
  const d3 = new Date(inputs.t3);

  const az_sol_obs = parseFloat(inputs.az_sol);
  const az_s1_obs = parseFloat(inputs.az_s1);
  const az_s2_obs = parseFloat(inputs.az_s2);

  const ra_s1 = parseFloat(inputs.ra_s1);
  const dec_s1 = parseFloat(inputs.dec_s1);
  const ra_s2 = parseFloat(inputs.ra_s2);
  const dec_s2 = parseFloat(inputs.dec_s2);

  const maxIter = 10;
  let iter = 0;
  let converged = false;
  let r_mat = [];
  let P_mat = [];
  let r_norm = 0;

  while (iter < maxIter && !converged) {
    // 1) Ephemeris
    const obs = new Astronomy.Observer(phi, lam, 0);
    const sunEq = Astronomy.Equator(Astronomy.Body.Sun, d1, obs, true, true);
    const ra_sol = sunEq.ra;
    const dec_sol = sunEq.dec;

    // 2) GST
    const gst1 = Astronomy.SiderealTime(d1);
    const gst2 = Astronomy.SiderealTime(d2);
    const gst3 = Astronomy.SiderealTime(d3);

    // 3) LST
    const lst1 = (gst1 + lam / 15) % 24;
    const lst2 = (gst2 + lam / 15) % 24;
    const lst3 = (gst3 + lam / 15) % 24;

    // 4) Hour angles
    const getHA = (lst, ra) => {
      let ha = (lst - ra) * 15;
      ha = ha % 360;
      if (ha > 180) ha -= 360;
      if (ha < -180) ha += 360;
      return ha;
    };

    const ha_sol = getHA(lst1, ra_sol);
    const ha_s1 = getHA(lst2, ra_s1);
    const ha_s2 = getHA(lst3, ra_s2);

    // 5) Calc Az, Alt
    const getAltAz = (lat, dec, ha) => {
      const sin_h = Math.sin(lat * rad) * Math.sin(dec * rad) + Math.cos(lat * rad) * Math.cos(dec * rad) * Math.cos(ha * rad);
      const alt = Math.asin(sin_h) * deg;

      const sin_Z = -Math.cos(dec * rad) * Math.sin(ha * rad) / Math.cos(alt * rad);
      const cos_Z = (Math.sin(dec * rad) - Math.sin(alt * rad) * Math.sin(lat * rad)) / (Math.cos(alt * rad) * Math.cos(lat * rad));
      let az = Math.atan2(sin_Z, cos_Z) * deg;
      if (az < 0) az += 360;
      return { alt, az };
    };

    const calc_sol = getAltAz(phi, dec_sol, ha_sol);
    const calc_s1 = getAltAz(phi, dec_s1, ha_s1);
    const calc_s2 = getAltAz(phi, dec_s2, ha_s2);

    // 6) Residuals
    const wrap = (angle) => {
      let a = angle % 360;
      if (a > 180) a -= 360;
      if (a < -180) a += 360;
      return a;
    };

    const r1 = wrap(az_sol_obs - calc_sol.az);
    const r2 = -0.833 - calc_sol.alt;
    const r3 = wrap(az_s1_obs - calc_s1.az);
    const r4 = wrap(az_s2_obs - calc_s2.az);

    r_mat = [[r1], [r2], [r3], [r4]];

    // 7) Jacobian J
    const getJ_az = (az, alt, lat) => [
      -Math.sin(az * rad) * Math.tan(alt * rad),
      Math.sin(lat * rad) - Math.cos(lat * rad) * Math.cos(az * rad) * Math.tan(alt * rad)
    ];
    const getJ_h = (az, lat) => [
      Math.cos(az * rad),
      Math.cos(lat * rad) * Math.sin(az * rad)
    ];

    const J = [
      getJ_az(calc_sol.az, calc_sol.alt, phi),
      getJ_h(calc_sol.az, phi),
      getJ_az(calc_s1.az, calc_s1.alt, phi),
      getJ_az(calc_s2.az, calc_s2.alt, phi)
    ];

    // 8) Solve
    const W = [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]];
    const JT = transpose(J);
    const JTW = multiply(JT, W);
    const JTWJ = multiply(JTW, J);
    
    let JTWJ_inv;
    try {
      JTWJ_inv = inv(JTWJ);
    } catch (e) {
      console.log("Singular matrix, cannot invert.");
      break;
    }

    P_mat = JTWJ_inv;
    const JTWr = multiply(JTW, r_mat);
    const dx = multiply(JTWJ_inv, JTWr);

    // 9) Update
    const dPhi = dx[0][0];
    const dLam = dx[1][0];

    phi += dPhi;
    lam += dLam;

    iter++;
    if (Math.abs(dPhi) < 1e-6 && Math.abs(dLam) < 1e-6) {
      converged = true;
    }
  }

  // Post-processing
  const rT = transpose(r_mat);
  const rTr = multiply(rT, r_mat);
  const v = 4 - 2; // df = n - u
  const sig0_2 = rTr[0][0] / v;
  const errLat = Math.sqrt(sig0_2 * P_mat[0][0]);
  const errLon = Math.sqrt(sig0_2 * P_mat[1][1]);
  
  const cov = multiply(P_mat, sig0_2);
  const a_val = cov[0][0];
  const b_val = cov[0][1];
  const c_val = cov[1][0];
  const d_val = cov[1][1];
  
  const trace = a_val + d_val;
  const det = a_val * d_val - b_val * c_val;
  const lambda1 = trace/2 + Math.sqrt(trace*trace/4 - det);
  const lambda2 = trace/2 - Math.sqrt(trace*trace/4 - det);
  
  const semiMajor = Math.sqrt(Math.abs(lambda1));
  const semiMinor = Math.sqrt(Math.abs(lambda2));
  
  console.log("SUCCESS");
} catch(e) {
  console.log("ERROR:");
  console.log(e);
}
