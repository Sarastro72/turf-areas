// ---- Constants ----
// buffer time between map change and reload
var LOAD_DELAY=500;   // in milliseconds

// Delay between player and take updates
var UPDATE_INTERVAL=10000;   // in milliseconds

// margin around viewport where zones are loaded and calculated
var LOAD_MARGIN=0.5;   // in kilometers

// Number of colors. Must be 2^N
var COLORS = 0x80;

// Time that the zone info tab is shown on inactivity
var ZONE_INFO_SHOW_TIME = 5000;   // in milliseconds

// Enable profiling of time critical parts
var PROFILE_ENABLED = false;

// marker icon representing a zone
var ZONE_ICON = {
  url: "img/zone.png",
  size: new google.maps.Size(24, 24),
  origin: new google.maps.Point(0,0),
  anchor: new google.maps.Point(6, 6),
  scaledSize: new google.maps.Size(12, 12)
};

// Marker representing a player
var PLAYER_ICON = {
  url: "img/player.png",
  size: new google.maps.Size(35, 90),
  origin: new google.maps.Point(0,0),
  anchor: new google.maps.Point(8, 40),
  scaledSize: new google.maps.Size(17, 40)
};

// ---- Variables ----
var geocoder = new google.maps.Geocoder();
var map;
var voronoi = new Voronoi();
var diagram;
var zones = {};
var markersArray = [];
var playersArray = [];
var loadTimer = null;
var updateInterval = null;
var zoneInfoTimer = null;
var lastUpdateTime = "0";
var selectedPlayer;
var matchedPlayer;
var area;
var zoneResult;
var latitudeFactor = 1;
var displayInfo = false;
var displaySearch = false;
var mode = "owner";

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

  console.log(navigator.userAgent);

  // Reduce saturation of the map
  var styles = [
  {
    "stylers": [
      { "saturation": -80 }
    ]
  },{
    "featureType": "poi",
    "elementType": "labels",
    "stylers": [
      { "visibility": "off" }
    ]
  },{
    "featureType": "water",
    "stylers": [
      { "color": "#aaaabb" }
    ]
  },{
    "featureType": "road.arterial",
    "elementType": "geometry.fill",
    "stylers": [
      { "color": "#FFFFFF" }
    ]
  },{
    "featureType": "road.arterial",
    "elementType": "geometry.stroke",
    "stylers": [
      { "color": "#AAAAAA" }
    ]
  },{
    "featureType": "road.local",
    "elementType": "geometry.stroke",
    "stylers": [
      { "color": "#AAAAAA" }
    ]
  },{
    "featureType": "road.local",
    "elementType": "geometry.fill",
    "stylers": [
      { "color": "#F8F8F8" }
    ]
  },{
    "featureType": "road",
    "elementType": "geometry",
    "stylers": [
      { "saturation": -100 }
    ]
  }];


  // Default location Stockholm
  var lat = 59.32893;
  var lng = 18.06491;
  var zoom = 14;

  var storedLoc = loadCurrentLocation();
  if (storedLoc != false)
  {
    lat = storedLoc.lat;
    lng = storedLoc.lng;
    zoom = storedLoc.zoom;
  }

  var location = $.url().param('location');
  setSelectedPlayer($.url().param('player'));
  mode = $.url().param('mode');

  var mapOptions = {
    center: new google.maps.LatLng(lat, lng),
    zoom: zoom,
    mapTypeId: google.maps.MapTypeId.TERRAIN,
    streetViewControl: false,
    styles: styles
  };
  map = new google.maps.Map(document.getElementById("map-canvas"),
    mapOptions);

  google.maps.event.addListener(map, "bounds_changed", function() {
    if (loadTimer != null) {
      clearTimeout(loadTimer);
    }
    _gaq.push(['_trackEvent', 'LoadZones', 'BoundsChanged']);
    loadTimer = setTimeout(loadZones, LOAD_DELAY);
  });

  if (location != null) {
    gotoLocation(location);
  }

  // Setup submit on enter for search input field
  $('#searchField').keypress(function(e) {
    // Enter is pressed
    if (e.keyCode == 13) {
      doSearch();
      return false;
    }
  });

  $('#searchField').keydown(function(e) {
    // Enter is pressed
    if (e.keyCode == 27) {
      toggleSearch();
      return false;
    }
  });
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


  // Doesn't handle cross datezone
  kilometerDLat = (bbox.getNorthEast().lng() - bbox.getSouthWest().lng()) / horizontalDistance;
  loadMarginLat = kilometerDLat * LOAD_MARGIN;
  kilometerDLng = (bbox.getNorthEast().lng() - bbox.getSouthWest().lng()) / verticalDistance;
  loadMarginLng = kilometerDLng * LOAD_MARGIN;


  var mbbox = {
    northEast: {
      lat: bbox.getNorthEast().lat() + loadMarginLat,
      lng: bbox.getNorthEast().lng() + loadMarginLng
    },
    southWest: {
      lat: bbox.getSouthWest().lat() - loadMarginLat,
      lng: bbox.getSouthWest().lng() - loadMarginLng
    }
  };

  return mbbox;
}

function loadZones() {
  initTime();
  storeCurrentLocation();
  var mbbox = getBoundsWithMargin();

  area = (mbbox.northEast.lat - mbbox.southWest.lat) * (mbbox.northEast.lng - mbbox.southWest.lng);

  if (area < 0.05) {
    var data = [{
      "northEast" : {"latitude": mbbox.northEast.lat, "longitude": mbbox.northEast.lng},
      "southWest" : {"latitude": mbbox.southWest.lat, "longitude": mbbox.southWest.lng}
    }];

    $.ajax({
      type: "POST",
      url: "zone-proxy.php",
      contentType: "application/json",
      data: JSON.stringify(data)
    })
    .done(function(res) {
      console.log("Loaded " + res.length + " zones");
      measureTime("Zones loaded");
      handleZoneResult(res);
    })
    .fail(function(xhr, status, error) {
      console.log("loadZones failed: " + JSON.stringify(xhr) + ",\n " + status + ",\n " + error);
    });

    measureTime("load initiated");
  }
  else
  {
    clearOverlays();
    loadPlayers();
    zoneResult = [];
  }

  if (updateInterval == null)
  {
    updateInterval = setInterval(performUpdate, UPDATE_INTERVAL);
  }

}

function tLatLng2voronoiXY(latlng)
{
  //console.log("tlng: " + latlng.longitude + ", vx: " + (latlng.longitude * latitudeFactor));
  return {x: latlng.longitude * latitudeFactor, y: latlng.latitude}
}

function voronoiXY2gLatLng(vxy)
{
  //console.log("vx: " + vxy.x + ", glng: " + (vxy.x / latitudeFactor));
  return new google.maps.LatLng(vxy.y, vxy.x / latitudeFactor);
}

function handleZoneResult(res) {
  zoneResult = res;
  var sites = [];

  if (res.length == 0) {
    clearOverlays();
    return;
  }

  // Calculate latitude factor from the first zone
  // The latitude factor is used to compensate for the difference in length between 
  // one latitude degree and one longitude degree.
  latitudeFactor = Math.cos(res[0].latitude.toRad());

  for (var i = 0; i < res.length; i++) {
    var site = tLatLng2voronoiXY(res[i]);

    //Store zone for later lookup
    storeZone(res[i], site);

    // Build sites array
    sites.push(site);
  }

  diagram = calculateVoronoi(sites);
  measureTime("voronoi calculated");
  clearOverlays();
  drawVoronoi(diagram);
  loadPlayers();
}

function performUpdate() {
  loadPlayers();
  loadTakes();
}

function loadPlayers() {
  $.ajax({
    type: "GET",
    url: "playerlocation-proxy.php",
  })
  .done(function(res) {
    handlePlayersResult(res);
  })
  .fail(function(xhr, status, error) {
    console.log("loadPlayers failed: " + JSON.stringify(xhr), + ",\n " + status, ",\n " + error);
  });
}

function handlePlayersResult (res) {
  var bbox = getBoundsWithMargin();
  clearPlayers();
  
  for (var i = 0; i < res.length; i++) {
    var player = res[i];
    // Place players that are within the bounds
    if (player.latitude > bbox.southWest.lat &&
        player.latitude < bbox.northEast.lat &&
        player.longitude > bbox.southWest.lng &&
        player.longitude < bbox.northEast.lng)
    {
      var pos = new google.maps.LatLng(player.latitude, player.longitude);
      var pname = player.name;
      var pcolor = colorFromStringHSV(pname, 0, 0x80, 0xff);

      var pmarker = new MarkerWithLabel({
        position: pos,
        map: map,
        icon: PLAYER_ICON,
        title: pname,
        labelContent: '<span class="pname" style="color: ' + pcolor + '">' + pname + '</span>',
        labelAnchor: new google.maps.Point(50, 0),
        labelClass: "labels", // the CSS class for the label
        labelStyle: {opacity: 0.85},
        zIndex: 20
      });
      playersArray.push(pmarker);
      selectPlayerOnClick(pmarker, pname);
    }
  }
}

function loadTakes() {
  $.ajax({
    type: "GET",
    url: "take-proxy.php",
  })
  .done(function(res) {
    handleTakeResult(res);
  })
  .fail(function(xhr, status, error) {
    console.log("loadTakes failed: " + JSON.stringify(xhr), + ",\n " + status, ",\n " + error);
  });
}

function handleTakeResult(res) {
  var newTake = false;

  // Check that area is small enough to have zones loaded
  if (area < 0.05) {
    var bbox = getBoundsWithMargin();

    for (var i = 0; i < res.length; i++) {
      var take = res[i];

      // Check that this is a new take
      if (take.time <= lastUpdateTime) {
        break;
      }
      // Reload if any new takes are within the bbox
      if (take.latitude > bbox.southWest.lat
          && take.latitude < bbox.northEast.lat
          && take.longitude > bbox.southWest.lng
          && take.longitude < bbox.northEast.lng)
      {
        console.log(take.currentOwner.name + " took " + take.zone.name + " from "
          + ((take.previousOwner != null) ? take.previousOwner.name : "no one"));
        newTake = true;
      }
    }

    if (newTake) {
      _gaq.push(['_trackEvent', 'LoadZones', 'TakeEvent']);
      loadZones();
    }
  }

  lastUpdateTime = res[0].time;
}

function selectPlayerOnClick(marker, playerName)
{
  google.maps.event.addListener(marker, 'click', function() {
      setSelectedPlayer(playerName)
      handleZoneResult(zoneResult);
    });
}

function showZoneInfoOnMouseOver(poly, zone)
{
  google.maps.event.addListener(poly, 'mouseover', function() {
      var owner = "-";
      if (zone.currentOwner != null) {
        owner = zone.currentOwner.name;
      }
      $( "#zone-info" ).html( "<b>Zone: " + zone.name + "</b>" +
        "<br><b>Owner:</b> " + owner +
        "<br><b>Take:</b> " + zone.takeoverPoints + ", <b>PPH:</b> " + zone.pointsPerHour);
      $( "#zone-info" ).animate({top: '0px'}, 400, function() {
        if (zoneInfoTimer != null)
        {
          clearTimeout(zoneInfoTimer);
        }
        zoneInfoTimer = setTimeout(function() {$( "#zone-info" ).animate({top: '-4em'})}, ZONE_INFO_SHOW_TIME);
      });
    });
}


function setSelectedPlayer(name) {
  if (name != null && selectedPlayer != name.toLowerCase())
  {
    console.log("Selecting player " + name);
    selectedPlayer = name.toLowerCase();
    loadSelectedPlayer();
    matchedPlayer = null;
    return true;
  } else {
    selectedPlayer = null;
    matchedPlayer = null;
    showSelectedPlayer();
    return false;
  }
}

function getBoundsWithMargin()
{
  return calculateMargins(map.getBounds());
}

function makeHString(lat, lng)
{
  return "[" + lat + "," + lng + "]";
}

function storeZone(zone, site)
{
  var hstring = makeHString(site.y, site.x);
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
    title: "Name: " + zone.name + "\nOwner: " + owner + "\nTake: " + zone.takeoverPoints + ", PPH: " + zone.pointsPerHour,
    zIndex: 10
  });
  markersArray.push(marker);
  selectPlayerOnClick(marker, owner);
}

function calculateVoronoi(sites)
{
  var mbounds = getBoundsWithMargin();
  var bbox = {
    xl: mbounds.southWest.lng * latitudeFactor,
    xr: mbounds.northEast.lng * latitudeFactor,
    yt: mbounds.southWest.lat,
    yb: mbounds.northEast.lat
  };

  voronoi.recycle(diagram);
  diagram = voronoi.compute(sites, bbox);
  return diagram;
}

function drawVoronoi(diagram)
{
  var opacity = calculateOpacity(0.2);
  if (mode == "pph")
  {
    opacity = 0.5;
  }

  for(var i = 0; i < diagram.cells.length; i++) {
    var polyCoords = [];
    var cell = diagram.cells[i];
    var zone = lookupZone(cell.site);
    placeMarker(zone);

    if (cell.halfedges.length > 0) {
      for (var c = 0; c < cell.halfedges.length; c++) {
        var edge = cell.halfedges[c];
        var coord = voronoiXY2gLatLng(edge.getStartpoint());
        polyCoords.push(coord);
      }
      // Close the loop
      var edge = cell.halfedges[0];
      var coord = voronoiXY2gLatLng(edge.getStartpoint());
      polyCoords.push(coord);
    }

    // Special case for lone zones, set poly to bounding box
    if (diagram.cells.length == 1) {
      var bbox = getBoundsWithMargin();
      polyCoords.push(new google.maps.LatLng(bbox.northEast.lat, bbox.northEast.lng));
      polyCoords.push(new google.maps.LatLng(bbox.northEast.lat, bbox.southWest.lng));
      polyCoords.push(new google.maps.LatLng(bbox.southWest.lat, bbox.southWest.lng));
      polyCoords.push(new google.maps.LatLng(bbox.southWest.lat, bbox.northEast.lng));
      polyCoords.push(new google.maps.LatLng(bbox.northEast.lat, bbox.northEast.lng));
    }

    if (polyCoords.length > 0)
    {
      var col = colorFromZone(zone);
      var zoneOpacity = opacity;

      if (col == "-") {  // hack!
        col = "#FFFFFF";
        zoneOpacity = 0;
      }

      var polygon = new google.maps.Polygon({
        paths: polyCoords,
        strokeColor: "#000000",
        strokeOpacity: zoneOpacity / 2,
        strokeWeight: 1,
        fillColor: col,
        fillOpacity: zoneOpacity,
        title: zone.name
      });

      showZoneInfoOnMouseOver(polygon, zone);
      polygon.setMap(map);
      markersArray.push(polygon);
    }
  }
  measureTime("cells drawn");

  if (mode != "pph")
  {
    drawBoundaries(diagram);
  }
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
    var opacity = calculateOpacity(0.75);
    var weight = 2;
    if (selectedPlayer != null 
      && (lname.toLowerCase() == selectedPlayer
      || rname.toLowerCase() == selectedPlayer))
    {
      if (matchedPlayer == null) {
        if (lname.toLowerCase() == selectedPlayer) {
          matchedPlayer = lname;
        } else {
          matchedPlayer = rname;
        }
        showSelectedPlayer();
      }
      opacity = 1;
      weight = 4;
    }

    // Draw a line
    var start = voronoiXY2gLatLng(edge.va);
    var stop = voronoiXY2gLatLng(edge.vb);
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

function showSelectedPlayer() {
  // Show/hide selected player info tab
  if (selectedPlayer != null) {
    $( "#player-info" ).html( "<b>Selected player:</b><br>" + ((matchedPlayer == null) ? selectedPlayer : matchedPlayer));
    $( "#player-info" ).animate({top: '0px'});
  } else {
    $( "#player-info" ).animate({top: '-4em'});
  }
}

// The more clutter, the less opacity.
function calculateOpacity(strength)
{
  // console.log("area: " + area);
  if (area > 0.015) {
    return 0.4 * strength;
  }
  if (area < 0.005) {
    return strength;
  }
  return 0.75 * strength;
}

function clearOverlays() {
  for (var i = 0; i < markersArray.length; i++ ) {
    markersArray[i].setMap(null);
  }
  markersArray = [];
}

function clearPlayers() {
  for (var i = 0; i < playersArray.length; i++ ) {
    playersArray[i].setMap(null);
  }
  playersArray = [];
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
                console.log(location + " not found: " + status); 
            } 
        }
    );
} 

function colorFromZone(zone) {
  if (mode == "pph")
  {
    var hue = (9 - zone.pointsPerHour) * 400 / 9;
    return colorFromHSV(hue, 0xFF, 0xFF);
  }
  else
    {
    if (zone.currentOwner == null) {
      return "-";
    }
    return colorFromString(zone.currentOwner.name);
  }
}

function colorFromString(str) {
  return colorFromStringHSV(str, 0, 0xFF, 0xFF);
}



function colorFromStringHSV(str, h, s, v) {
  var G = COLORS - 1;
  var hash = str.hashCode();
  var hue = (Math.floor((hash & G) + (h * G / 0xFF)) & G) * 1000 / COLORS;
  return colorFromHSV(hue, s, v);
}


/**
 *  h = HUE         1 - 1000 
 *  s = Saturation  0 - 255
 *  v = Value       0 - 255
 */
function colorFromHSV(h,s,v) {  
  var num = h / 1001 * 6;
  s = Math.floor((0xFF - s) * v / 0xFF);
  var d = v - s;
  var pattern = Math.floor(num);  // 0-5
  var scale = Math.floor((num - pattern) * d + 0.5); 

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

function toggleInfo() {
  if (displayInfo) {
    $('#info').fadeOut();
  } else {
    $('#info').fadeIn();
  }
  displayInfo = !displayInfo;
}

function toggleSearch() {
  if (displaySearch) {
    $('#searchField').blur();
    $('#search').fadeOut();
  } else {
    $('#searchField').val("");
    $('#search').fadeIn();
    $('#searchField').focus();
  }
  displaySearch = !displaySearch;
}

// profiling
var _starttime;
var _lasttime;

function initTime() {
  if (PROFILE_ENABLED) {
    _starttime = (new Date()).getTime();
    _lasttime = _starttime;
  }
}

function measureTime(point)
{
  if (PROFILE_ENABLED) {
    var time = (new Date()).getTime();
    console.log("MT: " + point + ": " + (time - _lasttime) +  " (" + (time - _starttime) + ")");

    _lasttime = time;
  }
}

function supportsHtml5Storage() {
  try {
    return 'localStorage' in window && window['localStorage'] !== null;
  } catch (e) {
    return false;
  }
}

function storeCurrentLocation () {
  if (!supportsHtml5Storage()) {
    return false;
  }
  var loc = map.getCenter();
  localStorage.locationStored = true;
  localStorage.currentLat = loc.lat();
  localStorage.currentLng = loc.lng();
  localStorage.currentZoom = map.getZoom();


  return true;
}

function loadCurrentLocation() {
  if (!supportsHtml5Storage()) {
    return false;
  }
  var loc = {};

  if (localStorage.locationStored != "true") {
    return false;
  }

  loc.lat = parseFloat(localStorage.currentLat);
  loc.lng = parseFloat(localStorage.currentLng);
  loc.zoom = parseInt(localStorage.currentZoom);

  return loc;
}

function doSearch() {
  toggleSearch();
  var txt = $("#searchField").val();
  if (txt) {
    gotoLocation(txt);
  }
}

function loadSelectedPlayer() {
  if (selectedPlayer != null) {
   var data = [{
      "name" : selectedPlayer
    }];

    $.ajax({
      type: "POST",
      url: "player-proxy.php",
      contentType: "application/json",
      data: JSON.stringify(data)
    })
    .done(function(res) {
      console.log("Loaded " + selectedPlayer + " player info");
      //measureTime("Zones loaded");
      handlePlayerResult(res);
    })
    .fail(function(xhr, status, error) {
      console.log("loadPlayer failed: " + JSON.stringify(xhr) + ",\n " + status + ",\n " + error);
    });
  }
}

function handlePlayerResult(res) {
  console.log("handlePlayerResult: " + JSON.stringify(res));
  if (res != null && res.length == 1) {
    pInfo = res[0];
    if (selectedPlayer == pInfo.name.toLowerCase()) {
        $( "#player-info" ).html( "<b>Selected player:</b><br>" +
          "<a href='http://turfgame.com/user/" + pInfo.name + "' target='_blank'>" +
          pInfo.name + "</a>" +
          " (" + pInfo.rank + ")<br>" +
          "<b>p:</b> " + pInfo.points + " +" + pInfo.pointsPerHour + " <b>z:</b> " + pInfo.zones.length);
    }
  }
}


google.maps.event.addDomListener(window, 'load', initialize);


