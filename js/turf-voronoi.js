var map;
var zones;
var markersArray = [];

function initialize() {
  var mapOptions = {
    center: new google.maps.LatLng(59.345356, 17.909285),
    zoom: 15
  };
  map = new google.maps.Map(document.getElementById("map-canvas"),
    mapOptions);

  google.maps.event.addListener(map, "bounds_changed", loadZones);
}

function loadZones() {
  var bbox = map.getBounds();

  var data = [{
    "northEast" : {"latitude":bbox.getNorthEast().lat(), "longitude":bbox.getNorthEast().lng()},
    "southWest" : {"latitude":bbox.getSouthWest().lat(), "longitude":bbox.getSouthWest().lng()}
  }];

  clearOverlays();
  $.ajax({
    type: "POST",
//    dataType: "JSONP",
    crossDomain: true,
    url: "http://api.turfgame.com/v4/zones",
    contentType: "application/json",
    data: JSON.stringify(data)
  })
  .done(function(res) {
    handleZoneResult(res);
  })
  .fail(function(res) {
    alert("failed: " + JSON.stringify(res));
  });
}

// [{"region":{"id":141,"name":"Stockholm","country":"se"},
//   "id":139,
//   "currentOwner":{"id":9241,"name":"speedmaster100"},
//   "dateLastTaken":"2014-03-15T21:07:12+0000",
//   "totalTakeovers":6590,
//   "takeoverPoints":65,
//   "name":"BearZone",
//   "pointsPerHour":9,
//   "dateCreated":"2010-09-04T16:41:37+0000",
//   "longitude":18.073934,
//   "latitude":59.31514
// }]
function handleZoneResult(res) {
  var sites = [];
  for (var i = 0; i < res.length; i++) {
    // place marker at each site
    placeMarker(res[i]);    

    // Build sites array
    var site = {x: res[i].longitude, y: res[i].latitude};
    sites.push(site);
  }

  var diagram = calculateVoronoi(sites);
  drawVoronoi(diagram);
}

function placeMarker(zone)
{
  var pos = new google.maps.LatLng(zone.latitude, zone.longitude);
  var marker = new google.maps.Marker({
    position: pos,
    map: map,
    title: zone.name
  });
  markersArray.push(marker);
}

function calculateVoronoi(sites)
{
  var mb = map.getBounds();
  var bbox = {
    xl: mb.getSouthWest().lng(),
    xr: mb.getNorthEast().lng(),
    yt: mb.getSouthWest().lat(),
    yb: mb.getNorthEast().lat()
  };

  //console.log("bbox: " + JSON.stringify(bbox));
  //console.log("sites: " + JSON.stringify(sites));

  var voronoi = new Voronoi();
  return voronoi.compute(sites, bbox);
}

function drawVoronoi(diagram)
{
  for(var i = 0; i < diagram.cells.length; i++) {
    var polyCoords = [];
    var cell = diagram.cells[i];
    //console.log("cell: " + JSON.stringify(cell));
    if (cell.halfedges.length > 0) {
      for (var c = 0; c < cell.halfedges.length; c++) {
        var edge = cell.halfedges[c];
        var coord = new google.maps.LatLng(edge.getStartpoint().y, edge.getStartpoint().x);
        polyCoords.push(coord);
      }
      // Close the loop
      var edge = cell.halfedges[0];
      var coord = new google.maps.LatLng(edge.getStartpoint().y, edge.getStartpoint().x);
      polyCoords.push(coord);

      console.log("poly: " + JSON.stringify(polyCoords));      

      var polygon = new google.maps.Polygon({
        paths: polyCoords,
        strokeColor: '#FF0000',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#FF0000',
        fillOpacity: 0.15
      });

      polygon.setMap(map);
      markersArray.push(polygon);
    }
  }
}

// function draw() {
//   var triangleCoords = [
//   new google.maps.LatLng(59.346356, 17.909285),
//   new google.maps.LatLng(59.344356, 17.907285),
//   new google.maps.LatLng(59.344356, 17.911285),
//   new google.maps.LatLng(59.346356, 17.909285)
//   ];

//   bermudaTriangle = new google.maps.Polygon({
//     paths: triangleCoords,
//     strokeColor: '#FF0000',
//     strokeOpacity: 0.8,
//     strokeWeight: 2,
//     fillColor: '#FF0000',
//     fillOpacity: 0.35
//   });

//   bermudaTriangle.setMap(map);

// }

function clearOverlays() {
  for (var i = 0; i < markersArray.length; i++ ) {
    markersArray[i].setMap(null);
  }
  markersArray = [];
}

function getDistance(lat1, lng1, lat2, lng2)
{
  // formula from http://www.movable-type.co.uk/scripts/latlong.html
  var R = 6371; // km
  var d = Math.acos(Math.sin(lat1)*Math.sin(lat2) + 
    Math.cos(lat1)*Math.cos(lat2) *
    Math.cos(lng2-lng1)) * R;
}

google.maps.event.addDomListener(window, 'load', initialize);


