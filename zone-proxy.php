<?PHP

  $url = "http://api.turfgame.com/v4/zones";
  $ch = curl_init( $url );
  $body = file_get_contents('php://input');

  curl_setopt($ch, CURLOPT_HTTPHEADER,
              array('Content-Type: application/json',
                    'Content-Length: ' . strlen($body)) );
  curl_setopt( $ch, CURLOPT_CUSTOMREQUEST, "POST" );
  curl_setopt( $ch, CURLOPT_POSTFIELDS, $body);
  curl_setopt( $ch, CURLOPT_FOLLOWLOCATION, true );
  curl_setopt( $ch, CURLOPT_HEADER, true );
  curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
  curl_setopt( $ch, CURLOPT_USERAGENT, $_SERVER['HTTP_USER_AGENT'] );
  
  list( $header, $contents ) = preg_split( '/([\r\n][\r\n])\\1/', curl_exec( $ch ), 2 );
  $status = curl_getinfo( $ch );
  curl_close( $ch );

  header( "Content-Type: application/json;charset=utf-8" );
  http_response_code($status['http_code']);
  print $contents;

?>
