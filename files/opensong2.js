/*
 * OpenSong remote maart 2021
 * onsen ui (http://onsen.io) and vanilla javascript
 */
//ons.platform.select('android');

ons.ready(function() {
 // Cordova APIs are ready
  //console.log('ready');
  var userLang = navigator.language || navigator.userLanguage;
  //userLang = 'cimode';  // alleen voor testen
  i18next
   .use(i18nextHttpBackend)
   .use(i18nextBrowserLanguageDetector)
   .init({
     lng: userLang,
     fallbackLng: 'en',
     supportedLngs: ['en','nl','es','pl'],
     load: 'languageOnly',
     useLocalStorage: false,
     debug: false,
     backend: {
       loadPath: './locales/{{lng}}/{{ns}}.json',
      crossDomain: true
     }, function(err, t) {
     }
   }).then(function(t) {
       // menu vertalen
       document.getElementById('nav-admin').innerText=i18next.t('nav.admin');
       document.getElementById('nav-remote').innerText=i18next.t('nav.remote');
       document.getElementById('nav-searchP').innerText=i18next.t('nav.searchP');
       document.getElementById('nav-searchL').innerText=i18next.t('nav.searchL');
       document.getElementById('nav-alert').innerText=i18next.t('nav.alert');
       document.getElementById('nav-setup').innerText=i18next.t('nav.setup');
       document.getElementById('nav-info').innerText=i18next.t('nav.info');
       // hier ook de setup pagina vertalen, omdat die als eerste staat
       document.getElementById('setup-titel').innerText=i18next.t('nav.setup');
       document.getElementById('setup-head1').innerText=i18next.t('setup.head1');
       document.getElementById('setup-head2').innerText=i18next.t('setup.head2');
       document.getElementById('setup-head3').innerText=i18next.t('setup.head3');
       document.getElementById('setup-theme').innerText=i18next.t('setup.theme');
       document.getElementById('setup-theme1').innerText=i18next.t('setup.dark');
       document.getElementById('setup-theme2').innerText=i18next.t('setup.light');
       document.getElementById('setup-remote').innerText=i18next.t('setup.tonen');
       document.getElementById('setup-remote1').innerText=i18next.t('setup.remote1');
       document.getElementById('setup-remote2').innerText=i18next.t('setup.remote2');
       document.getElementById('tekst-size').innerText=i18next.t('setup.textsize');
       document.getElementById('tekst-small').innerText=i18next.t('setup.small');
       document.getElementById('tekst-large').innerText=i18next.t('setup.large');
       document.getElementById('setup-speed').innerHTML=i18next.t('setup.speed');
       document.getElementById('speed1').innerText=i18next.t('setup.fast');
       document.getElementById('speed2').innerText=i18next.t('setup.slow');
    });

})

var osrNames = [];
var osrHosts = [];
var osrPorts = [];
var osrWWs = [];
if (localStorage["osrNames"]) { osrNames = JSON.parse(localStorage['osrNames']); }
if (localStorage["osrHosts"]) { osrHosts = JSON.parse(localStorage['osrHosts']); }
if (localStorage["osrPorts"]) { osrPorts = JSON.parse(localStorage['osrPorts']); }
if (localStorage["osrWWs"]) { osrWWs = JSON.parse(localStorage['osrWWs']); }

if (localStorage["osrTheme"] === null) {
  localStorage["osrTheme"] = 'light';
}
if (localStorage['osrTheme'] == 'dark') {
    document.querySelector('#thema').setAttribute('href', '/css/dark-onsen-css-components.css');
} else {
    document.querySelector('#thema').setAttribute('href', '/css/onsen-css-components.css');
}
const osrThemeAccent='rgb(30,136,229)';
const osrThemeDarkAccent='rgb(255,161,1)';
var osrThemeColor = osrThemeDarkAccent;


if (localStorage["osrtekstSize"] === null) {
  localStorage["osrtekstSize"] = '6';
} else {
  if (localStorage["osrtekstSize"] > 15) {
    localStorage["osrtekstSize"] = '6';
  }
}
if (localStorage["osrRemote"] === null) {
  localStorage["osrRemote"] = 'c';
}
if (localStorage["osrDisplay"] === null) {
  localStorage["osrDisplay"] = '2';
}
if (localStorage["osrLoadDelay"] === null) {
  localStorage["osrLoadDelay"] = '2';
}

// temp variables
var currentHost = -1;

if (osrNames.length > 0) {
  osrCurrentHostUrl = 'http://' + osrHosts[0] + ':' + osrPorts[0] + '/';
  osrCurrentWsUrl = 'ws://' + osrHosts[0] + ':' + osrPorts[0] + '/ws';
}

var currentMode = '';    // N = normal, B = black, F = freeze, H = hide, X = other, S = sleep
var lastMode = 'X';    // N = normal, B = black, F = freeze, H = hide, X = other, S = sleep
var lastSectie = -1;
var lastSlide = -1;
var currentSectie = -1;
var currentSlide = -1;
var totalSlides = -1;
var playList;
var sok;
var loadServiceBusy =false;
var updateStatusBusy;
var lastUrl;
var lastPresentId = '';
var ajaxBusy = 0;
var loadDelayBase = 100;
 // msec delay voor laden slides en uitvoeren akties
 var loadDelay = (loadDelayBase * localStorage["osrLoadDelay"]) + Math.round(Math.random() * 50);
var delayReconnectTimer;
var openSongVersie = 2;
function make_base_auth(password) {
  var hash = btoa(password);
  return "Basic " + hash;
}

window.osr = {};

window.osr.nextSlide = function() {
  osr.doeAktie("text","presentation/slide/next");
}
window.osr.previousSlide = function() {
  osr.doeAktie("text","presentation/slide/previous");
}

window.osr.delayReconnect = function() {
  clearTimeout(delayReconnectTimer);
  //console.log('delay reconnect host')
  delayReconnectTimer=setTimeout(function() {
        osr.openHost(currentHost);
  },600 * localStorage["osrLoadDelay"]);
};

window.osr.getStatus = function (event) {
    //console.log('start getStatus');
    lastUrl = "presentation/status";
    fetch(osrCurrentHostUrl + lastUrl)
      .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
    }).then(function(text) {
          osr.updateStatus(text);
    }).catch(function(error) {
          //console.log(error);
    });
    //console.log('einde getStatus');
}

window.osr.doeAktie = function(soort,opdracht) {
  // soort is, in dit geval, altijd 'text'
  //console.group('start doeAktie met opdracht ',opdracht);
  //console.trace();
  lastUrl = opdracht;
  if (osrWWs[currentHost] != '' ) {
    fetch(osrCurrentHostUrl + opdracht, {
        mode: 'cors',
        method: 'POST',
        headers: {
          'Authorization' : make_base_auth(osrWWs[currentHost]),
          'Content-Type': 'text/plain'
        },
        body: '',
    }).then(returnedData => {
          if (response.ok) {
            response.text().then(response => {
            //console.log(lastUrl + ' -> ' + response);
            });
          }
    }).catch(err => {
        // In case it errors.
      })
  } else {
    fetch(osrCurrentHostUrl + opdracht, {
        mode: 'cors',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: '',
    }).then(returnedData => {
        // Do whatever with returnedData
          if (response.ok) {
            response.text().then(response => {
            //console.log(lastUrl + ' -> ' + response);
            });
          }
    }).catch(err => {
        // In case it errors.
    })
  }
  //console.groupEnd();
};

window.osr.processPlaylist = function(data) {
  //console.log('start processs playlist ');
  //console.trace();
  try {
    playList=new DOMParser().parseFromString(data,"text/xml");
  } catch(error) {
    console.log('161- error parsing playlist ',error);
  }
   // voeg sectienummer toe aan playlist
  vorige = 'xxxxxxxxx';
  var n = 1;
  var slides = playList.getElementsByTagName("slide");
  for (var i = 0; i < slides.length; i++) {
    var slideId = slides[i].getAttribute('identifier');
    var soort = slides[i].getAttribute('type');
    if ((slideId) && (soort !== 'style')) {
      var name = slides[i].getAttribute('name');
      if ((name !== vorige) && (soort !== 'blank')) { n++;       }
      slides[i].setAttribute('sectie',parseInt(n, 10));
      vorige = name;
    }
  }
  var n = slides.length;;
  var myNavigator = document.getElementById('myNavigator');
  pageId=myNavigator.topPage.id;
  if (pageId == 'service-manager') {
    if (n != totalSlides) {
      //console.log('aantal slides is veranderd, nu bijwerken');
      lastSlide = -1;
      lastSectie = -1;
      totalSlides = n;
      var s = 1;   // tel songs
      var ul = document.getElementById("ulService");
      ul.innerHTML = '';
      var vorige = '';
      var subItems = '';
      var vorigeSectie = -1;
      var dezeSectie;
      var slideId;
      for (var i = 0; i < slides.length; i++) {
        dezeSectie = slides[i].getAttribute('sectie');
        if (dezeSectie) {
          //console.log('bezig met sectie ',dezeSectie,'sectie hiervoor was ',vorigeSectie);
          if ((dezeSectie != vorigeSectie) && (vorigeSectie >= 0)) {
             // vorige wegschrijven
             var li = document.createElement("ons-list-item");
             li.innerHTML = vorige + '<div class="expandable-content"><ons-list>'
               + subItems + '</ons-list></div>';
             li.setAttribute('expandable',true);
             li.setAttribute('data-sectie',vorigeSectie);
             li.onclick=function() { osr.setController(this); };
             ul.appendChild(li);
             subItems = '';
          }
          vorigeSectie = dezeSectie;
          slideId = slides[i].getAttribute('identifier');
          var name = slides[i].getAttribute('name');
          var soort = slides[i].getAttribute('type');
          if (soort == 'scripture') {
            var dezeTitel = '';
            try {
              if (slides[i].getElementsByTagName('title').length > 0) {
                var dezeTitel = slides[i].getElementsByTagName('title')[0].childNodes[0].nodeValue;
                if (dezeTitel != '') { name = dezeTitel; }
              }
            } catch(error) {
            }
          }
          if (name != '') {vorige = name; }
          var soort = slides[i].getAttribute('type');

          if (soort == 'song') {
              subItems += '<ons-list-item onclick="osr.setSlide(this)" data-slide="' + slideId
                +  '">placeholder ' + slideId + ' (sectie ' + dezeSectie + ') soort: ' + soort + '</ons-list-item>'
              s++;
          } else {
              subItems += '<ons-list-item onclick="osr.setSlide(this)" data-slide="' + slideId + '" data-song="' + s
                +  '">placeholder ' + slideId + ' (sectie ' + dezeSectie + ')</ons-list-item>'
          }
        }
      }
      /* voeg nu de laatste toe */
             var li = document.createElement("ons-list-item");
             li.innerHTML = vorige + '<div class="expandable-content"><ons-list>'
               + subItems + '</ons-list></div>';
             li.setAttribute('expandable',true);
             li.setAttribute('data-sectie',parseInt(vorigeSectie, 10));
             li.setAttribute('data-sectie',vorigeSectie);
             ul.appendChild(li);
      
    }
  }
  /* nu nog de currentSectie bepalen
   * want dat kon update status nog niet doen omdat de playlist niet klaar was */
   currentSectie = playList.querySelector('[identifier="' + parseInt(currentSlide,10) +'"]').getAttribute('sectie');
  loadServiceBusy = false;
  //console.log('einde processs playlist');
  osr.showService();
};

window.osr.loadService = function (event) {
    // service is de hele liturgie
    //console.groupCollapsed('start loadService');
    //console.trace();
    if (event) {
      event.preventDefault();
    }
    if (loadServiceBusy == true) {
       //console.log('exit want loadService is al bezig');
       //console.groupEnd();
       return;
    }
    loadServiceBusy = true; 

    fetch(osrCurrentHostUrl + "presentation/slide/list")
      .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
    }).then(function(text) {
          //console.log("response ok ",text);
          //console.groupEnd();
          osr.processPlaylist(text);
    }).catch(function(error) {
          console.warn('error fetching playlist ',error);
          ons.notification.alert('281- fetching playlist: ',error);

    });
    //console.log('einde loadService');
    //console.groupEnd();
}

window.osr.showService = function () {
    //console.groupCollapsed('start showService');
    //console.log('current mode ',currentMode,' last mode ',lastMode,' currents slide ',currentSlide,'; lastslide ',lastSlide);
    if ((! playList) || (playList.length < 1)) {
      // geen playlist, clear items
      document.getElementById("ulService").innerHTML = '';
    }
    statusId=document.getElementById('smStatus');
      switch (currentMode) {
          case 'N' :
            statusId.innerHTML=i18next.t('state.normal');
            break;;
          case 'B' :
            statusId.innerHTML=i18next.t('state.black');
            break;;
          case 'F' :
            statusId.innerHTML=i18next.t('state.freeze');
            break;;
          case 'H' :
            statusId.innerHTML=i18next.t('state.hide');
            break;;
          case 'L' :
            statusId.innerHTML=i18next.t('state.logo');;
            break;;
          case 'W' :
            statusId.innerHTML=i18next.t('state.white');
            break;;
          default:
            statusId.innerHTML='---';
      }

      //console.log('currentSectie: ',currentSectie,'; lastSectie: '+ lastSectie);
      
      if (currentSectie != lastSectie) {
        /* clear highlight voor vorige sectie/slide */
        var vorige = document.querySelector('[data-sectie="' + parseInt(lastSectie,10) +'"]');
        if (vorige) {
          if (vorige.expanded) {
            vorige.hideExpansion();
          }
          vorige.style.borderLeft='';
        }
        /* kan rustig loadController aanroepen en doorgaan
         * omdat alles wat ik hierna aankom al aanwezig is */
        osr.loadController(currentSectie);
        var deze = document.querySelector('[data-sectie="' + parseInt(currentSectie,10) +'"]');
        /* expand huidige sectie */
        if ((deze) && (! deze.expanded)) {
          deze.showExpansion();
        }
      }
      if ((deze) && (! deze.expanded)) {
        deze.style.borderLeft='8px solid ' + osrThemeColor;
      }
      // clear highlight van vorige slide
      var vorige = document.querySelector('[data-slide="' + parseInt(lastSlide,10) +'"]');
      if (vorige) {
        vorige.style.borderLeft='';
      }
      // set highlight van current slide
      var deze = document.querySelector('[data-slide="' + parseInt(currentSlide,10) +'"]');
      if (deze) {
        //deze.scrollIntoView({ behavior: 'smooth', block: 'nearest'});
        deze.style.borderLeft='8px solid ' + osrThemeColor;
      }
      // scroll nu in zicht
      if (deze && (currentSectie >= 0)) {
        var ip = deze.offsetTop;
         /* <div page_content>  is de scrollabel div, onderstaand slecteeert deze div */
        var pageContent = document.getElementById('ulService').parentNode.parentNode;
        var sp = pageContent.scrollTop;
        var sh = pageContent.scrollHeight;
        var wh = pageContent.parentNode.clientHeight -100;
        var deze2 = document.querySelector('[data-sectie="' + parseInt(currentSectie,10) +'"]');
        ip += deze2.offsetTop;
        var ih = deze.clientHeight;
        if (((ip + ih +ih - sp) > wh ) || ((ip - ih-ih) < sp)) {
          pageContent.scrollTop = ip-wh/4;
        }
      }
    //console.log('einde showService');
    //console.groupEnd();
}

osr.processRemoteSlide = function(deze) {
  //console.group('start processremoteslide');
  var tsize = localStorage["osrtekstSize"];
  if (localStorage['osrTheme'] == 'dark') {
    document.getElementById('current-screen-titel').style.color = 'rgba(255,255,255,0.7)';
    document.getElementById('current-screen-tekst').style.color = 'rgba(255,255,255,1)';
  } else {
    document.getElementById('current-screen-titel').style.color = 'rgba(0,0,0,0.7)';
    document.getElementById('current-screen-tekst').style.color = 'rgba(0,0,0,1)';
  }
  document.getElementById('current-screen-titel').style.fontSize = (tsize * 0.85) + 'vmin';

  xSlide = new DOMParser().parseFromString(deze,"text/xml");
  var dezeId= xSlide.getElementsByTagName('response')[0].getAttribute('identifier');
  //console.log('start process controller slide ',dezeId);
  var dezeRes= xSlide.getElementsByTagName('response')[0].getAttribute('resource');
  var dezeAktie= xSlide.getElementsByTagName('response')[0].getAttribute('action');
  var dezeSoort = xSlide.getElementsByTagName('slide')[0].getAttribute('type');
  var dezeTitel = '';
  try {
    if (xSlide.getElementsByTagName('title').length > 0) {
      var dezeTitel = xSlide.getElementsByTagName('title')[0].childNodes[0].nodeValue;
    }
  } catch(error) {
    //console.error(error);
  }
  var dezeBody = '';
  /* OpenSong V3 heeft in een slide ook style info met een body
   * vandaar onderstaande eerst slides en dan body */
  try {
    if (xSlide.getElementsByTagName('slides')[0].getElementsByTagName('body').length > 0) {
      var dezeBody = xSlide.getElementsByTagName('slides')[0].getElementsByTagName('body')[0].lastChild.nodeValue;
    }
  } catch (error) {
    //console.error(error);
  }

  try {
    var verzen = xSlide.getElementsByTagName('presentation')[0].lastChild.nodeValue;
  } catch(error) {
    var verzen = '';
  }
  //console.log('verzen ',verzen);
  if (dezeTitel != '') {
    if (verzen.trim() != '') {
      var aVerzen = verzen.split(' ');
      var currentVers = xSlide.getElementsByTagName('slides')[0].getElementsByTagName('slide')[0].getAttribute('PresentationIndex');
      // array index is zero based, index is 1 based
      var i;
      verzen = '';
      for (i = 0; i < aVerzen.length; i++) {
        if (i == (currentVers -1)) {
          if (/^B/i.test(aVerzen[i]) ) {
            verzen += '<strong>' + i18next.t('setup.bridge') + '</strong> ';
          }
          if (/^C/i.test(aVerzen[i]) ) {
            verzen += '<strong>' + i18next.t('setup.chorus') + '</strong> ';
          }
          if (/^T/i.test(aVerzen[i]) ) {
            verzen += '<strong>' + i18next.t('setup.tag') + '</strong> ';
          }
          if (/^V(\S)*/i.test(aVerzen[i]) ) {
            verzen += '<strong>' + aVerzen[i].substr(1,15) + '</strong> ';
          }
        } else {
          if (/^V(\S)*/i.test(aVerzen[i]) ) {
            verzen += aVerzen[i].substr(1,15)  + ' ';
          }
        }
      }
      dezeTitel += ': ' + verzen.trim().toLowerCase().replace(/ /g, ', ');
    }
  } else {
    dezeTitel = '';
  }
  var slides = xSlide.getElementsByTagName('slides')[0].getElementsByTagName('slide');
  for (var i = 0; i < slides.length; i++) {
    try {
      var tekst = slides[i].getElementsByTagName('body')[0].lastChild.nodeValue;
    } catch(error) {
      var tekst = '';
    }
    if ((dezeSoort == 'image') || (localStorage['osrRemote'] == 'c')) {
      document.getElementById('current-screen-titel').innerHTML = '';
      //$('#remote-main').addClass('geenpad');
      var ww = window.innerWidth -48;  // ons-card heeft rondom een margin van 8px en padding 16px
      var wh = window.innerHeight -64;
      tekst = '<img src="' + osrCurrentHostUrl + 'presentation/slide/' + currentSlide;
      if (wh < (ww * 9 / 16)) {
        tekst = tekst + '/image/height:' + wh + '/Math.random()" height="' + wh + 'px">';
      } else {
        tekst = tekst + '/image/width:' + ww + '/Math.random()" width="' + ww + 'px">';
      }
    } else {
      document.getElementById('current-screen-titel').innerHTML = dezeTitel;
    }
  }
  if (dezeSoort == 'external') {
    var dezeApp = xSlide.getElementsByTagName('slide')[0].getAttribute('application');
    var dezeBestand = xSlide.getElementsByTagName('slide')[0].getAttribute('filename');
    dezeBestand = dezeBestand.replace(/^.*[\\\/]/,'');
    dezeBestand = dezeBestand.replace(/%20/,' ');
    var dezeDesc='';
    try {
      dezeDesc = xSlide.getElementsByTagName('description')[0].childNodes[0].nodeValue
    } catch(error) {
      dezeDesc='';
    }
    tekst = tekst + '(' + dezeApp + ') ' + dezeDesc + ' - ' + dezeBestand;
  } 
  if (dezeSoort == 'song') {
    if (currentVers) {
      var vers = xSlide.getElementsByTagName('slides')[0].getElementsByTagName('slide')[0].getAttribute('id');
      verst = vers.replace(/V/gi, '');
      verst = verst.replace(/C/gi, 'refr');
      verst = verst.replace(/T/gi, '');
      presentid = xSlide.getElementsByTagName('slides')[0].getElementsByTagName('slide')[0].getAttribute('PresentationIndex');
      if (presentid != lastPresentId) {
        if (verst != '') {
          tekst = '<sup>' + verst + '. </sup>' + tekst;
        }
        lastPresentId = presentid;
      }
    }
  } else {
    lastPresentId = '';
  }
  if (dezeSoort == 'scripture') {
    // maak versnummers (1-3 cijfers) superscript
    tekst = tekst.replace(/(\d\d?\d?[abc]?) /g,'<sup>$1&nbsp;</sup>');
  }
  // de volgorde van de replaces is belangrijk
  tekst = tekst.replace(/^\t/gm, '&nbsp;&nbsp;&nbsp;&nbsp;');
  tekst = tekst.replace(/-\n/gm, '&shy;');
  tekst = tekst.replace(/\n/g, '<br>');
  tekst = tekst.replace(/[ \u00A0]<br>/g, ' ');
  
  if ((dezeSoort == 'image') || (localStorage['osrRemote'] == 'c')) {
    // als ik de font-size niet klein set, wordt de div overhoog gedrukt en komt er een vertical scrollbar
    document.getElementById('current-screen-tekst').style.fontSize = '1px';
  } else {
    document.getElementById('current-screen-tekst').style.fontSize = tsize + 'vmin';
  }
  document.getElementById('current-screen-tekst').innerHTML = tekst;
  //console.log('einde processremoteslide');
  //console.groupEnd();
}

osr.showRemoteScreen = function() {
  //console.group('start showremote')
  /* bekijk welke modus we moeten, plaatje of tekst */
  if ((currentMode == 'N') && (currentSlide >= 0)) {
    lastUrl = "presentation/slide/" + currentSlide;
    // fetch
    fetch(osrCurrentHostUrl + lastUrl)
      .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
      }).then(function(text) {
            osr.processRemoteSlide(text);
      }).catch(function(error) {
            console.log('fetching slide ' + currentSlide + ' ' + error);
            ons.notification.toast('589- fetching slide ' + currentSlide + ' ' + error, {
              timeout: 3000
            });
            //console.groupEnd();
      });
    } else {
      if (currentMode != 'F') {
        document.getElementById('current-screen-titel').innerText = '';
        document.getElementById('current-screen-tekst').innerHTML = '';
      }
    }
  //console.log('einde showremote')
  //console.groupEnd();
}

osr.processControllerSlide= function(deze) {
  //console.log('start process controller slide, queue: ',ajaxBusy);
  //console.log('ontvangen data ',deze);
  xSlide = new DOMParser().parseFromString(deze,"text/xml");
  /* activeElemenet werkt wel in firefox maar niet in chrome
   * onderstaand werkt in beide */
  var dezeId= xSlide.getElementsByTagName('response')[0].getAttribute('identifier');
  //console.log('start process controller slide ',dezeId);
  var dezeRes= xSlide.getElementsByTagName('response')[0].getAttribute('resource');
  var dezeAktie= xSlide.getElementsByTagName('response')[0].getAttribute('action');
  var dezeSoort = xSlide.getElementsByTagName('slide')[0].getAttribute('type');
  var dezeTitel = '';
  try {
    if (xSlide.getElementsByTagName('title').length > 0) {
      var dezeTitel = xSlide.getElementsByTagName('title')[0].childNodes[0].nodeValue;
    }
  } catch(error) {
    //console.error(error);
  }
  var dezeBody = '';
  /* OpenSong V3 heeft in een slide ook style info met een body
   * vandaar onderstaande eerst slides sectie en dan body */
  try {
    if (xSlide.getElementsByTagName('slides')[0].getElementsByTagName('body').length > 0) {
      var dezeBody = xSlide.getElementsByTagName('slides')[0].getElementsByTagName('body')[0].lastChild.nodeValue;
    }
  } catch (error) {
    //console.error(error);
  }
  if (dezeSoort == 'song') {
    var versno=xSlide.getElementsByTagName('slide')[1].getAttribute('id');;
  }
  //console.log('id ',dezeId,'; resource ',dezeRes,'; aktie ',dezeAktie,'; dezeSoort ',dezeSoort);

  var ditItem =document.querySelector('[data-slide="' + parseInt(dezeId,10) +'"]').firstChild;

   dezeBody = dezeBody.replace(/^\t/gm, '&nbsp;&nbsp;&nbsp;&nbsp;');
   dezeBody = dezeBody.replace(/-\n/gm, '&shy;');
   dezeBody = dezeBody.replace(/_\n/g, ' ');
   dezeBody = dezeBody.replace(/\n/g, '<br>');
   dezeBody = dezeBody.replace(/[ \u00A0]<br>/g, ' ');

  // flag hem als geladen
  var dezePl = playList.querySelector('slide[identifier="' + dezeId + '"]');
  if (dezePl) {
    dezePl.setAttribute('loaded',true);
  }
  switch (dezeSoort) {
    case 'custom':
      ditItem.innerHTML=dezeBody;
      break;
    case 'image':
      var dezeDesc='';
      try {
        dezeDesc = xSlide.getElementsByTagName('description')[0].childNodes[0].nodeValue
      } catch(error) {
        dezeDesc='';
      }
      //tekst = tekst + i18n.t("setup.dia3") + ': ' + bestand.replace(/^.*[\\\/]/, '');
      tekst = '<img src="' + osrCurrentHostUrl + 'presentation/slide/' + dezeId + '/image/width:160"'
        + ' style="float:left;padding-right:20px;">' + dezeDesc;
      ditItem.innerHTML=tekst;
      break;
    case 'external':
      var dezeApp = xSlide.getElementsByTagName('slide')[0].getAttribute('application');
      var dezeBestand = xSlide.getElementsByTagName('slide')[0].getAttribute('filename');
      dezeBestand = dezeBestand.replace(/^.*[\\\/]/, '');
      dezeBestand = dezeBestand.replace(/%20/,' ');
      var dezeDesc='';
      try {
        dezeDesc = xSlide.getElementsByTagName('description')[0].childNodes[0].nodeValue
      } catch(error) {
        dezeDesc='';
      }
      ditItem.innerHTML = dezeBody + '(' + dezeApp + ') ' + dezeDesc + ' - ' + dezeBestand;
      break;
    case 'scripture':
      ditItem.innerHTML=dezeBody;
      break; 
    case 'song':
        verst = versno.replace(/V/i, '');
        verst = verst.replace(/B/gi,i18next.t("setup.bridge"));
        verst = verst.replace(/C/gi, i18next.t("setup.chorus"));
        verst = verst.replace(/T/gi, i18next.t("setup.tag"));
        dezeBody = verst + '<br>' + dezeBody;
      ditItem.innerHTML=dezeBody;
      break;
    default:
      ditItem.innerHTML=tekst;
      //console.log('soort: ',soort);
  }
   ajaxBusy--;
  //console.log('einde process controller slide, queue: ',ajaxBusy);
  if (ajaxBusy < 1) {
    document.getElementById('bezig').removeAttribute('indeterminate',false);
    osr.showService();
  }
}

osr.delayControllerSlide= function(deze) {
    var d = ajaxBusy * loadDelay;
    //console.log('ophalen ',deze,' met queue ',ajaxBusy,' en delay  ',d);
    setTimeout(function() {
      osr.getControllerSlide(deze);
    },d);
}
osr.getControllerSlide= function (s) {
  //console.log('fetch call %d afgevuurd',s,' queue lengte ',ajaxBusy);
  if (currentMode != 'X') {
    // alleen afvoeren als de presentatie nog loopt
    lastUrl = "presentation/slide/" + s;
    fetch(osrCurrentHostUrl + "presentation/slide/" + s)
    .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
    }).then(function(text) {
          osr.processControllerSlide(text);
    }).catch(function(error) {
          ajaxBusy--;
          console.log('fetching slide ' + s + ' ' + error);
          /*ons.notification.toast('676- fetching slide ' + s + ' ' + error, {
            timeout: 3000
          });  */
    });
  } else {
   ajaxBusy--;
  }
}

osr.loadController= function (dezeSectie) {
  //console.group('start loadController voor sectie ',dezeSectie);
  //ajaxBusy = 0;
  /* zoek alle slides van deze sectie */
  if (playList) {
    var slides = playList.getElementsByTagName("slide");
    for (var i = 0; i < slides.length; i++) {
      var slideId = slides[i].getAttribute('identifier');
      var sectie = slides[i].getAttribute('sectie');
      var soort = slides[i].getAttribute('type');
      var geladen =  slides[i].getAttribute('loaded');
      if ((slideId) && (sectie == dezeSectie) && (! geladen)) {
        if (soort == 'blank') {
            var deze =document.querySelector('[data-slide="' + parseInt(slideId,10) +'"]');
            deze.innerHTML='-----';
        } else {
          ajaxBusy++;
          document.getElementById('bezig').setAttribute('indeterminate',true);
          osr.delayControllerSlide(slideId);
        }
      }
    }
  }
  //console.log('einde loadController')
  //console.groupEnd();
}

window.osr.setController = function (deze) {
  var sectieno = deze.getAttribute("data-sectie");
  //console.log('setControlller ',sectieno,' aktieve sectie ',currentSectie);
  if (deze.expanded) {
    deze.style.borderLeft='';
    osr.loadController(sectieno);
  } else {
    // we klappen hem dicht, zet highlight als dit de huidige is
    if (sectieno == currentSectie) {
       deze.style.borderLeft='8px solid ' + osrThemeColor;
    }
  }
}

window.osr.setSlide = function (deze) {
    var slideno = deze.getAttribute("data-slide");
    osr.doeAktie("text","presentation/slide/" + slideno);
}

window.osr.open = function() {
  var menu = document.getElementById('menu');
  menu.open();
};

window.osr.loadPage = function(page) {
  //console.log('load page ',page);
  myNavigator=document.getElementById('myNavigator');
  var menu = document.getElementById('menu');
  myNavigator.bringPageTop(page)
    .then(menu.close.bind(menu));
};   

window.osr.editHost = function(deze) {
  //console.log('new/edit host ',deze);
  // als ie van ie van een icon komt, is het een nieuwe
  if (deze) {currentHost = -1; }
  document.getElementById('hostMenu').hide();
  var dialog = document.getElementById('EditHost');
  if (dialog) {
    dialog.show();
  } else {
    ons.createElement('edithost.html', { append: true })
      .then(function(dialog) {
        dialog.show();
      });
  }
};

window.osr.cancelEditHost = function(deze) {
  document.getElementById('EditHost').hide();
  currentHost = -1;
};

window.osr.deleteHost = function(deze) {
  //console.log('delete host ',currentHost);
  osrNames.splice(currentHost,1);
  osrHosts.splice(currentHost,1);
  osrPorts.splice(currentHost,1);
  osrWWs.splice(currentHost,1);
  document.getElementById('hostMenu').hide();
  localStorage['osrNames'] = JSON.stringify(osrNames)
  localStorage['osrHosts'] = JSON.stringify(osrHosts)
  localStorage['osrPorts'] = JSON.stringify(osrPorts)
  localStorage['osrWWs'] = JSON.stringify(osrWWs)
  currentHost = -1;
  osr.refreshHostList();
};

window.osr.refreshHostList = function() {
  var ul = document.getElementById("OsHosts");
  ul.innerHTML = '';
  if (osrNames.length > 0) {
    for (let n = 0; n < osrNames.length; n++) {
      var li = document.createElement("ons-list-item");
      li.innerHTML = '<div class="right" onclick="osr.hostMenuClick(this);">&nbsp;'
        + '<ons-icon icon="md-more-vert" class="list-item__icon"></ons-icon>&nbsp;</div>'
        + osrNames[n];
      li.setAttribute('data-hostId',n);
      li.onclick=function() { osr.hostClick(this); };
      ul.appendChild(li);
    }
  }
  var d1 = document.getElementById('screenSize');
  d1.value = localStorage["osrtekstSize"];
  var d2 = document.getElementById('loadDelay');
  d2.value = localStorage["osrLoadDelay"];
};

window.osr.editHostSave = function(deze) {
  //console.log('save editted host ',deze);
  if (currentHost >= 0) {
    osrNames[currentHost] = document.getElementById("ehName").value;
    osrHosts[currentHost] = document.getElementById("ehIP").value;
    osrPorts[currentHost] = document.getElementById("ehPort").value;
    osrWWs[currentHost] = document.getElementById("ehPassword").value;
  } else {
    if (osrNames.includes(document.getElementById("ehName").value)) {
      ons.notification.alert(i18next.t('setup.host1'));
    } else {
      osrNames.push(document.getElementById("ehName").value);
      osrHosts.push(document.getElementById("ehIP").value);
      osrPorts.push(document.getElementById("ehPort").value);
      osrWWs.push(document.getElementById("ehPassword").value);
    }
  }
  localStorage['osrNames'] = JSON.stringify(osrNames)
  localStorage['osrHosts'] = JSON.stringify(osrHosts)
  localStorage['osrPorts'] = JSON.stringify(osrPorts)
  localStorage['osrWWs'] = JSON.stringify(osrWWs)
  osr.refreshHostList();
  document.getElementById('EditHost').hide();
  currentHost = -1;
};

window.osr.hostClick = function(deze) {
  //console.log('host clicked ',deze);
  currentHost=deze.getAttribute('data-hostid');
  deze.style.borderLeft='8px solid ' + osrThemeColor;
  var hostname = osrNames[currentHost];
  //console.log('connect to host  ',hostname);
  osr.openHost(currentHost);
};

window.osr.hostMenuClick = function(deze) {
  // onderstaand voorkomt trigger van listitem click
  event.stopPropagation();
  //console.log('hostmenu click ',deze);
  currentHost=deze.parentNode.getAttribute('data-hostid');
  //console.log('hostmenu klik  ',currentHost);
  document.getElementById('hostMenu').show(deze);
};

window.osr.warnMenu = function() {
  //console.log('start warnmenu ');
  var dialog = document.getElementById('popupWarning');
  if (dialog) {
    dialog.show();
  } else {
    ons.createElement('popupWarning.html', { append: true })
      .then(function(dialog) {
        dialog.show();
      });
  }
  var menu = document.getElementById('menu');
  //console.log('menu ',menu.isOpen);
  menu.close();
};

window.osr.setWarn = function(deze) {
  //console.log('start setwarn ',deze.id);
  if (deze.id == 'setWarn') {
    var bericht = document.getElementById('warnMessage').value;
    //console.log('bericht ',bericht);
    osr.doeAktie("text","presentation/screen/alert/message:" + encodeURI(bericht));
  } else {
    //console.log('clear warn ');
    osr.doeAktie("text","presentation/screen/alert/");
  }
  document.getElementById('popupWarning').hide();
}

window.osr.updateStatus = function (data) {
  //console.groupCollapsed('start updateStatus');
  //console.trace();
    if (data == 'OK') {
      //console.log(data,' ontvangen');
      //console.groupEnd();
      return;
    };
    if (updateStatusBusy == true) {
      //console.log('updateStatus is nog bezig');
      //console.groupEnd();
      return;
    }
    if (! data.includes('>')) {
      if (lastUrl) {
        // alleen rapporteren als er een valide lastUrl is
        //console.log('ontvangen status maar geen xml: ' + data + ' url: ' + lastUrl);
        /*ons.notification.toast('889- ontvangen status: ' + data + ' url: ' + lastUrl, {
              timeout: 5000
        });*/
      }
      //console.groupEnd();
      return;
    } else {
      //console.log('ontvangen ',data);
    }
    lastSlide = currentSlide;
    lastSectie = currentSectie;

    updateStatusBusy = true;
    //console.log('updatestatusbusy ',updateStatusBusy);
    pageId=myNavigator.topPage.id;
    try {
      xmlStatus=new DOMParser().parseFromString(data,"text/xml");
    } catch(error) {
      console.log('error parsing status ',error);
    }
    // onderstaande werkt !!
    //var running = xmlStatus.getElementsByTagName("presentation")[0].getAttribute("running");
    var running = 0;
    if (xmlStatus.getElementsByTagName('presentation')[0].hasAttribute('running')) {
      running = xmlStatus.getElementsByTagName('presentation')[0].getAttribute('running');
    }
    var statusResource= xmlStatus.getElementsByTagName("response")[0].getAttribute("resource");
    var statusAction= xmlStatus.getElementsByTagName("response")[0].getAttribute("action");
    if (xmlStatus.getElementsByTagName("response")[0].hasAttribute("reason")) {
      // OpensOng V3 heeft reason in de status
      openSongVersie = 3;  // nodig voor insertSong
      var statusReden= xmlStatus.getElementsByTagName("response")[0].getAttribute("reason");
    }
    if (! statusReden) { statusReden = 'change'; }
    //console.log('resource ',statusResource,'; action ',statusAction,'; reden ',statusReden);
    switch (statusReden) {
      case 'change':
          // dia wisseling gedaan
        break;
      case 'subscribe':
          // bevestiging subsscribe
        break;
      case 'starting':
          // opstarten presentatie
        break;
      case 'clear':
          // presentatie gaat stoppen, volgende status is closed
        break;
      case 'closed':
          // presentatie is gestopt, doorvallen naar herladen
      case 'insert_song':
          // er is een lied toegevoegd, doorvallen naar herladen
      case 'insert_scripture':
        // er is een bijbeltekst toegevoegd
        // nu herladen
        playList = '';
        currentSlide=-1; currentSectie=-1; lastSlide = -1; lastSectie = -1;
        break;
      }

    if ((running == "1") &&(statusReden == 'change')) {
      currentSlide = xmlStatus.getElementsByTagName('slide')[0].getAttribute('itemnumber');
      if (playList) {
        currentSectie = playList.querySelector('[identifier="' + parseInt(currentSlide,10) +'"]').getAttribute('sectie');
        //console.log('currentSectie ',currentSectie);
      } else {
        currentSectie = -1;
      }
      if (playList) {
       var statusNaam = xmlStatus.getElementsByTagName('name')[0];
       if (statusNaam && statusNaam.hasChildNodes()) {
        statusNaam = statusNaam.childNodes[0].nodeValue;
        var playItemName = playList.querySelector('[identifier="' + parseInt(currentSlide,10) +'"]').getAttribute('name');
        //console.log('statusnaam ',statusNaam,'; playitem: ',playItemName);
        if (statusNaam != playItemName) {
         // als ze niet overeenkomen is blijkbaar de playlist veranderd => herladen
         playList = '';
         currentSlide=-1; currentSectie=-1; lastSlide = -1; lastSectie = -1;
        }
       }
      }
/*            statusNaam = $(xml).find('response').find('presentation').find('slide').find('name').text();
      playItemName = $(Playlist).find('response').find('slide[identifier="' + currentSlide + '"]').attr('name');
      if ((statusNaam !=='') && (statusNaam !== playItemName)) {
        //console.log('reloaden! - statusNaam: ' + statusNaam + '; playItemName: ' + playItemName);
        lastSlide = -1; lastSectie = -1;  // force reload
      }
*/
      currentMode = xmlStatus.getElementsByTagName("screen")[0].getAttribute("mode");
      //console.log('current mode ',currentMode,'; last mode ',lastMode,'; sectie ',currentSectie,'; slide ',currentSlide,'; serviceBusy ',loadServiceBusy);
      switch (pageId) {
        case 'service-manager':
          if ((lastSlide == -1) || (lastSectie == -1)) {
            console.groupEnd();
            setTimeout(function(){ osr.loadService(); }, loadDelay);
          } else {
            osr.showService();
          }
          break;
        case 'remote-screen':
          console.groupEnd();
          osr.showRemoteScreen();
          break;
      }
    } else {
      // geen lopende presentatie
      //console.log('geen lopende presentatie')
      if ((lastMode != 'X') && (! loadServiceBusy)) {
        //console.log('currentmode ',currentMode,' lastmode ',lastMode,'; loadservicebusy ',loadServiceBusy);
        ons.notification.toast(i18next.t('setup.net6'), {
            timeout: 5000
        });
      }
      currentMode = "X";
      playList = '';
      lastStatus = '';
      lastMode = '';
      lastSectie = -1;
      lastSlide = -1;
      currentSectie = -1;
      currentSlide = -1;
      totalSlides = -1;
      loadServiceBusy = false;
      updateStatusBusy = false;
      // vermeld status
      switch (pageId) {
        case 'service-manager':
          console.groupEnd();
          osr.showService();
          break;
        case 'remote-screen':
          console.groupEnd();
          osr.showRemoteScreen();
        break;
      }

    } // else if running == 1
    updateStatusBusy = false;
    //console.log('einde update status');
    console.groupEnd();
}

window.osr.openHost = function (deze) {
    //console.groupCollapsed('start openHost');
    // sluit eerst een al geladen presentatie
    if (playList && (playList.length > 1)) {
      currentMode = "X";
      playList = '';
      lastStatus = '';
      lastMode = '';
      lastSectie = -1;
      lastSlide = -1;
      currentSectie = -1;
      currentSlide = -1;
      totalSlides = -1;
      loadServiceBusy = false;
      updateStatusBusy = false;
    }
    ajaxBusy = 0;
    var myNavigator = document.getElementById('myNavigator');

    if ((typeof sok != 'undefined') && (sok.readyState == 1)) {
      // connectie is open, eerst sluiten
      sok.close();
    }
    osrCurrentHostUrl = 'http://' + osrHosts[currentHost] + ':' + osrPorts[currentHost] + '/';
    osrCurrentWsUrl = 'ws://' + osrHosts[currentHost] + ':' + osrPorts[currentHost] + '/ws';
    //console.log('url ',osrCurrentWsUrl);
    if ("WebSocket" in window) {
      sok = new WebSocket(osrCurrentWsUrl);
      sok.onopen = function() {
        // Web Socket is connected, send data using send()
        sok.send('/ws/subscribe/presentation');
        ons.notification.toast(i18next.t('setup.net1') + osrNames[deze], {
          timeout: 1000
        });
        /* nu switchen naar service-manager
         * page init interrup stuurt een getStatus */
        myNavigator.bringPageTop('service-manager.html');
      };
      sok.onmessage = function (evt) {
        osr.updateStatus(evt.data);
      };
      sok.onerror = function() { 
        // websocket geeft error.
        osr.delayReconnect();
        ons.notification.alert(i18next.t('setup.net3'));
        //set host highlight weer uit
        currentHost = -1;
        myNavigator.bringPageTop('setup.html');
      };
      sok.onclose = function() { 
        // websocket is closed.
        currentHost = -1;
        ons.notification.toast(i18next.t('setup.net4'), {
          timeout: 10000
        });
      };
    } else {
      // The browser doesn't support WebSocket
      currentHost = -1;
        ons.notification.alert(i18next.t('setup.net5'));
    } // if websocket
    //console.clear();
    //osr.Herladen();
    //console.groupEnd();
}

window.osr.themaClick = function(deze) {
    //console.log('start thema klik ',deze);
    var keuze = document.forms.fThema.thema.value;
    localStorage['osrTheme'] = keuze;
    osr.thema(keuze)
};
window.osr.thema = function(thema) {
    if (thema == 'dark') {
      document.querySelector('#thema').setAttribute('href', './css/dark-onsen-css-components.css');
      document.getElementById('lblThema1').checked=true;
      osrThemeColor = osrThemeDarkAccent;
    } else {
      document.querySelector('#thema').setAttribute('href', './css/onsen-css-components.css');
      document.getElementById('lblThema2').checked=true;
      osrThemeColor = osrThemeAccent;
    }
};

window.osr.screenSoortClick = function(deze) {
    var radio = document.forms.fScreenSoort.screensoort.value;
    localStorage['osrRemote'] = radio;
};

window.osr.statusClick = function(deze) {
  //console.log('status klik ')
  ons.openActionSheet({
    cancelable: true,
    buttons: [
      i18next.t('state.normal'),
      i18next.t('state.black'),
      i18next.t('state.white'),
      i18next.t('state.hide'),
      i18next.t('state.logo'),
      i18next.t('state.freeze')
    ]
  }).then(function (index) {
    console.log('selected status: ', index)

    switch (index) {
      case 0:
          osr.doeAktie("text","presentation/screen/normal","");
        break;
      case 1:
          osr.doeAktie("text","presentation/screen/toggle_black","");
        break;
      case 2:
          osr.doeAktie("text","presentation/screen/toggle_white","");
        break;
      case 3:
          osr.doeAktie("text","presentation/screen/toggle_hide","");
        break;
      case 4:
          osr.doeAktie("text","presentation/screen/toggle_logo","");
        break;
      case 5:
          osr.doeAktie("text","presentation/screen/toggle_freeze","");
        break;
    }
    });
}

osr.processSetList = function(deze) {
  //console.log('start processSetList');
  // moet firstchild doen omdat onsen er een geneste select in zet
  var dropdown = document.getElementById('search-sets').firstChild;
  dropdown.length=0;
  var opt = document.createElement('option');
  opt.value = '';
  opt.innerText = i18next.t('setup.choose');
  dropdown.appendChild(opt);
  var xSet = new DOMParser().parseFromString(deze,"text/xml");
  var sets = xSet.getElementsByTagName("set");
  for (var i = 0; i < sets.length; i++) {
      var setName = sets[i].firstChild.nodeValue;
      opt = document.createElement('option');
      opt.value = setName;
      opt.innerText = setName;
      dropdown.appendChild(opt);
  }
  document.getElementById('sets-status').innerText = i18next.t('search.choose');
  //console.log('einde processSetList');
}

osr.presentShow= function (event) {
    //console.groupCollapsed('start presentShow');
    var dezeSet = event.target.value;
    //console.log('deze: ',dezeSet);
    // n = 1 of 2 screens
    var n = 1;
    var mode = document.querySelector('input[name="mode"]');
    if (mode.checked) { n = 2; }
    //console.log('mode ',mode.checked);
    if (currentMode != 'X') {
        //console.log('er loopt al een presenatie..');
        ons.notification.confirm({
          title: i18next.t('search.letop'),
          message: i18next.t('search.stopwarn'),
          buttonLabels: [i18next.t('nav.cancel'),i18next.t('nav.ok')],
          callback: function(answer) {
              if (answer > 0) {
                osr.doeAktie("text",'presentation/close');
                setTimeout(function() {
                  osr.doeAktie("text",'set/present/' + encodeURI(dezeSet) + '/display:' + n);
                },3 * loadDelay);
                setTimeout(function() {
                  myNavigator.bringPageTop('service-manager.html');
                },6 * loadDelay);
              }
            }
        });
    } else {
      osr.doeAktie("text",'set/present/' + encodeURI(dezeSet) + '/display:' + n);
      setTimeout(function() {
        myNavigator.bringPageTop('service-manager.html');
      },3 * loadDelay);
    }
    //console.groupEnd();
}

osr.presentStop= function () {
    //console.log('start presentStop,  cuurentMode ',currentMode);
    if (currentMode != 'X') {
      osr.doeAktie("text",'presentation/close');
    } else {
      ons.notification.alert('er loopt geen presentatie ');
    }
}

osr.showSet= function() {
// console.groupCollapsed('start showSet');
 var dropdown = document.getElementById('search-sets').firstChild;
 if (dropdown.length <= 1) {
      document.getElementById('sets-status').innerText = 'Even geduld, lijst wordt opgehaald...';
    lastUrl = "set/list/";
    fetch(osrCurrentHostUrl + lastUrl)
        .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
    }).then(function(text) {
          osr.processSetList(text);
    }).catch(function(error) {
          //console.log(error);
          ons.notification.alert('1238- fetch set list error '+ error);
    });
  }
  //console.groupEnd();
}

osr.addSong = function() {
  //console.log('start add song');
  var map = document.getElementById("search-folders").firstChild.value;
  var lied = document.getElementById("search-songs").firstChild.value;
  if ((map != '') && (lied != '')) {
    var verzen  = document.getElementById("song-verses").value;
    if (openSongVersie < 3) {
      // moet spaties tussen de verzen
      verzen = verzen.trim();
    } else {
      // moet komma's tussen de verzen
      verzen = verzen.trim().replace(/ /gi,",");
    }
    //console.log('lied toevoegen ',map,'/',lied,': ',verzen);
    var naLied = document.getElementById("after-song").firstChild.value;
    lastUrl = 'presentation/slide/song/folder:'
                  + encodeURI(map) + '/song:' + encodeURI(lied)
                  + '/after:' + naLied
                  + '/order:' + encodeURI(verzen);
    osr.doeAktie("text",lastUrl);
    if (openSongVersie < 3) {
       /* opensong geeft geen status update (bug!) na remote song insert
        * daarom forceren we een reload */
      currentSlide = -1; currentSectie = -1; totalSlides = -1; playList = '';
    }
    ons.notification.toast(i18next.t('song.insert2') + ' ' + lied + ': ' + verzen, {
        timeout: 3000
    });
  }
  //console.log('einde add song');
}

osr.processSong = function(deze) {
  //console.log('start process song');
  // moet firstchild doen omdat onsen er een geneste select in zet
  var xSong = new DOMParser().parseFromString(deze,"text/xml");
  //console.log('xmlSong ',xSong);
  var songTitel = xSong.getElementsByTagName('title')[0].childNodes[0].nodeValue;
  document.getElementById('song-titel').innerHTML = songTitel;
  var songVolgorde = xSong.getElementsByTagName('presentation')[0].childNodes[0].nodeValue;
  document.getElementById('song-verses').value = songVolgorde;
  var songTekst = xSong.getElementsByTagName('lyrics')[0].childNodes[0].nodeValue;
  document.getElementById('song-lyrics').innerText = songTekst;
  document.getElementById('search-status').innerHTML = '';
  //console.log('einde process song');
}

osr.selectSong = function(event) {
 //console.log('start select song ',event);
 var lied = document.getElementById("search-songs").firstChild.value;
 if ((lied) && (lied != 'blank')) {
 //console.log('start select song ',lied);
  var map = document.getElementById("search-folders").firstChild.value;
  //var map = document.getElementById("search-folders").value;
  //console.log('select map ',map,' song ',lied);
  document.getElementById('search-status').innerHTML = 'Even geduld, lied wordt opgehaald...';
  //document.getElementById('song-name').innerHTML = map + ' / ' + lied;
  lastUrl = "song/detail/" + encodeURI(lied) + "/folder:" + encodeURI(map)
  fetch(osrCurrentHostUrl + lastUrl)
        .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
  }).then(function(text) {
          osr.processSong(text);
  }).catch(function(error) {
          console.log(error);
          ons.notification.alert('1254- fetch song error '+ error);
  });
 }
 //console.log('einde select song');
}

osr.filterSong = function(deze) {
//  console.log('start filter song');
  var deze = -1;
  var keyword = document.getElementById("search-filter").value;
  var select = document.getElementById("search-songs").firstChild;
  //var select = document.getElementById("search-songs");
  for (var i = 1; i < select.length; i++) {
     var txt = select.options[i].text;
     //if (txt.substring(0, keyword.length).toLowerCase() !== keyword.toLowerCase() && keyword.trim() !== "") {
     if (txt.toLowerCase().includes(keyword.toLowerCase()) || keyword.trim() === "") {
       select.options[i].style.display = 'list-item';
       if (deze < 0) {deze = i; }
     } else {
       select.options[i].style.display = 'none';
     }
  }
  i
  //select.selectedIndex = deze;
  select.selectedIndex = 0;
  //osr.selectSong(deze);
  //console.log('einde filter song');
}

osr.processSongFolder = function(deze) {
  //console.log('start process song folder');
  // moet firstchild doen omdat onsen er een geneste select in zet
  var dropdown = document.getElementById('search-songs').firstChild;
  //var dropdown = document.getElementById('search-songs');
  dropdown.length = 0;
  var map = document.getElementById("search-folders").firstChild.value;
  //console.log('fetch song folder '+ map);
  var opt = document.createElement('option');
  opt.value = 'blank';
  opt.innerText = i18next.t('song.choose2') + map;
  dropdown.appendChild(opt);
  var xSong = new DOMParser().parseFromString(deze,"text/xml");
  var songs = xSong.getElementsByTagName("song");
  for (var i = 0; i < songs.length; i++) {
    //console.log('song i ',songs[i]);
    var songName = songs[i].getAttribute('name');
    var ext = songName.split('.').pop();
    //if (ext !== '') {console.log('ext ',ext); }
    // opensong toont alle bestanden in dir, ook plaatjes
    if ((songName != '') && (ext != 'jpg')) {
      var opt = document.createElement('option');
      opt.value = songName;
      opt.onclick=function() { osr.selectSong(this); };
      opt.innerText = songName;
      dropdown.appendChild(opt);
    }
  }
  document.getElementById('search-filter').value="" ;
  // search status spatie inzetten, anders nemet de div wel of niet ruimte in
  document.getElementById('search-status').innerHTML = '';
  //console.log('einde process song folder');
}

osr.selectFolder = function(event) {
 var map = event.target.value;
 if (map != 'blank') {
  //console.log('select song folder ',map);
  document.getElementById('search-status').innerHTML = 'Even geduld, lijst wordt opgehaald...';
  //document.getElementById('song-name').innerHTML = '&nbsp;';
  document.getElementById('song-titel').innerHTML = '&nbsp;';
  document.getElementById('song-verses').value = '';
  lastUrl = "song/list/folder:" + encodeURI(map);;
  fetch(osrCurrentHostUrl + lastUrl)
        .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
  }).then(function(text) {
          osr.processSongFolder(text);
  }).catch(function(error) {
          console.log(error);
          ons.notification.alert('1323- fetch song folder error '+ error);
  });
 }
}

osr.processSongDir = function(deze) {
  //console.log('start process song dir');
  // moet firstchild doen omdat onsen er een geneste select in zet
  var dropdown = document.getElementById('search-folders').firstChild;
  //var dropdown = document.getElementById('search-folders');
  dropdown.length = 0;
  var opt = document.createElement('option');
  opt.value = 'blank';
  opt.innerText = i18next.t('song.choose1');
  dropdown.appendChild(opt);
  var xFolder = new DOMParser().parseFromString(deze,"text/xml");
  var folders = xFolder.getElementsByTagName("folder");
  for (var i = 0; i < folders.length; i++) {
    //console.log('folder i ',folders[i]);
      var folderName = folders[i].getAttribute('name');
      if ((folderName != '') && (folderName.substr(0,1) != '(')) {
        var opt = document.createElement('option');
        opt.value = folderName;
        opt.innerText = folderName;
        dropdown.appendChild(opt);
      }
  }
  document.getElementById('search-status').innerHTML = '';
  //console.log('einde process song dir');
}

osr.showSongDirs = function() {
 //console.log('get song dirs ');
 // eerst insert after vullen
 var after = document.getElementById('after-song').firstChild;
 after.length = 0;
 var slides = playList.getElementsByTagName("slide");
 var vorige = '';
 for (var i = 0; i < slides.length; i++) {
    var slideId = slides[i].getAttribute('identifier');
    var soort = slides[i].getAttribute('type');
    if ((slideId) && (soort !== 'style')) {
      var name = slides[i].getAttribute('name');
    //console.log('1421- slideno ',slideId,'; naam: ',name,'; vorige: ',vorige);
      if ((name !== vorige) && (vorige !== '')) {
        var opt = document.createElement('option');
        opt.value = slideId;
        opt.innerText = vorige;
        after.appendChild(opt);
      }
      vorige = name;
    }
 }
 //var dropdown = document.getElementById('search-folders');
 var dropdown = document.getElementById('search-folders'),firstChild;
 if (dropdown.length <= 1) {
    document.getElementById('search-status').innerHTML = 'Even geduld, lijst wordt opgehaald...';
    lastUrl = "song/folders/";
    fetch(osrCurrentHostUrl + lastUrl)
        .then(function(response) {
          if (!response.ok) {
              throw Error(response.statusText);
          }
          return response.text();
    }).then(function(text) {
          osr.processSongDir(text);
    }).catch(function(error) {
          //console.log(error);
          ons.notification.alert('1250- fetch song folders error '+ error);
    });
  }
}

osr.rangeChanged = function(deze) {
  //console.log('start rangeChanged ',deze.id);
  switch (deze.id) {
      case 'loadDelay':
        //console.log('ajaxDelay is nu ',deze.value);
        loadDelay = (loadDelayBase * deze.value) + Math.round(Math.random() * 50);
        localStorage["osrLoadDelay"] = deze.value;   // msec delay voor laden slides en afvoeren akties
        break;
      case 'screenSize':
        console.log('screenSize is nu ',deze.value);
        localStorage["osrtekstSize"] = deze.value;
        break;
  }
}

document.addEventListener('show', function(event) {
  var page = event.target;
  if (page.id != '') {
    //console.log('show event: ',page.id);
    content=document.getElementById('myNavigator');
    switch(page.id) {
      case 'service-manager':
        if (currentSectie >= 0) {
          osr.loadController(currentSectie);
        }
        var deze = document.querySelector('[data-sectie="' + parseInt(currentSectie,10) +'"]');
        /* expand huidige sectie */
        if ((deze) && (! deze.expanded)) {
          deze.showExpansion();
        }
        var deze = document.querySelector('[data-slide="' + parseInt(currentSlide,10) +'"]');
        if (deze) {
          deze.scrollIntoView({ behavior: 'smooth', block: 'center'});
          deze.style.borderLeft='8px solid ' + osrThemeColor;
        }
        if (ons.platform.isAndroid()) {
          document.documentElement.requestFullscreen();
        }
        break;
      case 'remote-screen':
        osr.showRemoteScreen();
        if (ons.platform.isAndroid()) {
          document.documentElement.requestFullscreen();
        }
        break;
      case 'presentatie':
        osr.showSet();
        break;
      case 'search':
        osr.showSongDirs();
        break;
      case 'setup':
        // reset active host
        var hostlist = document.getElementById('OsHosts').children;
        if (hostlist.length > 0) {
          for (var i = 0; i < hostlist.length; i++) {
            if (i == currentHost) {
              hostlist[i].style.borderLeft = '8px solid ' + osrThemeColor;
            } else {
              hostlist[i].style.borderLeft = '';
            }
          }         
        }
        break;
      default:
        if (ons.platform.isAndroid()) {
          document.exitFullscreen();
        }
    }
  }
},false);

document.addEventListener('hide', function(event) {
  var page = event.target;
  if (page.id != '') {
    //console.log('hide event: ',page.id);
    content=document.getElementById('myNavigator');
    switch(page.id) {
      case 'service-manager':
        // eventuele highlight verbergen
        var vorige = document.querySelector('[data-sectie="' + parseInt(currentSectie,10) +'"]');
        if (vorige) {
          vorige.style.borderLeft='';
          if (vorige.expanded) {
            vorige.hideExpansion();
          }
        }
        var vorige = document.querySelector('[data-slide="' + parseInt(currentSlide,10) +'"]');
        if (vorige) {
          vorige.style.borderLeft='';
        }
        break;
      case 'remote-screen':
        break;
    }
  }
},false);

document.addEventListener('init', function(event) {
  var page = event.target;
  //console.log('init event: ',page);
  if (page.id != '') {
    content=document.getElementById('myNavigator');
    //console.log('topPage ',content.topPage.id);
    switch(page.id) {
      case 'service-manager':
        document.getElementById('service-titel').innerText=i18next.t('nav.admin');
        document.getElementById('service-previous').innerText=i18next.t('state.left');
        document.getElementById('service-next').innerText=i18next.t('state.right');
        osr.getStatus();
        break;
      case 'presentatie':
        document.getElementById('present-searchP').innerText=i18next.t('nav.searchP');
        document.getElementById('present-head1').innerText=i18next.t('search.sets');
        document.getElementById('sets-status').innerText=i18next.t('search.wait');
        document.getElementById('sets-screen1').innerText=i18next.t('setup.mode1');
        document.getElementById('sets-screen2').innerText=i18next.t('setup.mode2');
        document.getElementById('set-show').innerText=i18next.t('search.stopshow');
        break;
      case 'search':
        document.getElementById('search-head1').innerText=i18next.t('nav.searchL');
        document.getElementById('search-head2').innerText=i18next.t('song.head2');
        document.getElementById('search-after').innerText=i18next.t('song.after');
        document.getElementById('song-verses-label').innerText=i18next.t('song.setverse');
        document.getElementById('song-show').innerText=i18next.t('song.insert1');
        break;
      case 'setup':
        osr.refreshHostList();
        osr.thema(localStorage['osrTheme']);
        var d = localStorage["osrRemote"];
        switch (d) {
          case 'c':
            document.getElementById('lblRemote1').checked = true;
            break;
          default:
            document.getElementById('lblRemote2').checked = true;
            break;
        }
        break;
      case 'info':
        document.getElementById('info1').innerText=i18next.t('info.line1');
        document.getElementById('info2').innerText=i18next.t('info.line2');
        document.getElementById('info3').innerText=i18next.t('info.line3');
        document.getElementById('info4').innerText=i18next.t('info.line4');
        document.getElementById('info5').innerText=i18next.t('info.line5');
        document.getElementById('info6').innerHTML=i18next.t('info.line6');
        document.getElementById('info7').innerText=i18next.t('info.line7');
        document.getElementById('info8').innerText=i18next.t('info.line8');
        break;
      default:
    }
  }
},false);

document.addEventListener('preshow', function(event) {
  var dialogId = event.target.id;
  //console.log('preshow dialog: ',dialogId,' currentHost ',currentHost);
    switch(dialogId) {
      case 'setup':
        break;
      case 'EditHost':
        document.getElementById('ehTitel').innerText=i18next.t('setup.hosttitel');
        document.getElementById('ehName').setAttribute('placeholder',i18next.t('nav.info'));
        document.getElementById('ehIP').setAttribute('placeholder',i18next.t('setup.host'));
        document.getElementById('ehPort').setAttribute('placeholder',i18next.t('setup.port'));
        document.getElementById('ehPassword').setAttribute('placeholder',i18next.t('setup.ww'));
        document.getElementById('ehCancel').innerText=i18next.t('nav.cancel');
        document.getElementById('ehSave').innerText=i18next.t('nav.save');
        break;
      case 'popupWarning':
        document.getElementById('alert-head1').innerText=i18next.t('alert.alert');
        document.getElementById('clearWarn').innerText=i18next.t('alert.hide');
        document.getElementById('setWarn').innerText=i18next.t('alert.show');
        break;
    }
},false);

document.addEventListener('postshow', function(event) {
  var dialogId = event.target.id;
  //console.log('postshow dialog: ',dialogId,' currentHost ',currentHost);
    switch(dialogId) {
      case 'service-manager':
        osr.showService();
        break;
      case 'EditHost':
        if (currentHost >= 0) {
          document.getElementById('ehName').value = osrNames[currentHost];
          document.getElementById('ehIP').value = osrHosts[currentHost];
          document.getElementById('ehPort').value = osrPorts[currentHost];
          document.getElementById('ehPassword').value = osrWWs[currentHost];
        } else {
          document.getElementById('ehName').value = '';
          document.getElementById('ehIP').value = '';
          document.getElementById('ehPort').value = '8082';
          document.getElementById('ehPassword').value = '';
        }
        break;
    }
},false);

document.addEventListener('keyup', function(event) {
  //console.log('key ',event.keyCode);
  switch (event.keyCode) {
    case 37:
      // arrow left
          osr.doeAktie("text","presentation/section/previous");
      break;
    case 33:
    case 38:
      // pageup, arrow up
          osr.doeAktie("text","presentation/slide/previous");
      break;
    case 39:
      // key right
          osr.doeAktie("text","presentation/section/next");
      break;
    case 32:
    case 34:
    case 40:
      // space, page down, arrow down
          osr.doeAktie("text","presentation/slide/next");
      break;
  }
}, true);