(function () {
  function normalizeGeometry(f) {
    if (f.geometry.type === 'LineString') {
      f.geometry = { type: 'MultiLineString', coordinates: [ g.coordinates ] };
    }

    return f;
  }

  function projectWithMeasures(f, fmp, tmp) {
    var inParts = f.geometry.coordinates;
    var outParts = [];
    var d = 0;
    var p, i, j, pp, inPart, outPart, dx, dy;

    for (i = 0; i < inParts.length; ++i) {
      inPart = inParts[i];
      pp = undefined;
      outParts[i] = outPart = [];

      for (j = 0; j < inPart.length; ++j) {
        p = outPart[j] = app.webMercator.toProjected(inPart[j]);

        if (pp) {
          dx = p[0] - pp[0];
          dy = p[1] - pp[1];
          d += Math.sqrt(dx * dx + dy * dy);
        }

        p.push(d);
        pp = p;
      }
    }

    var ratio = (tmp - fmp) / d;

    for (i = 0; i < outParts.length; ++i) {
      outPart = outParts[i];

      for (j = 0; j < outPart.length; ++j) {
        outPart[j][2] = fmp + outPart[j][2] * ratio;
      }
    }

    f.geometry = { type: 'MultiLineString', coordinates: outParts };
    return f;
  }

  var linearReference = {
    pointToMeasure: function (f, p) {
      f = normalizeGeometry(f);
      f = projectWithMeasures(f, f.properties.from_milepoint, f.properties.to_milepoint);

      p = app.webMercator.toProjected(p);

      var minDist = Number.POSITIVE_INFINITY;
      var d, along, m;

      for (var i = 0; i < f.geometry.coordinates.length; ++i) {
        var part = f.geometry.coordinates[i];
        var a = part[0];
        var apx = p[0] - a[0];
        var apy = p[1] - a[1];

        for (var j = 1; j < part.length; ++j) {
          var b = part[j];
          var bpx = p[0] - b[0];
          var bpy = p[1] - b[1];
          var abx = b[0] - a[0];
          var aby = b[1] - a[1];

          var dab = Math.sqrt(abx * abx + aby * aby);
          var dot = abx * apx + aby * apy;

          if (dot < 0) {
            d = apx * apx + apy * apy;
            along = 0;
          }
          else {
            dot = abx * bpx + aby * bpy;

            if (dot > 0)
            {
              d = bpx * bpx + bpy * bpy;
              along = dab;
            }
            else
            {
              d = (abx * apy - aby * apx) / dab;
              d *= d;

              along = apx * apx + apy * apy - d;

              if (along > 0)
              {
                along = Math.sqrt(along);
              }
            }
          }

          if (d < minDist)
          {
            minDist = d;
            var ratio = along / dab;
            m = a[2] + ratio * (b[2] - a[2]);
          }
        }
      }

      return m;
    },

    measureToPoint: function (f, m) {
      f = normalizeGeometry(f);
      f = projectWithMeasures(f, f.properties.from_milepoint, f.properties.to_milepoint);
      var loc;

      for (var i = 0; i < f.geometry.coordinates.length && !loc; ++i) {
        var part = f.geometry.coordinates[i];

        for (var j = 1; j < part.length && !loc; ++j) {
          var p0 = part[j - 1];
          var p1 = part[j];

          if (p0[2] <= m && m <= p1[2]) {
            dx = p1[0] - p0[0];
            dy = p1[1] - p0[1];
            ratio = (m - p0[2]) / (p1[2] - p0[2]);

            loc = {
              point: app.webMercator.toGeodetic([ p0[0] + dx * ratio, p0[1] + dy * ratio ]),
              heading: Math.atan2(dx, dy) * 180 / Math.PI
            };
          }
        }
      }

      return loc;
    }
  };

  window.app = window.app || {};
  window.app.linearReference = linearReference;
})();
