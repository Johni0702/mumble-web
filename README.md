# mumble-web

mumble-web is an HTML5 [Mumble] client for use in modern browsers.

A live demo is running [here](https://voice.johni0702.de/?address=voice.johni0702.de&port=443/demo).

The Mumble protocol uses TCP for control and UDP for voice.
Running in a browser, both are unavailable to this client.
Instead Websockets are used for all communications.

libopus, libcelt (0.7.1) and libsamplerate, compiled to JS via emscripten, are used for audio decoding.
Therefore, at the moment only the Opus and CELT Alpha codecs are supported.

Quite a few features, most noticeably all
administrative functionallity, are still missing.

### Installing

#### Download
mumble-web can either be installed directly from npm with `npm install -g mumble-web`
or from git:

```
git clone https://github.com/johni0702/mumble-web
cd mumble-web
npm install
npm run build
```

The npm version is prebuilt and ready to use whereas the git version allows you
to e.g. customize the theme before building it.

Either way you will end up with a `dist` folder that contains the static page.

#### Setup
At the time of writing this there do not seem to be any Mumble servers
which natively support Websockets. To use this client with any standard mumble
server, websockify must be set up (preferably on the same machine that the
Mumble server is running on).

You can install websockify via your package manager `apt install websockify` or
manually from the [websockify GitHub page]. Note that while some versions might
function better than others, the python version generally seems to be the best.

There are two basic ways you can use websockify with mumble-web:
- Standalone, use websockify for both, websockets and serving static files
- Proxied, let your favorite web server serve static files and proxy websocket connections to websockify

##### Standalone
This is the simplest but at the same time least flexible configuration.
```
websockify --cert=mycert.crt --key=mykey.key --ssl-only --ssl-target --web=path/to/dist 443 mumbleserver:64738
```

##### Proxied
This configuration allows you to run websockify on a machine that already has
another webserver running.
```
websockify --ssl-target 64737 mumbleserver:64738
```

A sample configuration for nginx that allows access to mumble-web at 
`https://voice.example.com/` and connecting at `wss://voice.example.com/demo`
(similar to the demo server) looks like this:
```
server {
        listen 443 ssl;
        server_name voice.example.com;
        ssl_certificate /etc/letsencrypt/live/voice.example.com/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/voice.example.com/privkey.pem;

        location / {
                root /path/to/dist;
        }
        location /demo {
                proxy_pass http://websockify:64737;
                proxy_http_version 1.1;
                proxy_set_header Upgrade $http_upgrade;
                proxy_set_header Connection $connection_upgrade;
        }
}

map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
}
```

### License
ISC

[Mumble]: https://wiki.mumble.info/wiki/Main_Page
[websockify GitHub page]: https://github.com/novnc/websockify
