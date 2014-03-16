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
  for (var i = 0; i < res.length; i++) {
    var pos = new google.maps.LatLng(res[i].latitude, res[i].longitude);
    var marker = new google.maps.Marker({
      position: pos,
      map: map,
      title: res[i].name
    });
    markersArray.push(marker);
  }
}


function draw() {
  var triangleCoords = [
  new google.maps.LatLng(59.346356, 17.909285),
  new google.maps.LatLng(59.344356, 17.907285),
  new google.maps.LatLng(59.344356, 17.911285),
  new google.maps.LatLng(59.346356, 17.909285)
  ];

  bermudaTriangle = new google.maps.Polygon({
    paths: triangleCoords,
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#FF0000',
    fillOpacity: 0.35
  });

  bermudaTriangle.setMap(map);

}

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
