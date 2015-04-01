(function () {
  var bounds = new google.maps.LatLngBounds(new google.maps.LatLng(40.3700251,-96.6402091), new google.maps.LatLng(43.512821,-90.1147163));
  var mouseIsDown = false;
  var searched = false;

  var selectedMetric = 3;
  var selectedDistrict = 0;

  var clickTimeout;

  var $map = $("#map-canvas").on("mousedown", function () {
    mouseIsDown = true;
  });

  $(document).on("mouseup", function () {
    mouseIsDown = false;
  });

  // set up Google Map

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
    clickTimeout = setTimeout(function () {
      selectDistrict(e.latLng);
    }, 200);
  });

  // set up search box with Google Places Autocomplete

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

  // set up Google StreetView

  var $streetview = $("#streetview-canvas");
  var streetviewService = new google.maps.StreetViewService();
  var streetview = new google.maps.StreetViewPanorama($streetview.get(0), { imageDateControl: true });
  map.setStreetView(streetview);

  google.maps.event.addListener(streetview, "position_changed", function() {
    if (!mouseIsDown) {
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = undefined;
      }

      var loc = streetview.getPosition();
      map.setCenter(streetview.getPosition());

      if (!searched) {
        lookupRouteMilepoint(loc);
      }

      searched = false;
    }
  });

  // add CartoDB layers to Google Map

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

  // set up controls

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

      app.pieChart.show(id, selectedDistrict);
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

  //methods

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
            var location = app.linearReference.measureToPoint(fc.features[0], params.m);
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

  function lookupRouteMilepoint(loc) {
    var searchRadius = 10;
    var deg = app.webMercator.toDegrees(searchRadius);
    var bbox = [ loc.lng() - deg, loc.lat() - deg, loc.lng() + deg, loc.lat() + deg ];
    bbox = 'ST_MakeEnvelope(' + bbox.join() + ', 4326)';

    var p = 'ST_SetSRID(ST_MakePoint(' + loc.lng() + ', ' + loc.lat() + '), 4326)';
    var where = 'where the_geom && ' + bbox + ' and ST_Distance_Sphere(the_geom, ' + p + ') <= ' + searchRadius;

    db.execute('select system, route, direction, from_milepoint, to_milepoint, the_geom from ia_pci_2013 ' + where)
      .done(function (fc) {
        var display;

        if (fc.features.length) {
          var f = fc.features[0];
          var system = f.properties.system;
          var route = f.properties.route;
          var dir = f.properties.direction;
          var m = app.linearReference.pointToMeasure(f, [ loc.lng(), loc.lat() ]);

          display = (system === 1 ? 'I' : system === 2 ? 'US' : 'IA') + '-' + route + dir + ' ' + m.toFixed(2);
        }

        $locationSearch.val(display);
      })
      .error(function (err) {
        alert(err);
      });
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

          app.pieChart.show(selectedMetric, district);
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

  // initialize

  goToRouteMilepoint('I-235W 8.51');
  app.pieChart.show(selectedMetric, selectedDistrict);
})();
