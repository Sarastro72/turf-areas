// ---- Constants ----
// buffer time between map change and reload
const LOAD_DELAY=500;   // in milliseconds

// Delay between player and take updates
const UPDATE_INTERVAL=10000;   // in milliseconds

// margin around viewport where zones are loaded and calculated
const LOAD_MARGIN=0.5;   // in kilometers

// Number of colors. Must be 2^N
const COLORS = 0x80;

// Time that the zone info tab is shown on inactivity
const ZONE_INFO_SHOW_TIME = 5000;   // in milliseconds

// Enable profiling of time critical parts
const PROFILE_ENABLED = false;

// Max number of takes that are remembered
const TAKE_STORE_SIZE = 2500;

// Max length of visible log item list
const MAX_LOG_LIST_LENGTH = 50;

// Track max age, How long after take should a zone be more bright (minutes)
const TRACK_MAX_AGE = 30

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
  url: "img/enemy.png",
  size: new google.maps.Size(24, 38),
  origin: new google.maps.Point(0,0),
  anchor: new google.maps.Point(12, 39),
  scaledSize: new google.maps.Size(24, 38)
};

const geocoder = new google.maps.Geocoder();
const voronoi = new Voronoi();

// ---- Variables ----
var map;
var diagram;
var zones = {};
var zoneOutlines ={};
var zoneHighlight = null;
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
var displayZoneInfo = false;
var mode = "owner";
var logPanel;
var logList = [];
var displayLog = false;
var takeStore = {};

var participants = ["Bombina",
"rabbit_rail",
"LostDomain",
"aivar",
"mopskillen",
"BambamGranit",
"Cekt",
"Kettx",
"lejonet",
"speedmaster100",
"Hjulpynt",
"NisseNasse",
"matse55",
"ReggaeHasse",
"embeoo",
"Entertainer",
"Rickshaw",
"pancosmic",
"iTurf",
"LBz",
"rojter",
"well",
"elena",
"Mobius",
"acinom66",
"majsanförfan",
"Junioren",
"Bullmannen",
"Changrila",
"veronicafe",
"albee",
"~Sisyfos~",
"Celtikcross",
"Pebbles",
"CarreraGT",
"LeffeM",
"AIKTobbe",
"erx007",
"turingmachine",
"DaHunter",
"RiddervanMyyl",
"ewq",
"Zoomerturfarn",
"N@a",
"alfaturfen",
"GoSt",
"AnnSch",
"keeponwalking",
"edeby",
"Falken55",
"CattisB",
"Pivo",
"SneakyFudger",
"Arantes",
"airwolf",
"FlyingFreedom",
"Timmris",
"Spikbebis75",
"MrStarke",
"alicubi",
"Yenx",
"annanna",
"Gofika",
"Sultanen",
"PerTAst",
"frowdrik",
"TabulaRasa",
"WKB-Joel",
"MrLilja",
"larryz",
"prinsesskorv",
"captHaddock",
"Kaksmulan",
"kremlan",
"Zoomermilfen",
"eskandia",
"Mr__Noodle",
"polythene",
"Shivers",
"Bizkit",
"MrDent"];


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

  logPanel = $( "#log-area").isotope({
    itemSelector: '.log-entry',
    layoutMode: 'vertical',
    getSortData: {
      timestamp: '[timestamp]'
    },
    sortBy: 'timestamp',
    sortAscending: false
  });

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

  var zoomControlOptions = {
    "position": google.maps.ControlPosition.LEFT_BOTTOM,
    "style": google.maps.ZoomControlStyle.DEFAULT
  };


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

  let urlPlayer = $.url().param('p');
  let urlSearch = $.url().param('s');
  let urlLoc = $.url().param('l');
  let urlZoom = parseInt($.url().param('z'));
  mode = $.url().param('mode') || $.url().param('m');

  if (urlLoc !== undefined) {
    p = urlLoc.split(",")
    pLat = parseFloat(p[0])
    pLong = parseFloat(p[1])
    if (!(isNaN(pLat) || isNaN(pLong))) {
      lat = pLat
      lng= pLong
    }
  }

  if (urlZoom !== undefined && Number.isInteger(urlZoom) && urlZoom > 0) {
    zoom=urlZoom
  }

  var mapOptions = {
    "center": new google.maps.LatLng(lat, lng),
    "zoom": zoom,
    "gestureHandling": "greedy",
    "mapTypeId": google.maps.MapTypeId.TERRAIN,
    "streetViewControl": false,
    "styles": styles,
    "zoomControl": true,
    "zoomControlOptions": zoomControlOptions
  };
  map = new google.maps.Map(document.getElementById("map-canvas"),
    mapOptions);

  setSelectedPlayer(urlPlayer)

  google.maps.event.addListener(map, "bounds_changed", function() {
    if (loadTimer != null) {
      clearTimeout(loadTimer);
    }
    _gaq.push(['_trackEvent', 'LoadZones', 'BoundsChanged']);
    loadTimer = setTimeout(boundsChanged, LOAD_DELAY);
  });

  if (urlSearch !== undefined) {
    gotoLocation(urlSearch);
  }

  if (loadLogPanelStatus() == true) {
    toggleLog();
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
  storeCurrentState();
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

function boundsChanged()
{
  loadZones();
  resetTakes();
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
  if (mode != "pph") {
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
  measureTime("handleTakeResult");
  var newTake = false;

  var bbox = getBoundsWithMargin();
  var takeLogList = [];
  for (var i = 0; i < res.length; i++) {
    var take = res[i];
    storeTake(take);

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
      newTake = true;
      var logEntry = makeTakeLogEntry(take);
      takeLogList.push(logEntry);
    }
  }

  pruneTakeStore();
  addLogEntries(takeLogList);
  pruneLogList();

  if (area < 0.05 && newTake) {
    _gaq.push(['_trackEvent', 'LoadZones', 'TakeEvent']);
    loadZones();
  }

  lastUpdateTime = res[0].time;
  measureTime("handleTakeResult done");
}

function storeTake(take)
{

  var takeEntry = {};
  takeEntry.currentOwner = take.currentOwner.name;
  takeEntry.previousOwner = (take.zone.previousOwner != null) ? take.zone.previousOwner.name : null;
  takeEntry.zone = take.zone.name;
  takeEntry.time = take.time;

  var takeKey = formatTime(take.time) + takeEntry.zone;

  takeStore[takeKey] = takeEntry;

  //console.log("storeTake() takeStore: " + Object.keys(takeStore).length);
}

function pruneTakeStore()
{
  var takeKeyList = Object.keys(takeStore);
  if (takeKeyList.length > TAKE_STORE_SIZE) {
    takeKeyList.sort(); // Sorts in ascending order
    while (takeKeyList.length > TAKE_STORE_SIZE) {
      var item = takeKeyList.shift();
      console.log("prune: " + item);
      delete takeStore[item];
    }
  }
  console.log("pruneTakeStore() takeStore: " + Object.keys(takeStore).length);
}

function makeTakeLogEntry(take)
{
  var newOwnerColor = colorFromStringHSV(take.currentOwner.name, 0, 0x40, 0xff);

  var prevOwnerColor = "#FFFFFF";
  if (take.zone.previousOwner !== undefined) {
    prevOwnerColor = colorFromStringHSV(take.zone.previousOwner.name, 0, 0x40, 0xff);
  }
  var takeDiv = $("<div class='log-entry' timestamp='" + take.time + "'/>")

  //console.log(JSON.stringify(take));
  //console.log(JSON.stringify(takeDiv));

  takeDiv.append($("<span class='log-time'>").append(formatTime(take.time)));
  takeDiv.append($("<span style='color: " + newOwnerColor + "'/>").append(take.currentOwner.name));
  takeDiv.append(" took ")
  takeDiv.append($("<span class='log-zone'/>").append(take.zone.name));
  takeDiv.append(" from ")
  takeDiv.append($("<span style='color: " + prevOwnerColor + "'/>").append((take.zone.previousOwner !== undefined) ? take.zone.previousOwner.name : "no one"));

  takeDiv.mouseover(function () { selectLog(takeDiv); showZoneInfo(take.zone) });
  takeDiv.mouseout(function () { unselectLog(takeDiv) });

  return takeDiv;
}


function addLogEntries(entries) {
//    logPanel.prepend(entries)
//    .isotope('prepended', entries);

  var length = Math.min(entries.length, MAX_LOG_LIST_LENGTH);

  for (var i = length-1; i >= 0; i--) {
    var div = entries[i];

    logPanel
      .prepend(div)
      .isotope('prepended', div);
    logList.push(div);
  }
  logPanel
    .isotope( {sortBy: 'timestamp', sortAscending: false});

  console.log("logList " + logList.length + " (" + length + ")");
}

function pruneLogList() {
  while (logList.length > MAX_LOG_LIST_LENGTH)
  {
    logPanel.isotope('remove', logList.shift());
  }
}

function resetTakes()
{
  console.log("resetTakes()");
  while (logList.length > 0)
  {
    logPanel.isotope('remove', logList.shift());
  }
  lastUpdateTime = "0";
  loadTakes();
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
    showZoneInfo(zone);
  });
}

function selectLog(log) {
  log.css("border-color", "rgba(255,255,255,1)");
  log.css("background-color", "rgba(128,128,128,0.8)");
}

function unselectLog(log) {
  log.css("border-color", "");
  log.css("background-color", "");
}

function showZoneInfo(zone) {
    var owner = "-";
    if (zone.currentOwner != null) {
      owner = zone.currentOwner.name;
    }
    $( "#zone-info" ).html( "<b>Zone: " + zone.name + "</b>" +
      "<br><b>Owner:</b> " + owner +
      "<br><b>Take:</b> " + zone.takeoverPoints + ", <b>PPH:</b> " + zone.pointsPerHour);

    if (!displayZoneInfo) {
      $( "#zone-info" ).animate({top: '0px'});
      displayZoneInfo = true;
    }

    if (zoneInfoTimer != null)
    {
      clearTimeout(zoneInfoTimer);
    }
    zoneInfoTimer = setTimeout(hideZoneInfo, ZONE_INFO_SHOW_TIME);

    hideZoneHighlight();
    zoneHighlight = zoneOutlines[zone.name];
    zoneHighlight.setMap(map);
}

function hideZoneInfo()
{
  if (displayZoneInfo) {
    $( "#zone-info" ).animate({top: '-4em'}, {complete: hideZoneHighlight});
    displayZoneInfo = false;
  }
}

function hideZoneHighlight()
{
  if (zoneHighlight != null) {
    zoneHighlight.setMap(null);
  }
  zoneHighlight = null;
}

function setSelectedPlayer(name) {
  if (name != null && selectedPlayer != name.toLowerCase())
  {
    console.log("Selecting player " + name);
    selectedPlayer = name.toLowerCase();
    loadSelectedPlayer();
    matchedPlayer = null;
    showSelectedPlayer();
  } else {
    selectedPlayer = null;
    matchedPlayer = null;
    showSelectedPlayer();
  }
  storeCurrentState()
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
    opacity: 0.7,
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
      var zoneOpacity = calculateOpacity(0.2, zone);

      if (col == "-") {  // hack!
        col = "#FFFFFF";
        zoneOpacity = 0;
      }

      var polygon = new google.maps.Polygon({
        paths: polyCoords,
        strokeColor: "#000000",
        strokeOpacity: 0,
        strokeWeight: 0,
        fillColor: col,
        fillOpacity: zoneOpacity,
        title: zone.name
      });

      showZoneInfoOnMouseOver(polygon, zone);
      polygon.setMap(map);
      markersArray.push(polygon);

      // make zone highlight outline
      var outline = new google.maps.Polygon({
        paths: polyCoords,
        strokeColor: "#FFFFFF",
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: "#FFFFFF",
        fillOpacity: 0.5,
        zIndex: 3
      });
      zoneOutlines[zone.name] = outline;

    }
  }
  measureTime("cells drawn");

  if (mode != "pph")
  {
    drawBoundaries(diagram);
  }

  // Clear some memory
  zones = {};
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
    if (mode == "teamsthlm") {
      opacity = 0.2;
    }
    var weight = 1;
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
      }
      opacity = 1;
      weight = 2;
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
function calculateOpacity(strength, zone = null)
{
  if (mode == "pph") {
    return 0.4
  }
  let opacity = 0.75 * strength
  if (area > 0.015) {
    opacity = 0.4 * strength
  } else if (area < 0.005) {
    opacity = strength
  }

  if (zone != null) {
    if(zone.currentOwner != null && zone.currentOwner.name.toLowerCase() == selectedPlayer) {
      opacity *= 3;
    } else {
      let taken = Math.floor(Date.parse(zone.dateLastTaken) / 60000)
      let now = Math.floor(Date.now() / 60000)
      let age = Math.min(now - taken, TRACK_MAX_AGE)
      if (age < TRACK_MAX_AGE) {
        opacity = opacity + opacity * (TRACK_MAX_AGE - age) / (TRACK_MAX_AGE / 2)
      }
    }
  }

  return Math.min(opacity, 1)
}

function clearOverlays() {
  for (var i = 0; i < markersArray.length; i++ ) {
    markersArray[i].setMap(null);
  }
  markersArray = [];
  zoneOutlines = {};
  hideZoneHighlight();
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
  if (mode == "teamsthlm") {
    if (participants.indexOf(str) >= 0) {
      return colorFromStringHSV(str, 0, 0xFF, 0xFF);
    } else {
      return colorFromStringHSV(str, 0, 0x10, 0xFF);    
    }
  }

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

function toggleLog() {
  if (displayLog)
  {
    $( "#log-panel" ).animate({right: '-16em'});
  } else {
    $( "#log-panel" ).animate({right: '0em'});    
  }

  displayLog = !displayLog;
  storeLogPanelStatus();
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

function storeCurrentState() {
  let loc = map.getCenter();
  let oldurl = window.location.href
  let url = oldurl.replace(/\?.*/, "")
  url += "?l=" + loc.lat().toFixed(4) + "," + loc.lng().toFixed(4)
  url += "&z=" + map.getZoom()
  if (selectedPlayer) {
    url += "&p=" + encodeURIComponent(selectedPlayer)
  }
  if (mode == "pph") {
    url += "&m=pph"
  }
  if (oldurl !== url) {
    window.history.pushState("", "", url);
  }

  if (supportsHtml5Storage()) {
    localStorage.locationStored = true;
    localStorage.currentLat = loc.lat();
    localStorage.currentLng = loc.lng();
    localStorage.currentZoom = map.getZoom();
  }
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

function storeLogPanelStatus() {
  if (!supportsHtml5Storage()) {
    return false;
  }

  localStorage.showLogPanel = displayLog;
}

function loadLogPanelStatus()
{
  if (!supportsHtml5Storage()) {
    return false;
  }

  if (localStorage.showLogPanel == "false") {
    return false;
  }

  return true;
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
          "<b>p:</b> " + pInfo.points + "+" + pInfo.pointsPerHour + " <b>z:</b> " + pInfo.zones.length);
    }
  }
}

function formatTime(dateTimeString)
{
  return moment(dateTimeString).format("HH:mm");
}


google.maps.event.addDomListener(window, 'load', initialize);
