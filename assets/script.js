
    (function () {
      // year
      var y = document.getElementById('year');
      if (y) y.textContent = new Date().getFullYear();

      // Mobile tabs (list/map)
      var locator = document.getElementById('locator');
      var tabList = document.getElementById('tabList');
      var tabMap = document.getElementById('tabMap');
      var btnShowMap = document.getElementById('btnShowMap');

      function setView(view){
        if (!locator) return;
        locator.setAttribute('data-view', view);
        if (tabList) tabList.setAttribute('aria-pressed', view === 'list' ? 'true' : 'false');
        if (tabMap) tabMap.setAttribute('aria-pressed', view === 'map' ? 'true' : 'false');
        if (view === 'map') ensureMap();
      }

      if (tabList) tabList.addEventListener('click', function(){ setView('list'); });
      if (tabMap) tabMap.addEventListener('click', function(){ setView('map'); });
      if (btnShowMap) btnShowMap.addEventListener('click', function(){ setView('map'); });

      // Center data from DOM
      var list = document.getElementById('centersList');
      var cards = list ? Array.prototype.slice.call(list.querySelectorAll('.center-card')) : [];
      var countEl = document.getElementById('count');

      function normalize(s){
        return (s || '').toString().trim().toLowerCase();
      }

      // Filter: query + device
      function applyFilters(){
        var q = normalize(document.getElementById('q') && document.getElementById('q').value);
        var device = (document.getElementById('device') && document.getElementById('device').value) || '';

        var visible = 0;

        cards.forEach(function(card){
          var name = normalize(card.getAttribute('data-name'));
          var addr = normalize(card.getAttribute('data-address'));
          var devicesLabel = normalize(card.getAttribute('data-devices-label'));
          var devices = (card.getAttribute('data-devices') || '').split(',').map(function(x){ return (x || '').trim(); });

          var okDevice = !device || devices.indexOf(device) > -1;
          var okQuery = !q || name.indexOf(q) > -1 || addr.indexOf(q) > -1 || devicesLabel.indexOf(q) > -1;

          var ok = okDevice && okQuery;
          card.style.display = ok ? '' : 'none';
          if (ok) visible++;
        });

        if (countEl) countEl.textContent = String(visible);

        // update markers based on visibility
        refreshMarkers();
      }

      var btnApply = document.getElementById('btnApply');
      var btnReset = document.getElementById('btnReset');
      var qInput = document.getElementById('q');
      var deviceSel = document.getElementById('device');

      if (btnApply) btnApply.addEventListener('click', applyFilters);
      if (qInput) qInput.addEventListener('input', applyFilters);
      if (deviceSel) deviceSel.addEventListener('change', applyFilters);

      if (btnReset){
        btnReset.addEventListener('click', function(){
          if (qInput) qInput.value = '';
          if (deviceSel) deviceSel.value = '';
          applyFilters();
          clearActive();
          fitAll();
        });
      }

      // Active card handling
      function clearActive(){
        cards.forEach(function(c){ c.classList.remove('active'); });
      }
      function setActive(card){
        clearActive();
        card.classList.add('active');
      }

      // Route links
      function setRouteLink(card){
        var lat = card.getAttribute('data-lat');
        var lng = card.getAttribute('data-lng');
        var a = card.querySelector('[data-route]');
        if (!a || !lat || !lng) return;
        a.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lng);
      }
      cards.forEach(setRouteLink);

      // Leaflet lazy loader (LOCAL files)
      var map, markersLayer, leafletLoaded = false, mapReady = false;
      var mapEl = document.getElementById('map');
      var mapSkeleton = document.getElementById('mapSkeleton');

      function loadCSS(href){
        return new Promise(function(resolve, reject){
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.onload = resolve;
          link.onerror = reject;
          document.head.appendChild(link);
        });
      }
      function loadScript(src){
        return new Promise(function(resolve, reject){
          var s = document.createElement('script');
          s.src = src;
          s.defer = true;
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }

      function ensureLeaflet(){
        if (leafletLoaded) return Promise.resolve();
        var localCSS = 'assets/vendor/leaflet/leaflet.css';
        var localJS  = 'assets/vendor/leaflet/leaflet.js';
        return loadCSS(localCSS)
          .then(function(){ return loadScript(localJS); })
          .then(function(){ leafletLoaded = true; });
      }

      function initMap(){
        if (mapReady || !mapEl) return;
        if (!window.L) return;

        map = L.map(mapEl, { zoomControl: true, scrollWheelZoom: false, tap: true });
        markersLayer = L.layerGroup().addTo(map);

        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        mapReady = true;
        if (mapSkeleton) mapSkeleton.style.display = 'none';

        refreshMarkers(true);
        fitAll();
      }

      function ensureMap(){
        if (mapReady) return;
        if (!mapEl) return;

        ensureLeaflet()
          .then(function(){ initMap(); })
          .catch(function(){
            if (mapSkeleton) {
              mapSkeleton.innerHTML = '<strong>خطا در بارگذاری نقشه</strong><p>فایل‌های Leaflet را در مسیر <code>assets/vendor/leaflet/</code> قرار دهید (leaflet.css و leaflet.js).</p>';
            }
          });
      }

      // Auto-load map when map area becomes visible
      (function observeMap(){
        if (!('IntersectionObserver' in window)) return;
        var mapPane = document.getElementById('mapSection');
        if (!mapPane) return;

        var io = new IntersectionObserver(function(entries){
          entries.forEach(function(e){
            if (e.isIntersecting){
              ensureMap();
              io.disconnect();
            }
          });
        }, { rootMargin: '250px' });

        io.observe(mapPane);
      })();

      function getVisibleCards(){
        return cards.filter(function(c){ return c.style.display !== 'none'; });
      }

      function refreshMarkers(){
        if (!mapReady || !markersLayer) return;

        markersLayer.clearLayers();
        var visibleCards = getVisibleCards();

        visibleCards.forEach(function(card){
          var lat = parseFloat(card.getAttribute('data-lat'));
          var lng = parseFloat(card.getAttribute('data-lng'));
          if (!isFinite(lat) || !isFinite(lng)) return;

          var name = card.getAttribute('data-name') || '';
          var addr = card.getAttribute('data-address') || '';
          var phone = card.getAttribute('data-phone') || '';

          var m = L.marker([lat, lng]).addTo(markersLayer);
          m.bindPopup(
            '<strong style="font-family:Vazir,Arial;">' + escapeHTML(name) + '</strong><br>' +
            '<span style="font-family:Vazir,Arial;">' + escapeHTML(addr) + '</span><br>' +
            (phone ? ('<a href="tel:' + encodeURIComponent(phone) + '">تماس</a>') : '')
          );

          card._marker = m;
        });
      }

      function fitAll(){
        if (!mapReady || !map) return;

        var visibleCards = getVisibleCards();
        var pts = [];
        visibleCards.forEach(function(card){
          var lat = parseFloat(card.getAttribute('data-lat'));
          var lng = parseFloat(card.getAttribute('data-lng'));
          if (isFinite(lat) && isFinite(lng)) pts.push([lat, lng]);
        });

        if (!pts.length){
          map.setView([35.6892, 51.3890], 11);
          return;
        }
        var bounds = L.latLngBounds(pts);
        map.fitBounds(bounds.pad(0.18));
      }

      function focusCenter(card){
        ensureMap();
        setActive(card);

        var lat = parseFloat(card.getAttribute('data-lat'));
        var lng = parseFloat(card.getAttribute('data-lng'));
        if (!isFinite(lat) || !isFinite(lng)) return;

        setTimeout(function(){
          if (!mapReady || !map) return;
          map.setView([lat, lng], 14, { animate: true });
          if (card._marker && card._marker.openPopup) card._marker.openPopup();
        }, 250);
      }

      // Card click + buttons
      cards.forEach(function(card){
        card.addEventListener('click', function(e){
          if (e && e.target && (e.target.tagName === 'A')) return;
          focusCenter(card);
        });

        var btnFocus = card.querySelector('[data-focus]');
        if (btnFocus){
          btnFocus.addEventListener('click', function(e){
            e.stopPropagation();
            focusCenter(card);
            setView('map');
          });
        }
      });

      // Nearest center (optional)
      var btnNearest = document.getElementById('btnNearest');
      if (btnNearest){
        btnNearest.addEventListener('click', function(){
          if (!navigator.geolocation){
            alert('مرورگر شما از موقعیت مکانی پشتیبانی نمی‌کند.');
            return;
          }
          navigator.geolocation.getCurrentPosition(function(pos){
            var lat0 = pos.coords.latitude;
            var lng0 = pos.coords.longitude;

            var best = null;
            var bestD = Infinity;

            getVisibleCards().forEach(function(card){
              var lat = parseFloat(card.getAttribute('data-lat'));
              var lng = parseFloat(card.getAttribute('data-lng'));
              if (!isFinite(lat) || !isFinite(lng)) return;

              var d = haversine(lat0, lng0, lat, lng);
              if (d < bestD){
                bestD = d;
                best = card;
              }
            });

            if (best){
              focusCenter(best);
              setView('map');
            } else {
              alert('مرکزی با مختصات معتبر پیدا نشد.');
            }
          }, function(){
            alert('دسترسی موقعیت مکانی داده نشد.');
          }, { enableHighAccuracy: false, timeout: 7000, maximumAge: 60000 });
        });
      }

      function haversine(lat1, lon1, lat2, lon2){
        function toRad(x){ return x * Math.PI / 180; }
        var R = 6371; // km
        var dLat = toRad(lat2 - lat1);
        var dLon = toRad(lon2 - lon1);
        var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      }

      function escapeHTML(s){
        return (s || '').replace(/[&<>"']/g, function(m){
          return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];
        });
      }

      // initial render
      applyFilters();
    })();
  