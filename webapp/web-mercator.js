(function () {
  var halfPi = 1.5707963267948966192;
  var quarterPi = 0.7853981633974483096;
  var radiansPerDegree = 0.0174532925199432958;
  var degreesPerRadian = 57.295779513082320877;
  var radius = 6378137;

  var webMercator = {
    toGeodetic: function (p) {
      var lng = (p[0] / radius) * degreesPerRadian;
      var lat = (halfPi - 2 * Math.atan(1 / Math.exp(p[1] / radius))) * degreesPerRadian;
      return [ lng, lat ];
    },

    toProjected: function (p) {
      var x = radius * p[0] * radiansPerDegree;
      var y = radius * Math.log(Math.tan(quarterPi + p[1] * radiansPerDegree * 0.5));
      return [ x, y ];
    },

    toDegrees: function (m) {
      return m * degreesPerRadian / radius;
    }
  };

  window.app = window.app || {};
  window.app.webMercator = webMercator;
})();
