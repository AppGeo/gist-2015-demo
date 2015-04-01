(function () {
  var bounds = new google.maps.LatLngBounds(new google.maps.LatLng(40.3700251,-96.6402091), new google.maps.LatLng(43.512821,-90.1147163));
  var mouseIsDown = false;
  var searched = false;

  var selectedMetric = 3;
  var selectedDistrict = 0;

  var $map = $("#map-canvas").on("mousedown", function () {
    mouseIsDown = true;
  });

  $(document).on("mouseup", function () {
    mouseIsDown = false;
  });

  var $attribution = $map.find(".attribution").remove();

  var map = new google.maps.Map($map.get(0), {
    zoom: 14,
    center: new google.maps.LatLng(41.5956302, -93.6161277),
    styles: [
      {
        stylers: [ { saturation: -100 }, { lightness: 40 } ]
      }
    ],
    mapTypeControlOptions: {
      mapTypeIds: [ google.maps.MapTypeId.ROADMAP, google.maps.MapTypeId.TERRAIN, google.maps.MapTypeId.SATELLITE, google.maps.MapTypeId.HYBRID ]
    },
    mapTypeId: google.maps.MapTypeId.ROADMAP
  });

  map.controls[google.maps.ControlPosition.TOP_CENTER].push($attribution.get(0));

  google.maps.event.addListener(map, 'click', function(e) {
    selectDistrict(e.latLng);
  });

  var $locationSearch = $("#locationSearch");
  var autocomplete = new google.maps.places.Autocomplete($locationSearch.get(0), { bounds: bounds });

  $locationSearch.on("blur", function () {
    var t = $locationSearch.val();

    setTimeout(function () {
      $locationSearch.val(t);
    }, 10);
  });

  google.maps.event.addListener(autocomplete, "place_changed", function() {
    var place = autocomplete.getPlace();

    if (!place.geometry) {
      return;
    }

    setMapLocation(place.geometry.location);
    setStreetView(place.geometry.location, 0);
  });

  var placesService = new google.maps.places.PlacesService(map);
  var infoWindow = new google.maps.InfoWindow({});

  var $streetview = $("#streetview-canvas");
  var streetviewService = new google.maps.StreetViewService();
  var streetview = new google.maps.StreetViewPanorama($streetview.get(0), { imageDateControl: true });
  map.setStreetView(streetview);

  google.maps.event.addListener(streetview, "position_changed", function() {
    if (!mouseIsDown) {
      var loc = streetview.getPosition();
      map.setCenter(streetview.getPosition());

      if (!searched) {
        lookupRouteMilepoint(loc);
      }

      searched = false;
    }
  });

  var db = new cartodb.SQL({ user: 'clientdemos', format: 'geojson' });
  var cartoLayer;

  cartodb
    .createLayer(map, 'http://appgeo.cartodb.com/api/v2/viz/0e6fe1c4-d3db-11e4-b072-0e018d66dc29/viz.json')
    .addTo(map, 0)
    .done(function (layer) {
      layer.getSubLayer(1).hide();
      layer.getSubLayer(2).hide();
      cartoLayer = layer;
    });

  var $searchForm = $("#searchForm").on("submit", function (e) {
    e.preventDefault();
    goToRouteMilepoint($locationSearch.val());
  });

  $('.legend').on('click', function (e) {
    var $target = $(e.target);

    if (!$target.hasClass('legend')) {
      $target = $target.parent('.legend');
    }

    if (!$target.hasClass('legend-active')) {
      var $active = $('.legend-active').removeClass('legend-active');
      var id = parseInt($active.attr('data-id'), 10);
      cartoLayer.getSubLayer(id).hide();

      $target.addClass('legend-active');
      id = parseInt($target.attr('data-id'), 10);
      cartoLayer.getSubLayer(id).show();

      app.summary(id, selectedDistrict);
      selectedMetric = id;
    }
  });

  var $leftExpand = $('#left-expand').on('click', function () {
    var $container = $("#container-content");
    $container.animate({ left: $leftExpand.hasClass('expanded') ? '-250px' : '0px'}, {
      step: function () {
        google.maps.event.trigger(map, 'resize');
        google.maps.event.trigger(streetview, 'resize');
      },
      complete: function () {
        $leftExpand.toggleClass('expanded');
        $leftExpand.find('span').toggleClass('glyphicon-chevron-left').toggleClass('glyphicon-chevron-right');
      }
    });
  });

  var $bottomExpand = $('#bottom-expand').on('click', function () {
    var $container = $("#container-map");
    var isExpanded = $bottomExpand.hasClass('expanded');

    if (isExpanded) {
      $streetview.hide();
    }

    $container.animate({ height: isExpanded ? '100%' : '66%' }, {
      step: function () {
        google.maps.event.trigger(map, 'resize');
      },
      complete: function () {
        $bottomExpand.toggleClass('expanded');
        $bottomExpand.find('span').toggleClass('glyphicon-chevron-down').toggleClass('glyphicon-chevron-up');

        if (!isExpanded) {
          $streetview.show();
          google.maps.event.trigger(streetview, 'resize');
        }
      }
    });
  });

  function extractRouteMilepoint(s) {
    var params;
    var match = /^(.+)\s+(\d+(\.\d+)?)$/.exec(s.toUpperCase());

    if (match) {
      var route = match[1];
      var m = parseFloat(match[2]);

      match = /^(I|US|IA)(\s*|-)?(\d+)(N|E|S|W)?$/.exec(route);

      if (match) {
        var system = match[1];

        params = {
          system: system === 'I' ? 1 : system === 'US' ? 2 : 3,
          route: parseInt(match[3], 10),
          m: m,
          display: match[1] + '-' + match[3] + match[4] + ' ' + m.toFixed(2)
        };

        if (match[4]) {
          params.dir = match[4];
        }
      }
    }

    return params;
  }

  function findMeasure(parts, p) {
    var minDist = Number.POSITIVE_INFINITY;
    var d, along, m;

    for (var i = 0; i < parts.length; ++i) {
      var part = parts[i];
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
  }

  function goToRouteMilepoint(s) {
    var params = extractRouteMilepoint(s);

    if (params) {
      var where = 'where system = {{system}} and route = {{route}} and from_milepoint <= {{m}} and to_milepoint >= {{m}}';

      if (params.dir) {
        where += ' and direction = \'{{dir}}\'';
      }

      db.execute('select the_geom, from_milepoint, to_milepoint, direction from ia_pci_2013 ' + where, params)
        .done(function (fc) {
          if (fc.features.length) {
            var location = locateFeatureMilepoint(fc.features[0], params.m);
            var latLng = new google.maps.LatLng(location.point[1], location.point[0]);
            var dir = fc.features[0].properties.direction;
            var heading = dir === 'W' || dir === 'S' ? (180 + location.heading) % 360 : location.heading;

            searched = true;
            setMapLocation(latLng);
            setStreetView(latLng, heading);
            $locationSearch.val(params.display);
          }
        })
        .error(function (err) {
          alert(err);
        });
    }
  }

  function locateFeatureMilepoint(f, m) {
    var g = f.geometry;
    var parts = g.type === 'MultiLineString' ? g.coordinates : [ g.coordinates ];
    parts = projectWithMeasures(parts, f.properties.from_milepoint, f.properties.to_milepoint);
    var loc;

    for (var i = 0; i < parts.length && !loc; ++i) {
      var part = parts[i];

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

  function lookupRouteMilepoint(loc) {
    var p = 'ST_SetSRID(ST_MakePoint(' + loc.lng() + ', ' + loc.lat() + '), 4326)';
    var where = 'where ST_Distance_Sphere(the_geom, ' + p + ') <= 10';

    db.execute('select system, route, direction, from_milepoint, to_milepoint, the_geom from ia_pci_2013 ' + where)
      .done(function (fc) {
        var display;

        if (fc.features.length) {
          var f = fc.features[0];
          var g = f.geometry;
          var parts = g.type === 'MultiLineString' ? g.coordinates : [ g.coordinates ];

          var system = f.properties.system;
          var route = f.properties.route;
          var dir = f.properties.direction;

          parts = projectWithMeasures(parts, f.properties.from_milepoint, f.properties.to_milepoint);
          p = app.webMercator.toProjected([ loc.lng(), loc.lat() ]);

          var m = findMeasure(parts, p);
          display = (system === 1 ? 'I' : system === 2 ? 'US' : 'IA') + '-' + route + dir + ' ' + m.toFixed(2);
        }

        $locationSearch.val(display);
      })
      .error(function (err) {
        alert(err);
      });
  }

  function projectWithMeasures(inParts, fmp, tmp) {
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

    return outParts;
  }

  function selectDistrict(latLng) {
    var p = 'ST_SetSRID(ST_MakePoint(' + latLng.lng() + ', ' + latLng.lat() + '), 4326)';
    var where = 'where ST_Contains(the_geom, ' + p + ')';

    db.execute('select number, ' + p + ' as the_geom from ia_districts ' + where)
      .done(function (fc) {
        var district = fc.features.length ? fc.features[0].properties.number : 0;

        if (district && district === selectedDistrict) {
          district = 0;
        }

        if (district !== selectedDistrict) {
          var subLayer = cartoLayer.getSubLayer(0);

          if (district) {
            subLayer.setCartoCSS('#ia_districts [ number != ' + district + '] { polygon-fill: gray; polygon-opacity: 0.2 }');
          }
          else {
            subLayer.setCartoCSS('#null { }');
          }

          app.summary(selectedMetric, district);
          selectedDistrict = district;
        }
      })
      .error(function (err) {
        alert(err);
      });
  }

  function setMapLocation(loc) {
    if (map.getZoom() < 14) {
      map.setZoom(14);
    }

    map.setCenter(loc);
  }

  function setStreetView(loc, heading) {
    streetviewService.getPanoramaByLocation(loc, 50, function (result, status) {
      if (status == google.maps.StreetViewStatus.OK) {
        streetview.setOptions({
          pano: result.location.pano,
          pov: { heading: heading, pitch: 0 }
        });
        streetview.setZoom(0);
      }
    });
  }

  goToRouteMilepoint('I-235W 8.51');

  app.summary(selectedMetric, selectedDistrict);
})();
