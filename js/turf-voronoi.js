// ---- Constants ----
// buffer time between map change and reload
var LOAD_DELAY=500;   // in milliseconds
// margin around viewport where zones are loaded and calculated
var LOAD_MARGIN=0.5;   // in kilometers
// marker icon representing a zone
var ZONE_ICON = {
  url: "img/red_dot.png",
  size: new google.maps.Size(10, 10),
  origin: new google.maps.Point(0,0),
  anchor: new google.maps.Point(5, 5)
};

// ---- Variables ----
var map;
var zones = {};
var markersArray = [];
var loadTimer = null;
var selectedUser;
var matchedUser;

// ---- Prototypes ----
if (typeof(Number.prototype.toRad) === "undefined") {
  Number.prototype.toRad = function() {
    return this * Math.PI / 180;
  }
}

if (typeof(String.prototype.hashCode) === "undefined") {
  // from http://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
  String.prototype.hashCode = function(){
      var hash = 0x55555555, i, char;
      if (this.length == 0) return hash;
      for (i = 0, l = this.length; i < l; i++) {
          char  = this.charCodeAt(i);
          hash  = ((hash<<5)-hash)+char;
          hash |= 0; // Convert to 32bit integer
      }
      return hash;
  }
}

// ---- Code ----
function initialize() {
  // Reduce saturation of the map
  var styles = [
  {
    stylers: [
      { saturation: -80 }
    ]
  }];

  var lat = 59.32893;
  var lng = 18.06491;
  var location = $.url().param('location');
  selectedUser = $.url().param('user');
  if (selectedUser != null) {
    selectedUser = selectedUser.toLowerCase();
  }

  var mapOptions = {
    center: new google.maps.LatLng(lat, lng),
    zoom: 14,
    styles: styles
  };
  map = new google.maps.Map(document.getElementById("map-canvas"),
    mapOptions);

  google.maps.event.addListener(map, "bounds_changed", function() {
    if (loadTimer != null) {
      clearTimeout(loadTimer);
    }
    loadTimer = setTimeout(loadZones, LOAD_DELAY);
  });

  if (location != null) {
    gotoLocation(location);
  }
}

function calculateMargins(bbox) {
  var horizontalDistance = calculateDistance(
    bbox.getNorthEast().lat(),
    bbox.getNorthEast().lng(),
    bbox.getNorthEast().lat(),
    bbox.getSouthWest().lng()
    );
  var verticalDistance = calculateDistance(
    bbox.getNorthEast().lat(),
    bbox.getNorthEast().lng(),
    bbox.getSouthWest().lat(),
    bbox.getNorthEast().lng()
    );

  console.log("hDist: " + horizontalDistance);
  console.log("vDist: " + verticalDistance);

  // Doesn't handle cross datezone
  kilometerDLat = (bbox.getNorthEast().lng() - bbox.getSouthWest().lng()) / horizontalDistance;
  loadMarginLat = kilometerDLat * LOAD_MARGIN;
  kilometerDLng = (bbox.getNorthEast().lng() - bbox.getSouthWest().lng()) / verticalDistance;
  loadMarginLng = kilometerDLng * LOAD_MARGIN;

  var m = {loadMarginLat: loadMarginLat, loadMarginLng: loadMarginLng};
  return m;
}

function loadZones() {
  initTime();
  var bbox = map.getBounds();

  var m = calculateMargins(bbox);

  var data = [{
    "northEast" : {"latitude":bbox.getNorthEast().lat() + m.loadMarginLat, "longitude":bbox.getNorthEast().lng() + m.loadMarginLng},
    "southWest" : {"latitude":bbox.getSouthWest().lat() - m.loadMarginLat, "longitude":bbox.getSouthWest().lng() - m.loadMarginLng}
  }];

  $.ajax({
    type: "POST",
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

  measureTime("load initiated");
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
  console.log("Loaded " + res.length + " zones");
  measureTime("Zones loaded");
  var sites = [];
  zones = {};
  for (var i = 0; i < res.length; i++) {
    //Store zone for later lookup
    storeZone(res[i]);

    // Build sites array
    var site = {x: res[i].longitude, y: res[i].latitude};
    sites.push(site);
  }

  var diagram = calculateVoronoi(sites);
  measureTime("voronoi calculated");
  clearOverlays();
  drawVoronoi(diagram);
}

function makeHString(lat, lng)
{
  return "[" + lat + "," + lng + "]";
}

function storeZone(zone)
{
  var hstring = makeHString(zone.latitude, zone.longitude);
  zones[hstring] = zone;
}

function lookupZone(site)
{
  var hstring = makeHString(site.y, site.x);
  return zones[hstring];
}

function placeMarker(zone)
{
  var pos = new google.maps.LatLng(zone.latitude, zone.longitude);
  var owner = "-";
  if (zone.currentOwner != null) {
    owner = zone.currentOwner.name;
  }

  var marker = new google.maps.Marker({
    position: pos,
    map: map,
    icon: ZONE_ICON,
    title: "Name: " + zone.name + "\n Owner: " + owner
  });
  markersArray.push(marker);
}

function calculateVoronoi(sites)
{
  var mb = map.getBounds();
  var m = calculateMargins(mb);
  var bbox = {
    xl: mb.getSouthWest().lng() - m.loadMarginLng,
    xr: mb.getNorthEast().lng() + m.loadMarginLng,
    yt: mb.getSouthWest().lat() - m.loadMarginLat,
    yb: mb.getNorthEast().lat() + m.loadMarginLat
  };

  var voronoi = new Voronoi();
  return voronoi.compute(sites, bbox);
}

function drawVoronoi(diagram)
{
  for(var i = 0; i < diagram.cells.length; i++) {
    var polyCoords = [];
    var cell = diagram.cells[i];

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

      var zone = lookupZone(cell.site);
      var col = colorFromZone(zone);
      var opacity = 0.1;
      if (col == "-") {  // hack!
        col = "#FFFFFF";
        opacity = 0;
      }

      placeMarker(zone);    
      var polygon = new google.maps.Polygon({
        paths: polyCoords,
        strokeColor: "#000000",
        strokeOpacity: 0.1,
        strokeWeight: 1,
        fillColor: col,
        fillOpacity: opacity,
        title: zone.name
      });

      polygon.setMap(map);
      markersArray.push(polygon);
    }
  }
  measureTime("cells drawn");

  drawBoundaries(diagram);
}

function drawBoundaries(diagram)
{
  for (var i = 0; i < diagram.edges.length; i++)
  {
    var edge = diagram.edges[i];

    // Skip if this is an edge zone
    if (edge.lSite == null || edge.rSite == null) {
      continue;
    }

    lzone = lookupZone(edge.lSite);
    lname = lzone.currentOwner == null ? "" : lzone.currentOwner.name;
    rzone = lookupZone(edge.rSite);
    rname = rzone.currentOwner == null ? "" : rzone.currentOwner.name;

    // Skip if owner is the same
    if (lname == rname) {
      continue;
    }

    var col = "#000000";
    var opacity = 0.5;
    var weight = 1;
    if (selectedUser != null 
      && (lname.toLowerCase() == selectedUser
      || rname.toLowerCase() == selectedUser))
    {
      if (matchedUser == null) {
        if (lname.toLowerCase() == selectedUser) {
          matchedUser = lname;
        } else {
          matchedUser = rname;
        }
      }
      col = colorFromStringHSV(matchedUser, 0x80, 0x40, 0x80);
      opacity = 1;
      weight = 4;
    }

    // Draw a line
    var start = new google.maps.LatLng(edge.va.y, edge.va.x);
    var stop = new google.maps.LatLng(edge.vb.y, edge.vb.x);
    coordinates = [start, stop];
    var line = new google.maps.Polyline({
      path: coordinates,
      strokeColor: col,
      strokeOpacity: opacity,
      strokeWeight: weight,
      zIndex: 2
    });
    line.setMap(map);
    markersArray.push(line);
  }
}

function clearOverlays() {
  for (var i = 0; i < markersArray.length; i++ ) {
    markersArray[i].setMap(null);
  }
  markersArray = [];
}

function calculateDistance(lat1, lng1, lat2, lng2)
{
  // formula from http://www.movable-type.co.uk/scripts/latlong.html
  // var R = 6371; // km
  // var d = Math.acos(Math.sin(lat1.toRad())*Math.sin(lat2.toRad()) + 
  //   Math.cos(lat1.toRad())*Math.cos(lat2.toRad()) *
  //   Math.cos(lng2-lng1).toRad()) * R;
  var R = 111.111;
  var x = (lng2-lng1) * Math.cos((lat1+lat2).toRad()/2);
  var y = (lat2-lat1);
  var d = Math.sqrt(x*x + y*y) * R;

  return d;
}

var geocoder = new google.maps.Geocoder();
function gotoLocation(location) {
  geocoder.geocode(
        {'address': location}, 
        function(results, status) { 
            if (status == google.maps.GeocoderStatus.OK) { 
                var loc = results[0].geometry.location;
                console.log("moving to " + location + " @" + loc.lat() + ", " + loc.lng());
                map.panTo(loc);
            } 
            else {
                alert(location + " not found: " + status); 
            } 
        }
    );
} 

function colorFromZone(zone) {
  if (zone.currentOwner == null) {
    return "-";
  }

  return colorFromString(zone.currentOwner.name);
}

function colorFromString(str) {
  return colorFromStringHSV(str, 0, 0xFF, 0xFF);
}

var G = 0x3f;   // color granularity must be 2^x - 1

function colorFromStringHSV(str, h, s, v) {
  var hash = str.hashCode();
  var hue = Math.floor((hash & G) + (h * G / 0xFF)) & G;
  var num = hue / (G + 1) * 6;
  s = Math.floor((0xFF - s) * v / 0xFF);
  var d = v - s;
  var pattern = Math.floor(num);  // 0-5
  var scale = Math.floor((num - pattern) * d + 0.5); 

  // console.log("str: " + str + " h: " + h + " s: " + s + " v: " + v + " d: " + d);
  // console.log("hash: " + hash.toString(16) + ", hue: " + hue + "/" + G + ", num: " + num);
  // console.log("pattern: " + pattern + ", scale: " + scale);

  var r = 0, g = 0, b = 0;
  switch (pattern)
  {
    case 0:
      r = v;
      g = s + scale;
      b = s;
      break;
    case 1:
      r = s + d - scale;
      g = v;
      b = s
      break;
    case 2:
      r = s;
      g = v;
      b = s + scale;
      break;
    case 3:
      r = s;
      g = s + d - scale;
      b = v;
      break;
    case 4:
      r = s + scale;
      g = s;
      b = v;
      break;
    case 5:
      r = v;
      g = s;
      b = s + d - scale;
      break;
  }
  var col = "#" + getHexByte(r) + getHexByte(g) + getHexByte(b);
  // console.log("col: " + col);
  return col;
}

function getHexByte(num)
{
  var n = num & 0xff;
  if (n < 16) {
    return "0" + n.toString(16);
  } else {
    return n.toString(16);
  }  
}

// profiling
var _starttime;
var _lasttime;

function initTime() {
  _starttime = (new Date()).getTime();
  _lasttime = _starttime;
  console.log("timer initialized " + _starttime);
}

function measureTime(point)
{
  var time = (new Date()).getTime();
  console.log("MT: " + point + ": " + (time - _lasttime) +  " (" + (time - _starttime) + ")");
  _lasttime = time;
}



google.maps.event.addDomListener(window, 'load', initialize);


