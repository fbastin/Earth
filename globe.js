/* ---------- vue « Globe 3D » ----------
   Un globe WebGL fait de tuiles d'images à plusieurs niveaux de détail, posées sur un maillage qui suit le relief.
   Tout est servi par le site lui-même : tiles/ (images), data/ (relief, lignes, lieux). Voir tools/build_assets.py.
   Repère : la Terre est une sphère de rayon 1 ; x pointe vers (0° N, 0° E), y vers le pôle Nord, -z vers 90° E. */
(function(){
"use strict";
var Site=window.Site;
function $(id){return document.getElementById(id)}
var stage=$('gstage'), glc=$('gl'), lbc=$('glabels');
if(!stage||!Site) return;

var DEG=Math.PI/180, TAU=2*Math.PI, RKM=6371.0088, FOV=30*DEG, TANV=Math.tan(FOV/2);
var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var coarse=window.matchMedia&&matchMedia('(pointer: coarse)').matches;
function clamp(x,a,b){return x<a?a:x>b?b:x}
function wrap180(x){x=(x+180)%360; if(x<0) x+=360; return x-180;}
function pad(n){return (n<10?'0':'')+n}

/* ---------- textes ---------- */
var li=0;
var EN={
  gH1:"Explore Earth in 3D",
  gAria:"Interactive globe. Arrow keys to move, plus and minus to zoom.",
  gPh:"City, country or coordinates", gSearchAria:"Search for a place", gPlaces:"Places", gToolbar:"Navigation",
  gLayersT:"Layers and settings", gNorthT:"Put north back at the top", gInT:"Zoom in", gOutT:"Zoom out", gTiltT:"Tilt the view",
  gHomeT:"Back to the whole Earth", gMeasureT:"Measure a distance", gFullT:"Full screen",
  gLBorders:"Borders and coastlines", gLNames:"Place names", gLGrid:"Meridians and parallels", gLCircles:"Tropics and polar circles", gLEquator:"Equator", jShow:"Show on the globe",
  gLRelief:"Exaggerated relief", gModeL:"Level of detail", gModeLight:"Light", gModeStd:"Standard", gModeFull:"Full", gLSun:"Day and night", gLDate:"Date", gLHour:"Time (UTC)", gNow:"Now",
  gH2:"Places to explore",
  gHelp1:"<b>Move.</b> Drag the globe. On a keyboard, use the arrow keys.",
  gHelp2:"<b>Zoom.</b> Scroll wheel, two-finger pinch or double-click.",
  gHelp3:"<b>Tilt and rotate.</b> Right-click or Shift + drag; on a touch screen, two fingers sliding up or twisting.",
  gHelp4:"<b>Measure.</b> Turn on the ruler, then click two or more points: the distance follows Earth's curvature.",
  gFoot:"Imagery: NASA Blue Marble (day) and Black Marble 2016 (night), about 1 km per pixel at the finest. Relief: NOAA ETOPO2, smoothed to 14 km, so displayed elevations are approximate and summits somewhat flattened. Coastlines, borders and major cities: Natural Earth. Other towns, villages and hamlets, provinces and states: GeoNames (CC BY 4.0). Borders are indicative."
};
var EN_J={
  jH1:"Why is there day, then night?",
  jLede:"Because Earth is a ball that <b>spins on itself</b> in front of the Sun. At every moment one half is lit and the other is in shadow. In one turn, every place passes from one to the other.",
  j1h:"One half lit, one half in shadow",
  j1p:"The Sun lights only one side of the globe. On that side it is day. On the other it is night, and city lights can be seen shining. The boundary between the two is called the terminator.",
  j2h:"Earth spins on itself",
  j2p:"It makes one turn in 24 hours, from west to east, around the axis that runs through both poles (the white line). This axis is tilted by 23.4° relative to its orbit around the Sun, and the globe is shown that way. Here the camera stays fixed relative to the Sun: the light does not move, the continents slide past and go in turn from day to night.",
  j3h:"Follow a city",
  j3p:"Pick a city and watch it turn with the Earth. When it crosses the boundary into the light, the Sun rises there; when it goes back into shadow, the Sun sets. Because nobody feels this motion, it looks as if the Sun were crossing the sky.",
  j4h:"Noon here, midnight on the other side",
  j4p:"This time the camera turns with the Earth, as we do. The small sun marks the place where it is exactly noon. It moves 15° of longitude per hour, 360° in 24 hours. On the opposite side of the globe it is midnight. That is why the time differs from one country to another.",
  j5h:"Longer days in summer",
  j5p:"Earth's axis is tilted by 23.4°. On June 21 the North Pole leans toward the Sun: in the north, every city spends more time in the light than in shadow, and beyond the Arctic Circle the Sun no longer sets. On December 21 it is the reverse. At the equinoxes, day and night last 12 hours everywhere. The <a class=\"inline\" href=\"#saisons\" data-view=\"saisons\">Seasons</a> view explains this mechanism.",
  jqL:"Or type the city to follow", jqPh:"Sherbrooke, Nairobi, Lima…", jViewL:"View", jViewEcl:"Axis tilted by 23.4°", jViewNorth:"Axis upright",
  jToday:"Today", jSpeedL:"Speed", gLAxis:"Rotation axis",
  jD1:"June 21", jD2:"December 21", jD3:"March 20", jGo:"Show on the globe",
  jMh:"What day and night are not",
  jM1:"<b>The Sun does not go around the Earth.</b> It seems to rise in the east and set in the west because we turn with the ground, from west to east.",
  jM2:"<b>Night is not caused by the Moon or by clouds.</b> Nothing hides the Sun: we are simply on the side of the Earth that faces away from it.",
  jM3:"<b>Day and night are not the seasons.</b> One turn of the Earth on itself takes 24 hours and gives day and night. One trip around the Sun takes a year and, with the tilted axis, gives the seasons.",
  jFoot:"Sun position computed to within a fraction of a degree. The boundary between day and night is drawn with a twilight band; atmospheric refraction is not taken into account. Times are in Universal Time (UTC)."
};
for(var ek in EN) Site.EN[ek]=EN[ek];
for(ek in EN_J) Site.EN[ek]=EN_J[ek];
var D={
  noGL:["La 3D (WebGL) est indisponible ici. Vérifiez que l'accélération graphique du navigateur est activée, ou ouvrez la page dans un autre navigateur. La vue Saisons fonctionne sans.","3D (WebGL) is unavailable here. Check that the browser's graphics acceleration is turned on, or open the page in another browser. The Seasons view works without it."],
  mLight:["Images à 4 km par pixel, villes de plus de 5 000 habitants, sans relief. Moins de 10 Mo à charger.","Imagery at 4 km per pixel, towns over 5,000 inhabitants, no relief. Under 10 MB to load."],
  mStd:["Images à 2 km par pixel, localités de plus de 1 000 habitants, relief. Jusqu'à 40 Mo.","Imagery at 2 km per pixel, places over 1,000 inhabitants, relief. Up to 40 MB."],
  mFull:["Images à 1 km par pixel, tous les villages et hameaux connus, relief, affichage le plus net. Jusqu'à 110 Mo.","Imagery at 1 km per pixel, every known village and hamlet, relief, sharpest display. Up to 110 MB."],
  softNote:["rendu simplifié, sans carte graphique","simplified rendering, no graphics card"],
  glErr:["Le rendu 3D n'a pas pu démarrer sur cette carte graphique.","3D rendering could not start on this graphics card."],
  loading:["Chargement du globe…","Loading the globe…"],
  noData:["Les images du globe n'ont pas pu être chargées. Rechargez la page.","The globe imagery could not be loaded. Reload the page."],
  lost:["L'affichage 3D s'est interrompu. Rechargez la page.","The 3D display stopped. Reload the page."],
  elev:["altitude ≈ {0} m","elevation ≈ {0} m"], depth:["profondeur ≈ {0} m","depth ≈ {0} m"],
  eye:["vue de {0} km d'altitude","eye altitude {0} km"], ex:["relief × {0}","relief × {0}"],
  country:["pays","country"], city:["ville","city"], capital:["capitale","capital"], coords:["coordonnées","coordinates"],
  goto:["Aller à {0}","Go to {0}"], none:["Aucun lieu trouvé. Essayez une ville, un pays ou « 45,5 N 73,6 O ».","No place found. Try a city, a country or “45.5 N 73.6 W”."],
  m0:["Cliquez un premier point sur le globe.","Click a first point on the globe."],
  m1:["Cliquez un deuxième point.","Click a second point."],
  mD:["<b>{0} km</b> en suivant la courbure de la Terre{1}. Cliquez pour prolonger le trajet.","<b>{0} km</b> along Earth's curvature{1}. Click to extend the path."],
  mSeg:[" ({0} segments)"," ({0} segments)"],
  sunTxt:["Soleil au zénith à {0}. Il est midi solaire sur ce méridien.","The Sun is overhead at {0}. It is solar noon on that meridian."],
  zenith:["Soleil au zénith","Sun overhead"],
  turn:["un tour en {0}","one turn in {0}"], secs:["{0} s","{0} s"], mins:["{0} min","{0} min"],
  jPlay:["▶ Lancer","▶ Play"], jPause:["❚❚ Pause","❚❚ Pause"],
  jUp:["<b>{0}</b> : le Soleil est à {1}° au-dessus de l'horizon. Il fait jour.","<b>{0}</b>: the Sun is {1}° above the horizon. It is daytime."],
  jTw:["<b>{0}</b> : le Soleil vient de passer sous l'horizon ({1}°). C'est le crépuscule ou l'aube.","<b>{0}</b>: the Sun is just below the horizon ({1}°). It is dusk or dawn."],
  jDown:["<b>{0}</b> : le Soleil est à {1}° sous l'horizon. Il fait nuit.","<b>{0}</b>: the Sun is {1}° below the horizon. It is night."],
  jNoon:["Il est midi solaire sur le méridien {0}, et minuit sur le méridien {1}.","It is solar noon on the {0} meridian and midnight on the {1} meridian."],
  spin:["▶ 24 h","▶ 24 h"], spinStop:["❚❚ Pause","❚❚ Pause"],
  eq:["Équateur","Equator"], tc:["Tropique du Cancer","Tropic of Cancer"], tp:["Tropique du Capricorne","Tropic of Capricorn"],
  ac:["Cercle arctique","Arctic Circle"], aa:["Cercle antarctique","Antarctic Circle"]
};
var MONTHS=[['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
            ['January','February','March','April','May','June','July','August','September','October','November','December']];
var MLEN=[31,28,31,30,31,30,31,31,30,31,30,31];
function t(k){return D[k][li]}
function tf(k){var s=D[k][li]; for(var a=1;a<arguments.length;a++) s=s.replace('{'+(a-1)+'}',arguments[a]); return s;}
function nf(x,n){return x.toLocaleString(li?'en-US':'fr-FR',{minimumFractionDigits:n,maximumFractionDigits:n})}
function coordStr(lat,lon,n){
  if(n===undefined) n=2;
  return nf(Math.abs(lat),n)+'° '+(lat>=0?'N':'S')+'  '+nf(Math.abs(lon),n)+'° '+(lon>=0?'E':(li?'W':'O'));
}
function lonStr(lon){return nf(Math.abs(lon),0)+'° '+(lon>=0?'E':(li?'W':'O'));}
function dateStr(di){var m=0; while(m<11&&di>=MLEN[m]){di-=MLEN[m]; m++;} var d=di+1; return li?MONTHS[1][m]+' '+d:(d===1?'1er':d)+' '+MONTHS[0][m];}
function hourStr(h){var hh=Math.floor(h+1e-9), mm=Math.round((h-hh)*60); if(mm>=60){hh++;mm=0;} return li?pad(hh)+':'+pad(mm)+' UTC':hh+' h '+pad(mm)+' UTC';}
function fold(s){
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ø/g,'o').replace(/œ/g,'oe').replace(/æ/g,'ae').replace(/ß/g,'ss')
    .replace(/[-'’.,()]/g,' ').replace(/\s+/g,' ').trim();
}

/* Grands repères écrits à la main : [latitude, longitude, français, anglais] */
var OCEANS=[[24,-158,"Océan Pacifique","Pacific Ocean"],[-28,-125,"Océan Pacifique","Pacific Ocean"],[31,-42,"Océan Atlantique","Atlantic Ocean"],
  [-24,-14,"Océan Atlantique","Atlantic Ocean"],[-24,78,"Océan Indien","Indian Ocean"],[84,-150,"Océan Arctique","Arctic Ocean"],
  [-61,95,"Océan Austral","Southern Ocean"],[-63,-115,"Océan Austral","Southern Ocean"]];
var SEAS=[[35,18.5,"Mer Méditerranée","Mediterranean Sea"],[15,-75,"Mer des Caraïbes","Caribbean Sea"],[25,-90,"Golfe du Mexique","Gulf of Mexico"],
  [13,114,"Mer de Chine méridionale","South China Sea"],[16,64,"Mer d'Arabie","Arabian Sea"],[14,89,"Golfe du Bengale","Bay of Bengal"],
  [60,-85,"Baie d'Hudson","Hudson Bay"],[56,3,"Mer du Nord","North Sea"],[43.3,34.5,"Mer Noire","Black Sea"],[41.5,51,"Mer Caspienne","Caspian Sea"],
  [20,38.5,"Mer Rouge","Red Sea"],[58,-178,"Mer de Béring","Bering Sea"],[40,135,"Mer du Japon","Sea of Japan"],[-39,160,"Mer de Tasman","Tasman Sea"],
  [-17,155,"Mer de Corail","Coral Sea"],[1,3,"Golfe de Guinée","Gulf of Guinea"],[58,19.8,"Mer Baltique","Baltic Sea"],[74,38,"Mer de Barents","Barents Sea"],
  [57,-146,"Golfe d'Alaska","Gulf of Alaska"],[72,-66,"Baie de Baffin","Baffin Bay"],[-15,42,"Canal du Mozambique","Mozambique Channel"]];
var CONTS=[[8,22,"Afrique","Africa"],[50,16,"Europe","Europe"],[47,90,"Asie","Asia"],[47,-102,"Amérique du Nord","North America"],
  [-12,-58,"Amérique du Sud","South America"],[-24,134,"Océanie","Oceania"],[-82,60,"Antarctique","Antarctica"]];
/* Visites : [latitude, longitude, distance (rayons terrestres), inclinaison°, cap°, nom fr, nom en, légende fr, légende en] */
var TOURS=[
  [30,84,0.36,58,0,"Himalaya","Himalayas","<b>Himalaya.</b> La plaque indienne pousse contre l'Asie depuis 50 millions d'années et soulève la plus haute chaîne du monde. L'Everest atteint 8 849 m.","<b>Himalayas.</b> The Indian plate has been pushing into Asia for 50 million years, raising the highest range on Earth. Everest reaches 8,849 m."],
  [-21,-69,0.42,58,80,"Andes","Andes","<b>Cordillère des Andes.</b> La plaque de Nazca plonge sous l'Amérique du Sud. Résultat : 7 000 km de montagnes, la plus longue chaîne émergée.","<b>The Andes.</b> The Nazca plate dives beneath South America. The result is 7,000 km of mountains, the longest range on land."],
  [46,9.5,0.14,55,0,"Alpes","Alps","<b>Alpes.</b> Elles sont nées de la rencontre de l'Afrique et de l'Europe. Le mont Blanc culmine à 4 806 m.","<b>The Alps.</b> They rose where Africa met Europe. Mont Blanc peaks at 4,806 m."],
  [29.5,31,0.13,0,0,"Vallée du Nil","Nile valley","<b>Le Nil.</b> Un ruban vert de 6 650 km dans le désert : presque toute la population de l'Égypte vit le long du fleuve et dans son delta.","<b>The Nile.</b> A green ribbon 6,650 km long across the desert: almost all of Egypt's population lives along the river and in its delta."],
  [22,9,0.75,0,0,"Sahara","Sahara","<b>Sahara.</b> Le plus grand désert chaud du monde couvre 9 millions de km², presque la surface des États-Unis.","<b>Sahara.</b> The largest hot desert on Earth covers 9 million km², nearly the area of the United States."],
  [-3,-60,0.5,0,0,"Amazonie","Amazon","<b>Amazonie.</b> La plus grande forêt tropicale. L'Amazone y transporte à lui seul près d'un cinquième de l'eau douce que les fleuves apportent aux océans.","<b>The Amazon.</b> The largest tropical forest. The Amazon River alone carries nearly a fifth of all the fresh water that rivers bring to the oceans."],
  [65,-18.5,0.11,0,0,"Islande","Iceland","<b>Islande.</b> L'île est posée sur la dorsale médio-atlantique : l'Amérique du Nord et l'Eurasie s'y écartent d'environ 2 cm par an.","<b>Iceland.</b> The island sits on the Mid-Atlantic Ridge, where North America and Eurasia drift apart by about 2 cm a year."],
  [-3,35.5,0.3,50,0,"Rift est-africain","East African Rift","<b>Rift est-africain.</b> L'Afrique se déchire ici en deux plaques. Les grands lacs et le Kilimandjaro (5 895 m) jalonnent la fracture.","<b>East African Rift.</b> Africa is splitting into two plates here. The great lakes and Kilimanjaro (5,895 m) line the fracture."],
  [36,-5.5,0.07,0,0,"Gibraltar","Gibraltar","<b>Détroit de Gibraltar.</b> Quatorze kilomètres séparent l'Europe de l'Afrique et relient l'Atlantique à la Méditerranée.","<b>Strait of Gibraltar.</b> Fourteen kilometres separate Europe from Africa and link the Atlantic to the Mediterranean."],
  [47.6,-70.2,0.13,0,0,"Saint-Laurent","St. Lawrence","<b>Fleuve Saint-Laurent.</b> Il vide les Grands Lacs dans l'Atlantique par l'un des plus vastes estuaires du monde.","<b>St. Lawrence River.</b> It drains the Great Lakes into the Atlantic through one of the largest estuaries in the world."],
  [-18,147,0.22,0,0,"Grande Barrière","Great Barrier Reef","<b>Grande Barrière de corail.</b> Le plus grand ensemble corallien du monde longe l'Australie sur 2 300 km.","<b>Great Barrier Reef.</b> The largest coral reef system on Earth runs along Australia for 2,300 km."],
  [-84,0,1.25,0,0,"Antarctique","Antarctica","<b>Antarctique.</b> Une calotte de glace épaisse de 2 km en moyenne recouvre le continent. Elle contient la majeure partie de l'eau douce de la planète.","<b>Antarctica.</b> An ice sheet 2 km thick on average covers the continent. It holds most of the planet's fresh water."]
];

var JCITIES=[["Montréal","Montreal",45.5,-73.57],["Paris","Paris",48.86,2.35],["Dakar","Dakar",14.7,-17.45],["Tokyo","Tokyo",35.68,139.69],["Sydney","Sydney",-33.87,151.21],["Quito","Quito",-0.18,-78.47]];

/* ---------- niveaux de détail ----------
   maxL : niveau d'images le plus fin ; rank : rang maximal des localités (10 = 5 000 hab., 11 = 1 000, 13 = 100, 14 = hameaux) ;
   elev : relief ; dpr : pixels d'écran par point ; mem : mémoire d'images (Mo). */
var MODES={light:{maxL:1,rank:10,elev:false,dpr:1,mem:110,txt:'mLight'},
           std:{maxL:2,rank:11,elev:true,dpr:1.5,mem:260,txt:'mStd'},
           full:{maxL:3,rank:14,elev:true,dpr:2,mem:460,txt:'mFull'}};
var mode='full', M=MODES.full;

/* ---------- choix mémorisés ----------
   Les réglages du globe et ceux de la leçon sont gardés dans le navigateur : on les retrouve en changeant d'onglet
   comme en rouvrant la page. Sans stockage disponible, tout fonctionne avec les valeurs par défaut. */
var PREF_KEY='terre-choix', SHOWN=['axis','equator','circles','grid','borders','names'];
var prefs={globe:{borders:true,names:true,grid:false,equator:false,circles:false,axis:false,sun:false,ex:10,mode:''},
           lesson:{step:0,day:null,speed:3,ecl:true,city:0,place:null,show:{axis:true,equator:true,circles:false,grid:false,borders:true,names:true}}};
(function(){
  try{
    var d=JSON.parse(localStorage.getItem(PREF_KEY)||'null'); if(!d) return;
    ['globe','lesson'].forEach(function(g){ if(d[g]) for(var k in prefs[g]) if(d[g][k]!==undefined&&typeof d[g][k]===typeof prefs[g][k]||(prefs[g][k]===null&&d[g][k]!==undefined)) prefs[g][k]=d[g][k]; });
    var L=prefs.lesson; L.step=clamp(L.step|0,0,4); L.speed=clamp(L.speed|0,0,6);
    if(L.day!==null) L.day=clamp(L.day|0,0,364);
    if(L.place&&!(typeof L.place.lat==='number'&&typeof L.place.lon==='number'&&L.place.n&&L.place.n.length===2)){L.place=null;}
    if(!(L.city>=0&&L.city<6)) L.city=L.place?-1:0;
    prefs.globe.ex=clamp(prefs.globe.ex|0,1,30);
    if(!MODES[prefs.globe.mode]) prefs.globe.mode='';
  }catch(e){}
})();
function savePrefs(){
  var o=lesson.on?prefs.lesson.show:prefs.globe;
  SHOWN.forEach(function(k){o[k]=lesson.on&&lesson.auto[k]?false:opt[k];});      /* ce qu'une étape a allumé n'est pas un choix */
  if(lesson.on){
    var L=prefs.lesson; L.step=lesson.step; L.day=lesson.today?null:sunSt.day; L.speed=Math.max(0,SPEEDS.indexOf(speed)); L.ecl=lesson.ecl; L.city=lesson.city; L.place=lesson.place;
  } else { prefs.globe.sun=opt.sun; if(!soft) prefs.globe.ex=opt.ex; }
  prefs.globe.mode=modeChosen?mode:'';
  try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs));}catch(e){}
}

/* ---------- état ---------- */
var lesson={on:false,step:0,follow:null,elev:0.14,ecl:true,city:0,place:null,day:null,today:true,saved:null,auto:{}};
var cam={lat:22,lon:8,range:3.4,heading:0,tilt:0};
var opt={borders:true,names:true,grid:false,equator:false,circles:false,axis:false,ex:10,sun:false};
var SPEEDS=[0.1,0.25,0.5,1,2,4,8], speed=1;      /* heures simulées par seconde */
var soft=false, modeChosen=false;
var sunSt={day:171,hour:12,playing:false};
var dirty=true, inited=false, gl=null, frameNo=0, lastT=0;
var eye=[0,0,0], fwd=[0,0,0], rgt=[0,0,0], upv=[0,0,0], eyeD=1, W=1, H=1, DPR=1, aspect=1, VP=new Float32Array(16), SVP=new Float32Array(16);
var hover=null, pin=null, measure={on:false,pts:[]}, fly=null, zoomTo=null, anchor=null, tourMsg=null;
var msgEl=$('gMsg'), foot=document.querySelector('.gfoot');

function ll2v(lat,lon){var f=lat*DEG, l=lon*DEG, c=Math.cos(f); return [c*Math.cos(l), Math.sin(f), -c*Math.sin(l)];}
function v2ll(v){return {lat:Math.asin(clamp(v[1],-1,1))/DEG, lon:Math.atan2(-v[2],v[0])/DEG};}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];}
function norm(a){var l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l];}

var busyMsg=false;
function showMsg(html,bad){
  busyMsg=false;
  if(!html){msgEl.hidden=true; dirty=true; return;}
  msgEl.innerHTML=html; msgEl.hidden=false; msgEl.classList.toggle('bad',!!bad); dirty=true;
}

/* ---------- relief ---------- */
var EW=0, EH=0, elev=null, elevVer=0, elevState=0;
function elevAt(lat,lon){     /* altitude en mètres, interpolée ; 0 sans relief (mode léger) ou tant que la grille n'est pas arrivée */
  if(!elev||!M.elev) return 0;
  var x=(lon+180)/360*EW-0.5, y=(90-lat)/180*EH-0.5;
  var x0=Math.floor(x), y0=Math.floor(y), fx=x-x0, fy=y-y0;
  var xa=((x0%EW)+EW)%EW, xb=(xa+1)%EW, ya=clamp(y0,0,EH-1), yb=clamp(y0+1,0,EH-1);
  var a=elev[ya*EW+xa], b=elev[ya*EW+xb], c=elev[yb*EW+xa], d=elev[yb*EW+xb];
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
function loadBitmap(url){
  return fetch(url).then(function(r){ if(!r.ok) throw new Error(url); return r.blob(); })
    .then(function(b){ return createImageBitmap(b,{premultiplyAlpha:'none',colorSpaceConversion:'none'}); });
}
function loadElev(){
  if(elevState) return Promise.resolve();
  elevState=1;
  return loadBitmap('data/elev.png').then(function(bmp){
    var c=document.createElement('canvas'); c.width=bmp.width; c.height=bmp.height;
    var x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(bmp,0,0);
    var d=x.getImageData(0,0,c.width,c.height).data, n=c.width*c.height, e=new Int16Array(n);
    for(var i=0;i<n;i++) e[i]=(d[i*4]<<8|d[i*4+1])-11000;
    EW=c.width; EH=c.height; elev=e; elevVer++; elevState=2; rebuildLines(); dirty=true;
  }).catch(function(){elevState=0;});
}

/* ---------- WebGL ---------- */
/* Les shaders sont écrits en GLSL ES 1.00 : ils tournent aussi bien avec WebGL 2 qu'avec WebGL 1. */
var FP='#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
var VS_TILE='attribute vec3 aDir; attribute float aElev; attribute vec2 aUV;\n'+
  'uniform mat4 uVP; uniform float uEx; varying vec2 vUV; varying vec3 vN;\n'+
  'void main(){ vUV=aUV; vN=aDir; gl_Position=uVP*vec4(aDir*(1.0+max(aElev,0.0)*uEx),1.0); }';
var FS_TILE=FP+'varying vec2 vUV; varying vec3 vN; uniform sampler2D uTex; uniform sampler2D uNight; uniform vec3 uSun; uniform float uSunOn; uniform float uNightOn;\n'+
  'void main(){ vec3 c=texture2D(uTex,vUV).rgb;\n'+
  ' if(uSunOn>0.5){ vec3 n=normalize(vN); float d=dot(n,uSun); float day=smoothstep(-0.10,0.10,d);\n'+
  '  vec3 lit=c*(0.74+0.26*smoothstep(0.0,0.7,d)); vec3 dark=c*vec3(0.05,0.07,0.13);\n'+
  '  if(uNightOn>0.5){ vec2 q=vec2(atan(-n.z,n.x)*0.15915494+0.5, 0.5-asin(clamp(n.y,-1.0,1.0))*0.31830989); dark=max(dark,texture2D(uNight,q).rgb*1.35); }\n'+
  '  c=mix(dark,lit,day); }\n'+
  ' gl_FragColor=vec4(c,1.0); }';
var VS_LINE='attribute vec3 aDir; attribute float aElev;\n'+
  'uniform mat4 uVP; uniform float uEx; uniform vec3 uEye; varying float vVis;\n'+
  'void main(){ vVis=dot(aDir,uEye)-1.0; gl_Position=uVP*vec4(aDir*(1.0005+max(aElev,0.0)*uEx),1.0); }';
var FS_LINE=FP+'varying float vVis; uniform vec4 uColor; uniform float uFade;\n'+
  'void main(){ if(vVis<0.0) discard; gl_FragColor=vec4(uColor.rgb,uColor.a*smoothstep(0.0,uFade,vVis)); }';
var VS_ATMO='attribute vec2 aP; varying vec2 vP;\nvoid main(){ vP=aP; gl_Position=vec4(aP,0.0,1.0); }';
var FS_ATMO=FP+'varying vec2 vP; uniform vec3 uEye; uniform vec3 uR; uniform vec3 uU; uniform vec3 uF; uniform vec3 uSun; uniform float uSunOn;\n'+
  'void main(){ vec3 dir=normalize(uF+vP.x*uR+vP.y*uU); float tca=-dot(uEye,dir); float b2=dot(uEye,uEye)-tca*tca; float a=0.0; vec3 P=uEye;\n'+
  ' if(tca>0.0){ if(b2>1.0){ a=exp(-(sqrt(b2)-1.0)/0.02)*0.7; P=uEye+dir*tca; } else { a=pow(b2,5.0)*0.3; P=uEye+dir*(tca-sqrt(1.0-b2)); } }\n'+
  ' if(uSunOn>0.5) a*=mix(0.07,1.0,smoothstep(-0.3,0.25,dot(normalize(P),uSun)));\n'+
  ' gl_FragColor=vec4(vec3(0.34,0.60,1.0)*a,1.0); }';
var VS_STAR='attribute vec4 aP; uniform mat4 uVP; uniform float uSize; varying float vB;\n'+
  'void main(){ vB=aP.w; vec4 p=uVP*vec4(aP.xyz,1.0); gl_Position=vec4(p.xy,p.w*0.9999,p.w); gl_PointSize=uSize*(0.7+aP.w); }';
var FS_STAR=FP+'varying float vB;\nvoid main(){ gl_FragColor=vec4(vec3(0.82,0.88,1.0)*(0.25+0.75*vB),1.0); }';

function program(vs,fs,attribs,names){
  function sh(type,src){var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'shader'); return s;}
  var p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs));
  attribs.forEach(function(n,i){gl.bindAttribLocation(p,i,n);});
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'link');
  var u={p:p}; names.forEach(function(n){u[n]=gl.getUniformLocation(p,n);}); return u;
}
function getGL(){     /* WebGL 2 si possible, sinon WebGL 1 avec l'extension des « vertex arrays » */
  var o={antialias:true,alpha:false}, g=null, kinds=['webgl2','webgl','experimental-webgl'];
  for(var i=0;i<kinds.length&&!g;i++){ try{g=glc.getContext(kinds[i],o);}catch(e){g=null;} }
  if(!g) return null;
  if(!g.createVertexArray){
    var x=g.getExtension('OES_vertex_array_object'); if(!x) return null;
    g.createVertexArray=function(){return x.createVertexArrayOES();};
    g.bindVertexArray=function(v){x.bindVertexArrayOES(v);};
    g.deleteVertexArray=function(v){x.deleteVertexArrayOES(v);};
  }
  return g;
}
var pTile,pLine,pAtmo,pStar, aniso=null, nightTex=null, starVao=null, triVao=null, STARS=1500, ibos={};

function ibo(sx,sy){
  var k=sx+'x'+sy; if(ibos[k]) return ibos[k];
  var a=new Uint16Array(sx*sy*6), n=0, w=sx+1;
  for(var j=0;j<sy;j++) for(var i=0;i<sx;i++){var p=j*w+i; a[n++]=p; a[n++]=p+w; a[n++]=p+1; a[n++]=p+1; a[n++]=p+w; a[n++]=p+w+1;}
  var b=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,a,gl.STATIC_DRAW);
  return (ibos[k]={buf:b,count:a.length});
}

/* ---------- tuiles ---------- */
var meta=[{cols:1,rows:1,w:4096,h:2048},{cols:10,rows:5,w:1024,h:1024},{cols:10,rows:5,w:2048,h:2048}];
var tiles=new Map(), loading=0, usedBytes=0;
function tileAt(L,c,r){
  var key=L+'/'+c+'_'+r, tl=tiles.get(key); if(tl) return tl;
  var m=meta[L], lon0=-180+c*360/m.cols, lon1=lon0+360/m.cols, lat1=90-r*180/m.rows, lat0=lat1-180/m.rows;
  var cen=ll2v((lat0+lat1)/2,(lon0+lon1)/2), rad=0;
  for(var j=0;j<=2;j++) for(var i=0;i<=2;i++){var a=Math.acos(clamp(dot(cen,ll2v(lat0+(lat1-lat0)*j/2,lon0+(lon1-lon0)*i/2)),-1,1)); if(a>rad) rad=a;}
  var span=360/m.cols;
  tl={L:L,c:c,r:r,key:key,lon0:lon0,lon1:lon1,lat0:lat0,lat1:lat1,cen:cen,rad:L?rad:Math.PI,chord:L?2*Math.sin(rad/2):2,
      sx:L?(span>30?(L>1?128:64):96):256, sy:L?(span>30?(L>1?128:64):96):128,
      state:0,tex:null,vao:null,vbo:null,ver:-1,used:0,bytes:m.w*m.h*4*1.34};
  tiles.set(key,tl); return tl;
}
function buildMesh(tl){
  var sx=tl.sx, sy=tl.sy, a=new Float32Array((sx+1)*(sy+1)*6), k=0;
  for(var j=0;j<=sy;j++){
    var lat=tl.lat1-(tl.lat1-tl.lat0)*j/sy, sf=Math.sin(lat*DEG), cf=Math.cos(lat*DEG);
    if(Math.abs(lat)>89.9999) cf=0;
    for(var i=0;i<=sx;i++){
      var lon=tl.lon0+(tl.lon1-tl.lon0)*i/sx, l=lon*DEG;
      a[k++]=cf*Math.cos(l); a[k++]=sf; a[k++]=-cf*Math.sin(l); a[k++]=elevAt(lat,lon)/6371008.8; a[k++]=i/sx; a[k++]=j/sy;
    }
  }
  if(!tl.vao){
    tl.vao=gl.createVertexArray(); tl.vbo=gl.createBuffer();
    gl.bindVertexArray(tl.vao); gl.bindBuffer(gl.ARRAY_BUFFER,tl.vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,24,0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,1,gl.FLOAT,false,24,12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2,2,gl.FLOAT,false,24,16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ibo(sx,sy).buf);
  } else { gl.bindVertexArray(tl.vao); gl.bindBuffer(gl.ARRAY_BUFFER,tl.vbo); }
  gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW); gl.bindVertexArray(null);
  tl.ver=elevVer;
}
function makeTex(bmp,repeatS,mips){
  var tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,bmp);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,repeatS?gl.REPEAT:gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  if(mips){ gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
    if(aniso) gl.texParameterf(gl.TEXTURE_2D,aniso.TEXTURE_MAX_ANISOTROPY_EXT,4); }
  else gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  return tex;
}
function loadTile(tl){
  tl.state=1; loading++;
  loadBitmap('tiles/'+tl.L+'/'+tl.c+'_'+tl.r+'.jpg').then(function(bmp){
    tl.tex=makeTex(bmp,tl.L===0,true); if(bmp.close) bmp.close();
    tl.state=2; tl.used=frameNo; usedBytes+=tl.bytes;
    if(tl.L===0){ stage.removeAttribute('aria-busy'); if(busyMsg){busyMsg=false; showMsg('');} }
  }).catch(function(){
    tl.state=3; if(tl.L===0) showMsg(t('noData'),true);
  }).then(function(){ loading--; dirty=true; });
}
function evict(){
  var BUDGET=M.mem*(coarse?0.6:1)*1048576;
  if(usedBytes<=BUDGET) return;
  var old=[]; tiles.forEach(function(tl){ if(tl.state===2&&tl.L>0&&tl.used<frameNo-1) old.push(tl); });
  old.sort(function(a,b){return a.used-b.used});
  for(var i=0;i<old.length&&usedBytes>BUDGET*0.85;i++){
    var tl=old[i]; gl.deleteTexture(tl.tex); gl.deleteBuffer(tl.vbo); gl.deleteVertexArray(tl.vao);
    usedBytes-=tl.bytes; tiles.delete(tl.key);
  }
}
function visible(tl){   /* la tuile est-elle devant l'horizon et dans le champ ? (sphère englobante, test prudent) */
  if(tl.L===0) return true;
  var eh=[eye[0]/eyeD,eye[1]/eyeD,eye[2]/eyeD];
  if(Math.acos(clamp(dot(tl.cen,eh),-1,1))>Math.acos(1/eyeD)+tl.rad+0.05) return false;
  var v=[tl.cen[0]-eye[0],tl.cen[1]-eye[1],tl.cen[2]-eye[2]], x=dot(v,rgt), y=dot(v,upv), z=dot(v,fwd), r=tl.chord+0.06;
  var hh=Math.atan(TANV*aspect), ch=Math.cos(hh), sh=Math.sin(hh), cv=Math.cos(FOV/2), sv=Math.sin(FOV/2);
  return Math.abs(x)*ch-z*sh<=r && Math.abs(y)*cv-z*sv<=r;
}
/* Détail utile à l'endroit d'une tuile : angle au sol que couvre un pixel d'écran à cette distance.
   Un niveau sert là où le précédent serait étiré de plus de 1,6 fois. */
function texel(L){return TAU/(meta[L].cols*meta[L].w);}
function pixelAt(tl){
  var d=Math.hypot(tl.cen[0]-eye[0],tl.cen[1]-eye[1],tl.cen[2]-eye[2])-tl.chord*0.75;
  return Math.max(d,eyeD-1,cam.range*0.6)*2*TANV/(H*(soft?1:DPR));
}
function maxLevel(){return Math.min(meta.length-1,M.maxL);}
function wantedLevel(){
  var px=Math.max(eyeD-1,cam.range*0.6)*2*TANV/(H*(soft?1:DPR)), top=maxLevel();
  for(var L=0;L<top;L++) if(texel(L)<=px*1.6) return L;
  return top;
}

/* ---------- lignes ---------- */
var lineSets={};
function lineSet(name,polys,color,deg){    /* polys : listes [lon,lat,lon,lat…] en centièmes de degré (ou en degrés si deg) */
  var n=0; polys.forEach(function(p){n+=p.length/2-1;});
  if(soft){
    var sc=deg?1:0.01;
    softLines[name]={color:color,arr:polys.map(function(p){
      var f=new Float32Array(p.length/2*3);
      for(var i=0,j=0;i<p.length;i+=2){var v=ll2v(p[i+1]*sc,p[i]*sc); f[j++]=v[0]; f[j++]=v[1]; f[j++]=v[2];}
      return f; })};
    return;
  }
  var a=new Float32Array(n*8), k=0, s=deg?1:0.01;
  function put(lon,lat){var v=ll2v(lat,lon); a[k++]=v[0]; a[k++]=v[1]; a[k++]=v[2]; a[k++]=elevAt(lat,lon)/6371008.8;}
  polys.forEach(function(p){ for(var i=0;i+3<p.length;i+=2){ put(p[i]*s,p[i+1]*s); put(p[i+2]*s,p[i+3]*s); } });
  var old=lineSets[name];
  if(old){gl.deleteBuffer(old.vbo); gl.deleteVertexArray(old.vao);}
  var vao=gl.createVertexArray(), vbo=gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER,vbo); gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,3,gl.FLOAT,false,16,0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1,1,gl.FLOAT,false,16,12);
  gl.bindVertexArray(null);
  lineSets[name]={vao:vao,vbo:vbo,count:n*2,color:color,polys:polys,deg:deg};
}
var CIRCLES=[[0,'eq'],[23.44,'tc'],[-23.44,'tp'],[66.56,'ac'],[-66.56,'aa']];
function buildGraticule(){
  var grid=[], circ=[], eq=[], i, j, p;
  for(i=-180;i<180;i+=10){p=[]; for(j=-85;j<=85;j+=1) p.push(i,j); grid.push(p);}
  for(j=-80;j<=80;j+=10){ if(!j) continue; p=[]; for(i=-180;i<=180;i+=1) p.push(i,j); grid.push(p);}
  CIRCLES.forEach(function(c){p=[]; for(i=-180;i<=180;i+=1) p.push(i,c[0]); (c[0]?circ:eq).push(p);});
  lineSet('equator',eq,[1,0.80,0.30,0.9],true);
  lineSet('grid',grid,[0.72,0.80,1,0.26],true);
  lineSet('circles',circ,[1,0.80,0.30,0.85],true);
}
function rebuildLines(){ if(soft) return; for(var k in lineSets){var s=lineSets[k]; lineSet(k,s.polys,s.color,s.deg);} }

/* ---------- lieux ---------- */
var places=null;   /* {countries:[{n:[fr,en],lat,lon,v,rank,k}], cities:[…]} */
function loadPlaces(){
  return fetch('data/places.json').then(function(r){return r.json()}).then(function(d){
    var cs=d.countries.map(function(c){return {n:[c[0],c[1]],lat:c[2],lon:c[3],rank:c[4]/10,span:c[5],v:ll2v(c[2],c[3]),k:null,type:0};});
    places={countries:cs,cities:[],ends:[],admins:d.admins||[]};
    addCities(d.cities); needSmall();
  }).catch(function(){});
}
function addCities(rows){      /* rows triées par rang ; ends[r] = nombre de villes de rang <= r */
  var ct=places.cities;         /* objets légers : le vecteur v et les clés de recherche ne sont calculés qu'au besoin */
  rows.forEach(function(c){ct.push({n:[c[0],c[1]||c[0]],ci:c[2],lat:c[3],lon:c[4],pop:c[5],rank:c[6],cap:c[7],ai:c[8],v:null,k:null,type:1});});
  var ends=[], r=0;
  for(var i=0;i<ct.length;i++){ while(r<ct[i].rank) ends[r++]=i; }
  while(r<=15) ends[r++]=ct.length;
  places.ends=ends; dirty=true;
}
/* Fichiers de lieux supplémentaires, du plus peuplé au moins peuplé. Chacun n'est chargé que si le mode le permet
   et quand on en a besoin : le premier tout de suite, les autres à la première recherche ou au zoom rapproché. */
var EXTRA=[['places-small.json',11],['places-tiny.json',12],['places-hamlets.json',14]], extraAt=0, extraBusy=false;
function needPlaces(rank){
  if(extraBusy||!places||extraAt>=EXTRA.length||EXTRA[extraAt][1]>Math.min(rank,M.rank)) return;
  extraBusy=true;
  fetch('data/'+EXTRA[extraAt][0]).then(function(r){return r.json()}).then(function(d){
    addCities(d.cities); extraAt++; extraBusy=false;
    if(!qPop.hidden) renderSearch(); if(!jqPop.hidden) jqRender();
    needPlaces(rank);
  }).catch(function(){extraBusy=false;});
}
function needSmall(){needPlaces(11);}
function fixed(list,type){return list.map(function(o){return {n:[o[2],o[3]],lat:o[0],lon:o[1],v:ll2v(o[0],o[1]),type:type};});}
var oceans=fixed(OCEANS,2), seas=fixed(SEAS,3), conts=fixed(CONTS,4);

/* ---------- caméra ---------- */
function minRange(){return Math.max(0.035,(opt.ex*9000/6371008.8*1.25+0.004)/Math.cos(cam.tilt));}
function clampCam(){
  cam.lat=clamp(cam.lat,-90,90); cam.lon=wrap180(cam.lon);
  cam.tilt=clamp(cam.tilt,0,80*DEG*clamp((3.2-cam.range)/1.6,0,1));
  cam.range=clamp(cam.range,minRange(),14);
  cam.heading=Math.atan2(Math.sin(cam.heading),Math.cos(cam.heading));
}
function updateCam(){
  var f=cam.lat*DEG, l=cam.lon*DEG, sf=Math.sin(f), cf=Math.cos(f), sl=Math.sin(l), cl=Math.cos(l);
  var U=[cf*cl,sf,-cf*sl], E=[-sl,0,-cl], N=[-sf*cl,cf,sf*sl];
  var ch=Math.cos(cam.heading), sh=Math.sin(cam.heading), ct=Math.cos(cam.tilt), st=Math.sin(cam.tilt);
  var F=[N[0]*ch+E[0]*sh, N[1]*ch+E[1]*sh, N[2]*ch+E[2]*sh];
  for(var i=0;i<3;i++){
    eye[i]=U[i]+cam.range*(U[i]*ct-F[i]*st);
    fwd[i]=-U[i]*ct+F[i]*st;
    upv[i]=F[i]*ct+U[i]*st;
  }
  var r=cross(fwd,upv); rgt[0]=r[0]; rgt[1]=r[1]; rgt[2]=r[2];
  eyeD=Math.hypot(eye[0],eye[1],eye[2]);
  var relief=opt.ex*9000/6371008.8, near=Math.max(1e-4,(eyeD-1-relief)*0.5), far=Math.sqrt(Math.max(eyeD*eyeD-1,0))+0.6;
  var fy=1/TANV, fx=fy/aspect, A=(far+near)/(near-far), B=2*far*near/(near-far);
  var ex=-dot(rgt,eye), ey=-dot(upv,eye), ez=dot(fwd,eye);
  /* VP = projection × vue, colonnes d'abord */
  for(i=0;i<3;i++){ VP[i*4]=fx*rgt[i]; VP[i*4+1]=fy*upv[i]; VP[i*4+2]=-A*fwd[i]; VP[i*4+3]=fwd[i]; }
  VP[12]=fx*ex; VP[13]=fy*ey; VP[14]=A*ez+B; VP[15]=-ez;
  /* étoiles : même orientation, sans translation */
  var A2=-1.0002, B2=-0.02;
  for(i=0;i<3;i++){ SVP[i*4]=fx*rgt[i]; SVP[i*4+1]=fy*upv[i]; SVP[i*4+2]=-A2*fwd[i]; SVP[i*4+3]=fwd[i]; }
  SVP[12]=0; SVP[13]=0; SVP[14]=B2; SVP[15]=0;
}
function pick(x,y){      /* point du globe (niveau de la mer) sous le pixel (x, y), ou null */
  var nx=(2*x/W-1)*TANV*aspect, ny=(1-2*y/H)*TANV;
  var d=norm([fwd[0]+rgt[0]*nx+upv[0]*ny, fwd[1]+rgt[1]*nx+upv[1]*ny, fwd[2]+rgt[2]*nx+upv[2]*ny]);
  var b=dot(eye,d), c=eyeD*eyeD-1, q=b*b-c;
  if(q<0||b>0) return null;
  var s=-b-Math.sqrt(q);
  return [eye[0]+d[0]*s, eye[1]+d[1]*s, eye[2]+d[2]*s];
}
function project(v,h){    /* vecteur unitaire (et altitude relative h) -> pixel, ou null si derrière l'horizon ou hors champ */
  if(dot(v,eye)<1.0) return null;
  var s=1+(h||0), x=v[0]*s-eye[0], y=v[1]*s-eye[1], z=v[2]*s-eye[2];
  var zf=x*fwd[0]+y*fwd[1]+z*fwd[2]; if(zf<=1e-6) return null;
  var px=(x*rgt[0]+y*rgt[1]+z*rgt[2])/(zf*TANV*aspect), py=(x*upv[0]+y*upv[1]+z*upv[2])/(zf*TANV);
  return [(px*0.5+0.5)*W,(0.5-py*0.5)*H];
}
function grabTo(P,x,y){   /* déplace le point visé pour que le point P du globe vienne sous le pixel (x, y) */
  var g=v2ll(P);
  for(var k=0;k<4;k++){
    clampCam(); updateCam();
    var c=pick(x,y); if(!c) return false;
    var q=v2ll(c);
    cam.lon+=wrap180(g.lon-q.lon); cam.lat=clamp(cam.lat+clamp(g.lat-q.lat,-40,40),-90,90);
  }
  clampCam(); updateCam(); return true;
}
function homeRange(){     /* distance d'où la Terre entière tient dans le cadre */
  var half=Math.min(FOV/2,Math.atan(TANV*aspect))*0.86;
  return clamp(1/Math.sin(half)-1,2.4,13);
}
function stopMotion(){fly=null; zoomTo=null; anchor=null;}
function flyTo(o){
  var to={lat:o.lat,lon:o.lon,range:o.range===undefined?cam.range:o.range,heading:o.heading||0,tilt:o.tilt||0};
  stopMotion();
  if(reduce){cam.lat=to.lat; cam.lon=to.lon; cam.range=to.range; cam.heading=to.heading; cam.tilt=to.tilt; dirty=true; return;}
  var a=ll2v(cam.lat,cam.lon), b=ll2v(to.lat,to.lon), ang=Math.acos(clamp(dot(a,b),-1,1));
  var dh=to.heading-cam.heading; dh=Math.atan2(Math.sin(dh),Math.cos(dh));
  fly={a:a,b:b,ang:ang,r0:cam.range,r1:to.range,h0:cam.heading,dh:dh,t0:cam.tilt,t1:to.tilt,
       bump:Math.max(0,Math.min(2.2,ang*1.3)-Math.max(cam.range,to.range)*0.6),s:0,
       dur:clamp(0.9+ang*0.9+Math.abs(Math.log(to.range/cam.range))*0.35,0.9,3.6)};
}
function step(dt){
  if(fly){
    fly.s=Math.min(1,fly.s+dt/fly.dur);
    var s=fly.s, e=s*s*(3-2*s), v;
    if(fly.ang<1e-6) v=fly.b;
    else{var sa=Math.sin(fly.ang), k0=Math.sin((1-e)*fly.ang)/sa, k1=Math.sin(e*fly.ang)/sa; v=norm([fly.a[0]*k0+fly.b[0]*k1,fly.a[1]*k0+fly.b[1]*k1,fly.a[2]*k0+fly.b[2]*k1]);}
    var g=v2ll(v); cam.lat=g.lat; cam.lon=g.lon;
    cam.range=Math.exp(Math.log(fly.r0)+(Math.log(fly.r1)-Math.log(fly.r0))*e)+fly.bump*Math.sin(Math.PI*e);
    cam.heading=fly.h0+fly.dh*e; cam.tilt=fly.t0+(fly.t1-fly.t0)*e;
    if(s>=1) fly=null;
    dirty=true;
  }
  if(zoomTo!==null){
    var k=reduce?1:1-Math.exp(-dt*13), lr=Math.log(cam.range), lt=Math.log(zoomTo);
    cam.range=Math.exp(lr+(lt-lr)*k);
    if(Math.abs(lt-Math.log(cam.range))<0.003){cam.range=zoomTo; zoomTo=null;}
    if(anchor) grabTo(anchor.P,anchor.x,anchor.y);
    if(zoomTo===null) anchor=null;
    dirty=true;
  }
  if(sunSt.playing&&opt.sun){
    sunSt.hour+=dt*speed; if(sunSt.hour>=24){sunSt.hour-=24; if(!lesson.on) sunSt.day=(sunSt.day+1)%365;}
    syncSun(); dirty=true;
  }
  if(lesson.on&&lesson.follow!==null){        /* caméra fixe par rapport au Soleil : c'est la Terre qui tourne dessous */
    var busy=(drag&&drag.moved)||pinch||zoomTo!==null||fly, sl=sunPos().lon;
    if(lesson.ecl){
      /* Vue liée au plan de l'orbite : le haut de l'écran est le nord de l'écliptique, l'axe terrestre apparaît donc penché. */
      var B=eclBasis(), U;
      if(busy){ U=ll2v(cam.lat,cam.lon); lesson.follow=Math.atan2(dot(U,B.P),dot(U,B.S))/DEG; lesson.elev=clamp(Math.asin(clamp(dot(U,B.Ne),-1,1)),-1.3,1.3); }
      else{
        var f=lesson.follow*DEG, ce=Math.cos(lesson.elev), se=Math.sin(lesson.elev), cf=Math.cos(f), sf=Math.sin(f);
        var g=v2ll([ce*(B.S[0]*cf+B.P[0]*sf)+se*B.Ne[0], ce*(B.S[1]*cf+B.P[1]*sf)+se*B.Ne[1], ce*(B.S[2]*cf+B.P[2]*sf)+se*B.Ne[2]]);
        if(Math.abs(g.lat-cam.lat)>1e-9||Math.abs(wrap180(g.lon-cam.lon))>1e-9){cam.lat=g.lat; cam.lon=g.lon; dirty=true;}
      }
      if(!(drag&&drag.orbit)&&!pinch){
        var la=cam.lat*DEG, lo=cam.lon*DEG, E=[-Math.sin(lo),0,-Math.cos(lo)], N=[-Math.sin(la)*Math.cos(lo),Math.cos(la),Math.sin(la)*Math.sin(lo)];
        var h=Math.atan2(dot(B.Ne,E),dot(B.Ne,N));
        if(Math.abs(h-cam.heading)>1e-9){cam.heading=h; dirty=true;}
      }
    }
    else if(busy) lesson.follow=wrap180(cam.lon-sl);
    else{ var nl=wrap180(sl+lesson.follow); if(Math.abs(wrap180(nl-cam.lon))>1e-9){cam.lon=nl; dirty=true;} }
  }
}
function zoomBy(f,x,y){
  fly=null;
  var target=clamp((zoomTo===null?cam.range:zoomTo)*f,minRange(),14);
  anchor=null;
  if(x!==undefined){ clampCam(); updateCam(); var P=pick(x,y); if(P) anchor={P:P,x:x,y:y}; }
  zoomTo=target; dirty=true;
}

/* ---------- Soleil ---------- */
function eclBasis(){    /* dans le repère de la Terre : direction du Soleil S, nord de l'écliptique Ne, sens de l'orbite P */
  var sp=sunPos(), S=ll2v(sp.lat,sp.lon), e=23.44*DEG, sd=clamp(S[1]/Math.sin(e),-1,1);
  var cl=Math.sqrt(1-sd*sd)*((sunSt.day<172||sunSt.day>=355)?1:-1);          /* cosinus de la longitude écliptique du Soleil */
  var X=cross(S,[0,1,0]), ce=Math.cos(e), se=Math.sin(e);
  var Ne=norm([ce*(0-S[1]*S[0])+cl*se*X[0], ce*(1-S[1]*S[1])+cl*se*X[1], ce*(0-S[1]*S[2])+cl*se*X[2]]);
  return {S:S,Ne:Ne,P:cross(Ne,S)};
}
function sunPos(){   /* point où le Soleil est au zénith (formules de la NOAA, précision d'une fraction de degré) */
  var g=TAU/365*(sunSt.day+(sunSt.hour-12)/24);
  var eq=229.18*(0.000075+0.001868*Math.cos(g)-0.032077*Math.sin(g)-0.014615*Math.cos(2*g)-0.040849*Math.sin(2*g));
  var de=0.006918-0.399912*Math.cos(g)+0.070257*Math.sin(g)-0.006758*Math.cos(2*g)+0.000907*Math.sin(2*g)-0.002697*Math.cos(3*g)+0.00148*Math.sin(3*g);
  return {lat:de/DEG, lon:wrap180(-15*(sunSt.hour-12+eq/60))};
}
function syncSun(){
  $('gDay').value=sunSt.day; $('gHour').value=sunSt.hour;
  var ds=dateStr(sunSt.day), hs=hourStr(sunSt.hour), s=sunPos();
  $('gDayOut').textContent=ds; $('gHourOut').textContent=hs;
  $('gDay').setAttribute('aria-valuetext',ds); $('gHour').setAttribute('aria-valuetext',hs);
  $('gSunTxt').textContent=tf('sunTxt',coordStr(s.lat,s.lon,1));
  $('gSpin').textContent=t(sunSt.playing?'spinStop':'spin'); $('gSpin').setAttribute('aria-pressed',String(sunSt.playing));
  $('jPlay').textContent=t(sunSt.playing?'jPause':'jPlay'); $('jTime').textContent=ds+', '+hs;
  $('jDay').value=sunSt.day; $('jDay').setAttribute('aria-valuetext',ds);
  var sec=24/speed, so=tf('turn',sec>=60?tf('mins',nf(sec/60,0)):tf('secs',nf(sec,0)));
  $('jSpeedOut').textContent=so; $('jSpeed').setAttribute('aria-valuetext',so);
  document.querySelectorAll('#jDates button').forEach(function(b){b.setAttribute('aria-pressed',String(+b.getAttribute('data-jday')===sunSt.day));});
}
function setNow(){
  var d=new Date(), y0=Date.UTC(d.getUTCFullYear(),0,1);
  sunSt.day=clamp(Math.floor((d.getTime()-y0)/864e5),0,364);
  if(d.getUTCMonth()>1&&new Date(d.getUTCFullYear(),1,29).getMonth()===1) sunSt.day=Math.max(0,sunSt.day-1);   /* année bissextile */
  sunSt.hour=d.getUTCHours()+d.getUTCMinutes()/60;
}

/* ---------- rendu ---------- */
function resize(){
  var w=stage.clientWidth, h=stage.clientHeight; if(!w||!h) return false;
  var dpr=Math.min(window.devicePixelRatio||1,M.dpr), pw=Math.round(w*dpr), ph=Math.round(h*dpr);
  var gw=soft?w:pw, gh=soft?h:ph;                 /* le rendu de secours se contente d'un pixel par point d'écran */
  if(w===W&&h===H&&glc.width===gw&&glc.height===gh&&lbc.width===pw) return false;
  W=w; H=h; DPR=dpr; aspect=w/h;
  glc.width=gw; glc.height=gh; lbc.width=pw; lbc.height=ph;
  return true;
}
function render(){
  frameNo++;
  gl.viewport(0,0,glc.width,glc.height);
  gl.clearColor(0.031,0.047,0.106,1); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  var sp=sunPos(), sv=ll2v(sp.lat,sp.lon), ex=opt.ex;

  gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
  gl.useProgram(pStar.p); gl.uniformMatrix4fv(pStar.uVP,false,SVP); gl.uniform1f(pStar.uSize,1.1*DPR);
  gl.bindVertexArray(starVao); gl.drawArrays(gl.POINTS,0,STARS);

  /* Les niveaux se recouvrent du plus grossier au plus fin ; la profondeur est remise à zéro entre deux niveaux. */
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  gl.useProgram(pTile.p);
  gl.uniformMatrix4fv(pTile.uVP,false,VP); gl.uniform1f(pTile.uEx,ex); gl.uniform3f(pTile.uSun,sv[0],sv[1],sv[2]);
  gl.uniform1f(pTile.uSunOn,opt.sun?1:0); gl.uniform1f(pTile.uNightOn,nightTex?1:0);
  gl.uniform1i(pTile.uTex,0); gl.uniform1i(pTile.uNight,1);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,nightTex); gl.activeTexture(gl.TEXTURE0);
  var want=wantedLevel(), queue=[], target=ll2v(cam.lat,cam.lon);
  for(var L=0;L<=want;L++){
    var m=meta[L], drew=false, tx=L?texel(L-1):0, last=L===maxLevel();
    for(var r=0;r<m.rows;r++) for(var c=0;c<m.cols;c++){
      var tl=tileAt(L,c,r);
      if(!visible(tl)) continue;
      if(L>0){
        var px=pixelAt(tl)*1.6;
        if(tx<=px) continue;                                  /* le niveau précédent suffit ici */
        /* On demande le niveau le plus fin utile, et le niveau 1 comme aperçu rapide ; les autres servent s'ils sont déjà là. */
        if(tl.state===0){ if(L===1||last||texel(L)<=px) queue.push(tl); continue; }
      } else if(tl.state===0){ loadTile(tl); continue; }
      if(tl.state!==2) continue;
      if(tl.ver!==elevVer) buildMesh(tl);
      if(!drew){ if(L>0) gl.clear(gl.DEPTH_BUFFER_BIT); drew=true; }
      tl.used=frameNo;
      gl.bindTexture(gl.TEXTURE_2D,tl.tex); gl.bindVertexArray(tl.vao);
      gl.drawElements(gl.TRIANGLES,ibo(tl.sx,tl.sy).count,gl.UNSIGNED_SHORT,0);
    }
  }
  if(queue.length&&loading<6){
    queue.sort(function(a,b){return (a.L===1?0:1)-(b.L===1?0:1)||dot(b.cen,target)-dot(a.cen,target)});
    for(var i=0;i<queue.length&&loading<6;i++) loadTile(queue[i]);
  }
  evict();

  gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE,gl.ONE);
  gl.useProgram(pAtmo.p);
  gl.uniform3f(pAtmo.uEye,eye[0],eye[1],eye[2]); gl.uniform3f(pAtmo.uF,fwd[0],fwd[1],fwd[2]);
  gl.uniform3f(pAtmo.uR,rgt[0]*TANV*aspect,rgt[1]*TANV*aspect,rgt[2]*TANV*aspect); gl.uniform3f(pAtmo.uU,upv[0]*TANV,upv[1]*TANV,upv[2]*TANV);
  gl.uniform3f(pAtmo.uSun,sv[0],sv[1],sv[2]); gl.uniform1f(pAtmo.uSunOn,opt.sun?1:0);
  gl.bindVertexArray(triVao); gl.drawArrays(gl.TRIANGLES,0,3);

  gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(pLine.p);
  gl.uniformMatrix4fv(pLine.uVP,false,VP); gl.uniform1f(pLine.uEx,ex); gl.uniform3f(pLine.uEye,eye[0],eye[1],eye[2]);
  gl.uniform1f(pLine.uFade,0.05*eyeD);
  var far=clamp((cam.range-0.5)/2,0,1);        /* de loin, les lignes s'effacent un peu pour laisser voir l'image */
  function lines(name,k){var s=lineSets[name]; if(!s) return; gl.uniform4f(pLine.uColor,s.color[0],s.color[1],s.color[2],s.color[3]*k); gl.bindVertexArray(s.vao); gl.drawArrays(gl.LINES,0,s.count);}
  if(opt.grid) lines('grid',1);
  if(opt.borders){ lines('coast',1-0.45*far); lines('lakes',1-0.6*far); lines('borders',1-0.3*far); }
  if(opt.equator) lines('equator',1);
  if(opt.circles) lines('circles',1);
  gl.bindVertexArray(null);
}

/* ---------- rendu de secours, sans WebGL ----------
   Chaque pixel lance un rayon vers la sphère et lit la couleur dans les tuiles décodées en mémoire.
   Pas de relief en 3D ; pendant un mouvement l'image est calculée en plus petit, puis affinée à l'arrêt. */
var softLines={}, sctx=null, sbuf=document.createElement('canvas'), sbx=sbuf.getContext('2d'), simg=null, s32=null;
var softTiles=new Map(), softGrid=[], softBytes=0, softLoading=0, nightPx=null, NW=0, NH=0, refineAt=0, softCost=40;
function pixelsOf(bmp){
  var c=document.createElement('canvas'); c.width=bmp.width; c.height=bmp.height;
  var x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(bmp,0,0);
  var d=x.getImageData(0,0,c.width,c.height); if(bmp.close) bmp.close();
  return new Uint32Array(d.data.buffer);
}
function softLoad(L,c,r){
  var key=L+'/'+c+'_'+r, m=meta[L], tl={key:key,L:L,i:r*m.cols+c,state:1,used:frameNo,bytes:m.w*m.h*4};
  softTiles.set(key,tl); softLoading++;
  loadBitmap('tiles/'+key+'.jpg').then(function(bmp){
    if(!softGrid[L]) softGrid[L]=[];
    softGrid[L][tl.i]=pixelsOf(bmp); tl.state=2; softBytes+=tl.bytes;
    if(L===0){ stage.removeAttribute('aria-busy'); if(busyMsg){busyMsg=false; showMsg('');} }
  }).catch(function(){ tl.state=3; if(L===0) showMsg(t('noData'),true); }).then(function(){softLoading--; dirty=true;});
}
function softEvict(){
  var budget=M.mem*(coarse?0.5:0.75)*1048576; if(softBytes<=budget) return;
  var old=[]; softTiles.forEach(function(tl){ if(tl.state===2&&tl.L>0&&tl.used<frameNo-1) old.push(tl); });
  old.sort(function(a,b){return a.used-b.used});
  for(var i=0;i<old.length&&softBytes>budget*0.8;i++){ softGrid[old[i].L][old[i].i]=null; softBytes-=old[i].bytes; softTiles.delete(old[i].key); }
}
function renderSoft(fine){
  frameNo++;
  var cw=glc.width, ch=glc.height, maxPx=fine?Math.min(W*H,900000):clamp(170000*(40/softCost),60000,260000);
  var sc=Math.min(1,Math.sqrt(maxPx/(cw*ch))), w=Math.max(2,Math.round(cw*sc)), h=Math.max(2,Math.round(ch*sc));
  if(!simg||simg.width!==w||simg.height!==h){ sbuf.width=w; sbuf.height=h; simg=sbx.createImageData(w,h); s32=new Uint32Array(simg.data.buffer); }
  var t0=performance.now();
  /* tuiles : le niveau voulu au point visé ; on demande celles qui sont en vue */
  var want=wantedLevel(), queue=[], target=ll2v(cam.lat,cam.lon), L, m;
  if(!softTiles.has('0/0_0')) softLoad(0,0,0);
  for(L=1;L<=want;L++){
    m=meta[L];
    for(var r=0;r<m.rows;r++) for(var c=0;c<m.cols;c++){
      var tl=tileAt(L,c,r); if(!visible(tl)) continue;
      var st=softTiles.get(tl.key);
      if(st){st.used=frameNo; continue;}
      if(L===want&&texel(L-1)>pixelAt(tl)*1.6) queue.push(tl);
    }
  }
  queue.sort(function(a,b){return dot(b.cen,target)-dot(a.cen,target)});
  for(var q=0;q<queue.length&&softLoading<4;q++) softLoad(queue[q].L,queue[q].c,queue[q].r);
  softEvict();

  var levels=[]; for(L=want;L>=0;L--) if(softGrid[L]) levels.push({g:softGrid[L],cols:meta[L].cols,rows:meta[L].rows,w:meta[L].w,h:meta[L].h});
  var nl=levels.length, sun=opt.sun, sp=sunPos(), sv=ll2v(sp.lat,sp.lon), sx=sv[0], sy=sv[1], sz=sv[2];
  var ex=eye[0], ey=eye[1], ez=eye[2], C=eyeD*eyeD-1, ta=TANV*aspect, INV2PI=1/TAU, INVPI=1/Math.PI, SPACE=0xff1b0c08;
  for(var y=0;y<h;y++){
    var ny=(1-(y+0.5)/h*2)*TANV, bx=fwd[0]+upv[0]*ny, by=fwd[1]+upv[1]*ny, bz=fwd[2]+upv[2]*ny, o=y*w;
    for(var x=0;x<w;x++,o++){
      var nx=((x+0.5)/w*2-1)*ta, dx=bx+rgt[0]*nx, dy=by+rgt[1]*nx, dz=bz+rgt[2]*nx;
      var A=dx*dx+dy*dy+dz*dz, B=ex*dx+ey*dy+ez*dz, disc=B*B-A*C, R, G, Bl, a;
      if(B>=0){ s32[o]=SPACE; continue; }
      if(disc<0){                                    /* à côté de la Terre : fond d'espace et halo de l'atmosphère */
        var b2=eyeD*eyeD-B*B/A;
        if(b2>1.2){ s32[o]=SPACE; continue; }
        a=Math.exp(-(Math.sqrt(b2)-1)/0.02)*0.7;
        if(sun){ var tc=-B/A, hx=ex+dx*tc, hy=ey+dy*tc, hz=ez+dz*tc, hl=Math.sqrt(hx*hx+hy*hy+hz*hz), sd=(hx*sx+hy*sy+hz*sz)/hl; a*=0.07+0.93*clamp((sd+0.3)/0.55,0,1); }
        s32[o]=0xff000000|Math.min(255,27+255*a)<<16|Math.min(255,12+153*a)<<8|Math.min(255,8+87*a); continue;
      }
      var tt=(-B-Math.sqrt(disc))/A, px=ex+dx*tt, py=ey+dy*tt, pz=ez+dz*tt;
      var u=Math.atan2(-pz,px)*INV2PI+0.5, v=0.5-Math.asin(py>1?1:py<-1?-1:py)*INVPI, col=0;
      if(u>=1) u-=1; if(v>=1) v=0.999999;
      for(var k=0;k<nl;k++){
        var lv=levels[k], fu=u*lv.cols, fv=v*lv.rows, ci=fu|0, ri=fv|0, tp=lv.g[ri*lv.cols+ci];
        if(tp){ col=tp[((fv-ri)*lv.h|0)*lv.w+((fu-ci)*lv.w|0)]; break; }
      }
      if(!col){ s32[o]=0xff3a2412; continue; }
      R=col&255; G=col>>8&255; Bl=col>>16&255;
      if(sun){
        var d=px*sx+py*sy+pz*sz, day=clamp((d+0.1)/0.2,0,1); day=day*day*(3-2*day);
        var lt=0.74+0.26*clamp(d/0.7,0,1), nr=R*0.05, ng=G*0.07, nb=Bl*0.13;
        if(nightPx&&day<1){ var np=nightPx[(v*NH|0)*NW+(u*NW|0)]; nr=Math.max(nr,(np&255)*1.35); ng=Math.max(ng,(np>>8&255)*1.35); nb=Math.max(nb,(np>>16&255)*1.35); }
        R=nr+(R*lt-nr)*day; G=ng+(G*lt-ng)*day; Bl=nb+(Bl*lt-nb)*day;
      }
      var e2=eyeD*eyeD-B*B/A;                         /* brume bleutée vers le bord du disque */
      if(e2>0.55){ a=e2*e2; a=a*a*e2*0.3; if(sun) a*=0.07+0.93*clamp((px*sx+py*sy+pz*sz+0.3)/0.55,0,1); R+=87*a; G+=153*a; Bl+=255*a; }
      s32[o]=0xff000000|(Bl>255?255:Bl)<<16|(G>255?255:G)<<8|(R>255?255:R);
    }
  }
  sbx.putImageData(simg,0,0);
  sctx.imageSmoothingEnabled=true; sctx.drawImage(sbuf,0,0,cw,ch);
  if(!fine) softCost=softCost*0.7+(performance.now()-t0)*(170000/(w*h))*0.3;      /* coût ramené à 170 000 pixels */
}
function drawSoftLines(ctx){
  var step=cam.range>1.5?4:cam.range>0.6?2:1, hw=W/2, hh=H/2, kx=1/(TANV*aspect), ky=1/TANV;
  var ex=eye[0], ey=eye[1], ez=eye[2], far=clamp((cam.range-0.5)/2,0,1);
  function set(name,alpha,lw,st){
    var s=softLines[name]; if(!s) return;
    ctx.beginPath();
    for(var p=0;p<s.arr.length;p++){
      var f=s.arr[p], n=f.length/3, pen=false;
      for(var i=0;i<n;i+=(i+st<n||i===n-1?st:n-1-i)){
        var j=i*3, vx=f[j], vy=f[j+1], vz=f[j+2];
        if(vx*ex+vy*ey+vz*ez<1.0){pen=false; continue;}
        var x=vx-ex, y=vy-ey, z=vz-ez, zf=x*fwd[0]+y*fwd[1]+z*fwd[2];
        if(zf<=1e-6){pen=false; continue;}
        var sx=hw+(x*rgt[0]+y*rgt[1]+z*rgt[2])/zf*kx*hw, sy=hh-(x*upv[0]+y*upv[1]+z*upv[2])/zf*ky*hh;
        if(sx<-200||sx>W+200||sy<-200||sy>H+200){pen=false; continue;}
        if(pen) ctx.lineTo(sx,sy); else ctx.moveTo(sx,sy); pen=true;
      }
    }
    ctx.strokeStyle='rgba('+Math.round(s.color[0]*255)+','+Math.round(s.color[1]*255)+','+Math.round(s.color[2]*255)+','+(s.color[3]*alpha).toFixed(3)+')';
    ctx.lineWidth=lw; ctx.stroke();
  }
  ctx.save(); ctx.lineJoin='round';
  if(opt.grid) set('grid',1,1,2);
  if(opt.borders){ set('coast',1-0.45*far,1,step); set('lakes',1-0.6*far,1,step); set('borders',1-0.3*far,1,step); }
  if(opt.equator) set('equator',1,1.4,2);
  if(opt.circles) set('circles',1,1.2,2);
  ctx.restore();
}

/* ---------- étiquettes et tracés, sur une toile 2D posée sur le globe ---------- */
var lctx=lbc.getContext('2d'), FONT='"Instrument Sans",system-ui,sans-serif', widths=new Map(), boxes=[];
function tw(font,s){var k=font+'|'+s, w=widths.get(k); if(w===undefined){lctx.font=font; w=lctx.measureText(s).width; widths.set(k,w);} return w;}
var footH=30;
function free(x0,y0,x1,y1){
  if(x0<4||y0<50||x1>W-56||y1>H-footH) return false;
  for(var i=0;i<boxes.length;i++){var b=boxes[i]; if(x0<b[2]&&x1>b[0]&&y0<b[3]&&y1>b[1]) return false;}
  boxes.push([x0,y0,x1,y1]); return true;
}
function label(p,txt,font,color,align,dx,dy){
  var w=tw(font,txt), x=p[0]+(dx||0), y=p[1]+(dy||0), x0=align==='center'?x-w/2:x;
  if(!free(x0-7,y-11,x0+w+7,y+11)) return false;
  lctx.font=font; lctx.textAlign='left'; lctx.strokeText(txt,x0,y); lctx.fillStyle=color; lctx.fillText(txt,x0,y); return true;
}
function limb(v){return dot(v,eye)/eyeD-1/eyeD;}       /* > 0 devant l'horizon ; petit = près du bord du disque */
function arcPts(a,b,n){
  var ang=Math.acos(clamp(dot(a,b),-1,1)), out=[]; if(ang<1e-9) return [a];
  var sa=Math.sin(ang);
  for(var i=0;i<=n;i++){var e=i/n, k0=Math.sin((1-e)*ang)/sa, k1=Math.sin(e*ang)/sa; out.push([a[0]*k0+b[0]*k1,a[1]*k0+b[1]*k1,a[2]*k0+b[2]*k1]);}
  return out;
}
function seen(P){        /* un point de l'espace est-il visible, ou caché derrière la Terre ? -> pixel ou null */
  var dx=P[0]-eye[0], dy=P[1]-eye[1], dz=P[2]-eye[2], A=dx*dx+dy*dy+dz*dz, B=eye[0]*dx+eye[1]*dy+eye[2]*dz, q=B*B-A*(eyeD*eyeD-1);
  if(q>0&&B<0&&(-B-Math.sqrt(q))/A<0.999) return null;
  var zf=dx*fwd[0]+dy*fwd[1]+dz*fwd[2]; if(zf<=1e-6) return null;
  return [((dx*rgt[0]+dy*rgt[1]+dz*rgt[2])/(zf*TANV*aspect)*0.5+0.5)*W,(0.5-(dx*upv[0]+dy*upv[1]+dz*upv[2])/(zf*TANV)*0.5)*H];
}
function drawAxis(ctx){   /* l'axe dépasse des deux pôles ; une flèche courbe indique le sens de rotation, d'ouest en est */
  var L=0.3+Math.min(0.05,opt.ex*0.0006), i, p, pen;
  ctx.save(); ctx.lineCap='round'; ctx.lineJoin='round';
  function path(pts){ ctx.beginPath(); pen=false; var last=null, prev=null;
    pts.forEach(function(P){ p=seen(P); if(!p){pen=false; return;} if(pen) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); pen=true; prev=last; last=p; });
    ctx.lineWidth=5; ctx.strokeStyle='rgba(5,8,20,0.7)'; ctx.stroke(); ctx.lineWidth=2.2; ctx.strokeStyle='#fff'; ctx.stroke();
    return last&&prev?[prev,last]:null; }
  [1,-1].forEach(function(sg){
    var pts=[]; for(i=0;i<=10;i++) pts.push([0,sg*(1+L*i/10),0]);
    path(pts);
    p=seen([0,sg*(1+L),0]);
    if(p){ ctx.font='700 13px '+FONT; ctx.textAlign='left'; ctx.lineWidth=3; ctx.strokeStyle='rgba(5,8,20,0.85)'; ctx.strokeText(sg>0?'N':'S',p[0]+9,p[1]); ctx.fillStyle='#fff'; ctx.fillText(sg>0?'N':'S',p[0]+9,p[1]); }
  });
  /* flèche autour de l'axe, au-dessus du pôle Nord : la longitude croît dans le sens de la rotation */
  var arc=[], r=0.13, y=1+L*0.62, a0=cam.lon*DEG-2.3;      /* la flèche finit sur le devant, pointe vers l'est */
  for(i=0;i<=28;i++){var a=a0+i/28*3.2; arc.push([r*Math.cos(a),y,-r*Math.sin(a)]);}
  var end=path(arc);
  if(end&&pen){ var ang=Math.atan2(end[1][1]-end[0][1],end[1][0]-end[0][0]), x=end[1][0], yy=end[1][1];
    ctx.beginPath(); ctx.moveTo(x+Math.cos(ang)*7,yy+Math.sin(ang)*7); ctx.lineTo(x+Math.cos(ang+2.4)*6,yy+Math.sin(ang+2.4)*6); ctx.lineTo(x+Math.cos(ang-2.4)*6,yy+Math.sin(ang-2.4)*6); ctx.closePath();
    ctx.fillStyle='#fff'; ctx.strokeStyle='rgba(5,8,20,0.7)'; ctx.lineWidth=1; ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
function drawOverlay(){
  var ctx=lctx; ctx.setTransform(DPR,0,0,DPR,0,0); ctx.clearRect(0,0,W,H);
  footH=(foot.offsetHeight||30)+2;
  if(soft) drawSoftLines(ctx);
  boxes=[]; ctx.textBaseline='middle'; ctx.lineJoin='round'; ctx.lineWidth=3; ctx.strokeStyle='rgba(5,8,20,0.85)';
  var ex=opt.ex/6371008.8, i, o, p, rng=cam.range, edge=0.10*(1-1/eyeD)+0.01;
  function hOf(o){ if(o.h===undefined||o.hv!==elevVer){o.h=Math.max(0,elevAt(o.lat,o.lon)); o.hv=elevVer;} return o.h*ex; }

  if(opt.axis) drawAxis(ctx);
  /* trajet mesuré */
  if(measure.pts.length){
    ctx.save(); ctx.lineWidth=2.5; ctx.strokeStyle='#ffd24a'; ctx.beginPath();
    for(i=0;i+1<measure.pts.length;i++){
      var pen=false; arcPts(measure.pts[i].v,measure.pts[i+1].v,48).forEach(function(v){
        var q=project(v,Math.max(0,elevAt(v2ll(v).lat,v2ll(v).lon))*ex);
        if(!q){pen=false; return;} if(pen) ctx.lineTo(q[0],q[1]); else ctx.moveTo(q[0],q[1]); pen=true; });
    }
    ctx.stroke();
    measure.pts.forEach(function(m){ var q=project(m.v,hOf(m)); if(!q) return;
      ctx.beginPath(); ctx.arc(q[0],q[1],4.5,0,TAU); ctx.fillStyle='#ffd24a'; ctx.fill(); ctx.lineWidth=1.5; ctx.strokeStyle='#151a2d'; ctx.stroke(); });
    ctx.restore();
  }
  /* repère du lieu choisi : toujours affiché, il passe avant les autres étiquettes */
  if(pin){
    p=project(pin.v,hOf(pin));
    if(p){
      ctx.save(); ctx.beginPath(); ctx.arc(p[0],p[1],6,0,TAU); ctx.fillStyle='#ffd24a'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#151a2d'; ctx.stroke(); ctx.restore();
      label(p,pin.n,'600 13px '+FONT,'#ffd24a','left',11,0);
    }
  }
  if(opt.sun){
    var s=sunPos(); p=project(ll2v(s.lat,s.lon),0);
    if(p){
      ctx.save(); ctx.fillStyle='#ffd24a'; ctx.strokeStyle='#ffd24a'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(p[0],p[1],4,0,TAU); ctx.fill();
      for(i=0;i<8;i++){var a=i*TAU/8; ctx.beginPath(); ctx.moveTo(p[0]+Math.cos(a)*7,p[1]+Math.sin(a)*7); ctx.lineTo(p[0]+Math.cos(a)*10.5,p[1]+Math.sin(a)*10.5); ctx.stroke();}
      ctx.restore();
      label(p,t('zenith'),'500 12px '+FONT,'#ffd24a','left',15,0);
    }
  }
  if(opt.circles||opt.equator){
    CIRCLES.forEach(function(c){
      if(c[0]?!opt.circles:!opt.equator) return;
      var v=ll2v(c[0],cam.lon+(rng>1.2?-28:-rng*14)); if(limb(v)<edge) return;
      p=project(v,0); if(p) label(p,t(c[1]),'500 11px '+FONT,'rgba(255,214,110,0.95)','center',0,-10);
    });
  }
  if(!opt.names){return;}
  var count=0, box=Math.min(90,Math.acos(1/eyeD)/DEG+2), boxL=Math.abs(cam.lat)+box>80?180:box/Math.cos((Math.abs(cam.lat)+box)*DEG);
  function run(list,font,color,test,upper,dot2,n){
    if(n===undefined) n=list.length;
    for(var i=0;i<n&&count<110;i++){
      var o=list[i]; if(test&&!test(o)) continue;
      if(dot2){                                   /* villes : tri grossier par latitude et longitude avant tout calcul */
        var dl=o.lat-cam.lat; if(dl>box||dl<-box) continue;
        if(boxL<180){ dl=o.lon-cam.lon; if(dl>180) dl-=360; else if(dl<-180) dl+=360; if(dl>boxL||dl<-boxL) continue; }
        if(!o.v) o.v=ll2v(o.lat,o.lon);
      }
      if(limb(o.v)<edge) continue;
      var p=project(o.v,hOf(o)); if(!p||p[0]<0||p[0]>W||p[1]<0||p[1]>H) continue;
      var txt=upper?o.n[li].toUpperCase():o.n[li];
      if(dot2){
        if(label(p,txt,font,color,'left',7,0)){
          ctx.beginPath(); ctx.arc(p[0],p[1],o.cap?3.2:2.4,0,TAU); ctx.fillStyle=o.cap?'#ffd24a':'#fff'; ctx.fill(); ctx.lineWidth=1.2; ctx.strokeStyle='rgba(5,8,20,0.9)'; ctx.stroke(); ctx.lineWidth=3; ctx.strokeStyle='rgba(5,8,20,0.85)';
          count++;
        }
      } else if(label(p,txt,font,color,'center',0,0)) count++;
    }
  }
  if(rng>=2.4) run(conts,'600 13px '+FONT,'rgba(255,255,255,0.96)',null,true);
  if(rng>=0.9) run(oceans,'italic 500 13px '+FONT,'rgba(178,210,255,0.95)');
  if(places){
    var cmax=3.05-Math.log2(rng), tmax=Math.round(1.5-3*Math.log2(rng));
    if(rng<2.4) run(places.countries,'600 12px '+FONT,'rgba(255,255,255,0.96)',function(o){return o.rank<=cmax;},true);
    if(rng<1.1) run(seas,'italic 500 12px '+FONT,'rgba(178,210,255,0.95)');
    if(tmax>=0){
      run(places.cities,'500 12px '+FONT,'rgba(255,255,255,0.97)',null,false,true,places.ends[Math.min(tmax,M.rank)]);
      if(tmax>=12) needPlaces(tmax);
    }
  }
}

/* ---------- barre d'état ---------- */
var hud={};
function setText(id,s){ if(hud[id]!==s){hud[id]=s; $(id).textContent=s;} }
function updateHud(){
  var P=hover?pick(hover.x,hover.y):null, g=P?v2ll(P):{lat:cam.lat,lon:cam.lon};
  if(hover&&!P){ setText('gCoord','—'); setText('gElev',''); }
  else{
    setText('gCoord',coordStr(g.lat,g.lon));
    if(!M.elev) setText('gElev','');
    else if(elev){var e=elevAt(g.lat,g.lon); setText('gElev',e>=0?tf('elev',nf(Math.round(e/10)*10,0)):tf('depth',nf(Math.round(-e/10)*10,0)));}
  }
  var km=(eyeD-1)*RKM; setText('gAlt',tf('eye',nf(km>=1000?Math.round(km/10)*10:Math.round(km),0)));
  setText('gEx',soft?t('softNote'):opt.ex>1&&M.elev&&elev?tf('ex',opt.ex):'');
  var sc=$('gScale');
  if(cam.range>1.3||cam.tilt>0.9){ if(!sc.hidden) sc.hidden=true; }
  else{
    var kmpp=cam.range*2*TANV/H*RKM, raw=kmpp*110, pw=Math.pow(10,Math.floor(Math.log10(raw))), nice=raw/pw>=5?5*pw:raw/pw>=2?2*pw:pw;
    if(sc.hidden) sc.hidden=false;
    $('gScaleBar').style.width=Math.round(nice/kmpp)+'px'; setText('gScaleTxt',nf(nice,0)+' km');
  }
  if(lesson.on){
    var sp=sunPos(), html;
    if(pin){
      var al=Math.asin(clamp(dot(pin.v,ll2v(sp.lat,sp.lon)),-1,1))/DEG;
      html=tf(al>=0?'jUp':al>-6?'jTw':'jDown','\u0001',nf(Math.abs(al),0)).replace('\u0001',esc(pin.n));
    } else html=tf('jNoon',lonStr(sp.lon),lonStr(wrap180(sp.lon+180)));
    if(hud.jLive!==html){hud.jLive=html; $('jLive').innerHTML=html;}
  }
  $('gNeedle').setAttribute('transform','rotate('+(-cam.heading/DEG).toFixed(1)+' 12 12)');
  var tb=$('gTilt'), tp=String(cam.tilt>0.05); if(tb.getAttribute('aria-pressed')!==tp) tb.setAttribute('aria-pressed',tp);
}

/* ---------- gestes ---------- */
var ptrs=new Map(), drag=null, pinch=null, lastClick=0, handlers={};
function xy(ev){var r=glc.getBoundingClientRect(); return {x:ev.clientX-r.left,y:ev.clientY-r.top};}
function panBy(dx,dy){      /* déplacement en pixels quand le pointeur n'est plus sur le globe */
  var k=cam.range*2*TANV/H/DEG, ch=Math.cos(cam.heading), sh=Math.sin(cam.heading);
  var e=-(dx*ch-dy*sh)*k, n=(dx*sh+dy*ch)*k;
  cam.lat=clamp(cam.lat+n,-90,90); cam.lon+=e/Math.max(0.15,Math.cos(cam.lat*DEG));
}
glc.addEventListener('pointerdown',handlers.pointerdown=function(ev){
  var p=xy(ev); glc.focus({preventScroll:true});
  try{glc.setPointerCapture(ev.pointerId);}catch(e){}
  ptrs.set(ev.pointerId,p); stopMotion(); closePanels();
  if(ptrs.size===1){
    clampCam(); updateCam();
    drag={orbit:ev.button===2||ev.shiftKey||ev.ctrlKey, x0:p.x,y0:p.y,lx:p.x,ly:p.y, P:pick(p.x,p.y), moved:false};
    glc.classList.add('drag');
  } else if(ptrs.size===2){
    var a=[]; ptrs.forEach(function(q){a.push(q);});
    var cx=(a[0].x+a[1].x)/2, cy=(a[0].y+a[1].y)/2;
    clampCam(); updateCam();
    pinch={d:Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y)||1, a:Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x), cx:cx, cy:cy,
           range:cam.range, heading:cam.heading, tilt:cam.tilt, P:pick(cx,cy)};
    drag=null;
  }
});
glc.addEventListener('pointermove',handlers.pointermove=function(ev){
  var p=xy(ev);
  if(!ptrs.has(ev.pointerId)){ if(ev.pointerType==='mouse'){hover=p; dirty=true;} return; }
  ptrs.set(ev.pointerId,p);
  if(pinch&&ptrs.size>=2){
    var a=[]; ptrs.forEach(function(q){a.push(q);});
    var d=Math.hypot(a[1].x-a[0].x,a[1].y-a[0].y)||1, an=Math.atan2(a[1].y-a[0].y,a[1].x-a[0].x), cy=(a[0].y+a[1].y)/2;
    var da=an-pinch.a; da=Math.atan2(Math.sin(da),Math.cos(da));
    cam.range=pinch.range*pinch.d/d; cam.heading=pinch.heading-da; cam.tilt=pinch.tilt+(pinch.cy-cy)*0.006;
    if(pinch.P) grabTo(pinch.P,pinch.cx,pinch.cy);
    dirty=true; return;
  }
  if(!drag) return;
  var dx=p.x-drag.lx, dy=p.y-drag.ly; drag.lx=p.x; drag.ly=p.y;
  if(!drag.moved&&Math.hypot(p.x-drag.x0,p.y-drag.y0)<4) return;
  drag.moved=true;
  if(drag.orbit){ cam.heading-=dx*0.006; cam.tilt-=dy*0.006; }
  else if(!(drag.P&&grabTo(drag.P,p.x,p.y))) panBy(dx,dy);
  if(ev.pointerType==='mouse') hover=p;
  dirty=true;
});
function endPtr(ev){
  var had=ptrs.has(ev.pointerId); ptrs.delete(ev.pointerId);
  if(pinch&&ptrs.size<2){ pinch=null; drag=null; ptrs.clear(); }
  if(drag&&had&&ptrs.size===0){
    var p=xy(ev), moved=drag.moved, orbit=drag.orbit; drag=null; glc.classList.remove('drag');
    if(!moved&&!orbit&&ev.type==='pointerup'){
      var now=performance.now();
      if(measure.on) addMeasure(p.x,p.y);
      else if(now-lastClick<350){ zoomBy(0.45,p.x,p.y); now=0; }
      lastClick=now;
    }
  }
  if(ptrs.size===0) glc.classList.remove('drag');
}
handlers.pointerup=handlers.pointercancel=endPtr;
glc.addEventListener('pointerup',endPtr); glc.addEventListener('pointercancel',endPtr);
glc.addEventListener('pointerleave',handlers.pointerleave=function(){ if(hover){hover=null; dirty=true;} });
glc.addEventListener('contextmenu',handlers.contextmenu=function(ev){ev.preventDefault();});
glc.addEventListener('wheel',handlers.wheel=function(ev){
  ev.preventDefault();
  var p=xy(ev), d=ev.deltaY*(ev.deltaMode===1?32:ev.deltaMode===2?400:1);
  if(ev.ctrlKey) d*=6;                                  /* pincement sur pavé tactile */
  zoomBy(Math.exp(clamp(d,-240,240)*0.0022),p.x,p.y);
},{passive:false});
glc.addEventListener('keydown',handlers.keydown=function(ev){
  var k=ev.key, s=H*0.12, used=true;
  if(k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown'){
    stopMotion();
    var dx=k==='ArrowLeft'?1:k==='ArrowRight'?-1:0, dy=k==='ArrowUp'?1:k==='ArrowDown'?-1:0;
    if(ev.shiftKey){ cam.heading+=dx*0.12; cam.tilt+=dy*0.1; } else panBy(dx*s,dy*s);
  }
  else if(k==='+'||k==='=') zoomBy(0.6);
  else if(k==='-'||k==='_') zoomBy(1/0.6);
  else if(k==='n'||k==='N') flyTo({lat:cam.lat,lon:cam.lon,heading:0,tilt:0});
  else if(k==='Home') goHome();
  else if(k==='Escape'&&measure.on) setMeasure(false);
  else used=false;
  if(used){ev.preventDefault(); dirty=true;}
});

/* ---------- mesure ---------- */
function measureMsg(){
  var n=measure.pts.length;
  if(n<2){showMsg(t(n?'m1':'m0')); return;}
  var km=0; for(var i=0;i+1<n;i++) km+=Math.acos(clamp(dot(measure.pts[i].v,measure.pts[i+1].v),-1,1))*RKM;
  showMsg(tf('mD',nf(km,km<100?1:0),n>2?tf('mSeg',n-1):''));
}
function addMeasure(x,y){
  var P=pick(x,y); if(!P) return;
  var g=v2ll(P); measure.pts.push({v:norm(P),lat:g.lat,lon:g.lon}); measureMsg(); dirty=true;
}
function setMeasure(on){
  measure.on=on; measure.pts=[]; tourMsg=null;
  $('gMeasure').setAttribute('aria-pressed',String(on)); glc.classList.toggle('measure',on);
  if(on) measureMsg(); else showMsg('');
  dirty=true;
}

/* ---------- recherche ---------- */
var qIn=$('gq'), qPop=$('gqPop'), qList=$('gqList'), qHead=$('gqHead'), qItems=[], qAct=-1;
function parseCoords(s){
  s=s.trim().toLowerCase().replace(/[−–]/g,'-').replace(/º/g,'°');
  var m=/^(-?\d+(?:\.\d+)?)\s*°?\s*([ns])?\s*[\s,;]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([eow])?$/.exec(s)
      ||/^(-?\d+(?:,\d+)?)\s*°?\s*([ns])?\s*[\s;]\s*(-?\d+(?:,\d+)?)\s*°?\s*([eow])?$/.exec(s);
  if(!m) return null;
  var lat=parseFloat(m[1].replace(',','.')), lon=parseFloat(m[3].replace(',','.'));
  if(m[2]==='s') lat=-Math.abs(lat); if(m[4]==='o'||m[4]==='w') lon=-Math.abs(lon);
  if(Math.abs(lat)>90||Math.abs(lon)>180) return null;
  return {lat:lat,lon:lon};
}
function search(txt){
  var out=[], c=parseCoords(txt);
  if(c) return [{coords:true,lat:c.lat,lon:c.lon,n:[coordStr(c.lat,c.lon),coordStr(c.lat,c.lon)]}];
  var q=fold(txt); if(!q||!places) return out;
  needPlaces(14);
  function score(o){
    if(o.k===null){ o.k=fold(o.n[0]); o.k2=o.n[1]===o.n[0]?o.k:fold(o.n[1]); }        /* clés calculées à la première recherche */
    var a=o.k, b=o.k2;
    if(a===q||b===q) return 0;
    if(a.indexOf(q)===0||b.indexOf(q)===0) return 1;
    if((' '+a).indexOf(' '+q)>=0||(' '+b).indexOf(' '+q)>=0) return 2;
    return q.length>=3&&(a.indexOf(q)>=0||b.indexOf(q)>=0)?3:-1;
  }
  places.countries.forEach(function(o){var s=score(o); if(s>=0) out.push([s*100+o.rank-4,o]);});
  for(var ci=0, cn=places.ends[M.rank], cs=places.cities; ci<cn; ci++){ var o=cs[ci], sc=score(o); if(sc>=0) out.push([sc*100+o.rank-(o.cap?2:0)-Math.min(3,o.pop/3000),o]); }
  out.sort(function(x,y){return x[0]-y[0]});
  return out.slice(0,8).map(function(x){return x[1]});
}
function kindOf(o){return o.coords?t('coords'):o.type===0?t('country'):o.cap?t('capital'):t('city');}
function renderSearch(){
  var txt=qIn.value.trim();
  qItems=txt?search(txt):[]; qAct=qItems.length?0:-1;
  var h='';
  qItems.forEach(function(o,i){
    var sub='';
    if(o.type===1&&places){       /* ville : province ou État, puis pays */
      var ad=o.ai>=0&&places.admins[o.ai], an=ad?(li&&ad[1]?ad[1]:ad[0]):'', cn=o.ci>=0?places.countries[o.ci].n[li]:'';
      sub=an&&an!==cn?(cn?an+', '+cn:an):cn;
    }
    h+='<li role="option" id="gq-'+i+'" data-i="'+i+'" aria-selected="'+(i===qAct)+'" class="'+(i===qAct?'act':'')+'"><span class="n">'+esc(o.n[li])+(sub?' <span class="c">'+esc(sub)+'</span>':'')+'</span><span class="l">'+kindOf(o)+'</span></li>';
  });
  qList.innerHTML=h; qList.hidden=!qItems.length;
  var none=txt&&!qItems.length&&places; qHead.textContent=none?t('none'):''; qHead.hidden=!none;
  var open=!!txt&&(qItems.length>0||none);
  qPop.hidden=!open; qIn.setAttribute('aria-expanded',String(open));
  if(qAct>=0) qIn.setAttribute('aria-activedescendant','gq-'+qAct); else qIn.removeAttribute('aria-activedescendant');
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function setAct(i){
  var old=qList.querySelector('.act'); if(old){old.classList.remove('act'); old.setAttribute('aria-selected','false');}
  qAct=i; var el=qList.children[i]; if(!el) return;
  el.classList.add('act'); el.setAttribute('aria-selected','true'); qIn.setAttribute('aria-activedescendant',el.id);
}
function closeSearch(){qPop.hidden=true; qIn.setAttribute('aria-expanded','false'); qIn.removeAttribute('aria-activedescendant');}
function choosePlace(o){
  var range=o.coords?0.25:o.type===0?clamp(o.span*DEG*1.9,0.08,1.7):(o.rank<=2?0.14:0.1);
  pin={v:ll2v(o.lat,o.lon),lat:o.lat,lon:o.lon,n:o.n[li],src:o};
  tourMsg=null; if(!measure.on) showMsg('');
  flyTo({lat:o.lat,lon:o.lon,range:range});
  qIn.value=o.n[li]; closeSearch(); if(coarse) qIn.blur();
}
qIn.addEventListener('input',renderSearch);
qIn.addEventListener('focus',function(){ $('gPanel').hidden=true; $('gLayers').setAttribute('aria-expanded','false'); if(qIn.value.trim()) renderSearch(); });
qIn.addEventListener('keydown',function(ev){
  var k=ev.key, n=qItems.length;
  if((k==='ArrowDown'||k==='ArrowUp')&&n){ ev.preventDefault(); if(qPop.hidden) renderSearch(); else setAct(k==='ArrowDown'?(qAct+1)%n:(qAct+n-1)%n); }
  else if(k==='Enter'){ ev.preventDefault(); if(qPop.hidden) renderSearch(); if(qAct>=0&&qItems[qAct]) choosePlace(qItems[qAct]); }
  else if(k==='Escape'){ if(!qPop.hidden){ev.preventDefault(); closeSearch();} else if(qIn.value){ev.preventDefault(); qIn.value=''; pin=null; dirty=true;} }
});
qIn.addEventListener('blur',function(){setTimeout(closeSearch,0);});
qPop.addEventListener('mousedown',function(ev){ev.preventDefault();});
qList.addEventListener('click',function(ev){var el=ev.target.closest('li'); if(el) choosePlace(qItems[+el.getAttribute('data-i')]);});
function closePanels(){ closeSearch(); }

/* ---------- commandes ---------- */
function goHome(){ pin=null; tourMsg=null; if(!measure.on) showMsg(''); flyTo({lat:clamp(cam.lat,-35,45),lon:cam.lon,range:homeRange()}); }
$('gLayers').addEventListener('click',function(){
  var p=$('gPanel'); p.hidden=!p.hidden; this.setAttribute('aria-expanded',String(!p.hidden)); if(!p.hidden) closeSearch();
});
$('gNorth').addEventListener('click',function(){ if(lesson.on&&lesson.ecl) setEcl(false); flyTo({lat:cam.lat,lon:cam.lon,heading:0,tilt:cam.tilt});});
$('gIn').addEventListener('click',function(){zoomBy(0.55);});
$('gOut').addEventListener('click',function(){zoomBy(1/0.55);});
$('gTilt').addEventListener('click',function(){
  var up=cam.tilt>0.05;
  flyTo({lat:cam.lat,lon:cam.lon,heading:cam.heading,tilt:up?0:58*DEG,range:up?cam.range:Math.min(cam.range,1.5)});
});
$('gHome').addEventListener('click',goHome);
$('gMeasure').addEventListener('click',function(){setMeasure(!measure.on);});
$('gFull').addEventListener('click',function(){
  try{
    if(document.fullscreenElement) document.exitFullscreen();
    else{var p=stage.requestFullscreen&&stage.requestFullscreen(); if(p&&p.catch) p.catch(function(){});}
  }catch(e){}
});
/* Une même option peut avoir une case dans les calques du globe et une autre dans la leçon : elles restent d'accord. */
function setOpt(name,val){
  opt[name]=val;
  document.querySelectorAll('[data-opt="'+name+'"]').forEach(function(el){el.checked=val;});
  if(name==='sun') $('gSunBox').hidden=!val;
  dirty=true;
}
document.querySelectorAll('[data-opt]').forEach(function(el){
  el.addEventListener('change',function(){
    var name=el.getAttribute('data-opt');
    setOpt(name,el.checked); lesson.auto[name]=false;          /* un choix fait à la main n'est plus défait par les étapes */
    if(name==='sun'){ if(!el.checked) sunSt.playing=false; syncSun(); }
    savePrefs();
  });
});
$('gRelief').addEventListener('input',function(){opt.ex=+this.value; $('gReliefOut').textContent='× '+opt.ex; dirty=true; savePrefs();});
$('gDay').addEventListener('input',function(){sunSt.day=+this.value; syncSun(); dirty=true;});
$('gHour').addEventListener('input',function(){sunSt.hour=Math.min(+this.value,23.999); sunSt.playing=false; syncSun(); dirty=true;});
$('gNow').addEventListener('click',function(){sunSt.playing=false; setNow(); syncSun(); dirty=true;});
$('gSpin').addEventListener('click',function(){sunSt.playing=!sunSt.playing; syncSun(); dirty=true;});

var toursEl=$('gTours');
function renderTours(){
  toursEl.innerHTML=TOURS.map(function(x,i){return '<button type="button" data-tour="'+i+'">'+x[5+li]+'</button>';}).join('');
}
toursEl.addEventListener('click',function(ev){
  var b=ev.target.closest('button'); if(!b) return;
  var x=TOURS[+b.getAttribute('data-tour')];
  if(measure.on) setMeasure(false);
  pin=null; tourMsg=x; showMsg(x[7+li]);
  flyTo({lat:x[0],lon:x[1],range:x[2],tilt:x[3]*DEG,heading:x[4]*DEG});
  var r=stage.getBoundingClientRect(); if(r.top<0||r.bottom>window.innerHeight+80) stage.scrollIntoView({block:'nearest',behavior:reduce?'auto':'smooth'});
});

/* ---------- niveau de détail ---------- */
function showMode(){
  document.querySelectorAll('#gMode button').forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-mode')===mode));});
  $('gModeTxt').textContent=t(M.txt);
  $('gRelief').closest('.row').hidden=soft||!M.elev;
}
function setMode(m,chosen){
  mode=m; M=MODES[m]; if(chosen) modeChosen=true;
  showMode();
  if(inited&&(gl||soft)){
    if(M.elev&&!elevState) loadElev(); else { elevVer++; rebuildLines(); }       /* le relief apparaît ou s'aplatit */
    needSmall(); W=0; dirty=true;                                                 /* W=0 : la toile est redimensionnée à la netteté du mode */
  }
  if(chosen) savePrefs();
}
$('gMode').addEventListener('click',function(ev){var b=ev.target.closest('button'); if(b) setMode(b.getAttribute('data-mode'),true);});

/* ---------- leçon « Jour et nuit » ---------- */
function jCity(){
  var c=JCITIES[Math.max(0,lesson.city)], o=lesson.city<0&&lesson.place?lesson.place:{lat:c[2],lon:c[3],n:[c[0],c[1]]};
  return {v:ll2v(o.lat,o.lon),lat:o.lat,lon:o.lon,n:o.n[li],src:{n:o.n}};
}
function renderJ(){
  $('jCities').innerHTML=JCITIES.map(function(c,i){return '<button type="button" data-jcity="'+i+'" aria-pressed="'+(i===lesson.city&&lesson.step===2)+'">'+c[li]+'</button>';}).join('');
  document.querySelectorAll('#jSteps li').forEach(function(el){
    var on=+el.getAttribute('data-step')===lesson.step; el.classList.toggle('on',on);
    if(on) el.setAttribute('aria-current','step'); else el.removeAttribute('aria-current');
  });
}
function applyStep(i){
  lesson.step=i; stopMotion(); if(measure.on) setMeasure(false); tourMsg=null; showMsg('');
  /* Chaque étape allume ce qu'elle commente et éteint ce qu'une étape précédente avait allumé, sans toucher aux choix de l'utilisateur. */
  var need={grid:i===3,equator:i===4,circles:i===4};
  setOpt('sun',true);
  for(var k in need){
    if(need[k]&&!opt[k]){ setOpt(k,true); lesson.auto[k]=true; }
    else if(!need[k]&&lesson.auto[k]){ setOpt(k,false); lesson.auto[k]=false; }
  }
  if(i===4&&lesson.day!==null) sunSt.day=lesson.day;        /* les autres étapes gardent la date choisie */
  pin=i===2?jCity():(i===4?pin:null);
  var sl=sunPos().lon;
  resize(); cam.heading=0; cam.tilt=0;
  cam.range=Math.max(1.6/Math.sin(FOV/2*0.97),1.1/Math.sin(Math.atan(TANV*aspect)))-1;     /* la Terre et son axe tiennent dans le cadre */
  if(i===3){ lesson.follow=null; cam.lat=15; cam.lon=sl-25; }
  else{
    lesson.follow=i===4?-90:-75;
    lesson.elev=i===2&&pin.lat<-15?-0.16:0.16;                 /* hauteur de la caméra au-dessus du plan de l'orbite */
    cam.lat=i===2?clamp(pin.lat*0.55,-30,30):i===4?clamp(sunPos().lat*1.1,-25,25):12;
    cam.lon=wrap180(sl+lesson.follow);
  }
  sunSt.playing=i>0&&!reduce;
  if(i===4&&lesson.day!==null) lesson.today=false;
  syncSun(); renderJ(); dirty=true; savePrefs();
}
$('jSteps').addEventListener('click',function(ev){
  var li0=ev.target.closest('li[data-step]'); if(!li0) return;
  var b=ev.target.closest('button'); if(!b) return;
  var st=+li0.getAttribute('data-step');
  if(b.hasAttribute('data-jcity')){ lesson.city=+b.getAttribute('data-jcity'); st=2; jq.value=''; }
  lesson.day=b.hasAttribute('data-jday')?+b.getAttribute('data-jday'):(st===4&&b.classList.contains('go')&&lesson.step!==4?171:null);
  if(lesson.day!==null) st=4;
  applyStep(st);
  var r=stage.getBoundingClientRect(); if(r.bottom<120||r.top>window.innerHeight-120) stage.scrollIntoView({block:'nearest',behavior:reduce?'auto':'smooth'});
});
$('jPlay').addEventListener('click',function(){sunSt.playing=!sunSt.playing; syncSun(); dirty=true;});
function setEcl(on){
  lesson.ecl=on;
  $('jViewEcl').setAttribute('aria-pressed',String(on)); $('jViewNorth').setAttribute('aria-pressed',String(!on));
  if(lesson.follow!==null){
    if(on){ var B=eclBasis(), U=ll2v(cam.lat,cam.lon); lesson.follow=Math.atan2(dot(U,B.P),dot(U,B.S))/DEG; lesson.elev=clamp(Math.asin(clamp(dot(U,B.Ne),-1,1)),-1.3,1.3); }
    else lesson.follow=wrap180(cam.lon-sunPos().lon);
  }
  if(!on) cam.heading=0;
  dirty=true;
}
$('jViewEcl').addEventListener('click',function(){setEcl(true); savePrefs();});
$('jViewNorth').addEventListener('click',function(){setEcl(false); savePrefs();});
/* champ « ville à suivre » de l'étape 3 */
var jq=$('jq'), jqPop=$('jqPop'), jqList=$('jqList'), jqHead=$('jqHead'), jqItems=[], jqAct=-1;
function jqClose(){jqPop.hidden=true; jq.setAttribute('aria-expanded','false'); jq.removeAttribute('aria-activedescendant');}
function jqRender(){
  var txt=jq.value.trim();
  jqItems=txt?search(txt).filter(function(o){return o.coords||o.type===1;}):[]; jqAct=jqItems.length?0:-1;
  jqList.innerHTML=jqItems.map(function(o,i){
    var sub='';
    if(o.type===1&&places){ var ad=o.ai>=0&&places.admins[o.ai], an=ad?(li&&ad[1]?ad[1]:ad[0]):'', cn=o.ci>=0?places.countries[o.ci].n[li]:''; sub=an&&an!==cn?(cn?an+', '+cn:an):cn; }
    return '<li role="option" id="jq-'+i+'" data-i="'+i+'" aria-selected="'+(i===jqAct)+'" class="'+(i===jqAct?'act':'')+'"><span class="n">'+esc(o.n[li])+(sub?' <span class="c">'+esc(sub)+'</span>':'')+'</span></li>';
  }).join('');
  jqList.hidden=!jqItems.length;
  var none=txt&&!jqItems.length&&places; jqHead.textContent=none?t('none'):''; jqHead.hidden=!none;
  var open=!!txt&&(jqItems.length>0||none); jqPop.hidden=!open; jq.setAttribute('aria-expanded',String(open));
  if(jqAct>=0) jq.setAttribute('aria-activedescendant','jq-'+jqAct); else jq.removeAttribute('aria-activedescendant');
}
function jqChoose(o){
  lesson.city=-1; lesson.place={lat:o.lat,lon:o.lon,n:o.n};
  jq.value=o.n[li]; jqClose(); if(coarse) jq.blur();
  lesson.day=null; applyStep(2);
  var r=stage.getBoundingClientRect(); if(r.bottom<120||r.top>window.innerHeight-120) stage.scrollIntoView({block:'nearest',behavior:reduce?'auto':'smooth'});
}
jq.addEventListener('input',jqRender);
jq.addEventListener('keydown',function(ev){
  var k=ev.key, n=jqItems.length;
  if((k==='ArrowDown'||k==='ArrowUp')&&n){
    ev.preventDefault(); if(jqPop.hidden){jqRender(); return;}
    var old=jqList.querySelector('.act'); if(old){old.classList.remove('act'); old.setAttribute('aria-selected','false');}
    jqAct=k==='ArrowDown'?(jqAct+1)%n:(jqAct+n-1)%n;
    var el=jqList.children[jqAct]; el.classList.add('act'); el.setAttribute('aria-selected','true'); jq.setAttribute('aria-activedescendant',el.id);
  }
  else if(k==='Enter'){ ev.preventDefault(); if(jqPop.hidden) jqRender(); if(jqAct>=0&&jqItems[jqAct]) jqChoose(jqItems[jqAct]); }
  else if(k==='Escape'&&!jqPop.hidden){ ev.preventDefault(); jqClose(); }
});
jq.addEventListener('blur',function(){setTimeout(jqClose,0);});
jqPop.addEventListener('mousedown',function(ev){ev.preventDefault();});
jqList.addEventListener('click',function(ev){var el=ev.target.closest('li'); if(el) jqChoose(jqItems[+el.getAttribute('data-i')]);});
$('jDay').addEventListener('input',function(){sunSt.day=+this.value; lesson.today=false; syncSun(); dirty=true; savePrefs();});
$('jToday').addEventListener('click',function(){var h=sunSt.hour; setNow(); sunSt.hour=h; lesson.today=true; syncSun(); dirty=true; savePrefs();});
$('jSpeed').addEventListener('input',function(){speed=SPEEDS[+this.value]; syncSun(); savePrefs();});
function enterLesson(){
  savePrefs();                                      /* réglages du globe, tels qu'on les quitte */
  $('jStage').appendChild(stage);
  lesson.saved={cam:{lat:cam.lat,lon:cam.lon,range:cam.range,heading:cam.heading,tilt:cam.tilt},pin:pin,day:sunSt.day,hour:sunSt.hour};
  lesson.on=true; lesson.auto={}; $('gPanel').hidden=true; $('gLayers').setAttribute('aria-expanded','false');
  var L=prefs.lesson;                               /* la leçon reprend là où on l'avait laissée */
  lesson.step=L.step; lesson.city=L.city; lesson.place=L.place; lesson.day=null;
  setNow(); lesson.today=L.day===null; if(!lesson.today) sunSt.day=L.day;
  speed=SPEEDS[L.speed]; $('jSpeed').value=L.speed;
  lesson.ecl=L.ecl; $('jViewEcl').setAttribute('aria-pressed',String(L.ecl)); $('jViewNorth').setAttribute('aria-pressed',String(!L.ecl));
  $('jq').value=lesson.city<0&&lesson.place?lesson.place.n[li]:'';
  SHOWN.forEach(function(k){setOpt(k,L.show[k]);});
  applyStep(lesson.step);
}
function leaveLesson(){
  var sv=lesson.saved; savePrefs();
  lesson.on=false; lesson.follow=null; sunSt.playing=false; speed=1;
  $('gSlot').appendChild(stage);
  SHOWN.forEach(function(k){setOpt(k,prefs.globe[k]);}); setOpt('sun',prefs.globe.sun);
  if(sv){ cam.lat=sv.cam.lat; cam.lon=sv.cam.lon; cam.range=sv.cam.range; cam.heading=sv.cam.heading; cam.tilt=sv.cam.tilt; pin=sv.pin; sunSt.day=sv.day; sunSt.hour=sv.hour; }
  stopMotion(); syncSun(); dirty=true;
}
/* au chargement : le niveau de détail choisi, sinon « standard » sur écran tactile et « complet » ailleurs */
if(prefs.globe.mode){ mode=prefs.globe.mode; modeChosen=true; } else mode=coarse?'std':'full';
M=MODES[mode];
/* les calques du globe tels qu'on les avait laissés */
SHOWN.forEach(function(k){setOpt(k,prefs.globe[k]);}); setOpt('sun',prefs.globe.sun);
opt.ex=prefs.globe.ex; $('gRelief').value=opt.ex; $('gReliefOut').textContent='× '+opt.ex;

/* ---------- langue et vue ---------- */
Site.onLang(function(l){
  li=l==='en'?1:0; hud={}; widths.clear();
  renderTours(); syncSun(); renderJ(); showMode();
  if(pin&&pin.src) pin.n=pin.src.n[li];
  if(measure.on) measureMsg(); else if(tourMsg) showMsg(tourMsg[7+li]);
  if(!qPop.hidden) renderSearch();
  dirty=true;
});
Site.onView(function(v){
  var here=v==='globe'||v==='jour';
  if(here&&!inited) init();
  if(v==='jour'&&!lesson.on) enterLesson(); else if(v!=='jour'&&lesson.on) leaveLesson();
  if(here){ hud={}; dirty=true; }
});

/* ---------- démarrage ---------- */
function init(){
  inited=true;
  setNow(); sunSt.hour=Math.round(sunSt.hour*4)/4;
  gl=getGL();
  if(gl) try{
    pTile=program(VS_TILE,FS_TILE,['aDir','aElev','aUV'],['uVP','uEx','uTex','uNight','uSun','uSunOn','uNightOn']);
    pLine=program(VS_LINE,FS_LINE,['aDir','aElev'],['uVP','uEx','uEye','uColor','uFade']);
    pAtmo=program(VS_ATMO,FS_ATMO,['aP'],['uEye','uR','uU','uF','uSun','uSunOn']);
    pStar=program(VS_STAR,FS_STAR,['aP'],['uVP','uSize']);
  }catch(e){ gl=null; }
  if(!gl){        /* pas de WebGL utilisable : rendu par le processeur, sur une toile neuve (l'ancienne a pu garder un contexte 3D) */
    var c2=glc.cloneNode(false); glc.parentNode.replaceChild(c2,glc);
    ['pointerdown','pointermove','pointerup','pointercancel','pointerleave','contextmenu','keydown'].forEach(function(n){c2.addEventListener(n,handlers[n]);});
    c2.addEventListener('wheel',handlers.wheel,{passive:false});
    glc=c2; sctx=glc.getContext('2d');
    if(!sctx){showMsg(t('noGL'),true); return;}
    soft=true; opt.ex=0;
    if(!modeChosen&&mode==='full'){ mode='std'; M=MODES.std; }       /* sans carte graphique, on part moins chargé */
    showMode();
  }
  if(gl){
  aniso=gl.getExtension('EXT_texture_filter_anisotropic');
  glc.addEventListener('webglcontextlost',function(ev){ev.preventDefault(); gl=null; showMsg(t('lost'),true);});

  var s=20240611, st=new Float32Array(STARS*4);
  function rnd(){s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff;}
  for(var i=0;i<STARS;i++){var z=rnd()*2-1, a=rnd()*TAU, r=Math.sqrt(1-z*z), b=rnd(); st[i*4]=r*Math.cos(a); st[i*4+1]=z; st[i*4+2]=r*Math.sin(a); st[i*4+3]=b*b*b;}
  starVao=gl.createVertexArray(); gl.bindVertexArray(starVao);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,st,gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);
  triVao=gl.createVertexArray(); gl.bindVertexArray(triVao);
  gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0); gl.bindVertexArray(null);
  }

  showMsg(t('loading')); busyMsg=true;
  resize(); cam.range=homeRange();
  buildGraticule();
  fetch('tiles/levels.json').then(function(r){return r.json()}).then(function(m){ if(m&&m.length&&m[0].cols) meta=m; }).catch(function(){}).then(function(){dirty=true;});
  if(M.elev) loadElev();
  fetch('data/lines.json').then(function(r){return r.json()}).then(function(d){
    lineSet('coast',d.coast,[1,1,1,0.5]); lineSet('lakes',d.lakes,[1,1,1,0.4]); lineSet('borders',d.borders,[1,0.93,0.72,0.8]); dirty=true;
  }).catch(function(){});
  loadPlaces();
  loadBitmap('tiles/night.jpg').then(function(bmp){
    if(soft){ NW=bmp.width; NH=bmp.height; nightPx=pixelsOf(bmp); } else nightTex=makeTex(bmp,true,false);
    dirty=true;
  }).catch(function(){});
  if(document.fonts&&document.fonts.ready) document.fonts.ready.then(function(){widths.clear(); dirty=true;});
  if(window.ResizeObserver) new ResizeObserver(function(){dirty=true;}).observe(stage);
  window.addEventListener('resize',function(){dirty=true;});
  syncSun();
  lastT=performance.now(); requestAnimationFrame(frame);
}
function frame(now){
  requestAnimationFrame(frame);
  var dt=Math.min(0.1,(now-lastT)/1000); lastT=now;
  if(!(gl||soft)||(Site.view!=='globe'&&Site.view!=='jour')) return;
  step(dt);
  if(resize()) dirty=true;
  if(!dirty){
    if(soft&&refineAt&&now>refineAt){ refineAt=0; renderSoft(true); }       /* à l'arrêt : image à pleine définition */
    return;
  }
  dirty=false;
  clampCam(); updateCam();
  if(soft){ renderSoft(false); refineAt=now+280; } else render();
  drawOverlay(); updateHud();
}
window.EarthGlobe={cam:cam,opt:opt,flyTo:flyTo,redraw:function(){dirty=true;},stats:function(){return {soft:soft,tiles:soft?softTiles.size:tiles.size,loading:loading+softLoading,mb:Math.round((usedBytes+softBytes)/1048576),level:gl||soft?wantedLevel():-1,cost:Math.round(softCost)};}};
})();
